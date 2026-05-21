// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/kpi/staffing
//   WFM 필요인원 산정 — Erlang C 시간대별 (KPI-DESIGN.md §5-4 / §6)
//
//   query:
//     · granularity = day | week | month   (기본 month — dashboard 와 동일)
//     · date        = YYYY-MM-DD           (granularity 의 기준일)
//
//   처리:
//     ① cs_wfm_config        — 산정 기준 (목표 SL·응대시간·부재율·점유율·인터벌)
//     ② cs_call_records      — 기간 내 콜을 시간대(시)별 집계 → 인터벌당 평균 콜 수 λ
//     ③ cs_assignments × cs_shift_slots — 시간대별 커버(근무 중) 인원
//     → 시간대별 requiredAgents() vs 커버 인원 비교 → 과부족
//
//   모두 graceful try/catch — 테이블 미적재 시 빈 결과 + 안내
//
//   응답: { config, hourly: [...], shifts: [...], summary: {...} }
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

// granularity + 기준일 → { from, to } (YYYY-MM-DD) — dashboard route 패턴 재사용
function resolveRange(granularity: Granularity, base: Date): { from: string; to: string } {
  if (granularity === 'day') {
    const iso = isoOf(base)
    return { from: iso, to: iso }
  }
  if (granularity === 'week') {
    const d = new Date(base)
    const dow = (d.getDay() + 6) % 7 // 0 = 월
    const mon = new Date(d); mon.setDate(d.getDate() - dow)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { from: isoOf(mon), to: isoOf(sun) }
  }
  // month
  const y = base.getFullYear()
  const m = base.getMonth() + 1
  const last = new Date(y, m, 0).getDate()
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` }
}

// TIME 문자열("HH:MM:SS") → 시(hour) 정수. 파싱 실패 시 null
function hourOf(time: string | null | undefined): number | null {
  if (!time) return null
  const m = String(time).match(/^(\d{1,2}):/)
  if (!m) return null
  const h = Number(m[1])
  return h >= 0 && h <= 23 ? h : null
}

// 두 날짜(YYYY-MM-DD) 사이 일수 (포함)
function dayCount(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00')
  const b = new Date(to + 'T00:00:00')
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 1
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1
  return diff > 0 ? diff : 1
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
    const base = dateParam ? new Date(dateParam + 'T00:00:00') : new Date()
    const { from, to } = resolveRange(
      granularity, isNaN(base.getTime()) ? new Date() : base,
    )
    const days = dayCount(from, to)

    // ════ ① cs_wfm_config — 산정 기준 (1행) ════
    let config: WfmConfig = { ...DEFAULT_CONFIG }
    try {
      const cfgRows = await prisma.$queryRaw<any[]>`
        SELECT target_service_level_pct, target_answer_sec,
               shrinkage_pct, interval_minutes, max_occupancy_pct
        FROM cs_wfm_config
        ORDER BY updated_at DESC
        LIMIT 1
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
    } catch { /* graceful — cs_wfm_config 미적재 시 기본값 */ }

    // 인터벌 단위 — 30 또는 60분. 그 외 값은 60 으로 보정
    const intervalMin = [30, 60].includes(config.interval_minutes)
      ? config.interval_minutes : 60
    const intervalSec = intervalMin * 60
    // 1시간 = intervalsPerHour 개 인터벌 (60→1, 30→2)
    const intervalsPerHour = 60 / intervalMin

    // ════ ② cs_call_records — 시간대(시)별 콜 집계 ════
    // 시간(0~23)별: 콜 수 합계, 통화시간 합계 → 인터벌당 평균 콜 / AHT
    type HourAgg = { hour: number; calls: number; durSum: number }
    const hourAgg = new Map<number, HourAgg>()
    let hasCallData = false
    let totalCalls = 0
    let totalDurSum = 0

    try {
      const callRows = await prisma.$queryRaw<any[]>`
        SELECT
          HOUR(start_time) AS hh,
          COUNT(*)              AS cnt,
          COALESCE(SUM(duration_sec), 0) AS dur
        FROM cs_call_records
        WHERE call_date BETWEEN ${from} AND ${to}
          AND start_time IS NOT NULL
        GROUP BY HOUR(start_time)
      `
      for (const r of callRows) {
        const h = Number(r.hh)
        if (!(h >= 0 && h <= 23)) continue
        const cnt = Number(r.cnt || 0)
        const dur = Number(r.dur || 0)
        hourAgg.set(h, { hour: h, calls: cnt, durSum: dur })
        totalCalls += cnt
        totalDurSum += dur
      }
      hasCallData = callRows.length > 0
    } catch { /* graceful — cs_call_records 미적재 */ }

    // 전체 평균 AHT (해당 시간대 데이터 없을 때 fallback)
    const globalAht = totalCalls > 0
      ? Math.round(totalDurSum / totalCalls)
      : 0

    // ════ ③ cs_assignments × cs_shift_slots — 시간대별 커버 인원 ════
    // 각 시(hour)를 근무 중인 상담사(배정 셀) 수. is_overnight 시 자정 넘김.
    // 시프트별 커버 시간대도 함께 수집 (시프트 과부족 카드용).
    const hourCover = new Map<number, number>()   // hour → 커버 셀 수 (기간 평균)
    type ShiftAgg = {
      code: string; label: string
      startH: number; endH: number; overnight: boolean
      hours: number[]                              // 커버하는 시간대 목록
      cellCount: number                            // 기간 내 배정 셀 수
    }
    const shiftAgg = new Map<string, ShiftAgg>()
    let hasWorkData = false

    try {
      // 슬롯별 배정 셀 수 — special_code='none'(정상근무) + worker 배정된 셀만
      const slotRows = await prisma.$queryRaw<any[]>`
        SELECT
          s.id          AS slot_id,
          s.code        AS code,
          s.label       AS label,
          s.start_time  AS start_time,
          s.end_time    AS end_time,
          s.is_overnight AS is_overnight,
          COUNT(a.id)   AS cell_count
        FROM cs_shift_slots s
        LEFT JOIN cs_assignments a
          ON a.shift_slot_id = s.id
         AND a.work_date BETWEEN ${from} AND ${to}
         AND a.worker_id IS NOT NULL
         AND a.special_code = 'none'
        GROUP BY s.id, s.code, s.label, s.start_time, s.end_time, s.is_overnight
      `
      for (const r of slotRows) {
        const startH = hourOf(r.start_time)
        const endH = hourOf(r.end_time)
        if (startH === null || endH === null) continue
        const overnight = Number(r.is_overnight) === 1
        const cellCount = Number(r.cell_count || 0)

        // 시프트가 커버하는 시간대 목록 산출
        const coverHours: number[] = []
        if (overnight || endH <= startH) {
          // 자정 넘김: startH..23, 0..endH-1
          for (let h = startH; h <= 23; h++) coverHours.push(h)
          for (let h = 0; h < endH; h++) coverHours.push(h)
        } else {
          // 당일: startH..endH-1 (종료시각 시간대는 미포함 — 그 시각 직전까지 근무)
          for (let h = startH; h < endH; h++) coverHours.push(h)
        }
        if (coverHours.length === 0) coverHours.push(startH)

        shiftAgg.set(String(r.code || r.slot_id), {
          code: String(r.code || ''),
          label: String(r.label || ''),
          startH, endH, overnight,
          hours: coverHours,
          cellCount,
        })

        // 시간대별 커버 인원 누적 — 기간 평균 = 셀 수 / 일수
        const avgCells = cellCount / days
        for (const h of coverHours) {
          hourCover.set(h, (hourCover.get(h) || 0) + avgCells)
        }
        if (cellCount > 0) hasWorkData = true
      }
    } catch { /* graceful — cs_assignments / cs_shift_slots 미적재 */ }

    // ════ 시간대별 필요인원 산정 (Erlang C) ════
    type HourResult = {
      hour: number
      calls: number          // 인터벌당 평균 콜 수 (반올림)
      aht: number            // 해당 시간대 평균 AHT (초)
      required: number       // Erlang C 필요 인원 (부재율 보정 후)
      scheduled: number      // 배정(커버) 인원 (반올림)
      diff: number           // scheduled − required (음수=부족)
    }
    const hourly: HourResult[] = []
    for (let h = 0; h < 24; h++) {
      const agg = hourAgg.get(h)
      const hourCalls = agg ? agg.calls : 0
      // 시간당 콜 → 인터벌당 평균 콜 수 (요일/일수로 나눠 평균)
      const callsPerIntervalAvg = days > 0
        ? hourCalls / days / intervalsPerHour
        : 0
      // 해당 시간대 AHT — 없으면 전체 평균, 그것도 없으면 180 기본
      const hourAht = agg && agg.calls > 0
        ? Math.round(agg.durSum / agg.calls)
        : (globalAht > 0 ? globalAht : 180)

      const r = requiredAgents({
        callsPerInterval: callsPerIntervalAvg,
        ahtSec: hourAht,
        intervalSec,
        targetSlPct: config.target_service_level_pct,
        targetAnswerSec: config.target_answer_sec,
        maxOccupancyPct: config.max_occupancy_pct,
        shrinkagePct: config.shrinkage_pct,
      })
      const scheduled = Math.round((hourCover.get(h) || 0) * 10) / 10

      hourly.push({
        hour: h,
        calls: Math.round(callsPerIntervalAvg * 10) / 10,
        aht: hourAht,
        required: r.requiredAgents,
        scheduled,
        diff: Math.round((scheduled - r.requiredAgents) * 10) / 10,
      })
    }

    // ════ 시프트별 과부족 카드 ════
    type ShiftResult = {
      shift_name: string
      hours: string                 // "07~16시"
      required_peak: number         // 시프트 커버 시간대 중 최대 필요 인원
      scheduled: number             // 시프트 기간 평균 배정 인원
      status: 'short' | 'ok' | 'over'
    }
    const shifts: ShiftResult[] = []
    for (const sa of shiftAgg.values()) {
      // 시프트 커버 시간대들의 필요 인원 중 피크
      let reqPeak = 0
      for (const h of sa.hours) {
        const hr = hourly[h]
        if (hr && hr.required > reqPeak) reqPeak = hr.required
      }
      // 시프트 평균 배정 인원 = 셀 수 / 일수 (한 슬롯은 한 시간대당 1셀 기준)
      const sched = Math.round((sa.cellCount / days) * 10) / 10
      // 과부족 판정 — 피크 필요 대비
      let status: 'short' | 'ok' | 'over' = 'ok'
      if (sched < reqPeak) status = 'short'
      else if (sched > reqPeak + Math.max(1, reqPeak * 0.25)) status = 'over'

      const hh = (n: number) => `${pad(n)}`
      shifts.push({
        shift_name: sa.label || sa.code,
        hours: `${hh(sa.startH)}~${hh(sa.endH)}시${sa.overnight ? ' (익일)' : ''}`,
        required_peak: reqPeak,
        scheduled: sched,
        status,
      })
    }
    // 시작 시간 순 정렬
    shifts.sort((a, b) => a.hours.localeCompare(b.hours))

    // ════ 요약 ════
    const peakHour = hourly.reduce(
      (acc, h) => (h.required > acc.required ? h : acc),
      hourly[0],
    )
    const reqHours = hourly.filter(h => h.required > 0)
    const sumRequired = hourly.reduce((s, h) => s + h.required, 0)
    const sumScheduled = hourly.reduce((s, h) => s + h.scheduled, 0)
    const shortHours = hourly.filter(h => h.required > 0 && h.diff < 0).length

    const summary = {
      granularity, from, to, days,
      interval_minutes: intervalMin,
      total_calls: totalCalls,
      avg_aht: globalAht,
      peak_hour: peakHour ? peakHour.hour : 0,
      peak_required: peakHour ? peakHour.required : 0,
      avg_required: reqHours.length > 0
        ? Math.round((sumRequired / reqHours.length) * 10) / 10 : 0,
      sum_required: Math.round(sumRequired * 10) / 10,
      sum_scheduled: Math.round(sumScheduled * 10) / 10,
      short_hours: shortHours,
      has_call_data: hasCallData,
      has_work_data: hasWorkData,
    }

    return NextResponse.json({
      data: serialize({ config, hourly, shifts, summary }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
