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
  // PR-2SS-d — 최소 경력 (graceful)
  slot_min_seniority_months?: number
  // PR-2SS-e — 시간 분해 (graceful)
  slot_night_period_start?: string | null
  slot_night_period_end?: string | null
  slot_night_premium_rate?: number
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
// PR-2QQ-d-3 → d-revert → PR-2SS-c/d — 워커 제약 + 연속 한도 + 슬롯 거부 + 경력
interface WorkerConstraint {
  id: string
  priority_level: number
  preferred_dow_avoid: number[]
  required_days_per_month: number | null
  max_days_per_month: number | null
  cycle_days_on: number | null      // 외부 근무일 수 (이 phase = 당사 X)
  cycle_days_off: number | null     // 외부 휴무일 수 (이 phase = 당사 가능)
  cycle_start_date: string | null   // 'YYYY-MM-DD' 외부 cycle 1일차
  // PR-2SS-c — 연속 한도 + 슬롯 거부
  max_consecutive_work_days: number | null
  blocked_slot_ids: Set<string>     // 비어있으면 빈 Set
  // PR-2SS-d — 입사일 (ride_employees join)
  hire_date: string | null          // 'YYYY-MM-DD' or null
}
interface CoverageRow {
  group_id: string
  dow: number | null
  min_workers: number
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

// PR-2SS-d — 두 ISO 날짜 간 개월 수 (정수 — 일 단위 반올림)
function monthsSince(hireDateIso: string, refIso: string): number {
  const a = new Date(hireDateIso + 'T00:00:00')
  const b = new Date(refIso + 'T00:00:00')
  if (b < a) return 0
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) months -= 1
  return Math.max(0, months)
}

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

    // 2) 그룹 + 슬롯 join — PR-2SS-b/d/e: 안전 가드 + 경력 + 시간 분해 컬럼 graceful
    let hasSlotSafety = true
    let hasSlotSeniority = true
    let hasSlotBreakdown = true
    try {
      await prisma.$queryRaw<any[]>`SELECT next_day_blocking_hours FROM cs_shift_slots LIMIT 1`
    } catch { hasSlotSafety = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT min_seniority_months FROM cs_shift_slots LIMIT 1`
    } catch { hasSlotSeniority = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT night_period_start FROM cs_shift_slots LIMIT 1`
    } catch { hasSlotBreakdown = false }
    const groups: GroupRow[] = (hasSlotSafety && hasSlotSeniority && hasSlotBreakdown)
      ? (await prisma.$queryRaw<any[]>`
          SELECT g.id, g.name, g.shift_slot_id, g.pattern_type, g.custom_days,
                 g.generation_strategy, g.rotation_size, g.rotation_period_days,
                 TIME_FORMAT(s.start_time, '%H:%i:%s') AS slot_start,
                 TIME_FORMAT(s.end_time, '%H:%i:%s')   AS slot_end,
                 s.is_overnight AS slot_overnight,
                 s.next_day_blocking_hours AS slot_next_day_blocking_hours,
                 s.max_consecutive_days   AS slot_max_consecutive_days,
                 s.min_seniority_months   AS slot_min_seniority_months,
                 TIME_FORMAT(s.night_period_start, '%H:%i:%s') AS slot_night_period_start,
                 TIME_FORMAT(s.night_period_end,   '%H:%i:%s') AS slot_night_period_end,
                 s.night_premium_rate AS slot_night_premium_rate
          FROM cs_shift_groups g
          JOIN cs_shift_slots s ON s.id = g.shift_slot_id
          WHERE g.is_active = 1
          ORDER BY g.sort_order ASC, g.name ASC
        ` as any)
      : (hasSlotSafety && hasSlotSeniority)
      ? (await prisma.$queryRaw<any[]>`
          SELECT g.id, g.name, g.shift_slot_id, g.pattern_type, g.custom_days,
                 g.generation_strategy, g.rotation_size, g.rotation_period_days,
                 TIME_FORMAT(s.start_time, '%H:%i:%s') AS slot_start,
                 TIME_FORMAT(s.end_time, '%H:%i:%s')   AS slot_end,
                 s.is_overnight AS slot_overnight,
                 s.next_day_blocking_hours AS slot_next_day_blocking_hours,
                 s.max_consecutive_days   AS slot_max_consecutive_days,
                 s.min_seniority_months   AS slot_min_seniority_months
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

    // 4) 휴일 (exclude_auto=1) — 해당 월
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    let holidayDates = new Set<string>()
    let holidayList: HolidayRow[] = []
    if (skipHolidays) {
      try {
        holidayList = await prisma.$queryRaw<any[]>`
          SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date,
                 exclude_auto, name
          FROM cs_holidays
          WHERE holiday_date BETWEEN ${monthStart} AND ${monthEnd}
            AND exclude_auto = 1
        ` as any
        holidayDates = new Set(holidayList.map(h => h.holiday_date))
      } catch {
        // 테이블 미적용 시 무시
      }
    }

    // 5) 연차 — 해당 월 걸친 것
    let leaves: LeaveRow[] = []
    try {
      leaves = await prisma.$queryRaw<any[]>`
        SELECT worker_id,
               DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
               DATE_FORMAT(end_date, '%Y-%m-%d')   AS end_date,
               am_pm
        FROM cs_leaves
        WHERE NOT (end_date < ${monthStart} OR start_date > ${monthEnd})
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

    // 5-A) PR-2QQ-d-3 → PR-2SS-c/d — 워커 제약 + 연속/거부 + 경력 (graceful)
    let workerCons: Map<string, WorkerConstraint> = new Map()
    let hasBlockedConsec = true
    if (usePriority) {
      try {
        try {
          await prisma.$queryRaw<any[]>`SELECT max_consecutive_work_days FROM cs_workers LIMIT 1`
        } catch { hasBlockedConsec = false }
        // PR-2SS-d — ride_employees.hire_date LEFT JOIN (employee_id 또는 name 매칭)
        const wcRows = hasBlockedConsec
          ? await prisma.$queryRaw<any[]>`
              SELECT w.id, w.priority_level, w.preferred_dow_avoid,
                     w.required_days_per_month, w.max_days_per_month,
                     w.cycle_days_on, w.cycle_days_off,
                     DATE_FORMAT(w.cycle_start_date, '%Y-%m-%d') AS cycle_start_date,
                     w.max_consecutive_work_days, w.blocked_slot_ids,
                     DATE_FORMAT(re.hire_date, '%Y-%m-%d') AS hire_date
              FROM cs_workers w
              LEFT JOIN ride_employees re
                ON (w.employee_id IS NOT NULL AND re.id = w.employee_id)
                OR (w.employee_id IS NULL AND re.name = w.name)
              WHERE w.is_active = 1
            `
          : await prisma.$queryRaw<any[]>`
              SELECT w.id, w.priority_level, w.preferred_dow_avoid,
                     w.required_days_per_month, w.max_days_per_month,
                     w.cycle_days_on, w.cycle_days_off,
                     DATE_FORMAT(w.cycle_start_date, '%Y-%m-%d') AS cycle_start_date,
                     DATE_FORMAT(re.hire_date, '%Y-%m-%d') AS hire_date
              FROM cs_workers w
              LEFT JOIN ride_employees re
                ON (w.employee_id IS NOT NULL AND re.id = w.employee_id)
                OR (w.employee_id IS NULL AND re.name = w.name)
              WHERE w.is_active = 1
            `
        for (const r of wcRows) {
          // PR-2SS-c — blocked_slot_ids JSON 안전 파싱
          let blocked: Set<string> = new Set()
          if (hasBlockedConsec && r.blocked_slot_ids != null) {
            try {
              const arr = typeof r.blocked_slot_ids === 'string'
                ? JSON.parse(r.blocked_slot_ids)
                : (Array.isArray(r.blocked_slot_ids) ? r.blocked_slot_ids : [])
              if (Array.isArray(arr)) blocked = new Set(arr.map(String))
            } catch { /* 무시 */ }
          }
          workerCons.set(r.id, {
            id: r.id,
            priority_level: Number(r.priority_level || 2),
            preferred_dow_avoid: parseDowList(r.preferred_dow_avoid),
            required_days_per_month: r.required_days_per_month != null ? Number(r.required_days_per_month) : null,
            max_days_per_month: r.max_days_per_month != null ? Number(r.max_days_per_month) : null,
            cycle_days_on: r.cycle_days_on != null ? Number(r.cycle_days_on) : null,
            cycle_days_off: r.cycle_days_off != null ? Number(r.cycle_days_off) : null,
            cycle_start_date: r.cycle_start_date,
            max_consecutive_work_days: hasBlockedConsec && r.max_consecutive_work_days != null
              ? Number(r.max_consecutive_work_days) : null,
            blocked_slot_ids: blocked,
            // PR-2SS-d
            hire_date: r.hire_date || null,
          })
        }
      } catch {
        // 마이그 미적용 — 단순 rotation 동작
      }
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
    }>()
    const ensureCounter = (wId: string) => {
      if (!counter.has(wId)) counter.set(wId, { total: 0, by_dow: [0,0,0,0,0,0,0], last_date: null })
      return counter.get(wId)!
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
      // PR-2SS-d — 경력 부족 (신입 야간 금지 등)
      | { type: 'seniority_short'; worker_id: string; date: string; slot_id: string; required_months: number; actual_months: number | null }
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

        const dowSet = patternDays(g.pattern_type, g.custom_days)
        if (!dowSet.has(dow)) continue

        // 휴일 제외
        if (skipHolidays && holidayDates.has(isoDate)) {
          plan.push({
            work_date: isoDate, shift_slot_id: g.shift_slot_id, worker_id: null,
            special_code: 'none', action: 'skip-holiday',
            group_id: g.id, group_name: g.name,
          })
          byGroup[g.id].skipped++
          continue
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
        let candidates = gMembers.filter(wId => !lockedSet.has(wId))

        // 휴가 워커 제외 (full off 인 경우만 — am_half/pm_half 는 후보 유지하되 special_code 적용)
        candidates = candidates.filter(wId => {
          const lm = workerLeaveMap.get(wId)
          if (!lm) return true
          const sp = lm.get(isoDate)
          return sp !== 'off'  // 종일 off 면 제외
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

        // PR-2SS-c — 슬롯 거부 (blocked_slot_ids) hard exclude
        candidates = candidates.filter(wId => {
          const wc = workerCons.get(wId)
          if (wc && wc.blocked_slot_ids.has(g.shift_slot_id)) {
            warnings.push({
              type: 'slot_blocked',
              worker_id: wId, date: isoDate, slot_id: g.shift_slot_id,
            })
            return false
          }
          return true
        })

        // PR-2SS-c — 연속 한도 가드 (slot.max + worker.max 둘 중 작은 값)
        const slotConsecLimit = g.slot_max_consecutive_days != null ? Number(g.slot_max_consecutive_days) : null
        candidates = candidates.filter(wId => {
          const wc = workerCons.get(wId)
          const limits: number[] = []
          if (slotConsecLimit != null && slotConsecLimit > 0) limits.push(slotConsecLimit)
          if (wc?.max_consecutive_work_days != null && wc.max_consecutive_work_days > 0) limits.push(wc.max_consecutive_work_days)
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

        // PR-2SS-d — 최소 경력 가드 (slot.min_seniority_months 적용)
        const requiredMonths = Number(g.slot_min_seniority_months || 0)
        if (requiredMonths > 0) {
          candidates = candidates.filter(wId => {
            const wc = workerCons.get(wId)
            // 입사일 모르면 안전상 후보 X (운영 정책: 신입 야간 X)
            if (!wc?.hire_date) {
              warnings.push({
                type: 'seniority_short',
                worker_id: wId, date: isoDate, slot_id: g.shift_slot_id,
                required_months: requiredMonths, actual_months: null,
              })
              return false
            }
            const months = monthsSince(wc.hire_date, isoDate)
            if (months < requiredMonths) {
              warnings.push({
                type: 'seniority_short',
                worker_id: wId, date: isoDate, slot_id: g.shift_slot_id,
                required_months: requiredMonths, actual_months: months,
              })
              return false
            }
            return true
          })
        }

        // (4) usePriority=true 면 가중치 정렬, false 면 단순 rotation
        let selected: string[]
        if (usePriority) {
          // max 초과 / 패턴 불일치 워커 제외
          candidates = candidates.filter(wId => {
            const wc = workerCons.get(wId)
            if (wc) {
              if (wc.max_days_per_month != null) {
                const cn = counter.get(wId)
                if (cn && cn.total >= wc.max_days_per_month) return false
              }
              // PR-2QQ-d-revert: 외부 cycle 의 외부 근무 phase 면 당사 후보 X
              if (!isAvailableOnCycle(wc, isoDate)) return false
            }
            return true
          })
          // 가중치 정렬
          candidates.sort((a, b) => {
            const wa = workerCons.get(a)
            const wb = workerCons.get(b)
            const pa = wa?.priority_level || 2
            const pb = wb?.priority_level || 2
            if (pa !== pb) return pa - pb
            const aAvoid = wa?.preferred_dow_avoid.includes(dow) ? 1 : 0
            const bAvoid = wb?.preferred_dow_avoid.includes(dow) ? 1 : 0
            if (aAvoid !== bAvoid) return aAvoid - bAvoid
            const cnA = ensureCounter(a)
            const cnB = ensureCounter(b)
            const aShort = wa?.required_days_per_month && cnA.total < wa.required_days_per_month ? 1 : 0
            const bShort = wb?.required_days_per_month && cnB.total < wb.required_days_per_month ? 1 : 0
            if (aShort !== bShort) return bShort - aShort  // shortfall 1 우선
            if (cnA.by_dow[dow] !== cnB.by_dow[dow]) return cnA.by_dow[dow] - cnB.by_dow[dow]
            if (cnA.total !== cnB.total) return cnA.total - cnB.total
            const aDist = cnA.last_date
              ? Math.floor((new Date(isoDate).getTime() - new Date(cnA.last_date).getTime()) / 86400000) : 999
            const bDist = cnB.last_date
              ? Math.floor((new Date(isoDate).getTime() - new Date(cnB.last_date).getTime()) / 86400000) : 999
            return bDist - aDist
          })
          selected = candidates.slice(0, need)
        } else {
          // 단순 rotation (legacy)
          if (g.generation_strategy === 'rotation') {
            const st = rotState.get(g.id) || { cursor: 0, dayInPeriod: 0 }
            const size = Math.max(1, g.rotation_size || 1)
            const arr: string[] = []
            for (let i = 0; i < size; i++) {
              arr.push(candidates[(st.cursor + i) % candidates.length])
            }
            st.dayInPeriod++
            if (st.dayInPeriod >= (g.rotation_period_days || 1)) {
              st.cursor = (st.cursor + size) % Math.max(1, candidates.length)
              st.dayInPeriod = 0
            }
            rotState.set(g.id, st)
            selected = Array.from(new Set(arr)).slice(0, need)
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

    // PR-2SS-b/c/d — 경고 타입별 카운트
    const warnCount = {
      missing: warnings.filter(w => w.type === 'missing').length,
      next_day_block: warnings.filter(w => w.type === 'next_day_block').length,
      time_conflict: warnings.filter(w => w.type === 'time_conflict').length,
      consec_limit: warnings.filter(w => w.type === 'consec_limit').length,
      slot_blocked: warnings.filter(w => w.type === 'slot_blocked').length,
      seniority_short: warnings.filter(w => w.type === 'seniority_short').length,
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
        const slot = targetGroups.find(g => g.shift_slot_id === p.shift_slot_id)!
        const hours = computeHours(slot.slot_start, slot.slot_end, !!slot.slot_overnight, p.special_code)
        const newId = crypto.randomUUID()
        // PR-2SS-e — 시간 분해
        const bd = computeBreakdown(
          slot.slot_start, slot.slot_end, !!slot.slot_overnight,
          slot.slot_night_period_start, slot.slot_night_period_end,
          Number(slot.slot_night_premium_rate || 0),
          p.special_code,
        )
        if (hasAsnBreakdown) {
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
        const slot = targetGroups.find(g => g.shift_slot_id === p.shift_slot_id)!
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
          if (hasAsnBreakdown) {
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
