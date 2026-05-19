// ═══════════════════════════════════════════════════════════════════
// POST /api/call-scheduler/schedules/[id]/auto-generate
//   v3 (PR-2QQ-d-3): priority + dow_avoid + dow_only + cycle 패턴 + min_coverage + 균등
//
// body:
//   {
//     mode: 'preview' | 'apply',
//     overwrite_existing?: boolean,
//     clear_first?: boolean,                      // (manual_lock 보존)
//     group_ids?: string[],
//     skip_holidays?: boolean,                    // 기본 false (24/365)
//     mark_leaves?: boolean,                      // 기본 true
//     // PR-2QQ-d-3
//     use_priority?: boolean,                     // 기본 true (priority + 가중치 + 패턴)
//     enforce_min_coverage?: boolean,             // 기본 true (cs_group_min_coverage 적용)
//   }
//
// 응답:
//   { summary: {to_insert, to_update, ..., warnings}, plan: [...] }
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

interface ShiftSlotRow {
  id: string
  start_time: string
  end_time: string
  is_overnight: number | boolean
}
interface GroupRow {
  id: string
  name: string
  shift_slot_id: string
  pattern_type: string
  custom_days: string | null
  generation_strategy: string
  rotation_size: number | null
  rotation_period_days: number
  // 슬롯 join
  slot_start: string
  slot_end: string
  slot_overnight: number | boolean
  // PR-2SS-b — 안전 가드 (graceful)
  slot_next_day_blocking_hours?: number
  slot_max_consecutive_days?: number | null
  // PR-2SS-d revert — slot_min_seniority_months 폐기
  // PR-2SS-e — 시간 분해 (graceful)
  slot_night_period_start?: string | null
  slot_night_period_end?: string | null
  slot_night_premium_rate?: number
  // N-16 — 그룹별 휴일 자동 제외 (graceful)
  skip_on_holidays?: number | boolean
  // N-32 — 공휴일 추가 출근 (패턴 매칭 X 라도 휴일이면 추가 매칭) (graceful)
  include_holidays_extra?: number | boolean
  // N-35 — 같은 날 다른 그룹과 겹침 허용 (graceful)
  allow_same_day_other_group?: number | boolean
  // N-55 — A/B조 cycle (squad_rotation) (graceful)
  cycle_kind?: string | null
  cycle_days_per_member?: number | null
  cycle_start_date?: string | null
}
interface MemberRow {
  group_id: string
  worker_id: string
  priority: number
}
interface HolidayRow {
  holiday_date: string
  exclude_auto: number | boolean
  name: string
}
interface LeaveRow {
  worker_id: string
  start_date: string
  end_date: string
  am_pm: 'full' | 'am' | 'pm'
}
interface AssignmentRow {
  id: string
  work_date: string
  shift_slot_id: string
  worker_id: string | null
  special_code: string
  manual_lock?: number  // PR-2QQ-b — 1=수동 lock 셀
}
// Phase K-3 (2026-05-09) — 멤버 단위 제약 + 워커 cycle 분리
//   같은 워커가 그룹 A 에서 P1, 그룹 B 에서 P3 등 그룹마다 다른 설정 가능
//   cycle_* 은 워커 글로벌 (외부 일정 — 모든 그룹 공통)
interface MemberConstraint {
  group_id: string
  worker_id: string
  priority_level: number
  preferred_dow_avoid: number[]
  preferred_dow_prefer: number[]
  max_days_per_month: number | null
  max_consecutive_work_days: number | null
  blocked_slot_ids: Set<string>     // 비어있으면 빈 Set
}
interface WorkerCycle {
  worker_id: string
  cycle_days_on: number | null      // 외부 근무일 수 (이 phase = 당사 X)
  cycle_days_off: number | null     // 외부 휴무일 수 (이 phase = 당사 가능)
  cycle_start_date: string | null   // 'YYYY-MM-DD' 외부 cycle 1일차
}
// 옛 alias — isAvailableOnCycle 용 (점진 정리)
type WorkerConstraint = MemberConstraint & WorkerCycle & { id: string }
interface CoverageRow {
  group_id: string
  dow: number | null
  min_workers: number
}
// PR-2SS-h-1 — 그룹 회피일 (approved status 만 후보 제외)
interface GroupSkipRow {
  group_id: string
  worker_id: string
  start_date: string
  end_date: string
  reason: string | null
}

// "HH:MM:SS" → 분
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// PR-2SS-b — ISO 날짜를 절대 분으로 (epoch-like, 1970-01-01 자정 기준)
function isoToMin(iso: string, addMin: number = 0): number {
  const t = new Date(iso + 'T00:00:00').getTime()
  return Math.floor(t / 60000) + addMin
}

// 슬롯 + special_code → 시간 계산
function computeHours(start: string, end: string, isOvernight: boolean, special: string): number {
  if (special === 'off' || special === 'am_free' || special === 'pm_free') return 0
  let s = timeToMin(start); let e = timeToMin(end)
  if (isOvernight) e += 24 * 60
  let hours = (e - s) / 60
  if (hours < 0) hours = 0
  if (special === 'am_half' || special === 'pm_half') hours = hours / 2
  return Math.round(hours * 100) / 100
}

// PR-2SS-e — 분 단위 두 구간 교집합
function intersectMin(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
}

// PR-2SS-e — 슬롯 시간을 day/night 로 분해 + 가산 적용
//   night_period_start/end 가 NULL 이면 night=0, premium=0
//   night 가 자정을 넘으면 (예: 22:00 ~ 06:00) 두 구간으로 나눠 교집합
function computeBreakdown(
  slotStart: string, slotEnd: string, isOvernight: boolean,
  nightStart: string | null | undefined, nightEnd: string | null | undefined,
  premiumRate: number,
  special: string
): { day: number; night: number; premium: number } {
  const total = computeHours(slotStart, slotEnd, isOvernight, special)
  if (!nightStart || !nightEnd) return { day: total, night: 0, premium: 0 }
  if (special === 'off' || special === 'am_free' || special === 'pm_free') {
    return { day: 0, night: 0, premium: 0 }
  }
  // 슬롯 절대 분 (자정 기준, 0 시작)
  const sStart = timeToMin(slotStart)
  let sEnd = timeToMin(slotEnd)
  if (isOvernight) sEnd += 1440
  // 야간 구간 — 자정 넘으면 두 구간 [nStart, 1440) + [1440+0, 1440+nEnd)
  const nStart = timeToMin(nightStart)
  const nEnd = timeToMin(nightEnd)
  let nightMin = 0
  if (nEnd > nStart) {
    // 같은 날 [nStart, nEnd] — slot 의 자정 기준 하루 + 익일 하루 모두 검사
    nightMin += intersectMin(sStart, sEnd, nStart, nEnd)
    nightMin += intersectMin(sStart, sEnd, nStart + 1440, nEnd + 1440)
  } else {
    // 자정 넘는 [nStart, 1440) + [0, nEnd)
    nightMin += intersectMin(sStart, sEnd, nStart, 1440)
    nightMin += intersectMin(sStart, sEnd, 0, nEnd)
    // overnight 슬롯 다음날 영역도
    nightMin += intersectMin(sStart, sEnd, nStart + 1440, 1440 + 1440)
    nightMin += intersectMin(sStart, sEnd, 1440, 1440 + nEnd)
  }
  let nightHours = nightMin / 60
  if (special === 'am_half' || special === 'pm_half') nightHours = nightHours / 2
  const day = Math.max(0, total - nightHours)
  const premium = Math.round(nightHours * (premiumRate || 0) * 100) / 100
  return {
    day: Math.round(day * 100) / 100,
    night: Math.round(nightHours * 100) / 100,
    premium,
  }
}

// 연차에서 special_code 추출
function leaveToSpecial(amPm: 'full' | 'am' | 'pm'): 'off' | 'am_half' | 'pm_half' {
  if (amPm === 'full') return 'off'
  if (amPm === 'am') return 'am_half'
  return 'pm_half'
}

// PR-2SS-b — ISO 날짜에 N일 더한 ISO 날짜 반환
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// PR-2SS-d revert — monthsSince 헬퍼 폐기

// PR-2QQ-d-3 — '0,5' 같은 문자열 → number 배열 (안전 파싱)
function parseDowList(s: string | null | undefined): number[] {
  if (!s) return []
  return String(s).split(',')
    .map(t => t.trim())
    .filter(t => t !== '')
    .map(Number)
    .filter(n => !isNaN(n) && n >= 0 && n <= 6)
}

// PR-2QQ-d-revert — cycle 의미: 외부 근무 일정
// cycle on phase = 외부 근무 (당사 X) → 후보 제외
// cycle off phase = 외부 휴무 (당사 가능) → 후보 OK
function isAvailableOnCycle(w: WorkerConstraint, isoDate: string): boolean {
  if (!w.cycle_days_on || !w.cycle_start_date) return true  // cycle 미정의 → 제약 없음
  const start = new Date(w.cycle_start_date + 'T00:00:00').getTime()
  const cur = new Date(isoDate + 'T00:00:00').getTime()
  const elapsed = Math.floor((cur - start) / (24 * 60 * 60 * 1000))
  if (elapsed < 0) return true  // 시작 전엔 제약 없음
  const cycle = (w.cycle_days_on || 0) + (w.cycle_days_off || 0)
  if (cycle <= 0) return true
  const phase = ((elapsed % cycle) + cycle) % cycle
  // phase >= cycle_days_on 이면 외부 휴무 phase (= 당사 가능)
  return phase >= w.cycle_days_on
}

// N-56 — 비균등 cycle 패턴 (당사 근무 cycle)
//   CSV '1,2,1,4' = 1근무 2휴무 1근무 4휴무 (전체 8일 cycle)
//   짝수 idx (0, 2, ...) = 근무 / 홀수 idx (1, 3, ...) = 휴무
//   반환: true = 근무 가능일 / false = 휴무일 (당사 X)
interface WorkCyclePattern {
  parts: number[]      // 파싱된 cycle 일수 배열
  total: number        // sum(parts) — 전체 cycle 일수
  startIso: string     // 'YYYY-MM-DD'
}
function parseWorkCyclePattern(csv: string | null | undefined, startIso: string | null | undefined): WorkCyclePattern | null {
  if (!csv || !startIso) return null
  const parts = String(csv).split(',').map(s => Number(s.trim()))
  if (parts.length < 2 || !parts.every(n => Number.isFinite(n) && n > 0)) return null
  const total = parts.reduce((a, b) => a + b, 0)
  if (total <= 0) return null
  return { parts, total, startIso }
}
function isWorkDayByCyclePattern(p: WorkCyclePattern, isoDate: string): boolean {
  const start = new Date(p.startIso + 'T00:00:00').getTime()
  const cur = new Date(isoDate + 'T00:00:00').getTime()
  let elapsed = Math.floor((cur - start) / (24 * 60 * 60 * 1000))
  if (elapsed < 0) return false   // 시작 전 = 당사 미정 → 휴무로 처리
  elapsed = ((elapsed % p.total) + p.total) % p.total
  let acc = 0
  for (let i = 0; i < p.parts.length; i++) {
    acc += p.parts[i]
    if (elapsed < acc) {
      return i % 2 === 0   // 짝수 idx = 근무 phase
    }
  }
  return false   // 도달 X (방어)
}

// PR-2QQ-d-3 — 그룹 × 요일별 min_workers 결정 (디폴트 fallback)
function lookupMinCoverage(
  coverageByGroup: Map<string, CoverageRow[]>,
  groupId: string,
  dow: number,
): number | null {
  const arr = coverageByGroup.get(groupId)
  if (!arr || arr.length === 0) return null
  // 특정 dow 우선
  const exact = arr.find(c => c.dow === dow)
  if (exact) return exact.min_workers
  // 디폴트 (NULL)
  const def = arr.find(c => c.dow == null)
  if (def) return def.min_workers
  return null
}

