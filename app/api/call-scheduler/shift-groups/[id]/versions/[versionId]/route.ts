// ═══════════════════════════════════════════════════════════════════
// N-21-a — 그룹 설정 버전 timeline 단일 버전
// GET    /api/call-scheduler/shift-groups/[id]/versions/[versionId] — 상세 (settings + shifts + members)
// PATCH  /api/call-scheduler/shift-groups/[id]/versions/[versionId] — valid_from / valid_to / note / rotation_*
// DELETE /api/call-scheduler/shift-groups/[id]/versions/[versionId] — 버전 삭제 (cascade)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const ALLOWED_PATCH = new Set([
  'valid_from', 'valid_to', 'note',
  'rotation_enabled', 'rotation_period_kind', 'rotation_custom_days',
  'pattern_type', 'custom_days', 'generation_strategy',
  'rotation_size', 'rotation_period_days', 'skip_on_holidays',
])
const PATTERNS = new Set(['all_days', 'all_weekdays', 'weekends_only', 'custom', 'holidays_only'])
const STRATEGIES = new Set(['all_members', 'rotation'])
const PERIOD_KINDS = new Set(['monthly', 'days'])

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; versionId: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id: groupId, versionId } = await context.params

    const vRows = await prisma.$queryRaw<any[]>`
      SELECT id, group_id,
             DATE_FORMAT(valid_from, '%Y-%m-%d') AS valid_from,
             DATE_FORMAT(valid_to,   '%Y-%m-%d') AS valid_to,
             rotation_enabled, rotation_period_kind, rotation_custom_days,
             pattern_type, custom_days, generation_strategy,
             rotation_size, rotation_period_days, skip_on_holidays,
             note, created_at, updated_at
      FROM cs_shift_group_versions
      WHERE id = ${versionId} AND group_id = ${groupId} LIMIT 1
    `
    if (vRows.length === 0) {
      return NextResponse.json({ error: '버전을 찾을 수 없음' }, { status: 404 })
    }
    const v = vRows[0]
    const shifts = await prisma.$queryRaw<any[]>`
      SELECT gsv.shift_slot_id, gsv.sort_order,
             s.code AS slot_code, s.label AS slot_label,
             TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
             TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
             s.is_overnight
      FROM cs_group_shift_versions gsv
      JOIN cs_shift_slots s ON s.id = gsv.shift_slot_id
      WHERE gsv.version_id = ${versionId}
      ORDER BY gsv.sort_order ASC
    `
    const members = await prisma.$queryRaw<any[]>`
      SELECT mv.worker_id, mv.priority,
             mv.priority_level, mv.preferred_dow_prefer, mv.preferred_dow_avoid,
             mv.max_consecutive_work_days, mv.required_days_per_month, mv.max_days_per_month,
             mv.blocked_slot_ids, mv.work_pattern_text,
             DATE_FORMAT(mv.rotation_start_date, '%Y-%m-%d') AS rotation_start_date,
             mv.rotation_start_index,
             DATE_FORMAT(mv.rotation_end_date, '%Y-%m-%d') AS rotation_end_date,
             w.name AS worker_name, w.color_tone AS worker_tone, w.group_label
      FROM cs_group_member_versions mv
      JOIN cs_workers w ON w.id = mv.worker_id
      WHERE mv.version_id = ${versionId}
      ORDER BY mv.priority ASC
    `
    const version = {
      ...v,
      rotation_enabled: Boolean(v.rotation_enabled),
      skip_on_holidays: Boolean(v.skip_on_holidays),
      rotation_custom_days: Number(v.rotation_custom_days || 30),
      rotation_size: v.rotation_size != null ? Number(v.rotation_size) : null,
      rotation_period_days: Number(v.rotation_period_days || 1),
      shifts: shifts.map(s => ({
        ...s,
        sort_order: Number(s.sort_order || 0),
        is_overnight: Boolean(s.is_overnight),
      })),
      members: members.map(m => ({
        ...m,
        priority_level: Number(m.priority_level || 2),
        max_consecutive_work_days: m.max_consecutive_work_days != null ? Number(m.max_consecutive_work_days) : null,
        required_days_per_month: m.required_days_per_month != null ? Number(m.required_days_per_month) : null,
        max_days_per_month: m.max_days_per_month != null ? Number(m.max_days_per_month) : null,
        rotation_start_index: Number(m.rotation_start_index || 0),
        blocked_slot_ids: m.blocked_slot_ids
          ? (typeof m.blocked_slot_ids === 'string'
             ? (() => { try { return JSON.parse(m.blocked_slot_ids) } catch { return [] } })()
             : (Array.isArray(m.blocked_slot_ids) ? m.blocked_slot_ids : []))
          : null,
      })),
    }
    return NextResponse.json({ data: serialize(version), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; versionId: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id: groupId, versionId } = await context.params
    const body = await request.json()

    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(body || {})) {
      if (!ALLOWED_PATCH.has(k)) continue
      if (k === 'pattern_type' && !PATTERNS.has(String(v))) continue
      if (k === 'generation_strategy' && !STRATEGIES.has(String(v))) continue
      if (k === 'rotation_period_kind' && !PERIOD_KINDS.has(String(v))) continue
      if (k === 'rotation_enabled' || k === 'skip_on_holidays') {
        sets.push(`${k} = ?`); params.push(v ? 1 : 0); continue
      }
      if (k === 'rotation_custom_days' || k === 'rotation_size' || k === 'rotation_period_days') {
        sets.push(`${k} = ?`); params.push(v != null ? Number(v) : null); continue
      }
      sets.push(`${k} = ?`); params.push(v ?? null)
    }
    if (sets.length === 0 && !Array.isArray(body?.shifts) && !Array.isArray(body?.members)) {
      return NextResponse.json({ error: '변경할 항목 없음' }, { status: 400 })
    }
    if (sets.length > 0) {
      sets.push('updated_at = NOW()')
      const sql = `UPDATE cs_shift_group_versions SET ${sets.join(', ')}
                   WHERE id = ? AND group_id = ?`
      params.push(versionId, groupId)
      await prisma.$executeRawUnsafe(sql, ...params)
    }

    // shifts list 동기화 (DELETE + INSERT)
    if (Array.isArray(body?.shifts)) {
      const crypto = await import('crypto')
      await prisma.$executeRaw`DELETE FROM cs_group_shift_versions WHERE version_id = ${versionId}`
      const shifts: Array<{ shift_slot_id: string }> = body.shifts
      for (let i = 0; i < shifts.length; i++) {
        const slotId = shifts[i]?.shift_slot_id
        if (!slotId) continue
        await prisma.$executeRaw`
          INSERT INTO cs_group_shift_versions (id, version_id, shift_slot_id, sort_order, created_at, updated_at)
          VALUES (${crypto.randomUUID()}, ${versionId}, ${slotId}, ${i}, NOW(), NOW())
        `
      }
    }

    // members list 동기화 (DELETE + INSERT)
    if (Array.isArray(body?.members)) {
      const crypto = await import('crypto')
      await prisma.$executeRaw`DELETE FROM cs_group_member_versions WHERE version_id = ${versionId}`
      const members: any[] = body.members
      for (let i = 0; i < members.length; i++) {
        const m = members[i]
        if (!m?.worker_id) continue
        const blocked = Array.isArray(m.blocked_slot_ids) && m.blocked_slot_ids.length > 0
          ? JSON.stringify(m.blocked_slot_ids.map(String)) : null
        await prisma.$executeRaw`
          INSERT INTO cs_group_member_versions
            (id, version_id, worker_id, priority,
             priority_level, preferred_dow_prefer, preferred_dow_avoid,
             max_consecutive_work_days, required_days_per_month, max_days_per_month,
             blocked_slot_ids, work_pattern_text,
             rotation_start_date, rotation_start_index, rotation_end_date,
             created_at, updated_at)
          VALUES
            (${crypto.randomUUID()}, ${versionId}, ${m.worker_id}, ${i},
             ${Math.min(3, Math.max(1, Number(m.priority_level) || 2))},
             ${m.preferred_dow_prefer || null}, ${m.preferred_dow_avoid || null},
             ${m.max_consecutive_work_days != null ? Number(m.max_consecutive_work_days) : null},
             ${m.required_days_per_month != null ? Number(m.required_days_per_month) : null},
             ${m.max_days_per_month != null ? Number(m.max_days_per_month) : null},
             ${blocked}, ${m.work_pattern_text || null},
             ${m.rotation_start_date || null},
             ${Math.max(0, Math.min(255, Number(m.rotation_start_index) || 0))},
             ${m.rotation_end_date || null},
             NOW(), NOW())
        `
      }
    }

    return NextResponse.json({ data: { id: versionId, updated: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; versionId: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id: groupId, versionId } = await context.params
    await prisma.$executeRaw`
      DELETE FROM cs_shift_group_versions
      WHERE id = ${versionId} AND group_id = ${groupId}
    `
    return NextResponse.json({ data: { id: versionId, deleted: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
