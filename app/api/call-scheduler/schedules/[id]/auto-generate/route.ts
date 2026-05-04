// ═══════════════════════════════════════════════════════════════════
// POST /api/call-scheduler/schedules/[id]/auto-generate
//   그룹 + 휴일 + 연차 활용해서 cs_assignments 한 번에 생성
//
// body:
//   {
//     mode: 'preview' | 'apply',                  // preview = dry run
//     overwrite_existing?: boolean,               // 기존 셀 덮어쓸지 (기본 false)
//     clear_first?: boolean,                      // 시작 전 모든 배정 삭제 (기본 false)
//     group_ids?: string[],                       // 특정 그룹만 (생략=전체)
//     skip_holidays?: boolean,                    // 휴일 자동 제외 (기본 true)
//     mark_leaves?: boolean,                      // 연차자 셀에 special_code 표시 (기본 true)
//   }
//
// 응답:
//   { plan: {generated, skipped, conflicts, byGroup, byDate}, applied: boolean }
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

    for (const g of targetGroups) {
      byGroup[g.id] = { generated: 0, skipped: 0 }
      const gMembers = membersByGroup.get(g.id) || []
      if (gMembers.length === 0) {
        // 멤버 없는 그룹 skip
        for (let d = 1; d <= lastDay; d++) {
          const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          plan.push({
            work_date: isoDate, shift_slot_id: g.shift_slot_id, worker_id: null,
            special_code: 'none', action: 'skip-no-member',
            group_id: g.id, group_name: g.name,
          })
          byGroup[g.id].skipped++
        }
        continue
      }

      const dowSet = patternDays(g.pattern_type, g.custom_days)
      let rotationCursor = 0  // 로테이션 인덱스
      let dayInPeriod = 0     // 현재 주기 내 몇 번째 일자

      for (let d = 1; d <= lastDay; d++) {
        const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const dow = new Date(isoDate + 'T00:00:00').getDay()
        if (!dowSet.has(dow)) continue

        // 휴일 제외
        if (holidayDates.has(isoDate)) {
          plan.push({
            work_date: isoDate, shift_slot_id: g.shift_slot_id, worker_id: null,
            special_code: 'none', action: 'skip-holiday',
            group_id: g.id, group_name: g.name,
          })
          byGroup[g.id].skipped++
          continue
        }

        // 대상 일자에 배정할 워커들 결정
        let assignWorkers: string[] = []
        if (g.generation_strategy === 'rotation') {
          const size = Math.max(1, g.rotation_size || 1)
          assignWorkers = []
          for (let i = 0; i < size; i++) {
            assignWorkers.push(gMembers[(rotationCursor + i) % gMembers.length])
          }
          dayInPeriod++
          if (dayInPeriod >= (g.rotation_period_days || 1)) {
            rotationCursor = (rotationCursor + size) % gMembers.length
            dayInPeriod = 0
          }
        } else {
          // all_members
          assignWorkers = [...gMembers]
        }

        // 같은 그룹 안 멤버 중복 방지 (rotation 시 size > members.length 가능성)
        const seenWorkersThisCell = new Set<string>()
        for (const wId of assignWorkers) {
          if (seenWorkersThisCell.has(wId)) continue
          seenWorkersThisCell.add(wId)
          // PR-2OO: (date, slot, worker) 키 — 1셀 N워커 허용
          const key = `${isoDate}_${g.shift_slot_id}_${wId}`
          const existing = existingMap.get(key)

          // 연차 표시
          let special: 'none' | 'off' | 'am_free' | 'pm_free' | 'am_half' | 'pm_half' = 'none'
          if (markLeaves) {
            const leaveMap = workerLeaveMap.get(wId)
            if (leaveMap?.has(isoDate)) {
              special = leaveMap.get(isoDate) as any
            }
          }

          // PR-2QQ-b: lock 셀이거나 기존 보존
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
