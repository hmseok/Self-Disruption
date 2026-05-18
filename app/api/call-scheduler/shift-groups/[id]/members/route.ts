// ═══════════════════════════════════════════════════════════════════
// PUT /api/call-scheduler/shift-groups/[id]/members
//
// Phase K (2026-05-09) — body 확장:
//   { members: [{ worker_id, priority_level, preferred_dow_prefer, preferred_dow_avoid,
//                 max_consecutive_work_days, max_days_per_month,
//                 blocked_slot_ids, work_pattern_text }, ...] }
//
//   (옛 호환) { worker_ids: [uuid, ...] } 도 받음 — priority 만 인덱스로
//
//   동작: 그룹의 멤버 전체를 받은 배열로 set (delete + insert)
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

interface MemberInput {
  worker_id: string
  priority_level?: number
  preferred_dow_prefer?: string | null
  preferred_dow_avoid?: string | null
  max_consecutive_work_days?: number | null
  max_days_per_month?: number | null
  blocked_slot_ids?: string[] | null
  work_pattern_text?: string | null
  // N-19-a — 시프트 로테이션
  rotation_start_date?: string | null
  rotation_start_index?: number
  rotation_end_date?: string | null
  // N-34 — 그룹 분배 비율 (디폴트 1.0, 0 = hard exclude)
  target_ratio?: number | null
  // N-36 — 휴가 커버 우선순위 (1~3, NULL = priority_level 따라감)
  coverage_priority?: number | null
  // N-55 — A/B조 squad
  squad?: string | null      // 'A' | 'B' | null
  squad_order?: number | null  // 조 안 순서
  // N-56-b — 그룹멤버 비균등 cycle 패턴 (당사 근무 cycle)
  // CSV '1,2,1,4' = 1근무 2휴무 1근무 4휴무 (그룹마다 다른 출발일 가능)
  work_cycle_pattern?: string | null
  work_cycle_start_date?: string | null
}

