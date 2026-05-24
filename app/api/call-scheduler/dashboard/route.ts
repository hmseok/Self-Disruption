// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/dashboard?date=YYYY-MM-DD
//
//   N-17 — 운영 풀세트 대시보드 한 번 fetch
//   · KPI (인력 건강 / 채용 / 강도 / 운영 / 카페24 부하)
//   · 지금 일하는 사람 / 오늘 / 내일 근무자
//   · 검토 대기 / 빈자리 / 다음 액션 / 다가오는 휴일
//
//   모든 카페24 외부 DB 호출은 graceful — 실패 시 null 반환
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { cafe24Db } from '@/lib/cafe24-db'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const HOUR_MIN = (t: string): number => {
  const [h, m] = String(t || '00:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const yyyymmdd = (d: Date) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
const DOW_KR = ['일','월','화','수','목','금','토']

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const dateParam = url.searchParams.get('date')
    // 서버 TZ(Cloud Run 은 UTC 일 수 있음) 무관하게 KST 기준으로 계산.
    // tzShiftMs: 현재 서버 오프셋을 KST(UTC+9)로 맞추는 보정값.
    //   UTC 서버 → +9h / KST 서버 → 0.
    const tzShiftMs = (new Date().getTimezoneOffset() + 540) * 60000
    const now = dateParam
      ? new Date(new Date(dateParam + 'T00:00:00Z').getTime() + tzShiftMs)
      : new Date(Date.now() + tzShiftMs)
    const today = isoOf(now)
    const tomorrowD = new Date(now); tomorrowD.setDate(tomorrowD.getDate() + 1)
    const tomorrow = isoOf(tomorrowD)
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const monthStart = `${year}-${String(month).padStart(2,'0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const monthEnd = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    const monthStartYmd = `${year}${String(month).padStart(2,'0')}01`
    const monthEndYmd = `${year}${String(month).padStart(2,'0')}${String(lastDay).padStart(2,'0')}`
    const upcomingEnd = new Date(now); upcomingEnd.setDate(upcomingEnd.getDate() + 14)
    const upcomingEndIso = isoOf(upcomingEnd)
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndIso = isoOf(weekEnd)

    // ── 활성 published schedule (this month) — assignments source ──
    let scheduleId: string | null = null
    try {
      const sRows = await prisma.$queryRaw<any[]>`
        SELECT id FROM cs_schedules
        WHERE year = ${year} AND month = ${month}
        ORDER BY status = 'published' DESC, updated_at DESC
        LIMIT 1
      `
      if (sRows.length > 0) scheduleId = String(sRows[0].id)
    } catch { /* graceful */ }

    // ── KPI: 인력 건강도 + 채용 적정성 + 업무 강도 ──
    type Stats = {
      avg_workdays: number; max_workdays: { name: string; days: number } | null
      min_workdays: { name: string; days: number } | null
      active_workers: number; required_workers: number
      night_ratio: number; load_stddev: number; fill_rate: number
    }
    let stats: Stats = {
      avg_workdays: 0, max_workdays: null, min_workdays: null,
      active_workers: 0, required_workers: 0,
      night_ratio: 0, load_stddev: 0, fill_rate: 0,
    }

    // 활성 워커 수
    try {
      const wRow = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS c FROM cs_workers WHERE is_active = 1
      `
      stats.active_workers = Number(wRow[0]?.c || 0)
    } catch { /* graceful */ }

    // 필요 인원 합산 (min_coverage 디폴트 dow=NULL)
    try {
      const cRow = await prisma.$queryRaw<any[]>`
        SELECT COALESCE(SUM(min_workers), 0) AS c
        FROM cs_group_min_coverage WHERE dow IS NULL
      `
      stats.required_workers = Number(cRow[0]?.c || 0)
    } catch { /* graceful */ }

    // 인당 근무일 통계 + 야간 비율 + 충원율 (이번 달 schedule 기준)
    if (scheduleId) {
      try {
        const aRows = await prisma.$queryRaw<any[]>`
          SELECT w.name, COUNT(*) AS days
          FROM cs_assignments a
          JOIN cs_workers w ON w.id = a.worker_id
          WHERE a.schedule_id = ${scheduleId}
            AND a.worker_id IS NOT NULL
            AND a.special_code = 'none'
          GROUP BY a.worker_id, w.name
          ORDER BY days DESC
        `
        if (aRows.length > 0) {
          const days = aRows.map(r => Number(r.days))
          const sum = days.reduce((s, d) => s + d, 0)
          stats.avg_workdays = Math.round((sum / aRows.length) * 10) / 10
          stats.max_workdays = { name: aRows[0].name, days: Number(aRows[0].days) }
          stats.min_workdays = { name: aRows[aRows.length-1].name, days: Number(aRows[aRows.length-1].days) }
          const mean = sum / aRows.length
          const variance = days.reduce((s, d) => s + Math.pow(d - mean, 2), 0) / aRows.length
          stats.load_stddev = Math.round(Math.sqrt(variance) * 10) / 10
        }

        // 야간 비율 (is_overnight=1)
        const nRows = await prisma.$queryRaw<any[]>`
          SELECT
            SUM(CASE WHEN s.is_overnight = 1 THEN 1 ELSE 0 END) AS night,
            COUNT(*) AS total
          FROM cs_assignments a
          JOIN cs_shift_slots s ON s.id = a.shift_slot_id
          WHERE a.schedule_id = ${scheduleId}
            AND a.worker_id IS NOT NULL
        `
        const total = Number(nRows[0]?.total || 0)
        if (total > 0) {
          stats.night_ratio = Math.round((Number(nRows[0]?.night || 0) / total) * 1000) / 1000
        }

        // 충원율 — 같은 schedule_id 의 cells 중 worker_id IS NOT NULL 비율
        const fRows = await prisma.$queryRaw<any[]>`
          SELECT
            SUM(CASE WHEN worker_id IS NOT NULL THEN 1 ELSE 0 END) AS filled,
            COUNT(*) AS total
          FROM cs_assignments WHERE schedule_id = ${scheduleId}
        `
        const fTotal = Number(fRows[0]?.total || 0)
        if (fTotal > 0) {
          stats.fill_rate = Math.round((Number(fRows[0]?.filled || 0) / fTotal) * 1000) / 1000
        }
      } catch { /* graceful */ }
    }

    // ── 지금 일하는 사람 + 오늘/내일 ──
    type WorkerChip = {
      worker_id: string; name: string; color_tone: string
      shift_label: string; shift_start: string; shift_end: string
      is_overnight: boolean; group_name: string | null
    }
    let nowWorking: WorkerChip[] = []
    let todayAssignments: WorkerChip[] = []
    let tomorrowAssignments: WorkerChip[] = []
    const fetchDay = async (isoDate: string): Promise<WorkerChip[]> => {
      if (!scheduleId) return []
      try {
        const rows = await prisma.$queryRaw<any[]>`
          SELECT w.id AS worker_id, w.name, w.color_tone,
                 s.code AS slot_code, s.label AS slot_label,
                 TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
                 TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
                 s.is_overnight,
                 (SELECT g.name FROM cs_shift_groups g
                   WHERE g.shift_slot_id = s.id
                   ORDER BY g.name ASC LIMIT 1) AS group_name
          FROM cs_assignments a
          JOIN cs_workers w ON w.id = a.worker_id
          JOIN cs_shift_slots s ON s.id = a.shift_slot_id
          WHERE a.schedule_id = ${scheduleId}
            AND a.work_date = ${isoDate}
            AND a.worker_id IS NOT NULL
            AND a.special_code = 'none'
          ORDER BY s.start_time ASC
        `
        return rows.map(r => ({
          worker_id: r.worker_id,
          name: r.name,
          color_tone: r.color_tone || 'none',
          shift_label: r.slot_label || r.slot_code,
          shift_start: r.start_time,
          shift_end: r.end_time,
          is_overnight: Boolean(r.is_overnight),
          group_name: r.group_name || null,
        }))
      } catch { return [] }
    }
    todayAssignments = await fetchDay(today)
    tomorrowAssignments = await fetchDay(tomorrow)

    // 지금 시각 (HH:MM) 안에 포함되는 오늘 entry → nowWorking
    const nowMin = now.getHours() * 60 + now.getMinutes()
    for (const a of todayAssignments) {
      const startMin = HOUR_MIN(a.shift_start)
      const endMin = HOUR_MIN(a.shift_end)
      // 야간 (overnight) — 종료 < 시작 — 오늘 시작이 nowMin 보다 이전이면 진행 중
      const active = a.is_overnight
        ? (nowMin >= startMin || nowMin < endMin)
        : (nowMin >= startMin && nowMin < endMin)
      if (active) nowWorking.push(a)
    }
    // 어제 시작한 야간 (overnight) 이 오늘 새벽까지 이어지는 케이스
    if (nowMin < 12 * 60) {
      const yesterdayD = new Date(now); yesterdayD.setDate(yesterdayD.getDate() - 1)
      const yesterday = isoOf(yesterdayD)
      try {
        const yRows = await prisma.$queryRaw<any[]>`
          SELECT w.id AS worker_id, w.name, w.color_tone,
                 s.code AS slot_code, s.label AS slot_label,
                 TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
                 TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
                 s.is_overnight,
                 (SELECT g.name FROM cs_shift_groups g
                   WHERE g.shift_slot_id = s.id
                   ORDER BY g.name ASC LIMIT 1) AS group_name
          FROM cs_assignments a
          JOIN cs_workers w ON w.id = a.worker_id
          JOIN cs_shift_slots s ON s.id = a.shift_slot_id
          WHERE a.schedule_id = ${scheduleId}
            AND a.work_date = ${yesterday}
            AND a.worker_id IS NOT NULL
            AND a.special_code = 'none'
            AND s.is_overnight = 1
        `
        for (const r of yRows) {
          const endMin = HOUR_MIN(r.end_time)
          if (nowMin < endMin) {
            nowWorking.push({
              worker_id: r.worker_id,
              name: r.name,
              color_tone: r.color_tone || 'none',
              shift_label: (r.slot_label || r.slot_code) + ' (어제 시작)',
              shift_start: r.start_time,
              shift_end: r.end_time,
              is_overnight: true,
              group_name: r.group_name || null,
            })
          }
        }
      } catch { /* graceful */ }
    }

    // ── 검토 대기 카운트 ──
    let pendingSkip = 0, pendingLeave = 0, pendingSwap = 0
    try {
      const r = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS c FROM cs_group_member_skip_dates WHERE status = 'requested'
      `
      pendingSkip = Number(r[0]?.c || 0)
    } catch { /* graceful */ }
    try {
      const r = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS c FROM cs_leaves WHERE status = 'pending'
      `
      pendingLeave = Number(r[0]?.c || 0)
    } catch { /* graceful */ }
    try {
      const r = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS c FROM cs_swap_requests WHERE status = 'pending'
      `
      pendingSwap = Number(r[0]?.c || 0)
    } catch { /* graceful */ }

    // ── 다가오는 휴일 (오늘~+14일) ──
    type Holiday = { date: string; name: string; affected_groups: string[] }
    let upcomingHolidays: Holiday[] = []
    let holidaySet = new Set<string>()
    try {
      const hRows = await prisma.$queryRaw<any[]>`
        SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS d, name, exclude_auto
        FROM cs_holidays
        WHERE holiday_date BETWEEN ${today} AND ${upcomingEndIso}
        ORDER BY holiday_date ASC
      `
      // 휴일 자동 제외 그룹 list
      let skipGroupNames: string[] = []
      try {
        const gRows = await prisma.$queryRaw<any[]>`
          SELECT name FROM cs_shift_groups
          WHERE is_active = 1 AND skip_on_holidays = 1
          ORDER BY name ASC
        `
        skipGroupNames = gRows.map(r => String(r.name))
      } catch { /* graceful — column may not exist */ }
      for (const r of hRows) {
        upcomingHolidays.push({
          date: r.d,
          name: r.name || '휴일',
          affected_groups: r.exclude_auto ? skipGroupNames : [],
        })
        holidaySet.add(r.d)
      }
    } catch { /* graceful */ }

    // ── 빈자리 알람 (이번 주 = today~+7일) — min_coverage 미달 ──
    type EmptySlot = { date: string; dow_label: string; group_name: string; slot_code: string; min: number; actual: number }
    let emptySlots: EmptySlot[] = []
    if (scheduleId) {
      try {
        const rows = await prisma.$queryRaw<any[]>`
          SELECT
            DATE_FORMAT(a.work_date, '%Y-%m-%d') AS work_date,
            DAYOFWEEK(a.work_date) - 1 AS dow,
            g.id AS group_id, g.name AS group_name,
            s.code AS slot_code,
            COUNT(a.worker_id) AS actual
          FROM cs_assignments a
          JOIN cs_shift_slots s ON s.id = a.shift_slot_id
          JOIN cs_shift_groups g ON g.shift_slot_id = s.id
          WHERE a.schedule_id = ${scheduleId}
            AND a.work_date BETWEEN ${today} AND ${weekEndIso}
            AND a.special_code = 'none'
          GROUP BY a.work_date, g.id, g.name, s.code
        `
        // min_coverage 룩업
        const covRows = await prisma.$queryRaw<any[]>`
          SELECT group_id, dow, min_workers FROM cs_group_min_coverage
        `
        const covMap = new Map<string, number>()
        const covDefault = new Map<string, number>()
        for (const c of covRows) {
          const key = `${c.group_id}_${c.dow == null ? 'default' : c.dow}`
          if (c.dow == null) covDefault.set(c.group_id, Number(c.min_workers))
          else covMap.set(key, Number(c.min_workers))
        }
        for (const r of rows) {
          const min = covMap.get(`${r.group_id}_${r.dow}`) ?? covDefault.get(r.group_id) ?? 0
          if (min === 0) continue
          if (Number(r.actual) < min) {
            emptySlots.push({
              date: r.work_date,
              dow_label: DOW_KR[Number(r.dow)],
              group_name: String(r.group_name),
              slot_code: String(r.slot_code),
              min,
              actual: Number(r.actual),
            })
          }
        }
        emptySlots.sort((a, b) => a.date.localeCompare(b.date))
      } catch { /* graceful */ }
    }

    // ── 다음 액션 — 다음 달 스케줄 없으면 안내 ──
    const nextMonth = month === 12 ? 1 : month + 1
    const nextMonthYear = month === 12 ? year + 1 : year
    let nextActionType: 'create_next_month' | 'finalize_draft' | 'none' = 'none'
    let nextActionMsg = ''
    try {
      const nRows = await prisma.$queryRaw<any[]>`
        SELECT id, status FROM cs_schedules
        WHERE year = ${nextMonthYear} AND month = ${nextMonth}
        LIMIT 1
      `
      if (nRows.length === 0) {
        const daysLeft = lastDay - now.getDate()
        if (daysLeft <= 10) {
          nextActionType = 'create_next_month'
          nextActionMsg = `${nextMonthYear}년 ${nextMonth}월 스케줄 미작성 — ${daysLeft}일 후 시작`
        }
      } else if (nRows[0].status === 'draft') {
        nextActionType = 'finalize_draft'
        nextActionMsg = `${nextMonthYear}년 ${nextMonth}월 초안 — 검토 후 공지 필요`
      }
    } catch { /* graceful */ }

    // ── 카페24 KPI (graceful) ──
    let kpiAccidents: number | null = null
    let kpiDispatch: number | null = null
    try {
      kpiAccidents = await cafe24Db.count(
        `SELECT COUNT(*) AS c FROM aceesosh WHERE esosmddt BETWEEN ? AND ?`,
        [monthStartYmd, monthEndYmd],
      )
    } catch { /* graceful — cafe24 disconnected */ }
    try {
      kpiDispatch = await cafe24Db.count(
        `SELECT COUNT(*) AS c FROM acrotpth WHERE otptdcyn = 'Y' AND otptmddt BETWEEN ? AND ?`,
        [monthStartYmd, monthEndYmd],
      )
    } catch { /* graceful */ }

    let kpiOrders = 0
    try {
      const r = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS c FROM operations_dispatch_orders
        WHERE created_at BETWEEN ${monthStart} AND ${monthEnd + ' 23:59:59'}
      `
      kpiOrders = Number(r[0]?.c || 0)
    } catch { /* graceful */ }

    let kpiConsultations = 0
    try {
      const r = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS c FROM operations_consultations
        WHERE created_at BETWEEN ${monthStart} AND ${monthEnd + ' 23:59:59'}
      `
      kpiConsultations = Number(r[0]?.c || 0)
    } catch { /* graceful */ }

    // ── 응답 ──
    const todayDate = new Date(today + 'T00:00:00')
    const tomorrowDate = new Date(tomorrow + 'T00:00:00')
    return NextResponse.json({
      data: serialize({
        meta: {
          now_iso: now.toISOString(),
          today, tomorrow,
          year, month, last_day: lastDay,
          today_label: `${todayDate.getMonth()+1}/${todayDate.getDate()} ${DOW_KR[todayDate.getDay()]}`,
          tomorrow_label: `${tomorrowDate.getMonth()+1}/${tomorrowDate.getDate()} ${DOW_KR[tomorrowDate.getDay()]}`,
          today_is_holiday: holidaySet.has(today),
          tomorrow_is_holiday: holidaySet.has(tomorrow),
          schedule_id: scheduleId,
        },
        kpi: {
          // 운영 인력
          avg_workdays: stats.avg_workdays,
          max_workdays: stats.max_workdays,
          min_workdays: stats.min_workdays,
          active_workers: stats.active_workers,
          required_workers: stats.required_workers,
          night_ratio: stats.night_ratio,
          load_stddev: stats.load_stddev,
          fill_rate: stats.fill_rate,
          // 카페24 부하
          accidents_this_month: kpiAccidents,
          dispatch_this_month: kpiDispatch,
          orders_this_month: kpiOrders,
          consultations_this_month: kpiConsultations,
        },
        now_working: nowWorking,
        today_assignments: todayAssignments,
        tomorrow_assignments: tomorrowAssignments,
        pending: {
          skip: pendingSkip, leave: pendingLeave, swap: pendingSwap,
          total: pendingSkip + pendingLeave + pendingSwap,
        },
        empty_slots: emptySlots,
        next_action: {
          type: nextActionType,
          msg: nextActionMsg,
          next_year: nextMonthYear, next_month: nextMonth,
        },
        upcoming_holidays: upcomingHolidays,
      }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