// 패턴별 대상 요일 (0=일, 6=토)
function patternDays(pattern: string, customDays: string | null): Set<number> {
  if (pattern === 'all_days') return new Set([0, 1, 2, 3, 4, 5, 6])
  if (pattern === 'all_weekdays') return new Set([1, 2, 3, 4, 5])
  if (pattern === 'weekends_only') return new Set([0, 6])
  if (pattern === 'custom' && customDays) {
    return new Set(customDays.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)))
  }
  return new Set()
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id: scheduleId } = await context.params
    const body = await request.json()

    const mode: string = body?.mode === 'apply' ? 'apply' : 'preview'
    const overwriteExisting: boolean = !!body?.overwrite_existing
    const clearFirst: boolean = !!body?.clear_first
    const skipHolidays: boolean = body?.skip_holidays !== false  // 기본 true
    const markLeaves: boolean = body?.mark_leaves !== false      // 기본 true
    const groupFilter: string[] | null = Array.isArray(body?.group_ids) && body.group_ids.length > 0
      ? body.group_ids : null
    // PR-2QQ-d-3 새 옵션
    const usePriority: boolean = body?.use_priority !== false        // 기본 true
    const enforceMinCoverage: boolean = body?.enforce_min_coverage !== false  // 기본 true

    // 1) 스케줄 조회
    const sRows = await prisma.$queryRaw<any[]>`
      SELECT id, year, month FROM cs_schedules WHERE id = ${scheduleId} LIMIT 1
    `
    if (sRows.length === 0) {
      return NextResponse.json({ error: '스케줄을 찾을 수 없습니다.' }, { status: 404 })
    }
    const { year, month } = sRows[0]
    const lastDay = new Date(year, month, 0).getDate()

    // 2) 그룹 + 슬롯 join — PR-2SS-b/e: 안전 가드 + 시간 분해 컬럼 graceful (d revert 후 seniority 제거)
    let hasSlotSafety = true
    let hasSlotBreakdown = true
    let hasGroupSkipOnHolidays = true  // N-16
    let hasGroupRotation = true        // N-19-b — cs_shift_groups.rotation_enabled
    let hasGroupShifts = true          // N-19-b — cs_group_shifts 테이블
    let hasMemberRotation = true       // N-19-b — cs_group_members.rotation_start_date
    let hasGroupVersions = true        // N-21-b — cs_shift_group_versions 테이블
    try {
      await prisma.$queryRaw<any[]>`SELECT next_day_blocking_hours FROM cs_shift_slots LIMIT 1`
    } catch { hasSlotSafety = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT night_period_start FROM cs_shift_slots LIMIT 1`
    } catch { hasSlotBreakdown = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT skip_on_holidays FROM cs_shift_groups LIMIT 1`
    } catch { hasGroupSkipOnHolidays = false }
    // N-32 — include_holidays_extra 컬럼 graceful
    let hasGroupIncludeHolidaysExtra = true
    try {
      await prisma.$queryRaw<any[]>`SELECT include_holidays_extra FROM cs_shift_groups LIMIT 1`
    } catch { hasGroupIncludeHolidaysExtra = false }
    // N-35 — allow_same_day_other_group 컬럼 graceful
    let hasGroupAllowOverlap = true
    try {
      await prisma.$queryRaw<any[]>`SELECT allow_same_day_other_group FROM cs_shift_groups LIMIT 1`
    } catch { hasGroupAllowOverlap = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT rotation_enabled FROM cs_shift_groups LIMIT 1`
    } catch { hasGroupRotation = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_group_shifts LIMIT 1`
    } catch { hasGroupShifts = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT rotation_start_date FROM cs_group_members LIMIT 1`
    } catch { hasMemberRotation = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_shift_group_versions LIMIT 1`
    } catch { hasGroupVersions = false }
    const groups: GroupRow[] = (hasSlotSafety && hasSlotBreakdown)
      ? (await prisma.$queryRaw<any[]>`
          SELECT g.id, g.name, g.shift_slot_id, g.pattern_type, g.custom_days,
                 g.generation_strategy, g.rotation_size, g.rotation_period_days,
                 TIME_FORMAT(s.start_time, '%H:%i:%s') AS slot_start,
                 TIME_FORMAT(s.end_time, '%H:%i:%s')   AS slot_end,
                 s.is_overnight AS slot_overnight,
                 s.next_day_blocking_hours AS slot_next_day_blocking_hours,
                 s.max_consecutive_days   AS slot_max_consecutive_days,
                 TIME_FORMAT(s.night_period_start, '%H:%i:%s') AS slot_night_period_start,
                 TIME_FORMAT(s.night_period_end,   '%H:%i:%s') AS slot_night_period_end,
                 s.night_premium_rate AS slot_night_premium_rate
          FROM cs_shift_groups g
          JOIN cs_shift_slots s ON s.id = g.shift_slot_id
          WHERE g.is_active = 1
          ORDER BY g.sort_order ASC, g.name ASC
        ` as any)
      : hasSlotSafety
      ? (await prisma.$queryRaw<any[]>`
          SELECT g.id, g.name, g.shift_slot_id, g.pattern_type, g.custom_days,
                 g.generation_strategy, g.rotation_size, g.rotation_period_days,
                 TIME_FORMAT(s.start_time, '%H:%i:%s') AS slot_start,
                 TIME_FORMAT(s.end_time, '%H:%i:%s')   AS slot_end,
                 s.is_overnight AS slot_overnight,
                 s.next_day_blocking_hours AS slot_next_day_blocking_hours,
                 s.max_consecutive_days   AS slot_max_consecutive_days
          FROM cs_shift_groups g
          JOIN cs_shift_slots s ON s.id = g.shift_slot_id
          WHERE g.is_active = 1
          ORDER BY g.sort_order ASC, g.name ASC
        ` as any)
      : (await prisma.$queryRaw<any[]>`
          SELECT g.id, g.name, g.shift_slot_id, g.pattern_type, g.custom_days,
                 g.generation_strategy, g.rotation_size, g.rotation_period_days,
                 TIME_FORMAT(s.start_time, '%H:%i:%s') AS slot_start,
                 TIME_FORMAT(s.end_time, '%H:%i:%s')   AS slot_end,
                 s.is_overnight AS slot_overnight
          FROM cs_shift_groups g
          JOIN cs_shift_slots s ON s.id = g.shift_slot_id
          WHERE g.is_active = 1
          ORDER BY g.sort_order ASC, g.name ASC
        ` as any)
    const targetGroups = groupFilter
      ? groups.filter(g => groupFilter.includes(g.id))
      : groups
    if (targetGroups.length === 0) {
      return NextResponse.json({ error: '활성 그룹이 없습니다. 먼저 설정 → 그룹 탭에서 그룹을 만드세요.' }, { status: 400 })
    }

    // N-16 — 그룹별 skip_on_holidays 별도 조회 (graceful — 컬럼 없으면 false)
    const groupSkipHolidaysMap = new Map<string, boolean>()
    if (hasGroupSkipOnHolidays && targetGroups.length > 0) {
      try {
        const shRows = await prisma.$queryRaw<any[]>`
          SELECT id, skip_on_holidays FROM cs_shift_groups WHERE is_active = 1
        `
        for (const r of shRows) groupSkipHolidaysMap.set(r.id, Boolean(r.skip_on_holidays))
      } catch { /* graceful */ }
    }
    // 각 그룹 row 에 skip_on_holidays 주입
    for (const g of targetGroups) {
      g.skip_on_holidays = groupSkipHolidaysMap.get(g.id) ? 1 : 0
    }

    // N-32 — 그룹별 include_holidays_extra 별도 조회 (graceful)
    const groupIncludeHolidaysMap = new Map<string, boolean>()
    if (hasGroupIncludeHolidaysExtra && targetGroups.length > 0) {
      try {
        const ihRows = await prisma.$queryRaw<any[]>`
          SELECT id, include_holidays_extra FROM cs_shift_groups WHERE is_active = 1
        `
        for (const r of ihRows) groupIncludeHolidaysMap.set(r.id, Boolean(r.include_holidays_extra))
      } catch { /* graceful */ }
    }
    for (const g of targetGroups) {
      g.include_holidays_extra = groupIncludeHolidaysMap.get(g.id) ? 1 : 0
    }

    // N-35 — 그룹별 allow_same_day_other_group 별도 조회 (graceful)
    const groupAllowOverlapMap = new Map<string, boolean>()
    if (hasGroupAllowOverlap && targetGroups.length > 0) {
      try {
        const aoRows = await prisma.$queryRaw<any[]>`
          SELECT id, allow_same_day_other_group FROM cs_shift_groups WHERE is_active = 1
        `
        for (const r of aoRows) groupAllowOverlapMap.set(r.id, Boolean(r.allow_same_day_other_group))
      } catch { /* graceful */ }
    }
    for (const g of targetGroups) {
      g.allow_same_day_other_group = groupAllowOverlapMap.get(g.id) ? 1 : 0
    }

    // N-55 — 그룹 cycle (squad_rotation) 셋팅 + 멤버 squad 정보 (graceful)
    let hasGroupCycle = true
    try {
      await prisma.$queryRaw<any[]>`SELECT cycle_kind FROM cs_shift_groups LIMIT 1`
    } catch { hasGroupCycle = false }
    let hasMemberSquad = true
    try {
      await prisma.$queryRaw<any[]>`SELECT squad FROM cs_group_members LIMIT 1`
    } catch { hasMemberSquad = false }
    type CycleCfg = { kind: string | null; days: number | null; start: string | null }
    const groupCycleMap = new Map<string, CycleCfg>()
    if (hasGroupCycle && targetGroups.length > 0) {
      try {
        const ccRows = await prisma.$queryRaw<any[]>`
          SELECT id, cycle_kind, cycle_days_per_member,
                 DATE_FORMAT(cycle_start_date, '%Y-%m-%d') AS cycle_start_date
          FROM cs_shift_groups WHERE is_active = 1
        `
        for (const r of ccRows) {
          groupCycleMap.set(r.id, {
            kind: r.cycle_kind || null,
            days: r.cycle_days_per_member != null ? Number(r.cycle_days_per_member) : null,
            start: r.cycle_start_date || null,
          })
        }
      } catch { /* graceful */ }
    }
    for (const g of targetGroups) {
      const cc = groupCycleMap.get(g.id)
      g.cycle_kind = cc?.kind || null
      g.cycle_days_per_member = cc?.days ?? null
      g.cycle_start_date = cc?.start ?? null
    }
    // 멤버 squad 매핑 (group_id + worker_id → {squad, order})
    type SquadInfo = { squad: 'A' | 'B'; order: number }
    const memberSquadMap = new Map<string, SquadInfo>()
    if (hasMemberSquad && targetGroups.length > 0) {
      try {
        const sqRows = await prisma.$queryRaw<any[]>`
          SELECT group_id, worker_id, squad, squad_order
          FROM cs_group_members
          WHERE squad IN ('A', 'B')
        `
        for (const r of sqRows) {
          memberSquadMap.set(`${r.group_id}_${r.worker_id}`, {
            squad: r.squad === 'A' ? 'A' : 'B',
            order: r.squad_order != null ? Number(r.squad_order) : 0,
          })
        }
      } catch { /* graceful */ }
    }
    // 일자별 active 멤버 계산 헬퍼
    function computeActiveSquadMember(g: GroupRow, isoDate: string): string | null {
      const kind = g.cycle_kind
      if (kind !== 'squad_rotation') return null
      const N = Math.max(1, Number(g.cycle_days_per_member) || 5)
      const cycleStart = g.cycle_start_date || null
      if (!cycleStart) return null
      // 그룹의 A/B 멤버 목록 추출
      const gMembers = membersByGroup.get(g.id) || []
      const aList: Array<{ wId: string; order: number }> = []
      const bList: Array<{ wId: string; order: number }> = []
      for (const wId of gMembers) {
        const sq = memberSquadMap.get(`${g.id}_${wId}`)
        if (!sq) continue
        if (sq.squad === 'A') aList.push({ wId, order: sq.order })
        else bList.push({ wId, order: sq.order })
      }
      aList.sort((x, y) => x.order - y.order)
      bList.sort((x, y) => x.order - y.order)
      const A = aList.map(x => x.wId)
      const B = bList.map(x => x.wId)
      if (A.length === 0 && B.length === 0) return null
      const aCycleLen = A.length * N
      const bCycleLen = B.length * N
      const total = aCycleLen + bCycleLen
      if (total === 0) return null
      // 일자 차이 계산
      const s = new Date(cycleStart + 'T00:00:00')
      const d = new Date(isoDate + 'T00:00:00')
      const elapsed = Math.floor((d.getTime() - s.getTime()) / 86400000)
      if (elapsed < 0) return null
      const pos = ((elapsed % total) + total) % total
      if (pos < aCycleLen && A.length > 0) {
        const idx = Math.floor(pos / N)
        return A[Math.min(idx, A.length - 1)]
      } else if (B.length > 0) {
        const idx = Math.floor((pos - aCycleLen) / N)
        return B[Math.min(idx, B.length - 1)]
      }
      return null
    }

    // N-19-b — 그룹 rotation 설정 별도 조회 (graceful)
    type GroupRotationCfg = { enabled: boolean; period_kind: string; period_days: number }
    const groupRotMap = new Map<string, GroupRotationCfg>()
    if (hasGroupRotation && targetGroups.length > 0) {
      try {
        const rRows = await prisma.$queryRaw<any[]>`
          SELECT id, rotation_enabled, rotation_period_kind, rotation_custom_days
          FROM cs_shift_groups WHERE is_active = 1
        `
        for (const r of rRows) {
          groupRotMap.set(r.id, {
            enabled: Boolean(r.rotation_enabled),
            period_kind: String(r.rotation_period_kind || 'monthly'),
            period_days: Math.max(1, Number(r.rotation_custom_days || 30)),
          })
        }
      } catch { /* graceful */ }
    }

    // N-19-b — 그룹 ↔ 시프트 sequence (cs_group_shifts)
    type GroupShiftRow = { shift_slot_id: string; sort_order: number; slot_start: string; slot_end: string; is_overnight: number }
    const groupShiftsMap = new Map<string, GroupShiftRow[]>()
    if (hasGroupShifts && targetGroups.length > 0) {
      try {
        const gsRows = await prisma.$queryRaw<any[]>`
          SELECT gs.group_id, gs.shift_slot_id, gs.sort_order,
                 TIME_FORMAT(s.start_time, '%H:%i:%s') AS slot_start,
                 TIME_FORMAT(s.end_time, '%H:%i:%s')   AS slot_end,
                 s.is_overnight
          FROM cs_group_shifts gs
          JOIN cs_shift_slots s ON s.id = gs.shift_slot_id
          ORDER BY gs.group_id, gs.sort_order ASC
        `
        for (const r of gsRows) {
          const arr = groupShiftsMap.get(r.group_id) || []
          arr.push({
            shift_slot_id: String(r.shift_slot_id),
            sort_order: Number(r.sort_order || 0),
            slot_start: r.slot_start,
            slot_end: r.slot_end,
            is_overnight: Number(r.is_overnight || 0),
          })
          groupShiftsMap.set(r.group_id, arr)
        }
      } catch { /* graceful */ }
    }

    // N-19-b — 멤버별 rotation 시작 시점 (graceful)
    type MemberRotCfg = { start_date: string | null; start_index: number; end_date: string | null }
    const memberRotMap = new Map<string, MemberRotCfg>()  // key: group_id + '_' + worker_id
    if (hasMemberRotation && targetGroups.length > 0) {
      try {
        const placeholders = targetGroups.map(() => '?').join(',')
        const sql = `
          SELECT group_id, worker_id,
                 DATE_FORMAT(rotation_start_date, '%Y-%m-%d') AS start_date,
                 rotation_start_index,
                 DATE_FORMAT(rotation_end_date, '%Y-%m-%d')   AS end_date
          FROM cs_group_members WHERE group_id IN (${placeholders})
        `
        const ids = targetGroups.map(g => g.id)
        const mRows = await prisma.$queryRawUnsafe<any[]>(sql, ...ids) as any[]
        for (const r of mRows) {
          memberRotMap.set(`${r.group_id}_${r.worker_id}`, {
            start_date: r.start_date || null,
            start_index: Number(r.rotation_start_index || 0),
            end_date: r.end_date || null,
          })
        }
      } catch { /* graceful */ }
    }

    // ── N-21-b — 버전 timeline 일괄 fetch (graceful — 테이블 미적용 시 빈 Map) ──
    type VersionRow = {
      id: string; group_id: string
      valid_from: string; valid_to: string | null
      rotation_enabled: boolean; rotation_period_kind: string; rotation_custom_days: number
      pattern_type: string; custom_days: string | null
      skip_on_holidays: boolean
    }
    const groupVersionsMap = new Map<string, VersionRow[]>()  // group_id → 버전 list (시작일 ASC)
    const versionShiftsMap = new Map<string, Array<{ shift_slot_id: string; sort_order: number }>>()
    const versionMembersMap = new Map<string, Array<{
      worker_id: string; priority: number
      rotation_start_date: string | null; rotation_start_index: number; rotation_end_date: string | null
    }>>()
    if (hasGroupVersions && targetGroups.length > 0) {
      try {
        const placeholders = targetGroups.map(() => '?').join(',')
        const ids = targetGroups.map(g => g.id)
        // 버전 헤더
        const vRows: any[] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, group_id,
                  DATE_FORMAT(valid_from, '%Y-%m-%d') AS valid_from,
                  DATE_FORMAT(valid_to,   '%Y-%m-%d') AS valid_to,
                  rotation_enabled, rotation_period_kind, rotation_custom_days,
                  pattern_type, custom_days, skip_on_holidays
           FROM cs_shift_group_versions
           WHERE group_id IN (${placeholders})
           ORDER BY group_id, valid_from ASC`,
          ...ids,
        ) as any[]
        for (const r of vRows) {
          const arr = groupVersionsMap.get(r.group_id) || []
          arr.push({
            id: String(r.id),
            group_id: String(r.group_id),
            valid_from: String(r.valid_from),
            valid_to: r.valid_to || null,
            rotation_enabled: Boolean(r.rotation_enabled),
            rotation_period_kind: String(r.rotation_period_kind || 'monthly'),
            rotation_custom_days: Math.max(1, Number(r.rotation_custom_days || 30)),
            pattern_type: String(r.pattern_type || 'all_weekdays'),
            custom_days: r.custom_days || null,
            skip_on_holidays: Boolean(r.skip_on_holidays),
          })
          groupVersionsMap.set(r.group_id, arr)
        }
        // 모든 versionId 추출 후 shifts / members 한 번에 fetch
        const versionIds = vRows.map(v => v.id)
        if (versionIds.length > 0) {
          const vPlaceholders = versionIds.map(() => '?').join(',')
          // 시프트 sequence
          try {
            const gsvRows: any[] = await prisma.$queryRawUnsafe<any[]>(
              `SELECT version_id, shift_slot_id, sort_order
               FROM cs_group_shift_versions
               WHERE version_id IN (${vPlaceholders})
               ORDER BY version_id, sort_order ASC`,
              ...versionIds,
            ) as any[]
            for (const r of gsvRows) {
              const arr = versionShiftsMap.get(r.version_id) || []
              arr.push({
                shift_slot_id: String(r.shift_slot_id),
                sort_order: Number(r.sort_order || 0),
              })
              versionShiftsMap.set(r.version_id, arr)
            }
          } catch { /* graceful */ }
          // 멤버
          try {
            const mvRows: any[] = await prisma.$queryRawUnsafe<any[]>(
              `SELECT version_id, worker_id, priority,
                      DATE_FORMAT(rotation_start_date, '%Y-%m-%d') AS rotation_start_date,
                      rotation_start_index,
                      DATE_FORMAT(rotation_end_date, '%Y-%m-%d')   AS rotation_end_date
               FROM cs_group_member_versions
               WHERE version_id IN (${vPlaceholders})
               ORDER BY version_id, priority ASC`,
              ...versionIds,
            ) as any[]
            for (const r of mvRows) {
              const arr = versionMembersMap.get(r.version_id) || []
              arr.push({
                worker_id: String(r.worker_id),
                priority: Number(r.priority || 0),
                rotation_start_date: r.rotation_start_date || null,
                rotation_start_index: Number(r.rotation_start_index || 0),
                rotation_end_date: r.rotation_end_date || null,
              })
              versionMembersMap.set(r.version_id, arr)
            }
          } catch { /* graceful */ }
        }
      } catch { /* graceful */ }
    }

    // 3) 그룹 멤버
    const groupIds = targetGroups.map(g => g.id)
    let members: MemberRow[] = []
    if (groupIds.length > 0) {
      const placeholders = groupIds.map(() => '?').join(',')
      const sql = `SELECT group_id, worker_id, priority FROM cs_group_members
                   WHERE group_id IN (${placeholders}) ORDER BY priority ASC`
      members = await prisma.$queryRawUnsafe<MemberRow[]>(sql, ...groupIds) as any
    }
    const membersByGroup = new Map<string, string[]>()
    for (const m of members) {
      const arr = membersByGroup.get(m.group_id) || []
      arr.push(m.worker_id)
      membersByGroup.set(m.group_id, arr)
    }

    // N-57 — Cross-group cover pairs (이 그룹 결원 시 cover 그룹 멤버 진입 허용)
    //   coverPairsBySource: Map<source_group_id, Array<{cover_group_id, priority}>>
    interface CoverPairInfo { cover_group_id: string; priority: number }
    const coverPairsBySource = new Map<string, CoverPairInfo[]>()
    let hasCoverPairs = true
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_group_cover_pairs LIMIT 1`
    } catch { hasCoverPairs = false }
    if (hasCoverPairs && groupIds.length > 0) {
      try {
        const placeholders = groupIds.map(() => '?').join(',')
        const cpRows = await prisma.$queryRawUnsafe<any[]>(`
          SELECT source_group_id, cover_group_id, priority
          FROM cs_group_cover_pairs
          WHERE is_active = 1 AND source_group_id IN (${placeholders})
          ORDER BY priority ASC
        `, ...groupIds) as any
        for (const r of cpRows) {
          const arr = coverPairsBySource.get(r.source_group_id) || []
          arr.push({
            cover_group_id: String(r.cover_group_id),
            priority: r.priority != null ? Number(r.priority) : 1,
          })
          coverPairsBySource.set(r.source_group_id, arr)
        }
      } catch { /* graceful */ }
    }
    // helper: source 그룹의 cover 멤버 IDs (priority 순 평탄화)
    const getCoverWorkers = (sourceGroupId: string): string[] => {
      const pairs = coverPairsBySource.get(sourceGroupId)
      if (!pairs || pairs.length === 0) return []
      const out: string[] = []
      for (const p of pairs) {
        const members = membersByGroup.get(p.cover_group_id) || []
        for (const wId of members) {
          if (!out.includes(wId)) out.push(wId)
        }
      }
      return out
    }

    // 4) 휴일 (exclude_auto=1) — 해당 월
    // N-31 — 항상 fetch (그룹 skip_on_holidays=1 가드를 위해)
    //   다이얼로그의 「휴일 자동 제외」 옵션은 그룹 skip=0 에 대한 master kill switch 역할만
    //
    // N-41 — 주말 공휴일은 가드 X (사용자 결정 2026-05-17)
    //   "둘 다 공휴일 근무 되면 안 되니" + "6월 6일은 공휴일이 아니고"
    //   · 평일 공휴일/대체공휴일만 가드 작동 (운영상 진짜 「공휴일 휴무」 의미)
    //   · 주말 (토/일) 공휴일은 → 「주말 근무자가 정상 근무」 (가드 X)
    //   · 대체공휴일 페어 (3/1 일 + 3/2 월) 의 경우 → 3/2 만 가드 → 둘 다 적용 회피
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    let holidayDates = new Set<string>()
    let holidayList: HolidayRow[] = []
    try {
      holidayList = await prisma.$queryRaw<any[]>`
        SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date,
               exclude_auto, name
        FROM cs_holidays
        WHERE holiday_date BETWEEN ${monthStart} AND ${monthEnd}
          AND exclude_auto = 1
      ` as any
      // N-43 (사용자 정정 2026-05-17) — 「대체공휴일 페어 있는 주말 공휴일」만 가드 X
      //   · 평일 공휴일/대체공휴일 → 가드 작동 (회사 휴무)
      //   · 대체공휴일 페어 있는 주말 공휴일 (예: 3/1 일 삼일절 + 3/2 월 대체) → 가드 X
      //     (3/2 가 진짜 가드 → 둘 다 적용 방지)
      //   · 페어 없는 주말 공휴일 (예: 6/6 토 현충일) → 가드 작동 (회사 휴무 그대로)
      //
      //   페어 인식: name 패턴 "대체공휴일(X)" 의 X 를 원본 이름과 매칭
      const substituteOriginalNames = new Set<string>()
      for (const h of holidayList) {
        const m = String(h.name || '').match(/대체공휴일\(([^)]+)\)/)
        if (m) substituteOriginalNames.add(m[1].trim())
      }
      const filtered = holidayList.filter(h => {
        const d = new Date(h.holiday_date + 'T00:00:00')
        const dow = d.getDay()
        const isWeekend = dow === 0 || dow === 6
        if (!isWeekend) return true  // 평일 → 가드 작동
        // 주말 공휴일 — 대체공휴일 페어 있으면 가드 X
        const hasPair = substituteOriginalNames.has(String(h.name || '').trim())
        return !hasPair  // 페어 있으면 가드 X / 없으면 가드 작동
      })
      holidayDates = new Set(filtered.map(h => h.holiday_date))
    } catch {
      // 테이블 미적용 시 무시
    }

    // 5) 연차 — 해당 월 걸친 것
    // N-52 (사용자 보고 2026-05-17): "매니저 등록한 게 적용 안 됨"
    //   원인: status 필터 없어서 pending/rejected 도 포함 → 잘못된 휴가 적용
    //   fix: status='approved' 만 가드 작동 (cs_leaves.status IN approved)
    let leaves: LeaveRow[] = []
    try {
      leaves = await prisma.$queryRaw<any[]>`
        SELECT worker_id,
               DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
               DATE_FORMAT(end_date, '%Y-%m-%d')   AS end_date,
               am_pm
        FROM cs_leaves
        WHERE status = 'approved'
          AND NOT (end_date < ${monthStart} OR start_date > ${monthEnd})
      ` as any
    } catch {
      // 테이블 미적용 시 무시
    }

    // 워커별 (work_date → special_code) 맵
    const workerLeaveMap = new Map<string, Map<string, 'off' | 'am_half' | 'pm_half'>>()
    if (markLeaves) {
      for (const l of leaves) {
        const start = new Date(l.start_date + 'T00:00:00')
        const end = new Date(l.end_date + 'T00:00:00')
        const cur = new Date(start)
        while (cur <= end) {
          const isoDate = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
          if (isoDate >= monthStart && isoDate <= monthEnd) {
            const map = workerLeaveMap.get(l.worker_id) || new Map()
            map.set(isoDate, leaveToSpecial(l.am_pm))
            workerLeaveMap.set(l.worker_id, map)
          }
          cur.setDate(cur.getDate() + 1)
        }
      }
    }

    // 5-A) Phase K-3 — 그룹 단위 멤버 제약 (multi-group 워커가 그룹마다 다른 설정)
    //   memberCons: Map<`${groupId}_${workerId}`, MemberConstraint>
    //   workerCycle: Map<workerId, WorkerCycle> (워커 글로벌)
    let memberCons: Map<string, MemberConstraint> = new Map()
    let workerCycle: Map<string, WorkerCycle> = new Map()
    // N-29-d — 워커 개인 한계 (그룹 무관 — 모든 그룹 공통 적용)
    type WorkerLimits = {
      max_consecutive_work_days: number | null
      max_days_per_month: number | null
      min_days_per_month: number | null  // N-36 — 글로벌 월 최소 (모든 그룹 합산)
      blocked_slot_ids: Set<string>
      preferred_dow_prefer: number[]
      preferred_dow_avoid: number[]
    }
    const workerLimits = new Map<string, WorkerLimits>()
    let hasWorkerLimits = true
    try {
      await prisma.$queryRaw<any[]>`SELECT max_consecutive_work_days FROM cs_workers LIMIT 1`
    } catch { hasWorkerLimits = false }
    // N-36 — min_days_per_month 컬럼 graceful
    let hasWorkerMinDays = true
    try {
      await prisma.$queryRaw<any[]>`SELECT min_days_per_month FROM cs_workers LIMIT 1`
    } catch { hasWorkerMinDays = false }
    // N-56-b — work_cycle_pattern (그룹멤버) 컬럼 graceful
    //   같은 워커가 부엉이/달빛 등 여러 그룹에 다른 출발일로 들어갈 수 있음
    let hasMemberWorkCycle = true
    try {
      await prisma.$queryRaw<any[]>`SELECT work_cycle_pattern FROM cs_group_members LIMIT 1`
    } catch { hasMemberWorkCycle = false }
    // memberId → WorkCyclePattern (key = `${groupId}_${workerId}`)
    const memberWorkCycleMap = new Map<string, WorkCyclePattern>()
    if (hasMemberWorkCycle) {
      try {
        const wcpRows = await prisma.$queryRaw<any[]>`
          SELECT group_id, worker_id, work_cycle_pattern,
                 DATE_FORMAT(work_cycle_start_date, '%Y-%m-%d') AS work_cycle_start_date
          FROM cs_group_members
          WHERE work_cycle_pattern IS NOT NULL AND work_cycle_pattern <> ''
        `
        for (const r of wcpRows) {
          const p = parseWorkCyclePattern(r.work_cycle_pattern, r.work_cycle_start_date)
          if (p) memberWorkCycleMap.set(`${r.group_id}_${r.worker_id}`, p)
        }
      } catch { /* graceful */ }
    }
    // N-36 — min_days_per_month 별도 조회 (graceful)
    const workerMinDaysMap = new Map<string, number>()
    if (hasWorkerMinDays) {
      try {
        const minRows = await prisma.$queryRaw<any[]>`
          SELECT id, min_days_per_month FROM cs_workers WHERE is_active = 1
        `
        for (const r of minRows) {
          if (r.min_days_per_month != null) {
            workerMinDaysMap.set(String(r.id), Number(r.min_days_per_month))
          }
        }
      } catch { /* graceful */ }
    }
    if (usePriority) {
      try {
        // 워커 글로벌 cycle 정보 + N-29-d 개인 한계 (graceful)
        const wcRows = hasWorkerLimits
          ? await prisma.$queryRaw<any[]>`
              SELECT id,
                     cycle_days_on, cycle_days_off,
                     DATE_FORMAT(cycle_start_date, '%Y-%m-%d') AS cycle_start_date,
                     max_consecutive_work_days, max_days_per_month,
                     blocked_slot_ids, preferred_dow_prefer, preferred_dow_avoid
              FROM cs_workers WHERE is_active = 1
            `
          : await prisma.$queryRaw<any[]>`
              SELECT id,
                     cycle_days_on, cycle_days_off,
                     DATE_FORMAT(cycle_start_date, '%Y-%m-%d') AS cycle_start_date
              FROM cs_workers WHERE is_active = 1
            `
        for (const w of wcRows) {
          workerCycle.set(w.id, {
            worker_id: w.id,
            cycle_days_on: w.cycle_days_on != null ? Number(w.cycle_days_on) : null,
            cycle_days_off: w.cycle_days_off != null ? Number(w.cycle_days_off) : null,
            cycle_start_date: w.cycle_start_date,
          })
          // N-29-d — 워커 개인 한계 저장
          if (hasWorkerLimits) {
            let wBlocked = new Set<string>()
            if (w.blocked_slot_ids != null) {
              try {
                const arr = typeof w.blocked_slot_ids === 'string'
                  ? JSON.parse(w.blocked_slot_ids)
                  : (Array.isArray(w.blocked_slot_ids) ? w.blocked_slot_ids : [])
                if (Array.isArray(arr)) wBlocked = new Set(arr.map(String))
              } catch { /* graceful */ }
            }
            workerLimits.set(w.id, {
              max_consecutive_work_days: w.max_consecutive_work_days != null
                ? Number(w.max_consecutive_work_days) : null,
              max_days_per_month: w.max_days_per_month != null
                ? Number(w.max_days_per_month) : null,
              min_days_per_month: workerMinDaysMap.get(w.id) ?? null,  // N-36
              blocked_slot_ids: wBlocked,
              preferred_dow_prefer: parseDowList(w.preferred_dow_prefer),
              preferred_dow_avoid: parseDowList(w.preferred_dow_avoid),
            })
          }
        }
        // 멤버 설정 (그룹 × 워커 단위)
        try {
          const memberRows = await prisma.$queryRaw<any[]>`
            SELECT m.group_id, m.worker_id,
                   m.priority_level, m.preferred_dow_avoid, m.preferred_dow_prefer,
                   m.max_days_per_month,
                   m.max_consecutive_work_days, m.blocked_slot_ids
            FROM cs_group_members m
            JOIN cs_workers w ON w.id = m.worker_id
            WHERE w.is_active = 1
          `
          for (const r of memberRows) {
            // blocked_slot_ids JSON 안전 파싱
            let blocked: Set<string> = new Set()
            if (r.blocked_slot_ids != null) {
              try {
                const arr = typeof r.blocked_slot_ids === 'string'
                  ? JSON.parse(r.blocked_slot_ids)
                  : (Array.isArray(r.blocked_slot_ids) ? r.blocked_slot_ids : [])
                if (Array.isArray(arr)) blocked = new Set(arr.map(String))
              } catch { /* 무시 */ }
            }
            // N-29-d — 그룹 cfg 가 비어있으면 워커 cfg 적용 (워커 마스터 우선 정책)
            const wL = workerLimits.get(r.worker_id)
            const grpMaxConsec = r.max_consecutive_work_days != null ? Number(r.max_consecutive_work_days) : null
            const grpMaxDays = r.max_days_per_month != null ? Number(r.max_days_per_month) : null
            const grpDowPrefer = parseDowList(r.preferred_dow_prefer)
            const grpDowAvoid = parseDowList(r.preferred_dow_avoid)
            memberCons.set(`${r.group_id}_${r.worker_id}`, {
              group_id: r.group_id,
              worker_id: r.worker_id,
              priority_level: Number(r.priority_level || 2),
              // N-29-d — 그룹 cfg 우선, NULL/빈 set 이면 워커 cfg fallback
              preferred_dow_avoid: grpDowAvoid.length > 0 ? grpDowAvoid : (wL?.preferred_dow_avoid || []),
              preferred_dow_prefer: grpDowPrefer.length > 0 ? grpDowPrefer : (wL?.preferred_dow_prefer || []),
              max_days_per_month: grpMaxDays != null ? grpMaxDays : (wL?.max_days_per_month ?? null),
              max_consecutive_work_days: grpMaxConsec != null ? grpMaxConsec : (wL?.max_consecutive_work_days ?? null),
              blocked_slot_ids: blocked.size > 0 ? blocked : (wL?.blocked_slot_ids || new Set()),
            })
          }
        } catch {
          // 마이그 미적용 — 멤버 설정 컬럼 없음
        }
      } catch {
        // 마이그 미적용 — 단순 rotation 동작
      }
    }
    // 그룹 컨텍스트 + 워커 ID 로 멤버 제약 lookup
    // N-29-d — memberCons 없으면 워커 cfg 로 fallback (워커 마스터 적용)
    const lookupMember = (groupId: string, workerId: string): MemberConstraint | undefined => {
      const mc = memberCons.get(`${groupId}_${workerId}`)
      if (mc) return mc
      const wL = workerLimits.get(workerId)
      if (!wL) return undefined
      return {
        group_id: groupId,
        worker_id: workerId,
        priority_level: 2,
        preferred_dow_avoid: wL.preferred_dow_avoid,
        preferred_dow_prefer: wL.preferred_dow_prefer,
        max_days_per_month: wL.max_days_per_month,
        max_consecutive_work_days: wL.max_consecutive_work_days,
        blocked_slot_ids: wL.blocked_slot_ids,
      }
    }
    // cycle 포함 통합 (옛 workerCons.get 호환 — 부분 컬럼만 사용처가 있어 alias 만)
    const lookupWorkerCycle = (workerId: string): WorkerCycle | undefined => {
      return workerCycle.get(workerId)
    }

    // 5-C) PR-2SS-h-1 — 그룹 차원 회피일 (graceful)
    //   approved status 만 후보 제외 — requested/rejected/canceled 는 영향 X
    const groupSkipMap = new Map<string, GroupSkipRow[]>()  // group_id → rows
    try {
      const skipRows: any[] = await prisma.$queryRaw<any[]>`
        SELECT group_id, worker_id,
               DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
               DATE_FORMAT(end_date,   '%Y-%m-%d') AS end_date,
               reason
        FROM cs_group_member_skip_dates
        WHERE status = 'approved'
          AND NOT (end_date < ${monthStart} OR start_date > ${monthEnd})
      `
      for (const r of skipRows) {
        const arr = groupSkipMap.get(r.group_id) || []
        arr.push({
          group_id: r.group_id,
          worker_id: r.worker_id,
          start_date: r.start_date,
          end_date: r.end_date,
          reason: r.reason,
        })
        groupSkipMap.set(r.group_id, arr)
      }
    } catch {
      // 마이그 미적용 — 회피일 가드 비활성
    }

    // 5-B) PR-2QQ-d-3 — 그룹 × 요일 최소 인원 (graceful)
    const coverageByGroup = new Map<string, CoverageRow[]>()
    if (enforceMinCoverage) {
      try {
        const cRows = await prisma.$queryRaw<any[]>`
          SELECT group_id, dow, min_workers
          FROM cs_group_min_coverage
        `
        for (const r of cRows) {
          const arr = coverageByGroup.get(r.group_id) || []
          arr.push({
            group_id: r.group_id,
            dow: r.dow == null ? null : Number(r.dow),
            min_workers: Number(r.min_workers),
          })
          coverageByGroup.set(r.group_id, arr)
        }
      } catch {
        // 마이그 미적용
      }
    }

    // 6) 기존 배정 조회 — PR-2QQ-b: manual_lock 컬럼 graceful
    let hasLockCol = true
    try {
      await prisma.$queryRaw<any[]>`SELECT manual_lock FROM cs_assignments LIMIT 1`
    } catch { hasLockCol = false }

    const existingRows: AssignmentRow[] = hasLockCol
      ? (await prisma.$queryRaw<any[]>`
          SELECT id, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
                 shift_slot_id, worker_id, special_code, manual_lock
          FROM cs_assignments WHERE schedule_id = ${scheduleId}
        ` as any)
      : (await prisma.$queryRaw<any[]>`
          SELECT id, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
                 shift_slot_id, worker_id, special_code
          FROM cs_assignments WHERE schedule_id = ${scheduleId}
        ` as any)
    // (date, slot, worker) → assignment — PR-2OO: 1셀 N워커 허용 (worker_id 포함)
    const existingMap = new Map<string, AssignmentRow>()
    // (date, slot) → 모든 워커 — PR-2QQ-b: lock 셀 검사용
    const lockedSlotMap = new Map<string, Set<string>>()  // (date_slot) → Set<worker_id>
    for (const a of existingRows) {
      existingMap.set(`${a.work_date}_${a.shift_slot_id}_${a.worker_id || 'null'}`, a)
      if (a.manual_lock && a.worker_id) {
        const k = `${a.work_date}_${a.shift_slot_id}`
        const set = lockedSlotMap.get(k) || new Set<string>()
        set.add(a.worker_id)
        lockedSlotMap.set(k, set)
      }
    }

    // ── 7) 계획 산출 ────────────────────────────────────────────────
    interface PlanRow {
      work_date: string
      shift_slot_id: string
      worker_id: string | null
      special_code: 'none' | 'off' | 'am_free' | 'pm_free' | 'am_half' | 'pm_half'
      action: 'insert' | 'update' | 'skip-existing' | 'skip-holiday' | 'skip-no-member'
      group_id: string
      group_name: string
    }
    const plan: PlanRow[] = []
    const byGroup: Record<string, { generated: number; skipped: number }> = {}
    const byDate: Record<string, { generated: number }> = {}
    // PR-2QQ-d-3 — 통합 카운터 (워커 무관 그룹 합산)
    const counter = new Map<string, {
      total: number
      by_dow: number[]   // 길이 7
      last_date: string | null
      // N-34 — 그룹별 누적 (target_ratio 균형 계산용)
      by_group: Map<string, { total: number; last_date: string | null }>
    }>()
    const ensureCounter = (wId: string) => {
      if (!counter.has(wId)) counter.set(wId, {
        total: 0, by_dow: [0,0,0,0,0,0,0], last_date: null,
        by_group: new Map(),
      })
      return counter.get(wId)!
    }
    // N-34 — 그룹 안 카운터 헬퍼
    const ensureGroupBucket = (wId: string, gId: string) => {
      const cn = ensureCounter(wId)
      if (!cn.by_group.has(gId)) cn.by_group.set(gId, { total: 0, last_date: null })
      return cn.by_group.get(gId)!
    }

    // N-34 — (group_id, worker_id) → target_ratio 맵 (graceful)
    //   디폴트 1.0, 0 = hard exclude
    const targetRatioMap = new Map<string, number>()  // key: `${groupId}_${workerId}`
    let hasTargetRatio = true
    try {
      await prisma.$queryRaw<any[]>`SELECT target_ratio FROM cs_group_members LIMIT 1`
    } catch { hasTargetRatio = false }
    if (hasTargetRatio) {
      try {
        const ratioRows = await prisma.$queryRaw<any[]>`
          SELECT group_id, worker_id, target_ratio FROM cs_group_members
        `
        for (const r of ratioRows) {
          const v = Number(r.target_ratio)
          targetRatioMap.set(`${r.group_id}_${r.worker_id}`,
            Number.isFinite(v) && v >= 0 ? v : 1.0)
        }
      } catch { /* graceful */ }
    }
    const lookupTargetRatio = (gId: string, wId: string): number => {
      const v = targetRatioMap.get(`${gId}_${wId}`)
      return v == null ? 1.0 : v  // 없으면 1.0 (디폴트)
    }

    // N-36 — (group_id, worker_id) → coverage_priority (graceful)
    //   NULL = priority_level 따라감 (디폴트)
    //   1~3 = 휴가 커버 우선순위 명시
    const coveragePriorityMap = new Map<string, number>()
    let hasCoveragePriority = true
    try {
      await prisma.$queryRaw<any[]>`SELECT coverage_priority FROM cs_group_members LIMIT 1`
    } catch { hasCoveragePriority = false }
    if (hasCoveragePriority) {
      try {
        const covRows = await prisma.$queryRaw<any[]>`
          SELECT group_id, worker_id, coverage_priority FROM cs_group_members
          WHERE coverage_priority IS NOT NULL
        `
        for (const r of covRows) {
          coveragePriorityMap.set(`${r.group_id}_${r.worker_id}`, Number(r.coverage_priority))
        }
      } catch { /* graceful */ }
    }
    // 효과 우선순위 계산: coverage_priority 명시 시 그것, 없으면 priority_level
    const lookupCoveragePriority = (gId: string, wId: string, fallback: number): number => {
      const v = coveragePriorityMap.get(`${gId}_${wId}`)
      return v == null ? fallback : v
    }

    // ── N-33 — counter prefill (직전 30일 cs_assignments 누적) ──────
    //  사용자 보고: "일당 1명 로테이션 그룹이 어떤 사유에 의해 하루가 끊기면
    //              근무자가 연속적으로 이어가야 하는데 로테이션이 다시 처음부터 시작"
    //
    //  원인: counter Map 이 매 자동 생성마다 새로 생성 → 매월 1일에 모두 total=0,
    //        last_date=null → JS stable sort → gMembers 의 priority 순서 그대로
    //        → 첫 워커부터 다시 시작
    //
    //  해결: 자동 생성 시작 직전에 직전 30일 cs_assignments 조회하여 counter prefill
    //        → last_date 거리 기준이 "오래 안 일한 사람 우선" 정상 작동
    //        → 같은 달 내 skip 후에도 자연 이어감
    try {
      const prefillEndDate = (() => {
        const d = new Date(`${monthStart}T00:00:00`)
        d.setDate(d.getDate() - 1)  // monthStart 의 전날
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })()
      const prefillStartDate = (() => {
        const d = new Date(`${prefillEndDate}T00:00:00`)
        d.setDate(d.getDate() - 29)  // 30일 window (양 끝 포함)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })()
      // N-34 — group_id 도 함께 fetch (그룹별 누적 prefill)
      const prefillRows = await prisma.$queryRaw<Array<{
        worker_id: string
        work_date: string
        special_code: string | null
        group_id: string | null
      }>>`
        SELECT worker_id,
               DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
               special_code,
               group_id
        FROM cs_assignments
        WHERE work_date BETWEEN ${prefillStartDate} AND ${prefillEndDate}
          AND worker_id IS NOT NULL
          AND (special_code IS NULL OR special_code != 'off')
        ORDER BY worker_id, work_date ASC
      `
      for (const r of prefillRows) {
        const cn = ensureCounter(r.worker_id)
        cn.total++
        const d = new Date(r.work_date + 'T00:00:00')
        const dowN = d.getDay()
        cn.by_dow[dowN]++
        if (!cn.last_date || cn.last_date < r.work_date) cn.last_date = r.work_date
        // N-34 — 그룹별 누적 (group_id 가 NULL 인 옛 데이터는 skip)
        if (r.group_id) {
          const gb = ensureGroupBucket(r.worker_id, r.group_id)
          gb.total++
          if (!gb.last_date || gb.last_date < r.work_date) gb.last_date = r.work_date
        }
      }
    } catch (e) {
      // graceful — prefill 실패해도 자동 생성은 진행 (counter 가 빈 상태로 시작)
      console.warn('[N-33] counter prefill failed:', (e as any)?.message || e)
    }

    // PR-2SS-b — 워커별 마지막 슬롯 종료 시각 추적 (익일 휴식 검사용)
    //   endMin: 자정 기준 분 단위 (overnight 슬롯이면 +24*60)
    //   endIsoDate: 슬롯이 끝난 날짜 (overnight 면 다음 날, 아니면 같은 날)
    const workerLastEnd = new Map<string, { endIsoDate: string; endMin: number }>()
    // PR-2SS-c — 워커별 연속 근무일 카운터 (휴무일 = 리셋, 근무일 = ++)
    //   슬롯의 max_consecutive_days + 워커의 max_consecutive_work_days 둘 중 작은 값 한도
    const workerConsec = new Map<string, number>()
    // PR-2SS-b — Warning 다중 타입 지원
    type Warning =
      | { type: 'missing'; group_id: string; group_name: string; date: string; missing: number }
      | { type: 'next_day_block'; worker_id: string; date: string; blocked_slot_id: string; blocking_hours: number; prev_end_date: string }
      | { type: 'time_conflict'; worker_id: string; date: string; slot_a: string; slot_b: string }
      // PR-2SS-c — 연속 한도 / 슬롯 거부
      | { type: 'consec_limit'; worker_id: string; date: string; slot_id: string; limit: number }
      | { type: 'slot_blocked'; worker_id: string; date: string; slot_id: string }
      // PR-2SS-d revert — seniority_short 폐기
      // PR-2SS-h-1 — 그룹 회피일 (approved 매치 시 후보 제외)
      | { type: 'group_skip'; worker_id: string; group_id: string; date: string; reason: string | null }
      // N-56 — 비균등 cycle 패턴 휴무 phase
      | { type: 'work_cycle_off'; worker_id: string; date: string; pattern: string }
      | { type: 'squad_work_cycle_off'; worker_id: string; group_id: string; date: string; pattern: string }
    const warnings: Warning[] = []

    // group_id → rotation cursor (usePriority=false 일 때만 사용)
    const rotState = new Map<string, { cursor: number; dayInPeriod: number }>()

    // 일자 우선 루프 (통합 counter 의 시간 순서 일관성)
    for (let d = 1; d <= lastDay; d++) {
      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dow = new Date(isoDate + 'T00:00:00').getDay()

      // PR-2SS-c — 오늘 근무한 워커 집계 (그룹 무관, 일자 단위)
      const workedToday = new Set<string>()

      for (const g of targetGroups) {
        if (!byGroup[g.id]) byGroup[g.id] = { generated: 0, skipped: 0 }
        const gMembers = membersByGroup.get(g.id) || []
        if (gMembers.length === 0) {
          if (d === 1) {  // 그룹 멤버 없음 안내 — 일자별 중복 X
            for (let dd = 1; dd <= lastDay; dd++) {
              const isoX = `${year}-${String(month).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
              plan.push({
                work_date: isoX, shift_slot_id: g.shift_slot_id, worker_id: null,
                special_code: 'none', action: 'skip-no-member',
                group_id: g.id, group_name: g.name,
              })
              byGroup[g.id].skipped++
            }
          }
          continue
        }

        // N-55 — cycle_kind='squad_rotation' 우선 처리 (A/B조 cycle)
        //   조원수 × N일 cycle: 일자별 active 멤버 결정 → 그 사람만 배정
        //   휴가/회피일/skip 등 가드는 그대로 적용
        if (g.cycle_kind === 'squad_rotation') {
          // 패턴 매칭 — pattern_type='all_days' 가 일반적이지만 다른 패턴도 적용
          const dowSet = patternDays(g.pattern_type, g.custom_days)
          if (!dowSet.has(dow)) continue
          // 휴일 가드
          const groupSkipsHoliday = hasGroupSkipOnHolidays
            ? Boolean(g.skip_on_holidays)
            : false
          const isHoliday = holidayDates.has(isoDate)
          if (isHoliday && (groupSkipsHoliday || skipHolidays)) {
            plan.push({
              work_date: isoDate, shift_slot_id: g.shift_slot_id, worker_id: null,
              special_code: 'none', action: 'skip-holiday',
              group_id: g.id, group_name: g.name,
            })
            byGroup[g.id].skipped++
            continue
          }
          // 일자별 active 멤버 1명
          const activeWorker = computeActiveSquadMember(g, isoDate)
          if (!activeWorker) {
            // cycle 셋팅 미흡 또는 멤버 없음 — 빈자리
            byGroup[g.id].skipped++
            continue
          }
          // 휴가/회피일 체크 → 안 일하면 빈자리 (N-51 자동 재배정 이후 fix 가능)
          const lm = workerLeaveMap.get(activeWorker)
          const sp = lm?.get(isoDate)
          if (sp === 'off') {
            byGroup[g.id].skipped++
            continue
          }
          const gSkips = groupSkipMap.get(g.id) || []
          const skipMatch = gSkips.find(s =>
            s.worker_id === activeWorker && isoDate >= s.start_date && isoDate <= s.end_date
          )
          if (skipMatch) {
            byGroup[g.id].skipped++
            continue
          }
          // N-56-b — 멤버 비균등 cycle 패턴 — active 멤버의 휴무 phase 면 빈자리
          //   squad cycle 안에서도 멤버 cycle 패턴 유효
          const sqWcp = memberWorkCycleMap.get(`${g.id}_${activeWorker}`)
          if (sqWcp && !isWorkDayByCyclePattern(sqWcp, isoDate)) {
            warnings.push({
              type: 'squad_work_cycle_off',
              worker_id: activeWorker, group_id: g.id, date: isoDate,
              pattern: sqWcp.parts.join(','),
            })
            byGroup[g.id].skipped++
            continue
          }
          // 외부 cycle — active 멤버가 외부 근무 phase 면 빈자리
          const sqCy = lookupWorkerCycle(activeWorker)
          if (sqCy && !isAvailableOnCycle(sqCy as any, isoDate)) {
            byGroup[g.id].skipped++
            continue
          }
          // INSERT
          const specialCode: 'none' | 'am_half' | 'pm_half' = sp ?? 'none'
          plan.push({
            work_date: isoDate,
            shift_slot_id: g.shift_slot_id,
            worker_id: activeWorker,
            special_code: specialCode,
            action: 'insert',
            group_id: g.id, group_name: g.name,
          })
          byGroup[g.id].generated++
          workedToday.add(activeWorker)
          // counter 갱신
          const cn = ensureCounter(activeWorker)
          cn.total++
          cn.by_dow[dow]++
          cn.last_date = isoDate
          const gb = ensureGroupBucket(activeWorker, g.id)
          gb.total++
          gb.last_date = isoDate
          continue  // 이 일자 이 그룹 끝
        }

        // N-30 — pattern_type='holidays_only' 처리 (휴일 전담 그룹)
        const isHolidaysOnly = g.pattern_type === 'holidays_only'
        if (isHolidaysOnly) {
          // 공휴일 일자가 아니면 skip
          if (!holidayDates.has(isoDate)) continue
          // 휴일이면 통과 (dow 무관) — skip_on_holidays 가드도 무시 (self-conflict)
        } else {
          const dowSet = patternDays(g.pattern_type, g.custom_days)
          const dowMatch = dowSet.has(dow)
          // N-32 — 패턴 매칭 X 라도 공휴일이면 추가 출근 (include_holidays_extra)
          const isHoliday = holidayDates.has(isoDate)
          const includeHolidaysExtra = hasGroupIncludeHolidaysExtra
            ? Boolean(g.include_holidays_extra)
            : false
          const holidayMatch = includeHolidaysExtra && isHoliday
          if (!dowMatch && !holidayMatch) continue

          // N-31 — 휴일 가드 강화:
          //   그룹.skip_on_holidays=1 → 다이얼로그 옵션과 무관하게 무조건 skip (그룹 셋팅 우선)
          //   그룹.skip_on_holidays=0 + 다이얼로그 ON (skipHolidays=true) → 전역 강제 skip
          //   그룹.skip_on_holidays=0 + 다이얼로그 OFF → 휴일 출근 (24/365 운영)
          //
          // N-32 추가:
          //   include_holidays_extra=1 이면 휴일이 「추가 매칭」 사유 → skip 가드 우회
          //   (skip 과 include 는 상호배반 — UI 에서 보장하지만 데이터 차원에서 안전 처리)
          const groupSkipsHoliday = hasGroupSkipOnHolidays
            ? Boolean(g.skip_on_holidays)
            : false
          const shouldSkipForHoliday = isHoliday && (groupSkipsHoliday || skipHolidays) && !includeHolidaysExtra
          if (shouldSkipForHoliday) {
            plan.push({
              work_date: isoDate, shift_slot_id: g.shift_slot_id, worker_id: null,
              special_code: 'none', action: 'skip-holiday',
              group_id: g.id, group_name: g.name,
            })
            byGroup[g.id].skipped++
            continue
          }
        }

        // ── N-21-b — 버전 timeline 우선 lookup ──
        // 해당 work_date 에 활성 버전이 있고 rotation_enabled 면 버전 데이터로 처리
        // 활성 버전 = valid_from <= isoDate <= valid_to (valid_to NULL = 무한)
        const versions = groupVersionsMap.get(g.id) || []
        const activeVersion = versions.find(v =>
          v.valid_from <= isoDate && (v.valid_to == null || v.valid_to >= isoDate)
        )
        if (activeVersion && activeVersion.rotation_enabled) {
          const verShifts = versionShiftsMap.get(activeVersion.id) || []
          const verMembers = versionMembersMap.get(activeVersion.id) || []
          if (verShifts.length > 0 && verMembers.length > 0) {
            // 버전의 skip_on_holidays 우선 적용
            if (skipHolidays && activeVersion.skip_on_holidays && holidayDates.has(isoDate)) {
              plan.push({
                work_date: isoDate, shift_slot_id: g.shift_slot_id, worker_id: null,
                special_code: 'none', action: 'skip-holiday',
                group_id: g.id, group_name: g.name,
              })
              byGroup[g.id].skipped++
              continue
            }
            // N-23 정정 — priority (멤버 순서) 기반 자동 분산
            // verMembers 는 priority ASC 순서 (cs_group_member_versions.priority)
            for (let memberIdx = 0; memberIdx < verMembers.length; memberIdx++) {
              const m = verMembers[memberIdx]
              const wId = m.worker_id
              // 휴가 풀-오프 제외
              const lm = workerLeaveMap.get(wId)
              const sp = lm?.get(isoDate)
              if (sp === 'off') continue
              // 그룹 회피일 (PR-2SS-h-1 — 그룹 단위, 버전 무관)
              const gSkips = groupSkipMap.get(g.id) || []
              const skipMatch = gSkips.find(s =>
                s.worker_id === wId && isoDate >= s.start_date && isoDate <= s.end_date
              )
              if (skipMatch) {
                warnings.push({
                  type: 'group_skip', worker_id: wId, group_id: g.id, date: isoDate, reason: skipMatch.reason || null,
                })
                continue
              }
              // 멤버별 시작일 / 종료일 (버전 멤버 데이터 우선)
              const startDate = m.rotation_start_date || activeVersion.valid_from
              const endDate = m.rotation_end_date || activeVersion.valid_to
              // N-23 — start_index 가 명시적으로 양수면 그것, 아니면 priority (memberIdx) 자동
              const baseIdx = (m.rotation_start_index > 0) ? m.rotation_start_index : memberIdx
              if (startDate && isoDate < startDate) continue
              if (endDate && isoDate > endDate) continue
              // elapsed_periods 계산 (버전의 period_kind / custom_days 사용)
              let elapsed = 0
              if (startDate) {
                const start = new Date(startDate + 'T00:00:00')
                const cur = new Date(isoDate + 'T00:00:00')
                if (activeVersion.rotation_period_kind === 'days') {
                  const diffMs = cur.getTime() - start.getTime()
                  elapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24) / activeVersion.rotation_custom_days)
                } else {
                  elapsed = (cur.getFullYear() - start.getFullYear()) * 12 + (cur.getMonth() - start.getMonth())
                }
                if (elapsed < 0) elapsed = 0
              }
              const shiftIndex = ((baseIdx + elapsed) % verShifts.length + verShifts.length) % verShifts.length
              const targetSlotId = verShifts[shiftIndex].shift_slot_id
              const specialCode: 'none' | 'am_half' | 'pm_half' = sp ?? 'none'
              plan.push({
                work_date: isoDate,
                shift_slot_id: targetSlotId,
                worker_id: wId,
                special_code: specialCode,
                action: 'insert',
                group_id: g.id, group_name: g.name,
              })
              byGroup[g.id].generated++
              workedToday.add(wId)
            }
            continue  // 버전 path 종료
          }
          // 버전은 있지만 shifts 또는 members 비어있음 → 기존 N-19-b path 로 fall-through
        }

        // ── N-19-b — 그룹 시프트 로테이션 (rotation_enabled — 버전 없는 경우) ──
        // rotation_enabled 이면 워커마다 elapsed_periods 기반 shift_slot_id 동적 결정
        // (휴가 / 회피일 / 휴일 가드만 적용 — 슬롯거부 / 연속한도 등은 후속 작업)
        const rotCfg = groupRotMap.get(g.id)
        const rotShifts = groupShiftsMap.get(g.id) || []
        if (rotCfg?.enabled && rotShifts.length > 0) {
          // N-23 정정 — priority (멤버 순서) 기반 자동 분산
          // gMembers 는 priority ASC 순서 (cs_group_members.priority)
          for (let memberIdx = 0; memberIdx < gMembers.length; memberIdx++) {
            const wId = gMembers[memberIdx]
            // 휴가 풀-오프 제외
            const lm = workerLeaveMap.get(wId)
            const sp = lm?.get(isoDate)
            if (sp === 'off') continue

            // 그룹 회피일 (PR-2SS-h-1) — approved 상태 매치 시 후보 제외
            const gSkips = groupSkipMap.get(g.id) || []
            const skipMatch = gSkips.find(s =>
              s.worker_id === wId && isoDate >= s.start_date && isoDate <= s.end_date
            )
            if (skipMatch) {
              warnings.push({
                type: 'group_skip', worker_id: wId, group_id: g.id, date: isoDate, reason: skipMatch.reason || null,
              })
              continue
            }

            // 멤버별 시작일 / 종료일 (start_index 는 priority 기반 자동 — 사용자 명시 override 가능)
            const mrot = memberRotMap.get(`${g.id}_${wId}`)
            const startDate = mrot?.start_date || null
            const endDate = mrot?.end_date || null
            // N-23 — start_index 가 명시적으로 0 보다 크면 그것 사용, 아니면 priority (memberIdx) 자동
            const baseIdx = (mrot && mrot.start_index > 0) ? mrot.start_index : memberIdx
            if (startDate && isoDate < startDate) continue  // 시작 전 → skip
            if (endDate && isoDate > endDate) continue      // 종료 후 → skip

            // elapsed_periods 계산
            let elapsed = 0
            if (startDate) {
              const start = new Date(startDate + 'T00:00:00')
              const cur = new Date(isoDate + 'T00:00:00')
              if (rotCfg.period_kind === 'days') {
                const diffMs = cur.getTime() - start.getTime()
                elapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24) / rotCfg.period_days)
              } else {
                // monthly — 자연 월 차이
                elapsed = (cur.getFullYear() - start.getFullYear()) * 12 + (cur.getMonth() - start.getMonth())
              }
              if (elapsed < 0) elapsed = 0
            }
            const shiftIndex = ((baseIdx + elapsed) % rotShifts.length + rotShifts.length) % rotShifts.length
            const targetSlot = rotShifts[shiftIndex]
            const targetSlotId = targetSlot.shift_slot_id

            // 휴가 반차/F (am_half / pm_half) — off 는 위에서 이미 skip 됨
            const specialCode: 'none' | 'am_half' | 'pm_half' = sp ?? 'none'

            plan.push({
              work_date: isoDate,
              shift_slot_id: targetSlotId,
              worker_id: wId,
              special_code: specialCode,
              action: 'insert',  // rotation 도 insert (기존 action type 호환)
              group_id: g.id, group_name: g.name,
            })
            byGroup[g.id].generated++
            workedToday.add(wId)
            // workerLastEnd / counter 갱신은 단순화 — 가드 통합은 N-19-c 에서
          }
          continue  // 기존 path skip
        }

        // (1) min 결정
        let minN: number
        if (enforceMinCoverage) {
          const cv = lookupMinCoverage(coverageByGroup, g.id, dow)
          if (cv != null) {
            minN = cv
          } else if (g.generation_strategy === 'rotation') {
            minN = Math.max(1, g.rotation_size || 1)
          } else {
            minN = gMembers.length  // all_members
          }
        } else {
          minN = g.generation_strategy === 'rotation'
            ? Math.max(1, g.rotation_size || 1)
            : gMembers.length
        }

        // (2) 이미 lock=1 박힌 워커 카운트
        const lockedKey = `${isoDate}_${g.shift_slot_id}`
        const lockedSet = lockedSlotMap.get(lockedKey) || new Set<string>()
        const need = Math.max(0, minN - lockedSet.size)

        // (3) 후보 풀 (멤버 - lock - on_leave - at_max - 패턴 미일치)
        // N-57 — Cross-group cover: 자기 그룹 멤버 + cover 그룹 멤버 (낮은 priority)
        const coverWorkers = getCoverWorkers(g.id)
        const coverWorkerSet = new Set(coverWorkers)
        // candidates 구성: 자기 그룹 멤버 우선 + cover 그룹 멤버 (자기 그룹에 없는 사람만)
        const initialPool = [
          ...gMembers,
          ...coverWorkers.filter(wId => !gMembers.includes(wId)),
        ]
        let candidates = initialPool.filter(wId => !lockedSet.has(wId))

        // 휴가 워커 제외 (full off 인 경우만 — am_half/pm_half 는 후보 유지하되 special_code 적용)
        candidates = candidates.filter(wId => {
          const lm = workerLeaveMap.get(wId)
          if (!lm) return true
          const sp = lm.get(isoDate)
          return sp !== 'off'  // 종일 off 면 제외
        })

        // N-56-b — 멤버 비균등 cycle 패턴 (그룹별 출발일) — 휴무 phase 면 hard exclude
        //   같은 워커가 부엉이/달빛 같은 다른 그룹에 다른 출발일로 들어갈 수 있음
        //   priority/rotation 모든 경로 공통 적용
        candidates = candidates.filter(wId => {
          const wcp = memberWorkCycleMap.get(`${g.id}_${wId}`)
          if (!wcp) return true
          if (!isWorkDayByCyclePattern(wcp, isoDate)) {
            warnings.push({
              type: 'work_cycle_off',
              worker_id: wId, date: isoDate, pattern: wcp.parts.join(','),
            })
            return false
          }
          return true
        })

        // PR-2QQ-d-revert — 외부 cycle (워커 글로벌) — 외부 근무 phase 면 hard exclude
        //   N-56 과 함께 모든 경로 공통 가드 (priority 안에 있던 가드는 중복이지만 graceful)
        candidates = candidates.filter(wId => {
          const cy = lookupWorkerCycle(wId)
          if (!cy) return true
          return isAvailableOnCycle(cy as any, isoDate)
        })

        // PR-2SS-b — 익일 휴식 가드 (슬롯의 next_day_blocking_hours 적용)
        //   직전 슬롯 종료 시각 + blockingHours 가 오늘 슬롯 시작 시각 이후면 후보 제외
        const blockingHours = Number(g.slot_next_day_blocking_hours || 0)
        if (blockingHours > 0) {
          const slotStartMin = timeToMin(g.slot_start)
          const todayStartMin = isoToMin(isoDate, slotStartMin)
          candidates = candidates.filter(wId => {
            const last = workerLastEnd.get(wId)
            if (!last) return true
            // last.endMin 이 last.endIsoDate 자정 기준이면 절대 분으로 변환
            const lastAbsMin = isoToMin(last.endIsoDate, 0) + last.endMin
            const gap = (todayStartMin - lastAbsMin) / 60  // 시간 단위
            if (gap < blockingHours) {
              warnings.push({
                type: 'next_day_block',
                worker_id: wId,
                date: isoDate,
                blocked_slot_id: g.shift_slot_id,
                blocking_hours: blockingHours,
                prev_end_date: last.endIsoDate,
              })
              return false
            }
            return true
          })
        }

        // PR-2SS-c → K-3: 슬롯 거부 (blocked_slot_ids) hard exclude — 멤버 단위
        candidates = candidates.filter(wId => {
          const mc = lookupMember(g.id, wId)
          if (mc && mc.blocked_slot_ids.has(g.shift_slot_id)) {
            warnings.push({
              type: 'slot_blocked',
              worker_id: wId, date: isoDate, slot_id: g.shift_slot_id,
            })
            return false
          }
          return true
        })

        // PR-2SS-c → K-3: 연속 한도 가드 (slot.max + 멤버.max 둘 중 작은 값)
        const slotConsecLimit = g.slot_max_consecutive_days != null ? Number(g.slot_max_consecutive_days) : null
        candidates = candidates.filter(wId => {
          const mc = lookupMember(g.id, wId)
          const limits: number[] = []
          if (slotConsecLimit != null && slotConsecLimit > 0) limits.push(slotConsecLimit)
          if (mc?.max_consecutive_work_days != null && mc.max_consecutive_work_days > 0) limits.push(mc.max_consecutive_work_days)
          if (limits.length === 0) return true
          const limit = Math.min(...limits)
          const cur = workerConsec.get(wId) || 0
          if (cur >= limit) {
            warnings.push({
              type: 'consec_limit',
              worker_id: wId, date: isoDate, slot_id: g.shift_slot_id, limit,
            })
            return false
          }
          return true
        })

        // PR-2SS-d revert — min_seniority 가드 폐기 (매니저 직접 판단)

        // PR-2SS-h-1 — 그룹 차원 회피일 hard exclude (approved status)
        const skipsForGroup = groupSkipMap.get(g.id)
        if (skipsForGroup && skipsForGroup.length > 0) {
          candidates = candidates.filter(wId => {
            const matched = skipsForGroup.find(s =>
              s.worker_id === wId && isoDate >= s.start_date && isoDate <= s.end_date
            )
            if (matched) {
              warnings.push({
                type: 'group_skip',
                worker_id: wId, group_id: g.id, date: isoDate,
                reason: matched.reason,
              })
              return false
            }
            return true
          })
        }

        // N-34 — target_ratio = 0 인 워커는 이 그룹에서 hard exclude
        candidates = candidates.filter(wId => {
          const ratio = lookupTargetRatio(g.id, wId)
          return ratio > 0
        })

        // N-37 — 글로벌 max_days_per_month hard cap (모든 경로 공통)
        //   사용자 보고 (2026-05-17): "정동민씨가 다른 사람 연차 시 먼저 우선순위로
        //                              본인 근무가능일에 배정되더라도 최대일을 넘길 순 없습니다"
        //
        //   기존 가드는 usePriority=true 안에서만 + lookupMember 하나만 검사 →
        //   멤버 cfg max 명시되면 워커 글로벌 max 우회 가능 (버그)
        //
        //   새 가드: 둘 다 검사 (작은 값 자동 적용) + 모든 경로 공통
        candidates = candidates.filter(wId => {
          const cn = counter.get(wId)
          if (!cn) return true  // counter 0 인 사람은 max 0건 비교 → 통과
          // 워커 글로벌 max (모든 그룹 합산 기준)
          //   N-58 — 0 은 미설정 동의어로 처리 (workerMax > 0 가드 추가)
          //          DB 옛 데이터에 0 누적된 경우 매월 0회 출근 방지
          const workerMax = workerLimits.get(wId)?.max_days_per_month
          if (workerMax != null && workerMax > 0 && cn.total >= workerMax) return false
          // 멤버 cfg max (이 그룹 명시 — 더 빡빡할 수 있음)
          const memberCfg = memberCons.get(`${g.id}_${wId}`)
          if (memberCfg?.max_days_per_month != null && memberCfg.max_days_per_month > 0
              && cn.total >= memberCfg.max_days_per_month) return false
          return true
        })

        // N-35 — 이 그룹이 「같은 날 다른 그룹 겹침」 허용 X 이면 workedToday hard exclude
        //   디폴트 false (한 사람 하루 1그룹). 24/365 특수 운영만 true.
        //   주의: 이 그룹이 allow=1 이어도 「상대 그룹」 이 allow=0 이면 그 워커는
        //         상대 그룹 처리 시 제외되어야 함. 단방향만 검사하면 비대칭 발생.
        //         안전한 해석 — 어느 한쪽이라도 금지면 전체 금지.
        //         → 이 그룹의 allow=0 일 때만 workedToday 가드 적용 (양방향 일관)
        const groupAllowsOverlap = hasGroupAllowOverlap
          ? Boolean(g.allow_same_day_other_group)
          : false
        if (!groupAllowsOverlap) {
          candidates = candidates.filter(wId => !workedToday.has(wId))
        }

        // (4) usePriority=true 면 가중치 정렬, false 면 단순 rotation
        let selected: string[]
        if (usePriority) {
          // max 초과 / 패턴 불일치 워커 제외 — K-3: 멤버 단위
          //   N-58 — 0 은 미설정 동의어로 처리 (> 0 가드)
          candidates = candidates.filter(wId => {
            const mc = lookupMember(g.id, wId)
            if (mc) {
              if (mc.max_days_per_month != null && mc.max_days_per_month > 0) {
                const cn = counter.get(wId)
                if (cn && cn.total >= mc.max_days_per_month) return false
              }
            }
            // PR-2QQ-d-revert: 외부 cycle (워커 글로벌) — 외부 근무 phase 면 당사 후보 X
            const cy = lookupWorkerCycle(wId)
            if (cy && !isAvailableOnCycle(cy as any, isoDate)) return false
            // N-56-b — 멤버 비균등 cycle 패턴 (당사 근무 cycle) — 휴무 phase 면 당사 후보 X
            //   이미 위에서 그룹멤버 단위로 한 번 가드했지만 priority 분기에서 재확인 (호환)
            const wcp = memberWorkCycleMap.get(`${g.id}_${wId}`)
            if (wcp && !isWorkDayByCyclePattern(wcp, isoDate)) return false
            return true
          })
          // 가중치 정렬 (K-3: 멤버 단위 priority/dow/필수일수)
          // N-34 — 그룹 분배 비율 (target_ratio) 우선 비교 추가
          // N-36 — 글로벌 min_days shortfall + coverage_priority 통합
          candidates.sort((a, b) => {
            const wa = lookupMember(g.id, a)
            const wb = lookupMember(g.id, b)
            const pa = wa?.priority_level || 2
            const pb = wb?.priority_level || 2
            const cnA = ensureCounter(a)
            const cnB = ensureCounter(b)
            // N-57 — Cover 그룹 멤버는 자기 그룹 멤버보다 항상 후순위
            //   자기 그룹 멤버가 다 빠진 경우에만 cover 멤버가 진입
            const aIsCover = !gMembers.includes(a) && coverWorkerSet.has(a) ? 1 : 0
            const bIsCover = !gMembers.includes(b) && coverWorkerSet.has(b) ? 1 : 0
            if (aIsCover !== bIsCover) return aIsCover - bIsCover  // 0 (own) 먼저, 1 (cover) 나중
            // N-36 — 글로벌 min_days_per_month shortfall 최우선
            //   외부인력 같은 「의도된 적은 출근」 보장 — 평소엔 후순위지만 min 까지는 보장
            //   N-58 — min=0 은 미설정 동의어 (> 0 가드)
            const wlA = workerLimits.get(a)
            const wlB = workerLimits.get(b)
            const aGlobalShort = wlA?.min_days_per_month != null && wlA.min_days_per_month > 0
              && cnA.total < wlA.min_days_per_month ? 1 : 0
            const bGlobalShort = wlB?.min_days_per_month != null && wlB.min_days_per_month > 0
              && cnB.total < wlB.min_days_per_month ? 1 : 0
            if (aGlobalShort !== bGlobalShort) return bGlobalShort - aGlobalShort  // shortfall 1 우선
            // priority_level (평소 순위) — coverage_priority 가 명시되면 fallback 으로만 사용
            // 부족분 채우기 단계(아래 단순 rotation 분기) 가 아닌 평소 정렬에서는 priority_level 사용
            if (pa !== pb) return pa - pb
            // N-36 — coverage_priority 보조 (priority_level 동등 시점에 적용)
            //   정동민 priority_level=3 + coverage_priority=1 →
            //   P3 끼리 후보일 때 (P1/P2 가 휴가 등으로 다 빠진 결원 시점) 1순위
            const aCov = lookupCoveragePriority(g.id, a, pa)
            const bCov = lookupCoveragePriority(g.id, b, pb)
            if (aCov !== bCov) return aCov - bCov
            // 희망 요일 매치 우선 (priority 다음)
            const aPrefer = wa?.preferred_dow_prefer.includes(dow) ? 0 : 1
            const bPrefer = wb?.preferred_dow_prefer.includes(dow) ? 0 : 1
            if (aPrefer !== bPrefer) return aPrefer - bPrefer
            const aAvoid = wa?.preferred_dow_avoid.includes(dow) ? 1 : 0
            const bAvoid = wb?.preferred_dow_avoid.includes(dow) ? 1 : 0
            if (aAvoid !== bAvoid) return aAvoid - bAvoid
            // N-48 — required_days_per_month 제거. 워커 글로벌 min_days_per_month 만 사용 (위쪽 aGlobalShort)
            // N-34 — 「그룹에서 이미 채워진 비율」 적은 사람 우선
            //   ratio_score = by_group[g.id].total / target_ratio (작을수록 미충족 → 우선)
            //   target_ratio = 0 은 이미 위에서 filter 됨 (hard exclude)
            const aRatio = lookupTargetRatio(g.id, a)
            const bRatio = lookupTargetRatio(g.id, b)
            const aGroupCnt = cnA.by_group.get(g.id)?.total || 0
            const bGroupCnt = cnB.by_group.get(g.id)?.total || 0
            const aScore = aRatio > 0 ? aGroupCnt / aRatio : Infinity
            const bScore = bRatio > 0 ? bGroupCnt / bRatio : Infinity
            if (Math.abs(aScore - bScore) > 0.001) return aScore - bScore
            // 그 다음 기존 기준 (요일별 / 글로벌 total / last_date 거리)
            if (cnA.by_dow[dow] !== cnB.by_dow[dow]) return cnA.by_dow[dow] - cnB.by_dow[dow]
            if (cnA.total !== cnB.total) return cnA.total - cnB.total
            const aDist = cnA.last_date
              ? Math.floor((new Date(isoDate).getTime() - new Date(cnA.last_date).getTime()) / 86400000) : 999
            const bDist = cnB.last_date
              ? Math.floor((new Date(isoDate).getTime() - new Date(cnB.last_date).getTime()) / 86400000) : 999
            return bDist - aDist
          })

          // N-46 — P2 결원 자리는 P3 cov 우선 채움 (균등 보장)
          //   사용자 보고 (2026-05-17): "정동민이 윤민진/전유하/전정연 휴가 시 커버 →
          //                              정동민 max 도달 후 윤민진 추가 휴가 시
          //                              다른 사람 (전유하/전정연) 근무일 늘어남 → 균등 깨짐"
          //
          //   해결: P2 결원 (휴가/회피일/skip 으로 candidates 에서 빠진 P2 수) 만큼
          //         P3 cov 우선 selected → 그 다음 P2 자연 분배
          //
          //   효과: P2 가 max=17 까지 채우려 시도하기 전에 P3 가 먼저 결원 자리 채움
          //         → 전유하/전정연 가 윤민진 빠진 자리 안 채움 → 균등 유지
          const isP2 = (wId: string): boolean => {
            const mc = lookupMember(g.id, wId)
            return (mc?.priority_level ?? 2) <= 2
          }
          const isP3 = (wId: string): boolean => {
            const mc = lookupMember(g.id, wId)
            return (mc?.priority_level ?? 2) >= 3
          }
          const p2TotalMembers = gMembers.filter(isP2)
          const p2AvailableNow = p2TotalMembers.filter(wId => candidates.includes(wId))
          const p2Short = Math.max(0, p2TotalMembers.length - p2AvailableNow.length)

          let selectedList: string[]
          if (p2Short > 0 && need > 0) {
            // P3 cov 후보 정렬 (cov 우선)
            const p3Pool = candidates
              .filter(isP3)
              .sort((a, b) => {
                const pa = lookupMember(g.id, a)?.priority_level ?? 3
                const pb = lookupMember(g.id, b)?.priority_level ?? 3
                const aCov = lookupCoveragePriority(g.id, a, pa)
                const bCov = lookupCoveragePriority(g.id, b, pb)
                return aCov - bCov  // cov 작을수록 우선
              })
            // P2 결원 수 + need 중 작은 만큼 P3 우선 선택
            const p3Pick = p3Pool.slice(0, Math.min(p2Short, need))
            // 나머지 need → 기존 정렬된 candidates 에서 (P3 pick 제외)
            const usedSet = new Set(p3Pick)
            const restPool = candidates.filter(wId => !usedSet.has(wId))
            const restPick = restPool.slice(0, need - p3Pick.length)
            selectedList = [...p3Pick, ...restPick]
          } else {
            selectedList = candidates.slice(0, need)
          }
          selected = selectedList
        } else {
          // 단순 rotation (legacy)
          if (g.generation_strategy === 'rotation') {
            // N-27 — cursor 균등 분배 fix
            // 기존: cursor mod candidates.length → candidates 변동 시 cursor 흔들림 (전정연 자주 출근 버그)
            // 새: cursor mod gMembers.length (고정) + candidates 에 없으면 다음 워커로 skip
            const st = rotState.get(g.id) || { cursor: 0, dayInPeriod: 0 }
            const size = Math.max(1, g.rotation_size || 1)
            const memberLen = Math.max(1, gMembers.length)
            const arr: string[] = []
            // cursor 부터 시작해 candidates 에 있는 size 명 선택
            const candidateSet = new Set(candidates)
            let cur = st.cursor
            let scanned = 0
            while (arr.length < size && scanned < memberLen) {
              const wId = gMembers[cur % memberLen]
              if (candidateSet.has(wId) && !arr.includes(wId)) {
                arr.push(wId)
              }
              cur = (cur + 1) % memberLen
              scanned++
            }
            // cursor advance — 항상 size 칸 (candidates 변동 무관)
            st.dayInPeriod++
            if (st.dayInPeriod >= (g.rotation_period_days || 1)) {
              st.cursor = (st.cursor + size) % memberLen
              st.dayInPeriod = 0
            }
            rotState.set(g.id, st)
            selected = arr.slice(0, need)
          } else {
            // all_members
            selected = candidates.slice(0, need)
          }
        }

        // (5) plan 추가 + 카운터 업데이트
        const dailyAdded = new Set<string>()
        for (const wId of selected) {
          if (dailyAdded.has(wId)) continue
          dailyAdded.add(wId)
          const key = `${isoDate}_${g.shift_slot_id}_${wId}`
          const existing = existingMap.get(key)
          let special: 'none' | 'off' | 'am_free' | 'pm_free' | 'am_half' | 'pm_half' = 'none'
          if (markLeaves) {
            const lm = workerLeaveMap.get(wId)
            if (lm?.has(isoDate)) special = lm.get(isoDate) as any
          }
          const isLocked = existing?.manual_lock === 1
          if (existing && (isLocked || !overwriteExisting)) {
            plan.push({
              work_date: isoDate, shift_slot_id: g.shift_slot_id, worker_id: wId,
              special_code: special, action: 'skip-existing',
              group_id: g.id, group_name: g.name,
            })
            byGroup[g.id].skipped++
          } else {
            plan.push({
              work_date: isoDate, shift_slot_id: g.shift_slot_id, worker_id: wId,
              special_code: special,
              action: existing ? 'update' : 'insert',
              group_id: g.id, group_name: g.name,
            })
            byGroup[g.id].generated++
            byDate[isoDate] = byDate[isoDate] || { generated: 0 }
            byDate[isoDate].generated++
          }
          // 통합 카운터 업데이트 (선택된 워커 + 휴가 종일이 아닌 경우)
          if (special !== 'off') {
            const cn = ensureCounter(wId)
            cn.total++
            cn.by_dow[dow]++
            cn.last_date = isoDate
            // N-34 — 그룹별 누적도 증가
            const gb = ensureGroupBucket(wId, g.id)
            gb.total++
            gb.last_date = isoDate
            // PR-2SS-b — 슬롯 종료 시각 기록 (익일 휴식 가드용)
            const slotEndMin = timeToMin(g.slot_end)
            const isOver = !!g.slot_overnight
            workerLastEnd.set(wId, {
              endIsoDate: isOver ? addDays(isoDate, 1) : isoDate,
              endMin: slotEndMin,
            })
            // PR-2SS-c — 오늘 근무 집계 (그룹 무관 — 같은 날 여러 슬롯 들어가도 1일)
            workedToday.add(wId)
          }
        }

        // (6) lock 워커도 통합 카운터에 반영 (균형 분석에 포함)
        for (const wId of lockedSet) {
          const cn = ensureCounter(wId)
          cn.total++
          cn.by_dow[dow]++
          cn.last_date = isoDate
          // N-34 — lock 도 그룹별 누적
          const gb = ensureGroupBucket(wId, g.id)
          gb.total++
          gb.last_date = isoDate
          // PR-2SS-b — lock 워커도 종료 시각 기록
          const slotEndMin = timeToMin(g.slot_end)
          const isOver = !!g.slot_overnight
          workerLastEnd.set(wId, {
            endIsoDate: isOver ? addDays(isoDate, 1) : isoDate,
            endMin: slotEndMin,
          })
          // PR-2SS-c — lock 도 오늘 근무로 카운트
          workedToday.add(wId)
        }

        // (7) 부족 경고
        if (selected.length + lockedSet.size < minN) {
          warnings.push({
            type: 'missing',
            group_id: g.id, group_name: g.name,
            date: isoDate, missing: minN - (selected.length + lockedSet.size),
          })
        }
      }

      // PR-2SS-c — 일자 끝에서 연속 근무일 카운터 업데이트
      //   workedToday 에 있으면 ++ / 없으면 0 (휴무 = 리셋)
      //   각 워커 마다 (활성 워커 전체 — 후보 풀 합집합 사용)
      const allCandidateWorkers = new Set<string>()
      for (const arr of membersByGroup.values()) {
        for (const wId of arr) allCandidateWorkers.add(wId)
      }
      for (const wId of allCandidateWorkers) {
        if (workedToday.has(wId)) {
          workerConsec.set(wId, (workerConsec.get(wId) || 0) + 1)
        } else {
          workerConsec.set(wId, 0)
        }
      }
    }

    // PR-2SS-b — 시간 겹침 검사 (apply 전 사전 가드)
    //   같은 (worker_id, work_date) 의 plan + lock + existing 들 중 시간 겹침 detect
    {
      type Range = { start: number; end: number; slot_id: string }
      const occByWorkerDate = new Map<string, Range[]>()
      // 슬롯 ID → (start_min, end_min, is_overnight) 인덱스
      const slotById = new Map<string, { start: number; end: number; overnight: boolean }>()
      for (const g of targetGroups) {
        if (slotById.has(g.shift_slot_id)) continue
        slotById.set(g.shift_slot_id, {
          start: timeToMin(g.slot_start),
          end: timeToMin(g.slot_end),
          overnight: !!g.slot_overnight,
        })
      }
      const addRange = (wId: string, isoDate: string, slotId: string) => {
        const sl = slotById.get(slotId)
        if (!sl) return
        const startAbs = isoToMin(isoDate, sl.start)
        const endAbs = sl.overnight
          ? isoToMin(addDays(isoDate, 1), sl.end)
          : isoToMin(isoDate, sl.end)
        const key = `${wId}_${isoDate}`
        const arr = occByWorkerDate.get(key) || []
        arr.push({ start: startAbs, end: endAbs, slot_id: slotId })
        occByWorkerDate.set(key, arr)
      }
      // existing (lock 포함) row 들 우선 등록
      for (const a of existingRows) {
        if (!a.worker_id) continue
        addRange(a.worker_id, a.work_date, a.shift_slot_id)
      }
      // plan 의 새 insert/update 등록 (skip 제외)
      for (const p of plan) {
        if (!p.worker_id) continue
        if (p.action !== 'insert' && p.action !== 'update') continue
        // existing 와 동일 (worker, date, slot) 인 경우 중복 등록 회피
        const key = `${p.worker_id}_${p.work_date}_${p.shift_slot_id}`
        if (existingMap.has(`${p.work_date}_${p.shift_slot_id}_${p.worker_id}`)) continue
        addRange(p.worker_id, p.work_date, p.shift_slot_id)
      }
      // 겹침 detect — 같은 (wId, date) 의 range 들 페어 비교
      for (const [key, ranges] of occByWorkerDate) {
        if (ranges.length < 2) continue
        const [wId, date] = key.split('_')
        // 시작 시각 정렬 후 인접 페어 검사 (O(n log n))
        const sorted = [...ranges].sort((a, b) => a.start - b.start)
        for (let i = 0; i < sorted.length - 1; i++) {
          for (let j = i + 1; j < sorted.length; j++) {
            const a = sorted[i], b = sorted[j]
            if (b.start >= a.end) break  // 정렬 보장 — 이후 j 도 안 겹침
            // 겹침 발견
            warnings.push({
              type: 'time_conflict',
              worker_id: wId,
              date: date,
              slot_a: a.slot_id,
              slot_b: b.slot_id,
            })
          }
        }
      }
    }

    // PR-2SS-b/c/h-1 — 경고 타입별 카운트
    const warnCount = {
      missing: warnings.filter(w => w.type === 'missing').length,
      next_day_block: warnings.filter(w => w.type === 'next_day_block').length,
      time_conflict: warnings.filter(w => w.type === 'time_conflict').length,
      consec_limit: warnings.filter(w => w.type === 'consec_limit').length,
      slot_blocked: warnings.filter(w => w.type === 'slot_blocked').length,
      group_skip: warnings.filter(w => w.type === 'group_skip').length,
    }
    const summary = {
      mode,
      total_plan: plan.length,
      to_insert: plan.filter(p => p.action === 'insert').length,
      to_update: plan.filter(p => p.action === 'update').length,
      skip_existing: plan.filter(p => p.action === 'skip-existing').length,
      skip_holiday: plan.filter(p => p.action === 'skip-holiday').length,
      skip_no_member: plan.filter(p => p.action === 'skip-no-member').length,
      holidays_excluded: holidayList.length,
      leaves_marked: markLeaves ? leaves.length : 0,
      by_group: byGroup,
      by_date: byDate,
      // PR-2QQ-d-3 → PR-2SS-b — 경고 다중 타입 (missing/next_day_block/time_conflict)
      warnings: warnings.slice(0, 100),
      warning_count: warnings.length,
      warn_by_type: warnCount,
      use_priority: usePriority,
      enforce_min_coverage: enforceMinCoverage,
    }

    if (mode === 'preview') {
      return NextResponse.json({
        data: { applied: false, summary, plan: plan.slice(0, 50) /* 프리뷰는 50개만 */ },
        error: null,
      })
    }

    // ── 8) APPLY ────────────────────────────────────────────────────
    // PR-2SS-e — cs_assignments 의 day_hours/night_hours/premium_hours 컬럼 graceful
    let hasAsnBreakdown = true
    try {
      await prisma.$queryRaw<any[]>`SELECT day_hours FROM cs_assignments LIMIT 1`
    } catch { hasAsnBreakdown = false }
    // N-25 — cs_assignments.group_id 컬럼 graceful
    let hasAsnGroupId = true
    try {
      await prisma.$queryRaw<any[]>`SELECT group_id FROM cs_assignments LIMIT 1`
    } catch { hasAsnGroupId = false }

    // N-23 fix — rotation 그룹은 워커별 다른 shift_slot_id 가 plan 에 들어감.
    // targetGroups 는 그룹 row 라 g.shift_slot_id (단일) 만 매칭 → undefined 에러.
    // 모든 cs_shift_slots 직접 fetch 후 slotByIdMap 으로 lookup.
    type SlotById = {
      slot_start: string; slot_end: string; slot_overnight: number | boolean
      slot_night_period_start: string | null; slot_night_period_end: string | null
      slot_night_premium_rate: number
    }
    const slotByIdMap = new Map<string, SlotById>()
    try {
      const rows: any[] = (hasSlotBreakdown
        ? await prisma.$queryRaw<any[]>`
            SELECT id,
                   TIME_FORMAT(start_time, '%H:%i:%s') AS slot_start,
                   TIME_FORMAT(end_time, '%H:%i:%s')   AS slot_end,
                   is_overnight,
                   TIME_FORMAT(night_period_start, '%H:%i:%s') AS slot_night_period_start,
                   TIME_FORMAT(night_period_end,   '%H:%i:%s') AS slot_night_period_end,
                   night_premium_rate
            FROM cs_shift_slots
          `
        : await prisma.$queryRaw<any[]>`
            SELECT id,
                   TIME_FORMAT(start_time, '%H:%i:%s') AS slot_start,
                   TIME_FORMAT(end_time, '%H:%i:%s')   AS slot_end,
                   is_overnight
            FROM cs_shift_slots
          `) as any[]
      for (const r of rows) {
        slotByIdMap.set(String(r.id), {
          slot_start: r.slot_start,
          slot_end: r.slot_end,
          slot_overnight: r.is_overnight,
          slot_night_period_start: r.slot_night_period_start || null,
          slot_night_period_end: r.slot_night_period_end || null,
          slot_night_premium_rate: Number(r.night_premium_rate || 0),
        })
      }
    } catch { /* graceful — slotByIdMap 빈 채로 — fallback to targetGroups.find */ }
    // slot lookup helper — slotByIdMap 우선, fallback to targetGroups
    const lookupSlot = (slotId: string): SlotById | null => {
      const s = slotByIdMap.get(slotId)
      if (s) return s
      const g = targetGroups.find(g => g.shift_slot_id === slotId)
      if (!g) return null
      return {
        slot_start: g.slot_start,
        slot_end: g.slot_end,
        slot_overnight: g.slot_overnight,
        slot_night_period_start: g.slot_night_period_start || null,
        slot_night_period_end: g.slot_night_period_end || null,
        slot_night_premium_rate: Number(g.slot_night_premium_rate || 0),
      }
    }

    if (clearFirst) {
      // PR-2QQ-b: manual_lock=1 셀은 보존
      if (hasLockCol) {
        await prisma.$executeRaw`
          DELETE FROM cs_assignments
          WHERE schedule_id = ${scheduleId} AND (manual_lock IS NULL OR manual_lock = 0)
        `
      } else {
        await prisma.$executeRaw`DELETE FROM cs_assignments WHERE schedule_id = ${scheduleId}`
      }
      // 클리어 후엔 모두 insert
      for (const p of plan) {
        if (p.action === 'skip-holiday' || p.action === 'skip-no-member') continue
        // N-23 fix — slotByIdMap 우선 lookup (rotation 그룹의 sequence 시프트 포함)
        const slot = lookupSlot(p.shift_slot_id)
        if (!slot) continue  // 안전 fallback — slot 못 찾으면 skip
        const hours = computeHours(slot.slot_start, slot.slot_end, !!slot.slot_overnight, p.special_code)
        const newId = crypto.randomUUID()
        // PR-2SS-e — 시간 분해
        const bd = computeBreakdown(
          slot.slot_start, slot.slot_end, !!slot.slot_overnight,
          slot.slot_night_period_start, slot.slot_night_period_end,
          Number(slot.slot_night_premium_rate || 0),
          p.special_code,
        )
        // N-25 — group_id 같이 INSERT (graceful)
        if (hasAsnBreakdown && hasAsnGroupId) {
          await prisma.$executeRaw`
            INSERT INTO cs_assignments
              (id, schedule_id, work_date, shift_slot_id, group_id, worker_id, special_code,
               computed_hours, day_hours, night_hours, premium_hours,
               created_at, updated_at)
            VALUES
              (${newId}, ${scheduleId}, ${p.work_date}, ${p.shift_slot_id}, ${p.group_id}, ${p.worker_id}, ${p.special_code},
               ${hours}, ${bd.day}, ${bd.night}, ${bd.premium},
               NOW(), NOW())
          `
        } else if (hasAsnBreakdown) {
          await prisma.$executeRaw`
            INSERT INTO cs_assignments
              (id, schedule_id, work_date, shift_slot_id, worker_id, special_code,
               computed_hours, day_hours, night_hours, premium_hours,
               created_at, updated_at)
            VALUES
              (${newId}, ${scheduleId}, ${p.work_date}, ${p.shift_slot_id}, ${p.worker_id}, ${p.special_code},
               ${hours}, ${bd.day}, ${bd.night}, ${bd.premium},
               NOW(), NOW())
          `
        } else if (hasAsnGroupId) {
          await prisma.$executeRaw`
            INSERT INTO cs_assignments
              (id, schedule_id, work_date, shift_slot_id, group_id, worker_id, special_code, computed_hours, created_at, updated_at)
            VALUES
              (${newId}, ${scheduleId}, ${p.work_date}, ${p.shift_slot_id}, ${p.group_id}, ${p.worker_id}, ${p.special_code}, ${hours}, NOW(), NOW())
          `
        } else {
          await prisma.$executeRaw`
            INSERT INTO cs_assignments
              (id, schedule_id, work_date, shift_slot_id, worker_id, special_code, computed_hours, created_at, updated_at)
            VALUES
              (${newId}, ${scheduleId}, ${p.work_date}, ${p.shift_slot_id}, ${p.worker_id}, ${p.special_code}, ${hours}, NOW(), NOW())
          `
        }
      }
    } else {
      // 일반 적용 — insert / update 만
      for (const p of plan) {
        if (p.action !== 'insert' && p.action !== 'update') continue
        // N-23 fix — slotByIdMap 우선 lookup
        const slot = lookupSlot(p.shift_slot_id)
        if (!slot) continue
        const hours = computeHours(slot.slot_start, slot.slot_end, !!slot.slot_overnight, p.special_code)
        // PR-2SS-e — 시간 분해
        const bd = computeBreakdown(
          slot.slot_start, slot.slot_end, !!slot.slot_overnight,
          slot.slot_night_period_start, slot.slot_night_period_end,
          Number(slot.slot_night_premium_rate || 0),
          p.special_code,
        )

        if (p.action === 'insert') {
          const newId = crypto.randomUUID()
          // N-25 — group_id 같이 INSERT (graceful)
          if (hasAsnBreakdown && hasAsnGroupId) {
            await prisma.$executeRaw`
              INSERT INTO cs_assignments
                (id, schedule_id, work_date, shift_slot_id, group_id, worker_id, special_code,
                 computed_hours, day_hours, night_hours, premium_hours,
                 created_at, updated_at)
              VALUES
                (${newId}, ${scheduleId}, ${p.work_date}, ${p.shift_slot_id}, ${p.group_id}, ${p.worker_id}, ${p.special_code},
                 ${hours}, ${bd.day}, ${bd.night}, ${bd.premium},
                 NOW(), NOW())
            `
          } else if (hasAsnBreakdown) {
            await prisma.$executeRaw`
              INSERT INTO cs_assignments
                (id, schedule_id, work_date, shift_slot_id, worker_id, special_code,
                 computed_hours, day_hours, night_hours, premium_hours,
                 created_at, updated_at)
              VALUES
                (${newId}, ${scheduleId}, ${p.work_date}, ${p.shift_slot_id}, ${p.worker_id}, ${p.special_code},
                 ${hours}, ${bd.day}, ${bd.night}, ${bd.premium},
                 NOW(), NOW())
            `
          } else if (hasAsnGroupId) {
            await prisma.$executeRaw`
              INSERT INTO cs_assignments
                (id, schedule_id, work_date, shift_slot_id, group_id, worker_id, special_code, computed_hours, created_at, updated_at)
              VALUES
                (${newId}, ${scheduleId}, ${p.work_date}, ${p.shift_slot_id}, ${p.group_id}, ${p.worker_id}, ${p.special_code}, ${hours}, NOW(), NOW())
            `
          } else {
            await prisma.$executeRaw`
              INSERT INTO cs_assignments
                (id, schedule_id, work_date, shift_slot_id, worker_id, special_code, computed_hours, created_at, updated_at)
              VALUES
                (${newId}, ${scheduleId}, ${p.work_date}, ${p.shift_slot_id}, ${p.worker_id}, ${p.special_code}, ${hours}, NOW(), NOW())
            `
          }
        } else {
          // update — PR-2OO: (date, slot, worker) 키
          const existing = existingMap.get(`${p.work_date}_${p.shift_slot_id}_${p.worker_id || 'null'}`)!
          if (hasAsnBreakdown) {
            await prisma.$executeRaw`
              UPDATE cs_assignments
              SET special_code = ${p.special_code},
                  computed_hours = ${hours},
                  day_hours = ${bd.day},
                  night_hours = ${bd.night},
                  premium_hours = ${bd.premium},
                  updated_at = NOW()
              WHERE id = ${existing.id}
            `
          } else {
            await prisma.$executeRaw`
              UPDATE cs_assignments
              SET special_code = ${p.special_code},
                  computed_hours = ${hours}, updated_at = NOW()
              WHERE id = ${existing.id}
            `
          }
        }
      }
    }

    return NextResponse.json({
      data: { applied: true, summary, plan: plan.slice(0, 50) },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