function clampPriorityLevel(v: any): number {
  return Math.min(3, Math.max(1, Number(v) || 2))
}
function nullableNum(v: any): number | null {
  if (v == null || v === '') return null
  const n = Number(v); return Number.isFinite(n) ? n : null
}
function nullableStr(v: any): string | null {
  if (v == null) return null
  const s = String(v).trim(); return s.length > 0 ? s : null
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    const body = await request.json()

    // body 정규화 — members 우선, worker_ids fallback
    let members: MemberInput[] = []
    if (Array.isArray(body?.members)) {
      members = body.members.filter((m: any) => m && typeof m.worker_id === 'string')
    } else if (Array.isArray(body?.worker_ids)) {
      members = body.worker_ids.map((wId: string) => ({ worker_id: String(wId) }))
    }

    // 그룹 존재 확인
    const exists = await prisma.$queryRaw<any[]>`
      SELECT id FROM cs_shift_groups WHERE id = ${id} LIMIT 1
    `
    if (exists.length === 0) {
      return NextResponse.json({ error: '그룹을 찾을 수 없습니다.' }, { status: 404 })
    }

    // N-19-a — rotation 컬럼 graceful 감지
    let hasMemberRotation = true
    try {
      await prisma.$queryRaw<any[]>`SELECT rotation_start_date FROM cs_group_members LIMIT 1`
    } catch { hasMemberRotation = false }
    // N-34 — target_ratio 컬럼 graceful 감지
    let hasTargetRatio = true
    try {
      await prisma.$queryRaw<any[]>`SELECT target_ratio FROM cs_group_members LIMIT 1`
    } catch { hasTargetRatio = false }
    // N-36 — coverage_priority 컬럼 graceful 감지
    let hasCoveragePriority = true
    try {
      await prisma.$queryRaw<any[]>`SELECT coverage_priority FROM cs_group_members LIMIT 1`
    } catch { hasCoveragePriority = false }
    // N-55 — squad 컬럼 graceful 감지
    let hasSquad = true
    try {
      await prisma.$queryRaw<any[]>`SELECT squad FROM cs_group_members LIMIT 1`
    } catch { hasSquad = false }
    // N-56-b — work_cycle_pattern (그룹멤버) graceful 감지
    let hasMemberWorkCycle = true
    try {
      await prisma.$queryRaw<any[]>`SELECT work_cycle_pattern FROM cs_group_members LIMIT 1`
    } catch { hasMemberWorkCycle = false }

    // 기존 멤버 모두 삭제
    await prisma.$executeRaw`DELETE FROM cs_group_members WHERE group_id = ${id}`

    // 새 멤버 INSERT (priority = 배열 인덱스, 8 컬럼 + N-19-a rotation 3 컬럼)
    for (let i = 0; i < members.length; i++) {
      const m = members[i]
      const memberId = crypto.randomUUID()
      const priority_level = clampPriorityLevel(m.priority_level)
      const dow_prefer = nullableStr(m.preferred_dow_prefer)
      const dow_avoid = nullableStr(m.preferred_dow_avoid)
      const max_consec = nullableNum(m.max_consecutive_work_days)
      const max_days = nullableNum(m.max_days_per_month)
      const blocked = Array.isArray(m.blocked_slot_ids) && m.blocked_slot_ids.length > 0
        ? JSON.stringify(m.blocked_slot_ids.map(String)) : null
      const pattern = nullableStr(m.work_pattern_text)
      const rot_start = nullableStr(m.rotation_start_date)
      const rot_index = Math.max(0, Math.min(255, Number(m.rotation_start_index) || 0))
      const rot_end = nullableStr(m.rotation_end_date)
      // N-34 — target_ratio: 0 이상 실수, 디폴트 1.0
      const target_ratio_raw = m.target_ratio
      const target_ratio = (target_ratio_raw == null || target_ratio_raw === '' as any)
        ? 1.0
        : Math.max(0, Number(target_ratio_raw) || 0)
      // N-36 — coverage_priority (1~3 또는 NULL = priority_level 따라감)
      const cov_raw = m.coverage_priority
      const coverage_priority: number | null =
        cov_raw == null || cov_raw === '' as any
          ? null
          : Math.min(3, Math.max(1, Number(cov_raw) || 0)) || null

      if (hasMemberRotation && hasTargetRatio) {
        await prisma.$executeRaw`
          INSERT INTO cs_group_members
            (id, group_id, worker_id, priority,
             priority_level, preferred_dow_prefer, preferred_dow_avoid,
             max_consecutive_work_days, max_days_per_month,
             blocked_slot_ids, work_pattern_text,
             rotation_start_date, rotation_start_index, rotation_end_date,
             target_ratio, created_at)
          VALUES
            (${memberId}, ${id}, ${m.worker_id}, ${i},
             ${priority_level}, ${dow_prefer}, ${dow_avoid},
             ${max_consec}, ${max_days},
             ${blocked}, ${pattern},
             ${rot_start}, ${rot_index}, ${rot_end},
             ${target_ratio}, NOW())
        `
      } else if (hasMemberRotation) {
        await prisma.$executeRaw`
          INSERT INTO cs_group_members
            (id, group_id, worker_id, priority,
             priority_level, preferred_dow_prefer, preferred_dow_avoid,
             max_consecutive_work_days, max_days_per_month,
             blocked_slot_ids, work_pattern_text,
             rotation_start_date, rotation_start_index, rotation_end_date,
             created_at)
          VALUES
            (${memberId}, ${id}, ${m.worker_id}, ${i},
             ${priority_level}, ${dow_prefer}, ${dow_avoid},
             ${max_consec}, ${max_days},
             ${blocked}, ${pattern},
             ${rot_start}, ${rot_index}, ${rot_end},
             NOW())
        `
      } else {
        await prisma.$executeRaw`
          INSERT INTO cs_group_members
            (id, group_id, worker_id, priority,
             priority_level, preferred_dow_prefer, preferred_dow_avoid,
             max_consecutive_work_days, max_days_per_month,
             blocked_slot_ids, work_pattern_text, created_at)
          VALUES
            (${memberId}, ${id}, ${m.worker_id}, ${i},
             ${priority_level}, ${dow_prefer}, ${dow_avoid},
             ${max_consec}, ${max_days},
             ${blocked}, ${pattern}, NOW())
        `
      }

      // N-36 — coverage_priority 별도 UPDATE (graceful, 분기 폭증 방지)
      if (hasCoveragePriority) {
        try {
          await prisma.$executeRaw`
            UPDATE cs_group_members SET coverage_priority = ${coverage_priority}
            WHERE id = ${memberId}
          `
        } catch { /* graceful */ }
      }
      // N-55 — squad / squad_order 별도 UPDATE (graceful)
      if (hasSquad) {
        const squad = m.squad === 'A' || m.squad === 'B' ? m.squad : null
        const squadOrder = m.squad_order != null ? Math.max(0, Number(m.squad_order) || 0) : null
        try {
          await prisma.$executeRaw`
            UPDATE cs_group_members SET squad = ${squad}, squad_order = ${squadOrder}
            WHERE id = ${memberId}
          `
        } catch { /* graceful */ }
      }
      // N-56-b — work_cycle_pattern / start_date 별도 UPDATE (graceful)
      //   CSV 검증: 콤마 구분 양수 정수 2개 이상
      if (hasMemberWorkCycle) {
        let wcp: string | null = null
        const raw = m.work_cycle_pattern
        if (raw != null && raw !== '') {
          const parts = String(raw).split(',').map(s => s.trim())
          if (parts.length >= 2 && parts.every(p => /^\d+$/.test(p) && Number(p) > 0)) {
            wcp = parts.join(',')
          }
        }
        const wcStart = m.work_cycle_start_date == null || m.work_cycle_start_date === ''
          ? null
          : String(m.work_cycle_start_date).slice(0, 10)
        try {
          await prisma.$executeRaw`
            UPDATE cs_group_members
              SET work_cycle_pattern = ${wcp},
                  work_cycle_start_date = ${wcStart}
            WHERE id = ${memberId}
          `
        } catch { /* graceful */ }
      }
    }

    // 새 멤버 목록 반환 (8 컬럼 포함)
    const out = await prisma.$queryRaw<any[]>`
      SELECT m.id, m.worker_id, m.priority,
             m.priority_level, m.preferred_dow_prefer, m.preferred_dow_avoid,
             m.max_consecutive_work_days, m.max_days_per_month,
             m.blocked_slot_ids, m.work_pattern_text,
             w.name AS worker_name, w.color_tone AS worker_tone, w.group_label
      FROM cs_group_members m
      JOIN cs_workers w ON w.id = m.worker_id
      WHERE m.group_id = ${id}
      ORDER BY m.priority ASC
    `
    const data = out.map(r => ({
      ...r,
      priority_level: Number(r.priority_level || 2),
      max_consecutive_work_days: r.max_consecutive_work_days != null ? Number(r.max_consecutive_work_days) : null,
      max_days_per_month: r.max_days_per_month != null ? Number(r.max_days_per_month) : null,
      blocked_slot_ids: r.blocked_slot_ids
        ? (typeof r.blocked_slot_ids === 'string'
           ? (() => { try { return JSON.parse(r.blocked_slot_ids) } catch { return [] } })()
           : (Array.isArray(r.blocked_slot_ids) ? r.blocked_slot_ids : []))
        : null,
    }))
    return NextResponse.json({
      data: serialize({ group_id: id, members: data }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
