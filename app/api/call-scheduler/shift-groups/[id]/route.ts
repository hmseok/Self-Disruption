// ═══════════════════════════════════════════════════════════════════
// GET    /api/call-scheduler/shift-groups/[id] — 상세 + 멤버 목록
// PATCH  /api/call-scheduler/shift-groups/[id] — 수정
// DELETE /api/call-scheduler/shift-groups/[id] — soft delete (is_active=0)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const ALLOWED_COLS = new Set([
  'name', 'category', 'shift_slot_id', 'pattern_type', 'custom_days',
  'generation_strategy', 'rotation_size', 'rotation_period_days',
  'color_tone', 'description', 'sort_order', 'is_active',
  'skip_on_holidays',         // N-16
  'include_holidays_extra',   // N-32 — 공휴일 추가 출근 (패턴 매칭 X 라도 휴일이면 출근)
  'allow_same_day_other_group', // N-35 — 같은 날 다른 그룹과 겹침 허용
  'rotation_enabled',         // N-19-a
  'rotation_period_kind',     // N-19-a — monthly | days
  'rotation_custom_days',     // N-19-a
  'rotation_start_date',      // PR-2RR (2026-05-28) — 그룹 단위 회전 시작 일자
  'rotation_end_date',        // PR-2RR (2026-05-28) — 그룹 단위 회전 종료 일자
  'rotation_direction',       // PR-2RR-b (2026-05-28) — 회전 방향 'forward' | 'reverse'
  // N-55 — A/B조 cycle
  'cycle_kind',                // 'squad_rotation' | NULL
  'cycle_days_per_member',     // 각자 N일
  'cycle_start_date',          // YYYY-MM-DD
])
const PATTERNS = new Set(['all_days', 'all_weekdays', 'weekends_only', 'custom', 'holidays_only'])
const STRATEGIES = new Set(['all_members', 'rotation'])
const COLOR_TONES = new Set([
  'blue', 'gray', 'green', 'amber', 'violet', 'red', 'none',
  'indigo', 'sky', 'teal', 'lime', 'orange', 'pink', 'slate',
])

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params

    // graceful 컬럼 감지 — N-16 / N-19-a
    let hasCategory = true
    try { await prisma.$queryRaw<any[]>`SELECT category FROM cs_shift_groups LIMIT 1` }
    catch { hasCategory = false }
    let hasSkipOnHolidays = true
    try { await prisma.$queryRaw<any[]>`SELECT skip_on_holidays FROM cs_shift_groups LIMIT 1` }
    catch { hasSkipOnHolidays = false }
    // N-32 — include_holidays_extra 컬럼 graceful
    let hasIncludeHolidaysExtra = true
    try { await prisma.$queryRaw<any[]>`SELECT include_holidays_extra FROM cs_shift_groups LIMIT 1` }
    catch { hasIncludeHolidaysExtra = false }
    // N-35 — allow_same_day_other_group 컬럼 graceful
    let hasAllowOverlap = true
    try { await prisma.$queryRaw<any[]>`SELECT allow_same_day_other_group FROM cs_shift_groups LIMIT 1` }
    catch { hasAllowOverlap = false }
    // N-55 — cycle_kind / squad 컬럼 graceful
    let hasCycle = true
    try { await prisma.$queryRaw<any[]>`SELECT cycle_kind FROM cs_shift_groups LIMIT 1` }
    catch { hasCycle = false }
    let hasSquad = true
    try { await prisma.$queryRaw<any[]>`SELECT squad FROM cs_group_members LIMIT 1` }
    catch { hasSquad = false }
    let hasRotation = true
    try { await prisma.$queryRaw<any[]>`SELECT rotation_enabled FROM cs_shift_groups LIMIT 1` }
    catch { hasRotation = false }
    // PR-2RR (2026-05-28) — 그룹 단위 회전 시작/종료 일자 컬럼 graceful
    let hasGroupRotationDates = true
    try { await prisma.$queryRaw<any[]>`SELECT rotation_start_date FROM cs_shift_groups LIMIT 1` }
    catch { hasGroupRotationDates = false }
    // PR-2RR-b (2026-05-28) — rotation_direction 컬럼 graceful
    let hasGroupRotationDirection = true
    try { await prisma.$queryRaw<any[]>`SELECT rotation_direction FROM cs_shift_groups LIMIT 1` }
    catch { hasGroupRotationDirection = false }
    let hasGroupShifts = true
    try { await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_group_shifts LIMIT 1` }
    catch { hasGroupShifts = false }
    let hasMemberSettings = true
    try { await prisma.$queryRaw<any[]>`SELECT priority_level FROM cs_group_members LIMIT 1` }
    catch { hasMemberSettings = false }
    let hasMemberRotation = true
    try { await prisma.$queryRaw<any[]>`SELECT rotation_start_date FROM cs_group_members LIMIT 1` }
    catch { hasMemberRotation = false }
    // N-34 — target_ratio 컬럼 graceful
    let hasTargetRatio = true
    try { await prisma.$queryRaw<any[]>`SELECT target_ratio FROM cs_group_members LIMIT 1` }
    catch { hasTargetRatio = false }

    const grpRows = await prisma.$queryRaw<any[]>`
      SELECT g.id, g.name, g.shift_slot_id, g.pattern_type, g.custom_days,
             g.generation_strategy, g.rotation_size, g.rotation_period_days,
             g.color_tone, g.description, g.sort_order, g.is_active,
             g.created_at, g.updated_at,
             s.code AS slot_code, s.label AS slot_label,
             TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
             TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
             s.is_overnight
      FROM cs_shift_groups g
      JOIN cs_shift_slots s ON s.id = g.shift_slot_id
      WHERE g.id = ${id} LIMIT 1
    `
    if (grpRows.length === 0) {
      return NextResponse.json({ error: '그룹을 찾을 수 없습니다.' }, { status: 404 })
    }

    // N-16/N-19-a/N-32/N-35 — 별도 컬럼 조회 (graceful)
    let category = 'general'
    let skipOnHolidays = false
    let includeHolidaysExtra = false  // N-32
    let allowOverlap = false  // N-35
    let rotationEnabled = false
    let rotationPeriodKind = 'monthly'
    let rotationCustomDays = 30
    // PR-2RR (2026-05-28)
    let rotationStartDate: string | null = null
    let rotationEndDate: string | null = null
    // PR-2RR-b (2026-05-28)
    let rotationDirection: 'forward' | 'reverse' = 'forward'
    if (hasCategory) {
      try {
        const r = await prisma.$queryRaw<any[]>`SELECT category FROM cs_shift_groups WHERE id = ${id} LIMIT 1`
        category = r[0]?.category || 'general'
      } catch { /* graceful */ }
    }
    if (hasSkipOnHolidays) {
      try {
        const r = await prisma.$queryRaw<any[]>`SELECT skip_on_holidays FROM cs_shift_groups WHERE id = ${id} LIMIT 1`
        skipOnHolidays = Boolean(r[0]?.skip_on_holidays)
      } catch { /* graceful */ }
    }
    // N-32 — include_holidays_extra
    if (hasIncludeHolidaysExtra) {
      try {
        const r = await prisma.$queryRaw<any[]>`SELECT include_holidays_extra FROM cs_shift_groups WHERE id = ${id} LIMIT 1`
        includeHolidaysExtra = Boolean(r[0]?.include_holidays_extra)
      } catch { /* graceful */ }
    }
    // N-35 — allow_same_day_other_group
    if (hasAllowOverlap) {
      try {
        const r = await prisma.$queryRaw<any[]>`SELECT allow_same_day_other_group FROM cs_shift_groups WHERE id = ${id} LIMIT 1`
        allowOverlap = Boolean(r[0]?.allow_same_day_other_group)
      } catch { /* graceful */ }
    }
    // N-55 — cycle 셋팅 별도 조회
    let cycleKind: string | null = null
    let cycleDaysPerMember: number | null = null
    let cycleStartDate: string | null = null
    if (hasCycle) {
      try {
        const r = await prisma.$queryRaw<any[]>`
          SELECT cycle_kind, cycle_days_per_member,
                 DATE_FORMAT(cycle_start_date, '%Y-%m-%d') AS cycle_start_date
          FROM cs_shift_groups WHERE id = ${id} LIMIT 1
        `
        cycleKind = r[0]?.cycle_kind || null
        cycleDaysPerMember = r[0]?.cycle_days_per_member != null ? Number(r[0].cycle_days_per_member) : null
        cycleStartDate = r[0]?.cycle_start_date || null
      } catch { /* graceful */ }
    }
    if (hasRotation) {
      try {
        const selectDates = hasGroupRotationDates
          ? `DATE_FORMAT(rotation_start_date, '%Y-%m-%d') AS rotation_start_date,
             DATE_FORMAT(rotation_end_date,   '%Y-%m-%d') AS rotation_end_date,`
          : ``
        const selectDir = hasGroupRotationDirection ? `rotation_direction,` : ``
        const r = await prisma.$queryRawUnsafe<any[]>(`
          SELECT rotation_enabled, rotation_period_kind, rotation_custom_days,
                 ${selectDates} ${selectDir}
                 1 AS _padding
          FROM cs_shift_groups WHERE id = ? LIMIT 1
        `, id)
        rotationEnabled = Boolean(r[0]?.rotation_enabled)
        rotationPeriodKind = String(r[0]?.rotation_period_kind || 'monthly')
        rotationCustomDays = Number(r[0]?.rotation_custom_days || 30)
        if (hasGroupRotationDates) {
          rotationStartDate = r[0]?.rotation_start_date ?? null
          rotationEndDate   = r[0]?.rotation_end_date   ?? null
        }
        if (hasGroupRotationDirection && r[0]?.rotation_direction === 'reverse') {
          rotationDirection = 'reverse'
        }
      } catch { /* graceful */ }
    }

    // N-19-a — cs_group_shifts sequence
    let rotationShifts: any[] = []
    if (hasGroupShifts) {
      try {
        rotationShifts = await prisma.$queryRaw<any[]>`
          SELECT gs.shift_slot_id, gs.sort_order,
                 s.code AS slot_code, s.label AS slot_label,
                 TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
                 TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
                 s.is_overnight
          FROM cs_group_shifts gs
          JOIN cs_shift_slots s ON s.id = gs.shift_slot_id
          WHERE gs.group_id = ${id}
          ORDER BY gs.sort_order ASC
        `
      } catch { /* graceful */ }
    }

    // 멤버 — Phase K (priority_level 등) + N-19-a (rotation_start_*)
    const memberRows: any[] = (hasMemberSettings && hasMemberRotation)
      ? await prisma.$queryRaw<any[]>`
          SELECT m.id, m.worker_id, m.priority,
                 m.priority_level, m.preferred_dow_prefer, m.preferred_dow_avoid,
                 m.max_consecutive_work_days, m.max_days_per_month,
                 m.blocked_slot_ids, m.work_pattern_text,
                 DATE_FORMAT(m.rotation_start_date, '%Y-%m-%d') AS rotation_start_date,
                 m.rotation_start_index,
                 DATE_FORMAT(m.rotation_end_date, '%Y-%m-%d') AS rotation_end_date,
                 w.name AS worker_name, w.color_tone AS worker_tone, w.group_label
          FROM cs_group_members m
          JOIN cs_workers w ON w.id = m.worker_id
          WHERE m.group_id = ${id}
          ORDER BY m.priority ASC, w.name ASC
        `
      : hasMemberSettings
      ? await prisma.$queryRaw<any[]>`
          SELECT m.id, m.worker_id, m.priority,
                 m.priority_level, m.preferred_dow_prefer, m.preferred_dow_avoid,
                 m.max_consecutive_work_days, m.max_days_per_month,
                 m.blocked_slot_ids, m.work_pattern_text,
                 w.name AS worker_name, w.color_tone AS worker_tone, w.group_label
          FROM cs_group_members m
          JOIN cs_workers w ON w.id = m.worker_id
          WHERE m.group_id = ${id}
          ORDER BY m.priority ASC, w.name ASC
        `
      : await prisma.$queryRaw<any[]>`
          SELECT m.id, m.worker_id, m.priority,
                 w.name AS worker_name, w.color_tone AS worker_tone, w.group_label
          FROM cs_group_members m
          JOIN cs_workers w ON w.id = m.worker_id
          WHERE m.group_id = ${id}
          ORDER BY m.priority ASC, w.name ASC
        `

    // N-34 — target_ratio 별도 조회 (graceful)
    const ratioMap = new Map<string, number>()
    if (hasTargetRatio) {
      try {
        const rRows = await prisma.$queryRaw<any[]>`
          SELECT worker_id, target_ratio FROM cs_group_members WHERE group_id = ${id}
        `
        for (const r of rRows) {
          const v = Number(r.target_ratio)
          ratioMap.set(String(r.worker_id), Number.isFinite(v) ? v : 1.0)
        }
      } catch { /* graceful */ }
    }

    // N-36 — coverage_priority 별도 조회 (graceful)
    let hasCoveragePriority = true
    try { await prisma.$queryRaw<any[]>`SELECT coverage_priority FROM cs_group_members LIMIT 1` }
    catch { hasCoveragePriority = false }
    const covMap = new Map<string, number | null>()
    if (hasCoveragePriority) {
      try {
        const cRows = await prisma.$queryRaw<any[]>`
          SELECT worker_id, coverage_priority FROM cs_group_members WHERE group_id = ${id}
        `
        for (const r of cRows) {
          covMap.set(String(r.worker_id),
            r.coverage_priority != null ? Number(r.coverage_priority) : null)
        }
      } catch { /* graceful */ }
    }

    // N-55 — squad 별도 조회 (graceful) — DEPRECATED in N-56-b (UI 제거)
    //   DB 컬럼은 유지 (기존 데이터 안전), 응답에는 포함 (호환성)
    const squadMap = new Map<string, { squad: string | null; squad_order: number | null }>()
    if (hasSquad) {
      try {
        const sRows = await prisma.$queryRaw<any[]>`
          SELECT worker_id, squad, squad_order FROM cs_group_members WHERE group_id = ${id}
        `
        for (const r of sRows) {
          squadMap.set(String(r.worker_id), {
            squad: r.squad || null,
            squad_order: r.squad_order != null ? Number(r.squad_order) : null,
          })
        }
      } catch { /* graceful */ }
    }

    // N-56-b — work_cycle_pattern / start_date 별도 조회 (graceful)
    let hasMemberWorkCycle = true
    try {
      await prisma.$queryRaw<any[]>`SELECT work_cycle_pattern FROM cs_group_members LIMIT 1`
    } catch { hasMemberWorkCycle = false }
    const workCycleMap = new Map<string, { pattern: string | null; start_date: string | null }>()
    if (hasMemberWorkCycle) {
      try {
        const wcRows = await prisma.$queryRaw<any[]>`
          SELECT worker_id, work_cycle_pattern,
                 DATE_FORMAT(work_cycle_start_date, '%Y-%m-%d') AS work_cycle_start_date
          FROM cs_group_members WHERE group_id = ${id}
        `
        for (const r of wcRows) {
          workCycleMap.set(String(r.worker_id), {
            pattern: r.work_cycle_pattern || null,
            start_date: r.work_cycle_start_date || null,
          })
        }
      } catch { /* graceful */ }
    }

    // 멤버 응답 정규화 (parse blocked_slot_ids JSON)
    const members = memberRows.map(r => ({
      ...r,
      priority_level: hasMemberSettings ? Number(r.priority_level || 2) : 2,
      max_consecutive_work_days: hasMemberSettings && r.max_consecutive_work_days != null
        ? Number(r.max_consecutive_work_days) : null,
      max_days_per_month: hasMemberSettings && r.max_days_per_month != null
        ? Number(r.max_days_per_month) : null,
      blocked_slot_ids: hasMemberSettings && r.blocked_slot_ids != null
        ? (typeof r.blocked_slot_ids === 'string'
           ? (() => { try { return JSON.parse(r.blocked_slot_ids) } catch { return [] } })()
           : (Array.isArray(r.blocked_slot_ids) ? r.blocked_slot_ids : []))
        : null,
      rotation_start_date: hasMemberRotation ? (r.rotation_start_date ?? null) : null,
      rotation_start_index: hasMemberRotation ? Number(r.rotation_start_index || 0) : 0,
      rotation_end_date: hasMemberRotation ? (r.rotation_end_date ?? null) : null,
      target_ratio: ratioMap.has(String(r.worker_id)) ? ratioMap.get(String(r.worker_id))! : 1.0,  // N-34
      coverage_priority: covMap.has(String(r.worker_id)) ? covMap.get(String(r.worker_id)) : null,  // N-36
      squad: squadMap.get(String(r.worker_id))?.squad ?? null,  // N-55 (deprecated)
      squad_order: squadMap.get(String(r.worker_id))?.squad_order ?? null,  // N-55 (deprecated)
      // N-56-b — 멤버 비균등 cycle 패턴 (그룹별 다른 출발일)
      work_cycle_pattern: workCycleMap.get(String(r.worker_id))?.pattern ?? null,
      work_cycle_start_date: workCycleMap.get(String(r.worker_id))?.start_date ?? null,
    }))

    const group = {
      ...grpRows[0],
      category,
      skip_on_holidays: skipOnHolidays,
      include_holidays_extra: includeHolidaysExtra,  // N-32
      allow_same_day_other_group: allowOverlap,  // N-35
      // N-55 — A/B조 cycle
      cycle_kind: cycleKind,
      cycle_days_per_member: cycleDaysPerMember,
      cycle_start_date: cycleStartDate,
      rotation_enabled: rotationEnabled,
      rotation_period_kind: rotationPeriodKind,
      rotation_custom_days: rotationCustomDays,
      // PR-2RR (2026-05-28) — 그룹 단위 회전 시작/종료
      rotation_start_date: rotationStartDate,
      rotation_end_date:   rotationEndDate,
      // PR-2RR-b (2026-05-28) — 회전 방향
      rotation_direction: rotationDirection,
      rotation_shifts: rotationShifts.map(s => ({
        shift_slot_id: s.shift_slot_id,
        sort_order: Number(s.sort_order || 0),
        slot_code: s.slot_code,
        slot_label: s.slot_label,
        start_time: s.start_time,
        end_time: s.end_time,
        is_overnight: Boolean(s.is_overnight),
      })),
      is_active: Boolean(grpRows[0].is_active),
      is_overnight: Boolean(grpRows[0].is_overnight),
      rotation_size: grpRows[0].rotation_size != null ? Number(grpRows[0].rotation_size) : null,
      rotation_period_days: Number(grpRows[0].rotation_period_days || 1),
    }
    return NextResponse.json({
      data: serialize({ group, members }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    const body = await request.json()

    // category 컬럼 존재 확인 (graceful)
    let hasCategory = true
    try {
      await prisma.$queryRaw<any[]>`SELECT category FROM cs_shift_groups LIMIT 1`
    } catch {
      hasCategory = false
    }
    // N-16 — skip_on_holidays 컬럼 존재 확인 (graceful)
    let hasSkipOnHolidays = true
    try {
      await prisma.$queryRaw<any[]>`SELECT skip_on_holidays FROM cs_shift_groups LIMIT 1`
    } catch { hasSkipOnHolidays = false }
    // N-32 — include_holidays_extra 컬럼 존재 확인 (graceful)
    let hasIncludeHolidaysExtra = true
    try {
      await prisma.$queryRaw<any[]>`SELECT include_holidays_extra FROM cs_shift_groups LIMIT 1`
    } catch { hasIncludeHolidaysExtra = false }
    // N-35 — allow_same_day_other_group 컬럼 존재 확인 (graceful)
    let hasAllowOverlap = true
    try {
      await prisma.$queryRaw<any[]>`SELECT allow_same_day_other_group FROM cs_shift_groups LIMIT 1`
    } catch { hasAllowOverlap = false }
    // N-55 — cycle 컬럼 존재 확인 (graceful)
    let hasCyclePatch = true
    try {
      await prisma.$queryRaw<any[]>`SELECT cycle_kind FROM cs_shift_groups LIMIT 1`
    } catch { hasCyclePatch = false }
    // N-19-a — rotation 컬럼 존재 확인 (graceful)
    let hasRotation = true
    try {
      await prisma.$queryRaw<any[]>`SELECT rotation_enabled FROM cs_shift_groups LIMIT 1`
    } catch { hasRotation = false }
    // PR-2RR (2026-05-28) — rotation_start_date / rotation_end_date graceful
    let hasGroupRotationDates = true
    try {
      await prisma.$queryRaw<any[]>`SELECT rotation_start_date FROM cs_shift_groups LIMIT 1`
    } catch { hasGroupRotationDates = false }
    // PR-2RR-b (2026-05-28) — rotation_direction graceful
    let hasGroupRotationDirection = true
    try {
      await prisma.$queryRaw<any[]>`SELECT rotation_direction FROM cs_shift_groups LIMIT 1`
    } catch { hasGroupRotationDirection = false }
    let hasGroupShifts = true
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_group_shifts LIMIT 1`
    } catch { hasGroupShifts = false }

    const sets: string[] = []
    const params: any[] = []
    const rotationCols = new Set(['rotation_enabled', 'rotation_period_kind', 'rotation_custom_days'])
    for (const [k, v] of Object.entries(body || {})) {
      if (!ALLOWED_COLS.has(k)) continue
      if (k === 'category' && !hasCategory) continue  // 마이그레이션 미적용 시 skip
      if (k === 'skip_on_holidays' && !hasSkipOnHolidays) continue  // N-16 — graceful
      if (k === 'include_holidays_extra' && !hasIncludeHolidaysExtra) continue  // N-32 — graceful
      if (k === 'allow_same_day_other_group' && !hasAllowOverlap) continue  // N-35 — graceful
      if ((k === 'cycle_kind' || k === 'cycle_days_per_member' || k === 'cycle_start_date') && !hasCyclePatch) continue  // N-55
      if (rotationCols.has(k) && !hasRotation) continue  // N-19-a — graceful
      // PR-2RR (2026-05-28) — 그룹 단위 회전 시작/종료
      if ((k === 'rotation_start_date' || k === 'rotation_end_date') && !hasGroupRotationDates) continue
      // PR-2RR-b (2026-05-28) — 회전 방향
      if (k === 'rotation_direction' && !hasGroupRotationDirection) continue
      if (k === 'rotation_direction') {
        const dv = String(v) === 'reverse' ? 'reverse' : 'forward'
        sets.push(`rotation_direction = ?`); params.push(dv); continue
      }
      if (k === 'pattern_type' && !PATTERNS.has(String(v))) continue
      if (k === 'generation_strategy' && !STRATEGIES.has(String(v))) continue
      if (k === 'color_tone' && !COLOR_TONES.has(String(v))) continue
      if (k === 'is_active' || k === 'skip_on_holidays' || k === 'include_holidays_extra' || k === 'allow_same_day_other_group' || k === 'rotation_enabled') {
        sets.push(`${k} = ?`); params.push(v ? 1 : 0); continue
      }
      if (k === 'rotation_custom_days') {
        sets.push(`${k} = ?`); params.push(Math.max(1, Number(v) || 30)); continue
      }
      // PR-2RR — YYYY-MM (월 입력) 또는 YYYY-MM-DD 둘 다 허용. 빈 문자열 → NULL.
      if (k === 'rotation_start_date' || k === 'rotation_end_date') {
        let dv: string | null = null
        const s = String(v ?? '').trim()
        if (/^\d{4}-\d{2}$/.test(s))         dv = `${s}-01`             // 월 입력 → 그 달 1일
        else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) dv = s                  // 풀 날짜 그대로
        else if (s === '')                   dv = null                  // clear
        else continue                                                    // 잘못된 포맷은 skip
        sets.push(`${k} = ?`); params.push(dv); continue
      }
      sets.push(`${k} = ?`); params.push(v ?? null)
    }
    if (sets.length === 0 && !Array.isArray(body?.rotation_shifts)) {
      return NextResponse.json({ error: '변경할 항목 없음' }, { status: 400 })
    }
    if (sets.length > 0) {
      sets.push('updated_at = NOW()')
      const sql = `UPDATE cs_shift_groups SET ${sets.join(', ')} WHERE id = ?`
      params.push(id)
      await prisma.$executeRawUnsafe(sql, ...params)
    }

    // N-19-a — rotation_shifts list 동기화 (DELETE + INSERT)
    if (Array.isArray(body?.rotation_shifts) && hasGroupShifts) {
      const shifts: Array<{ shift_slot_id: string }> = body.rotation_shifts
      await prisma.$executeRaw`DELETE FROM cs_group_shifts WHERE group_id = ${id}`
      const crypto = await import('crypto')
      for (let i = 0; i < shifts.length; i++) {
        const slotId = shifts[i]?.shift_slot_id
        if (!slotId) continue
        await prisma.$executeRaw`
          INSERT INTO cs_group_shifts (id, group_id, shift_slot_id, sort_order, created_at, updated_at)
          VALUES (${crypto.randomUUID()}, ${id}, ${slotId}, ${i}, NOW(), NOW())
        `
      }
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, shift_slot_id, pattern_type, custom_days,
             generation_strategy, rotation_size, rotation_period_days,
             color_tone, description, sort_order, is_active, created_at, updated_at
      FROM cs_shift_groups WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: serialize(rows[0] || null), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    await prisma.$executeRaw`
      UPDATE cs_shift_groups SET is_active = 0, updated_at = NOW() WHERE id = ${id}
    `
    return NextResponse.json({ data: { id, deleted: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
