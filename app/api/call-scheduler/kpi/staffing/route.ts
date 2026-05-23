// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/kpi/staffing
//   WFM 필요인원 재설계 (CX-KPI-18) — 요일 × 인터벌 격자 Erlang C
//
//   query: granularity=day|week|month, date=YYYY-MM-DD, from/to=YYYY-MM-DD
//
//   처리:
//     ① cs_wfm_config — 산정 기준 (목표 SL·응대시간·부재율·점유율·인터벌)
//     ② cs_call_records — 콜을 (요일 × 30/60분 인터벌) 실제 버킷으로 집계
//        · start_time 의 시·분으로 실제 인터벌 산출 (가짜 균등 분할 X)
//        · WEEKDAY(call_date) 로 월~일 7개 요일 프로파일
//        · (요일,인터벌) 평균 콜 = 합 ÷ 해당 요일 일수
//     ③ cs_assignments × cs_shift_slots — (요일 × 인터벌) 실제 배치 격자
//        · overnight 슬롯은 다음날 요일로 spill (콜 요일과 정합)
//     ④ (요일 × 인터벌) 셀마다 Erlang C requiredAgents → 과부족
//     ⑤ cs_response_queue — 실측 SL (목표·이론 vs 실측 괴리 표시)
//
//   응답: { config, interval_minutes, buckets_per_day, dow_days,
//           grid:[{dow,bucket,calls,aht,required,scheduled,diff}],
//           shifts:[...], summary:{...} }
//   호환: MySQL 8.0 — WEEKDAY/HOUR/MINUTE/FLOOR/COUNT/SUM (회색함수 X)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { requiredAgents } from '@/lib/erlang-c'

export const dynamic = 'force-dynamic'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

type Granularity = 'day' | 'week' | 'month'

// 검사 업무 제외 (dashboard route 와 동일 기준)
const LEGAL_KEYWORD = '%검사%'

// JS Date.getDay(): 0=일..6=토 → WEEKDAY 식 0=월..6=일 로 변환
const jsDowToWeekday = (d: Date) => (d.getDay() + 6) % 7

