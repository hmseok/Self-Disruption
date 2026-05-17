// ═══════════════════════════════════════════════════════════════════
// N-21-a — 그룹 설정 버전 timeline
// GET  /api/call-scheduler/shift-groups/[id]/versions — list
// POST /api/call-scheduler/shift-groups/[id]/versions — 새 버전 생성 (현재 설정 복제 + valid_from)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params

    // graceful — 새 테이블 미적용 시 빈 배열
    let hasVersions = true
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_shift_group_versions LIMIT 1`
    } catch { hasVersions = false }
    if (!hasVersions) {
      return NextResponse.json({ data: [], error: null, _migration_pending: true })
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT v.id, v.group_id,
             DATE_FORMAT(v.valid_from, '%Y-%m-%d') AS valid_from,
             DATE_FORMAT(v.valid_to,   '%Y-%m-%d') AS valid_to,
             v.rotation_enabled, v.rotation_period_kind, v.rotation_custom_days,
             v.pattern_type, v.custom_days, v.generation_strategy,
             v.rotation_size, v.rotation_period_days, v.skip_on_holidays,
             v.note, v.created_at, v.updated_at,
             (SELECT COUNT(*) FROM cs_group_shift_versions  WHERE version_id = v.id) AS shift_count,
             (SELECT COUNT(*) FROM cs_group_member_versions WHERE version_id = v.id) AS member_count
      FROM cs_shift_group_versions v
      WHERE v.group_id = ${id}
      ORDER BY v.valid_from ASC
    `
    const data = rows.map(r => ({
      ...r,
      rotation_enabled: Boolean(r.rotation_enabled),
      skip_on_holidays: Boolean(r.skip_on_holidays),
      rotation_custom_days: Number(r.rotation_custom_days || 30),
      rotation_size: r.rotation_size != null ? Number(r.rotation_size) : null,
      rotation_period_days: Number(r.rotation_period_days || 1),
      shift_count: Number(r.shift_count || 0),
      member_count: Number(r.member_count || 0),
    }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id: groupId } = await context.params
    const body = await request.json()
    const validFrom: string = String(body?.valid_from || '').trim()
    const validTo: string | null = body?.valid_to ? String(body.valid_to).trim() : null
    const note: string | null = body?.note ? String(body.note).trim() : null
    const copyFrom: string | null = body?.copy_from_version_id || null  // 기존 버전 복제 옵션
    if (!validFrom) {
      return NextResponse.json({ error: '시작일(valid_from) 필수' }, { status: 400 })
    }
    if (validTo && validTo < validFrom) {
      return NextResponse.json({ error: '종료일이 시작일보다 빠를 수 없음' }, { status: 400 })
    }

    // graceful — 새 테이블 미적용 시 차단
    let hasVersions = true
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_shift_group_versions LIMIT 1`
    } catch { hasVersions = false }
    if (!hasVersions) {
      return NextResponse.json({
        error: '버전 timeline 마이그레이션 미적용 — migrations/2026-05-16_cs_shift_group_versions.sql 적용 필요',
      }, { status: 412 })
    }

    // 그룹 존재 확인
    const grp = await prisma.$queryRaw<any[]>`
      SELECT id, rotation_enabled, rotation_period_kind, rotation_custom_days,
             pattern_type, custom_days, generation_strategy,
             rotation_size, rotation_period_days, skip_on_holidays
      FROM cs_shift_groups WHERE id = ${groupId} LIMIT 1
    `
    if (grp.length === 0) {
      return NextResponse.json({ error: '그룹을 찾을 수 없음' }, { status: 404 })
    }
    const g = grp[0]

    // 복제 source 결정:
    //   copyFrom = '__current__' (그룹 현재 cs_shift_groups + cs_group_shifts + cs_group_members)
    //   copyFrom = <version_id>  (해당 버전 복제)
    //   copyFrom = null          (디폴트 = 그룹 현재)
    const versionId = crypto.randomUUID()
    const source = copyFrom && copyFrom !== '__current__' ? copyFrom : null

    let sourceSettings: any
    let sourceShifts: any[] = []
    let sourceMembers: any[] = []
    if (source) {
      // 다른 버전 복제
      const src = await prisma.$queryRaw<any[]>`
        SELECT * FROM cs_shift_group_versions WHERE id = ${source} LIMIT 1
      `
      if (src.length === 0) {
        return NextResponse.json({ error: '복제 source 버전을 찾을 수 없음' }, { status: 404 })
      }
      sourceSettings = src[0]
      sourceShifts = await prisma.$queryRaw<any[]>`
        SELECT shift_slot_id, sort_order FROM cs_group_shift_versions
        WHERE version_id = ${source} ORDER BY sort_order ASC
      ` as any[]
      sourceMembers = await prisma.$queryRaw<any[]>`
        SELECT * FROM cs_group_member_versions
        WHERE version_id = ${source} ORDER BY priority ASC
      ` as any[]
    } else {
      // 그룹 현재 설정 복제
      sourceSettings = g
      try {
        sourceShifts = await prisma.$queryRaw<any[]>`
          SELECT shift_slot_id, sort_order FROM cs_group_shifts
          WHERE group_id = ${groupId} ORDER BY sort_order ASC
        ` as any[]
      } catch { /* graceful */ }
      try {
        sourceMembers = await prisma.$queryRaw<any[]>`
          SELECT m.worker_id, m.priority,
                 m.priority_level, m.preferred_dow_prefer, m.preferred_dow_avoid,
                 m.max_consecutive_work_days, m.max_days_per_month,
                 m.blocked_slot_ids, m.work_pattern_text,
                 DATE_FORMAT(m.rotation_start_date, '%Y-%m-%d') AS rotation_start_date,
                 m.rotation_start_index,
                 DATE_FORMAT(m.rotation_end_date, '%Y-%m-%d') AS rotation_end_date
          FROM cs_group_members m
          WHERE m.group_id = ${groupId}
          ORDER BY m.priority ASC
        ` as any[]
      } catch { /* graceful — 옛 컬럼만 */
        sourceMembers = await prisma.$queryRaw<any[]>`
          SELECT worker_id, priority FROM cs_group_members
          WHERE group_id = ${groupId} ORDER BY priority ASC
        ` as any[]
      }
    }

    // INSERT 버전 헤더
    await prisma.$executeRaw`
      INSERT INTO cs_shift_group_versions
        (id, group_id, valid_from, valid_to,
         rotation_enabled, rotation_period_kind, rotation_custom_days,
         pattern_type, custom_days, generation_strategy,
         rotation_size, rotation_period_days, skip_on_holidays,
         note, created_at, updated_at)
      VALUES
        (${versionId}, ${groupId}, ${validFrom}, ${validTo},
         ${sourceSettings.rotation_enabled ? 1 : 0},
         ${sourceSettings.rotation_period_kind || 'monthly'},
         ${Number(sourceSettings.rotation_custom_days || 30)},
         ${sourceSettings.pattern_type || 'all_weekdays'},
         ${sourceSettings.custom_days || null},
         ${sourceSettings.generation_strategy || 'all_members'},
         ${sourceSettings.rotation_size != null ? Number(sourceSettings.rotation_size) : null},
         ${Number(sourceSettings.rotation_period_days || 1)},
         ${sourceSettings.skip_on_holidays ? 1 : 0},
         ${note}, NOW(), NOW())
    `

    // INSERT 시프트 sequence
    for (const s of sourceShifts) {
      await prisma.$executeRaw`
        INSERT INTO cs_group_shift_versions (id, version_id, shift_slot_id, sort_order, created_at, updated_at)
        VALUES (${crypto.randomUUID()}, ${versionId}, ${s.shift_slot_id}, ${Number(s.sort_order || 0)}, NOW(), NOW())
      `
    }

    // INSERT 멤버
    for (const m of sourceMembers) {
      const blocked = m.blocked_slot_ids
        ? (typeof m.blocked_slot_ids === 'string' ? m.blocked_slot_ids : JSON.stringify(m.blocked_slot_ids))
        : null
      await prisma.$executeRaw`
        INSERT INTO cs_group_member_versions
          (id, version_id, worker_id, priority,
           priority_level, preferred_dow_prefer, preferred_dow_avoid,
           max_consecutive_work_days, max_days_per_month,
           blocked_slot_ids, work_pattern_text,
           rotation_start_date, rotation_start_index, rotation_end_date,
           created_at, updated_at)
        VALUES
          (${crypto.randomUUID()}, ${versionId}, ${m.worker_id}, ${Number(m.priority || 0)},
           ${Number(m.priority_level || 2)},
           ${m.preferred_dow_prefer || null},
           ${m.preferred_dow_avoid || null},
           ${m.max_consecutive_work_days != null ? Number(m.max_consecutive_work_days) : null},
           ${m.max_days_per_month != null ? Number(m.max_days_per_month) : null},
           ${blocked},
           ${m.work_pattern_text || null},
           ${m.rotation_start_date || null},
           ${Number(m.rotation_start_index || 0)},
           ${m.rotation_end_date || null},
           NOW(), NOW())
      `
    }

    return NextResponse.json({
      data: serialize({ version_id: versionId, valid_from: validFrom, valid_to: validTo }),
      error: null,
    }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
