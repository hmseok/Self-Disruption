// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/kpi/attendance — CX KPI 근태 (지각·조퇴)
//
// 근무표 예정 시각(cs_shift_slots) ↔ KT 생산성 실측 로그인/로그아웃
// (cs_agent_productivity daily) 매칭으로 지각·조퇴를 산출.
//
// 매칭 경로:
//   예정  cs_assignments → cs_shift_slots = start_time / end_time
//   실측  cs_assignments.worker_id → cs_workers.kt_id
//                                  → cs_agent_productivity(period_label=work_date, daily)
//
// 그룹 시간 겹침 처리 (사용자 명시 2026-05-23):
//   한 사람이 하루에 여러 슬롯(예: 부엉 20:30~08:30 + 달빛 19:00~23:00)이면
//   슬롯 구간을 합집합(union)으로 계산 — 겹치는 시간 중복 제거.
//   지각 = login_first vs 그날 가장 이른 슬롯 시작
//   조퇴 = login_last  vs 그날 가장 늦은 슬롯 종료
//   ※ overnight 도 동일 — login_first 저녁/login_last 아침이면 평면 비교 정확.
//
// 판정: 정시 ±grace(cs_kpi_attendance_config) 분 이내는 정상.
//
// query: granularity=day|week|month, date, from/to
// 응답  : { data:{ from,to,granularity, grace_minutes, has_daily_prod,
//                  migration_pending, summary, workers:[...] }, error }
// 호환  : MySQL 8.0 — DATE_FORMAT/TIME_FORMAT/JOIN (회색함수 X)
//         JOIN 은 같은 init 마이그레이션 테이블끼리만 — collation mismatch 회피.
//         (cs_agent_productivity 는 별도 쿼리 후 TS 에서 kt_id 로 join)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { timeToMinutes, slotInterval, unionIntervals } from '@/lib/cs-shift-hours'

export const dynamic = 'force-dynamic'

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

type Granularity = 'day' | 'week' | 'month'

