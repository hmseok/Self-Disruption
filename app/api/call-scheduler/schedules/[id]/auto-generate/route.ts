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
// PR-2QQ-d-3 — 워커 제약 + 패턴
interface WorkerConstraint {
  id: string
  priority_level: number
  preferred_dow_avoid: number[]
  preferred_dow_only: number[]
  required_days_per_month: number | null
  max_days_per_month: number | null
  cycle_days_on: number | null
  cycle_days_off: number | null
  cycle_start_date: string | null  // 'YYYY-MM-DD'
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

// 연차에서 special_code 추출
function leaveToSpecial(amPm: 'full' | 'am' | 'pm'): 'off' | 'am_half' | 'pm_half' {
  if (amPm === 'full') return 'off'
  if (amPm === 'am') return 'am_half'
  return 'pm_half'
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

// PR-2QQ-d-3 — cycle 패턴이 그 날짜에 근무 phase 인지
function cycleAllows(w: WorkerConstraint, isoDate: string): boolean {
  if (!w.cycle_days_on || !w.cycle_start_date) return true
  const start = new Date(w.cycle_start_date + 'T00:00:00').getTime()
  const cur = new Date(isoDate + 'T00:00:00').getTime()
  const elapsed = Math.floor((cur - start) / (24 * 60 * 60 * 1000))
  if (elapsed < 0) return true  // 시작 전엔 제약 없음
  const cycle = (w.cycle_days_on || 0) + (w.cycle_days_off || 0)
  if (cycle <= 0) return true
  const phase = ((elapsed % cycle) + cycle) % cycle
  return phase < w.cycle_days_on
}

// PR-2QQ-d-3 — dow_only 한정 (있으면 그 요일만)
function dowOnlyAllows(w: WorkerConstraint, dow: number): boolean {
  if (!w.preferred_dow_only.length) return true
  return w.preferred_dow_only.includes(dow)
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

    // 2) 그룹 + 슬롯 join
    const groups: GroupRow[] = await prisma.$queryRaw<any[]>`
      SELECT g.id, g.name, g.shift_slot_id, g.pattern_type, g.custom_days,
             g.generation_strategy, g.rotation_size, g.rotation_period_days,
             TIME_FORMAT(s.start_time, '%H:%i:%s') AS slot_start,
             TIME_FORMAT(s.end_time, '%H:%i:%s')   AS slot_end,
             s.is_overnight AS slot_overnight
      FROM cs_shift_groups g
      JOIN cs_shift_slots s ON s.id = g.shift_slot_id
      WHERE g.is_active = 1
      ORDER BY g.sort_order ASC, g.name ASC
    ` as any
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

    // 5-A) PR-2QQ-d-3 — 워커 제약 + 패턴 (graceful)
    let workerCons: Map<string, WorkerConstraint> = new Map()
    if (usePriority) {
      try {
        const wcRows = await prisma.$queryRaw<any[]>`
          SELECT id, priority_level, preferred_dow_avoid, preferred_dow_only,
                 required_days_per_month, max_days_per_month,
                 cycle_days_on, cycle_days_off,
                 DATE_FORMAT(cycle_start_date, '%Y-%m-%d') AS cycle_start_date
          FROM cs_workers WHERE is_active = 1
        `
        for (const r of wcRows) {
          workerCons.set(r.id, {
            id: r.id,
            priority_level: Number(r.priority_level || 2),
            preferred_dow_avoid: parseDowList(r.preferred_dow_avoid),
            preferred_dow_only: parseDowList(r.preferred_dow_only),
            required_days_per_month: r.required_days_per_month != null ? Number(r.required_days_per_month) : null,
            max_days_per_month: r.max_days_per_month != null ? Number(r.max_days_per_month) : null,
            cycle_days_on: r.cycle_days_on != null ? Number(r.cycle_days_on) : null,
            cycle_days_off: r.cycle_days_off != null ? Number(r.cycle_days_off) : null,
            cycle_start_date: r.cycle_start_date,
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
    const warnings: Array<{ group_id: string; group_name: string; date: string; missing: number }> = []

    // group_id → rotation cursor (usePriority=false 일 때만 사용)
    const rotState = new Map<string, { cursor: number; dayInPeriod: number }>()

    // 일자 우선 루프 (통합 counter 의 시간 순서 일관성)
    for (let d = 1; d <= lastDay; d++) {
      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dow = new Date(isoDate + 'T00:00:00').getDay()

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
              if (!cycleAllows(wc, isoDate)) return false
              if (!dowOnlyAllows(wc, dow)) return false
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
          }
        }

        // (6) lock 워커도 통합 카운터에 반영 (균형 분석에 포함)
        for (const wId of lockedSet) {
          const cn = ensureCounter(wId)
          cn.total++
          cn.by_dow[dow]++
          cn.last_date = isoDate
        }

        // (7) 부족 경고
        if (selected.length + lockedSet.size < minN) {
          warnings.push({
            group_id: g.id, group_name: g.name,
            date: isoDate, missing: minN - (selected.length + lockedSet.size),
          })
        }
      }
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
      // PR-2QQ-d-3
      warnings: warnings.slice(0, 50),  // 부족 경고 (최대 50개)
      warning_count: warnings.length,
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
        await prisma.$executeRaw`
          INSERT INTO cs_assignments
            (id, schedule_id, work_date, shift_slot_id, worker_id, special_code, computed_hours, created_at, updated_at)
          VALUES
            (${newId}, ${scheduleId}, ${p.work_date}, ${p.shift_slot_id}, ${p.worker_id}, ${p.special_code}, ${hours}, NOW(), NOW())
        `
      }
    } else {
      // 일반 적용 — insert / update 만
      for (const p of plan) {
        if (p.action !== 'insert' && p.action !== 'update') continue
        const slot = targetGroups.find(g => g.shift_slot_id === p.shift_slot_id)!
        const hours = computeHours(slot.slot_start, slot.slot_end, !!slot.slot_overnight, p.special_code)

        if (p.action === 'insert') {
          const newId = crypto.randomUUID()
          await prisma.$executeRaw`
            INSERT INTO cs_assignments
              (id, schedule_id, work_date, shift_slot_id, worker_id, special_code, computed_hours, created_at, updated_at)
            VALUES
              (${newId}, ${scheduleId}, ${p.work_date}, ${p.shift_slot_id}, ${p.worker_id}, ${p.special_code}, ${hours}, NOW(), NOW())
          `
        } else {
          // update — PR-2OO: (date, slot, worker) 키
          const existing = existingMap.get(`${p.work_date}_${p.shift_slot_id}_${p.worker_id || 'null'}`)!
          await prisma.$executeRaw`
            UPDATE cs_assignments
            SET special_code = ${p.special_code},
                computed_hours = ${hours}, updated_at = NOW()
            WHERE id = ${existing.id}
          `
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