function resolveRange(granularity: Granularity, base: Date): { from: string; to: string } {
  if (granularity === 'day') {
    const iso = isoOf(base)
    return { from: iso, to: iso }
  }
  if (granularity === 'week') {
    const d = new Date(base)
    const dow = jsDowToWeekday(d)
    const mon = new Date(d); mon.setDate(d.getDate() - dow)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { from: isoOf(mon), to: isoOf(sun) }
  }
  const y = base.getFullYear()
  const m = base.getMonth() + 1
  const last = new Date(y, m, 0).getDate()
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` }
}

// 'HH:MM[:SS]' → 분(0~1439). 실패 시 null
function timeToMin(t: string | null | undefined): number | null {
  if (!t) return null
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1]); const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null
  return h * 60 + mi
}

interface WfmConfig {
  target_service_level_pct: number
  target_answer_sec: number
  shrinkage_pct: number
  interval_minutes: number
  max_occupancy_pct: number
}
const DEFAULT_CONFIG: WfmConfig = {
  target_service_level_pct: 80,
  target_answer_sec: 20,
  shrinkage_pct: 30,
  interval_minutes: 60,
  max_occupancy_pct: 85,
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const granRaw = url.searchParams.get('granularity') || 'month'
    const granularity: Granularity =
      (['day', 'week', 'month'].includes(granRaw) ? granRaw : 'month') as Granularity
    const dateParam = url.searchParams.get('date')
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')
    const base = dateParam ? new Date(dateParam + 'T00:00:00') : new Date()
    let { from, to } = resolveRange(
      granularity, isNaN(base.getTime()) ? new Date() : base,
    )
    if (fromParam && toParam) { from = fromParam; to = toParam }

    // ── 요일별 일수 (from~to 안 각 요일이 며칠인가) ──
    const dowDays = [0, 0, 0, 0, 0, 0, 0] // 0=월..6=일
    {
      const a = new Date(from + 'T00:00:00')
      const b = new Date(to + 'T00:00:00')
      if (!isNaN(a.getTime()) && !isNaN(b.getTime())) {
        let guard = 0
        const cur = new Date(a)
        while (cur <= b && guard < 800) {
          dowDays[jsDowToWeekday(cur)]++
          cur.setDate(cur.getDate() + 1)
          guard++
        }
      }
    }

    // ════ ① cs_wfm_config ════
    let config: WfmConfig = { ...DEFAULT_CONFIG }
    try {
      const cfgRows = await prisma.$queryRaw<any[]>`
        SELECT target_service_level_pct, target_answer_sec,
               shrinkage_pct, interval_minutes, max_occupancy_pct
        FROM cs_wfm_config ORDER BY updated_at DESC LIMIT 1
      `
      if (cfgRows.length > 0) {
        const r = cfgRows[0]
        config = {
          target_service_level_pct: Number(r.target_service_level_pct ?? 80),
          target_answer_sec: Number(r.target_answer_sec ?? 20),
          shrinkage_pct: Number(r.shrinkage_pct ?? 30),
          interval_minutes: Number(r.interval_minutes ?? 60),
          max_occupancy_pct: Number(r.max_occupancy_pct ?? 85),
        }
      }
    } catch { /* graceful — 기본값 */ }

    const intervalMin = [30, 60].includes(config.interval_minutes)
      ? config.interval_minutes : 60
    const intervalSec = intervalMin * 60
    const bucketsPerDay = Math.round(1440 / intervalMin) // 30→48, 60→24

    // ════ ② cs_call_records — (요일 × 인터벌) 실제 버킷 집계 ════
    const callAgg = new Map<string, { cnt: number; dur: number }>() // `${dow}|${bucket}`
    let hasCallData = false
    let totalCalls = 0
    let totalDur = 0
    try {
      const callRows = await prisma.$queryRaw<any[]>`
        SELECT
          WEEKDAY(call_date) AS dow,
          FLOOR((HOUR(start_time) * 60 + MINUTE(start_time)) / ${intervalMin}) AS bucket,
          COUNT(*)                       AS cnt,
          COALESCE(SUM(duration_sec), 0) AS dur
        FROM cs_call_records
        WHERE call_date BETWEEN ${from} AND ${to}
          AND start_time IS NOT NULL
          AND COALESCE(department, '') NOT LIKE ${LEGAL_KEYWORD}
          AND COALESCE(center, '')     NOT LIKE ${LEGAL_KEYWORD}
          AND COALESCE(type1, '')      NOT LIKE ${LEGAL_KEYWORD}
          AND COALESCE(type2, '')      NOT LIKE ${LEGAL_KEYWORD}
        GROUP BY
          WEEKDAY(call_date),
          FLOOR((HOUR(start_time) * 60 + MINUTE(start_time)) / ${intervalMin})
      `
      for (const r of callRows) {
        const dow = Number(r.dow)
        const bucket = Number(r.bucket)
        if (!(dow >= 0 && dow <= 6)) continue
        if (!(bucket >= 0 && bucket < bucketsPerDay)) continue
        const cnt = Number(r.cnt || 0)
        const dur = Number(r.dur || 0)
        callAgg.set(`${dow}|${bucket}`, { cnt, dur })
        totalCalls += cnt
        totalDur += dur
      }
      hasCallData = callRows.length > 0
    } catch { /* graceful — cs_call_records 미적재 */ }

    const globalAht = totalCalls > 0 ? Math.round(totalDur / totalCalls) : 0

    // ════ ③ cs_assignments × cs_shift_slots — (요일 × 인터벌) 배치 격자 ════
    // overnight 슬롯은 시작 요일 D 의 늦은 버킷 + (D+1)%7 의 이른 버킷 커버.
    const coverAgg = new Map<string, number>() // `${dow}|${bucket}` → 셀 수 합
    type SlotAgg = {
      slotId: string; code: string; label: string
      startMin: number; endMin: number; overnight: boolean
      totalCells: number
      dowSet: Set<number>          // 배정된 요일들
      buckets: { dow: number; bucket: number }[] // 커버 (요일,버킷) 목록
    }
    const slotAgg = new Map<string, SlotAgg>()
    let hasWorkData = false
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT
          WEEKDAY(a.work_date)               AS dow,
          s.id                               AS slot_id,
          s.code                             AS code,
          s.label                            AS label,
          TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
          TIME_FORMAT(s.end_time, '%H:%i')   AS end_time,
          s.is_overnight                     AS is_overnight,
          COUNT(*)                           AS cells
        FROM cs_assignments a
        JOIN cs_shift_slots s ON s.id = a.shift_slot_id
        WHERE a.work_date BETWEEN ${from} AND ${to}
          AND a.worker_id IS NOT NULL
          AND a.special_code = 'none'
        GROUP BY
          WEEKDAY(a.work_date), s.id, s.code, s.label,
          s.start_time, s.end_time, s.is_overnight
      `
      for (const r of rows) {
        const dow = Number(r.dow)
        if (!(dow >= 0 && dow <= 6)) continue
        const sMin = timeToMin(r.start_time)
        const eMin = timeToMin(r.end_time)
        if (sMin == null || eMin == null) continue
        const overnight = Number(r.is_overnight) === 1 || eMin <= sMin
        const cells = Number(r.cells || 0)
        if (cells <= 0) continue
        hasWorkData = true

        const slotId = String(r.slot_id || '')
        const startB = Math.floor(sMin / intervalMin)
        const endB = Math.floor(eMin / intervalMin)

        // 커버 (요일,버킷) 산출
        const covered: { dow: number; bucket: number }[] = []
        if (overnight) {
          for (let b = startB; b < bucketsPerDay; b++) covered.push({ dow, bucket: b })
          const nextDow = (dow + 1) % 7
          for (let b = 0; b < endB; b++) covered.push({ dow: nextDow, bucket: b })
        } else {
          for (let b = startB; b < endB; b++) covered.push({ dow, bucket: b })
        }
        if (covered.length === 0) covered.push({ dow, bucket: startB })

        for (const c of covered) {
          const key = `${c.dow}|${c.bucket}`
          coverAgg.set(key, (coverAgg.get(key) || 0) + cells)
        }

        let sa = slotAgg.get(slotId)
        if (!sa) {
          sa = {
            slotId, code: String(r.code || ''), label: String(r.label || ''),
            startMin: sMin, endMin: eMin, overnight,
            totalCells: 0, dowSet: new Set<number>(), buckets: covered,
          }
          slotAgg.set(slotId, sa)
        }
        sa.totalCells += cells
        sa.dowSet.add(dow)
      }
    } catch { /* graceful — cs_assignments / cs_shift_slots 미적재 */ }

    // ════ ④ (요일 × 인터벌) 격자 Erlang C ════
    type Cell = {
      dow: number; bucket: number
      calls: number; aht: number
      required: number; scheduled: number; diff: number
    }
    const grid: Cell[] = []
    // required 룩업 — 시프트 카드용
    const requiredAt = new Map<string, number>()
    for (let dow = 0; dow <= 6; dow++) {
      for (let b = 0; b < bucketsPerDay; b++) {
        const ca = callAgg.get(`${dow}|${b}`)
        const cnt = ca ? ca.cnt : 0
        // (요일,버킷) 평균 콜 = 합 ÷ 해당 요일 일수
        const avgCalls = dowDays[dow] > 0 ? cnt / dowDays[dow] : 0
        const aht = ca && ca.cnt > 0
          ? Math.round(ca.dur / ca.cnt)
          : (globalAht > 0 ? globalAht : 180)

        const r = requiredAgents({
          callsPerInterval: avgCalls,
          ahtSec: aht,
          intervalSec,
          targetSlPct: config.target_service_level_pct,
          targetAnswerSec: config.target_answer_sec,
          maxOccupancyPct: config.max_occupancy_pct,
          shrinkagePct: config.shrinkage_pct,
        })
        const cover = coverAgg.get(`${dow}|${b}`) || 0
        const scheduled = dowDays[dow] > 0 ? cover / dowDays[dow] : 0

        requiredAt.set(`${dow}|${b}`, r.requiredAgents)
        grid.push({
          dow, bucket: b,
          calls: Math.round(avgCalls * 10) / 10,
          aht,
          required: r.requiredAgents,
          scheduled: Math.round(scheduled * 10) / 10,
          diff: Math.round((scheduled - r.requiredAgents) * 10) / 10,
        })
      }
    }

    // ════ ⑤ cs_response_queue — 실측 SL ════
    let actualServiceLevel: number | null = null
    let hasResponseData = false
    try {
      const slRows = await prisma.$queryRaw<any[]>`
        SELECT
          COALESCE(SUM(inbound), 0)         AS inbound,
          COALESCE(SUM(answered_in_20s), 0) AS answered_in_20s
        FROM cs_response_queue
        WHERE stat_date BETWEEN ${from} AND ${to}
          AND COALESCE(skill, '') NOT LIKE ${LEGAL_KEYWORD}
      `
      const inbound = Number(slRows[0]?.inbound || 0)
      const in20s = Number(slRows[0]?.answered_in_20s || 0)
      if (inbound > 0) {
        actualServiceLevel = Math.round((in20s / inbound) * 1000) / 10
        hasResponseData = true
      }
    } catch { /* graceful */ }

    // ════ 시프트별 과부족 카드 ════
    type ShiftResult = {
      shift_name: string; code: string
      hours: string
      required_peak: number    // 커버 셀 중 최대 필요 인원
      scheduled: number        // 평균 배치 인원 (셀 ÷ 요일 발생일수)
      status: 'short' | 'ok' | 'over'
      shortage: number
    }
    const shifts: ShiftResult[] = []
    for (const sa of slotAgg.values()) {
      let reqPeak = 0
      for (const c of sa.buckets) {
        const req = requiredAt.get(`${c.dow}|${c.bucket}`) || 0
        if (req > reqPeak) reqPeak = req
      }
      // 발생 일수 = 배정된 요일들의 일수 합
      let occ = 0
      for (const d of sa.dowSet) occ += dowDays[d]
      const sched = occ > 0 ? Math.round((sa.totalCells / occ) * 10) / 10 : 0
      let status: 'short' | 'ok' | 'over' = 'ok'
      if (sched < reqPeak) status = 'short'
      else if (sched > reqPeak + Math.max(1, reqPeak * 0.25)) status = 'over'
      shifts.push({
        shift_name: sa.label || sa.code,
        code: sa.code,
        hours: `${pad(Math.floor(sa.startMin / 60))}:${pad(sa.startMin % 60)}`
          + `~${pad(Math.floor(sa.endMin / 60))}:${pad(sa.endMin % 60)}`
          + (sa.overnight ? ' (익일)' : ''),
        required_peak: reqPeak,
        scheduled: sched,
        status,
        shortage: status === 'short'
          ? Math.round((reqPeak - sched) * 10) / 10 : 0,
      })
    }
    // 시작 시각 문자열 기준 정렬
    shifts.sort((a, b) => a.hours.localeCompare(b.hours))

    // ════ 요약 ════
    let peak: Cell | null = null
    let sumRequired = 0
    let sumScheduled = 0
    let shortCells = 0
    let activeCells = 0
    for (const c of grid) {
      if (dowDays[c.dow] === 0) continue // 기간에 없는 요일은 제외
      sumRequired += c.required
      sumScheduled += c.scheduled
      if (c.required > 0) {
        activeCells++
        if (c.diff < 0) shortCells++
      }
      if (!peak || c.required > peak.required) peak = c
    }

    const summary = {
      granularity, from, to,
      interval_minutes: intervalMin,
      buckets_per_day: bucketsPerDay,
      total_calls: totalCalls,
      avg_aht: globalAht,
      peak_dow: peak ? peak.dow : 0,
      peak_bucket: peak ? peak.bucket : 0,
      peak_required: peak ? peak.required : 0,
      sum_required: Math.round(sumRequired * 10) / 10,
      sum_scheduled: Math.round(sumScheduled * 10) / 10,
      short_cells: shortCells,
      active_cells: activeCells,
      has_call_data: hasCallData,
      has_work_data: hasWorkData,
      target_service_level: config.target_service_level_pct,
      actual_service_level: actualServiceLevel,
      has_response_data: hasResponseData,
    }

    return NextResponse.json({
      data: serialize({
        config,
        interval_minutes: intervalMin,
        buckets_per_day: bucketsPerDay,
        dow_days: dowDays,
        grid,
        shifts,
        summary,
      }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