function resolveRange(g: Granularity, base: Date): { from: string; to: string } {
  if (g === 'day') {
    const iso = isoOf(base)
    return { from: iso, to: iso }
  }
  if (g === 'week') {
    const d = new Date(base)
    const dow = (d.getDay() + 6) % 7 // 0 = 월
    const mon = new Date(d); mon.setDate(d.getDate() - dow)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { from: isoOf(mon), to: isoOf(sun) }
  }
  const y = base.getFullYear()
  const m = base.getMonth() + 1
  const last = new Date(y, m, 0).getDate()
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` }
}

// 분(0~1439) → 'HH:MM' (표시용)
const minToHHMM = (min: number): string =>
  `${pad(Math.floor((min % 1440) / 60))}:${pad((min % 1440) % 60)}`

// timeToMinutes / slotInterval / unionIntervals 는 lib/cs-shift-hours 공용 —
// 근무시간 union 계산이 dashboard/evaluation/attendance 단일 소스 (규칙 14).

interface DayResult {
  date: string
  slots: { code: string; label: string }[]
  is_overnight: boolean
  sched_start: string          // HH:MM — 판정 기준 시작 (가장 이른 슬롯)
  sched_end: string            // HH:MM — 판정 기준 종료 (가장 늦은 슬롯)
  sched_hours: number          // 슬롯 union 시간 (겹침 제거)
  login_first: string | null   // HH:MM
  login_last: string | null    // HH:MM
  late_min: number             // 지각 분 (0 = 정상)
  early_min: number            // 조퇴 분 (0 = 정상)
  status: 'ok' | 'late' | 'early' | 'late_early' | 'no_data' | 'unmatched'
}
interface WorkerResult {
  worker_id: string
  name: string
  kt_id: string | null
  work_days: number
  late_count: number
  late_total_min: number
  early_count: number
  early_total_min: number
  no_data_days: number
  days: DayResult[]
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const gRaw = url.searchParams.get('granularity') || 'month'
    const granularity = (['day', 'week', 'month'].includes(gRaw)
      ? gRaw : 'month') as Granularity
    const dateParam = url.searchParams.get('date')
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')

    const base = dateParam ? new Date(dateParam + 'T00:00:00') : new Date()
    let { from, to } = resolveRange(
      granularity, isNaN(base.getTime()) ? new Date() : base,
    )
    if (fromParam && toParam) { from = fromParam; to = toParam }

    // ── 근태 판정 기준 (grace) ──────────────────────────────────
    let grace = 0
    let migrationPending = false
    try {
      const gRows = await prisma.$queryRaw<any[]>`
        SELECT grace_minutes FROM cs_kpi_attendance_config LIMIT 1
      `
      if (gRows.length > 0) grace = Number(gRows[0].grace_minutes) || 0
    } catch {
      migrationPending = true // 테이블 미적용 — grace 0 으로 진행
    }

    // ── ① 근무 배정 + 시프트 (예정) — 같은 init 마이그레이션 테이블 JOIN ──
    let asnRows: any[] = []
    try {
      asnRows = await prisma.$queryRaw<any[]>`
        SELECT
          DATE_FORMAT(a.work_date, '%Y-%m-%d')    AS work_date,
          a.worker_id                             AS worker_id,
          w.name                                  AS worker_name,
          w.kt_id                                 AS kt_id,
          s.code                                  AS slot_code,
          s.label                                 AS slot_label,
          TIME_FORMAT(s.start_time, '%H:%i')      AS start_time,
          TIME_FORMAT(s.end_time, '%H:%i')        AS end_time,
          s.is_overnight                          AS is_overnight
        FROM cs_assignments a
        JOIN cs_shift_slots s ON s.id = a.shift_slot_id
        JOIN cs_workers w     ON w.id = a.worker_id
        WHERE a.work_date BETWEEN ${from} AND ${to}
          AND a.worker_id IS NOT NULL
          AND a.special_code = 'none'
        ORDER BY a.work_date ASC, w.name ASC
      `
    } catch {
      asnRows = [] // graceful — cs_assignments 미적재
    }

    // ── ② 일별 생산성 (실측 로그인/로그아웃) — 별도 쿼리 (collation 회피) ──
    // key: `${period_label}|${agent_kt_id}` → { login_first, login_last }
    const prodMap = new Map<string, { first: string | null; last: string | null }>()
    let hasDailyProd = false
    try {
      const pRows = await prisma.$queryRaw<any[]>`
        SELECT
          period_label                          AS period_label,
          agent_kt_id                            AS agent_kt_id,
          TIME_FORMAT(login_first, '%H:%i')      AS login_first,
          TIME_FORMAT(login_last, '%H:%i')       AS login_last
        FROM cs_agent_productivity
        WHERE period_kind = 'daily'
          AND period_label BETWEEN ${from} AND ${to}
          AND agent_kt_id IS NOT NULL AND agent_kt_id <> ''
      `
      for (const r of pRows) {
        const key = `${String(r.period_label)}|${String(r.agent_kt_id)}`
        prodMap.set(key, {
          first: r.login_first ? String(r.login_first) : null,
          last: r.login_last ? String(r.login_last) : null,
        })
      }
      hasDailyProd = pRows.length > 0
    } catch {
      hasDailyProd = false // graceful — cs_agent_productivity 미적재
    }

    // ── ③ (worker_id, work_date) 로 그룹핑 — 같은 날 여러 슬롯 = union ──
    type DayBucket = {
      worker_id: string; name: string; kt_id: string | null
      date: string
      slots: { code: string; label: string }[]
      intervals: [number, number][]
      anyOvernight: boolean
    }
    const buckets = new Map<string, DayBucket>()
    for (const r of asnRows) {
      const workerId = String(r.worker_id)
      const date = String(r.work_date)
      const key = `${workerId}|${date}`
      let b = buckets.get(key)
      if (!b) {
        b = {
          worker_id: workerId,
          name: String(r.worker_name || '미상'),
          kt_id: r.kt_id ? String(r.kt_id) : null,
          date,
          slots: [],
          intervals: [],
          anyOvernight: false,
        }
        buckets.set(key, b)
      }
      const sMin = timeToMinutes(r.start_time)
      const eMin = timeToMinutes(r.end_time)
      const overnight = Number(r.is_overnight) === 1
      if (sMin != null && eMin != null) {
        b.intervals.push(slotInterval(sMin, eMin, overnight))
      }
      if (overnight) b.anyOvernight = true
      b.slots.push({
        code: String(r.slot_code || ''),
        label: String(r.slot_label || ''),
      })
    }

    // ── ④ 워커별 일자 판정 ─────────────────────────────────────
    const workerMap = new Map<string, WorkerResult>()
    const getWorker = (b: DayBucket): WorkerResult => {
      let w = workerMap.get(b.worker_id)
      if (!w) {
        w = {
          worker_id: b.worker_id, name: b.name, kt_id: b.kt_id,
          work_days: 0, late_count: 0, late_total_min: 0,
          early_count: 0, early_total_min: 0, no_data_days: 0, days: [],
        }
        workerMap.set(b.worker_id, w)
      }
      return w
    }

    for (const b of buckets.values()) {
      const w = getWorker(b)
      w.work_days += 1

      const uni = unionIntervals(b.intervals)
      const schedStartClock = uni.start % 1440
      const schedEndClock = uni.end % 1440
      const schedHours = Math.round((uni.minutes / 60) * 100) / 100

      // 실측 로그인 — kt_id 로 그날 daily 생산성 조회
      const prod = b.kt_id ? prodMap.get(`${b.date}|${b.kt_id}`) : undefined
      const loginFirst = prod?.first ?? null
      const loginLast = prod?.last ?? null
      const lfMin = timeToMinutes(loginFirst)
      const llMin = timeToMinutes(loginLast)

      let lateMin = 0
      let earlyMin = 0
      let status: DayResult['status']

      if (!b.kt_id) {
        status = 'unmatched' // 워커에 KT ID 미연결 — 「상담원 매칭」 필요
      } else if (lfMin == null && llMin == null) {
        status = 'no_data'   // 그날 daily 생산성 행 없음
        w.no_data_days += 1
      } else {
        // 지각 — login_first 가 예정 시작보다 grace 초과 늦음
        if (lfMin != null) {
          const diff = lfMin - schedStartClock
          if (diff > grace) lateMin = diff
        }
        // 조퇴 — login_last 가 예정 종료보다 grace 초과 이름
        if (llMin != null) {
          const diff = schedEndClock - llMin
          if (diff > grace) earlyMin = diff
        }
        if (lateMin > 0) { w.late_count += 1; w.late_total_min += lateMin }
        if (earlyMin > 0) { w.early_count += 1; w.early_total_min += earlyMin }
        status = lateMin > 0 && earlyMin > 0 ? 'late_early'
          : lateMin > 0 ? 'late'
          : earlyMin > 0 ? 'early'
          : 'ok'
      }

      w.days.push({
        date: b.date,
        slots: b.slots,
        is_overnight: b.anyOvernight,
        sched_start: minToHHMM(schedStartClock),
        sched_end: minToHHMM(schedEndClock),
        sched_hours: schedHours,
        login_first: loginFirst,
        login_last: loginLast,
        late_min: lateMin,
        early_min: earlyMin,
        status,
      })
    }

    // 일자 정렬 (각 워커 days 최신순)
    const workers = Array.from(workerMap.values())
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    for (const w of workers) {
      w.days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    }

    // ── 요약 ────────────────────────────────────────────────────
    // late_count/early_count 는 일수 기준 — late_early 일은 둘 다에 포함되므로
    // ok_count/unmatched_count 는 status 로 직접 집계 (이중 차감 회피).
    const summary = {
      worker_count: workers.length,
      work_day_count: 0,
      late_count: 0,
      early_count: 0,
      no_data_count: 0,
      unmatched_count: 0,
      ok_count: 0,
    }
    for (const w of workers) {
      summary.work_day_count += w.work_days
      summary.late_count += w.late_count
      summary.early_count += w.early_count
      summary.no_data_count += w.no_data_days
      for (const d of w.days) {
        if (d.status === 'ok') summary.ok_count += 1
        else if (d.status === 'unmatched') summary.unmatched_count += 1
      }
    }

    return NextResponse.json({
      data: {
        from, to, granularity,
        grace_minutes: grace,
        has_daily_prod: hasDailyProd,
        migration_pending: migrationPending,
        summary,
        workers,
      },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'DB error' },
      { status: 500 },
    )
  }
}
