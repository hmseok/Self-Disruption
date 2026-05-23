// ═══════════════════════════════════════════════════════════════════
// lib/cs-shift-hours.ts — CallScheduler 근무시간 union 계산 (공용)
//
// 한 사람이 하루에 여러 시프트(예: 부엉 20:30~08:30 + 달빛 19:00~23:00)를
// 동시에 맡으면, 슬롯 시간이 겹친다. computed_hours 를 단순 SUM 하면
// 겹친 시간이 중복 합산된다(부엉 12h + 달빛 4h = 16h, 실제 19:00~08:30 13.5h).
//
// 이 모듈은 슬롯 구간을 합집합(union)으로 계산해 겹친 시간을 1회만 센다.
// KPI dashboard / evaluation / attendance route 공용 — 단일 소스.
//   · 사용자 명시 (2026-05-23): "그룹 시간이 겹치는 경우 전체 시간을 체크"
// ═══════════════════════════════════════════════════════════════════

// 'HH:MM[:SS]' → 분(0~1439). 실패 시 null
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null
  return h * 60 + mi
}

// 슬롯 1개 구간 [startMin, endMin] — overnight(또는 end<=start)이면 endMin += 1440
export function slotInterval(
  startMin: number, endMin: number, overnight: boolean,
): [number, number] {
  let e = endMin
  if (overnight || e <= startMin) e += 1440
  return [startMin, e]
}

// 구간 배열 union — { minutes(겹침 제거 총분), start(최소 시작), end(최대 종료) }
// 빈 배열이면 모두 0.
export function unionIntervals(intervals: [number, number][]): {
  minutes: number; start: number; end: number
} {
  if (intervals.length === 0) return { minutes: 0, start: 0, end: 0 }
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  let minutes = 0
  let [curS, curE] = sorted[0]
  const start = curS
  let maxEnd = curE
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i]
    if (s <= curE) {
      curE = Math.max(curE, e)
    } else {
      minutes += curE - curS
      curS = s; curE = e
    }
    if (e > maxEnd) maxEnd = e
  }
  minutes += curE - curS
  return { minutes, start, end: maxEnd }
}

// 배정 1행 — work_date 별 슬롯 시각
export interface ShiftAssignmentRow {
  worker_id: string
  work_date: string          // YYYY-MM-DD
  start_time: string | null  // HH:MM
  end_time: string | null    // HH:MM
  is_overnight: boolean
}

// 배정 행 목록 → worker_id 별 { work_days, work_hours }.
// 같은 (worker, work_date) 의 여러 슬롯은 union 으로 합쳐 겹친 시간 중복 제거.
export function workHoursByWorker(
  rows: ShiftAssignmentRow[],
): Map<string, { work_days: number; work_hours: number }> {
  // (worker_id|date) → 구간 배열
  const buckets = new Map<string, { worker: string; intervals: [number, number][] }>()
  for (const r of rows) {
    if (!r.worker_id) continue
    const key = `${r.worker_id}|${r.work_date}`
    let b = buckets.get(key)
    if (!b) {
      b = { worker: r.worker_id, intervals: [] }
      buckets.set(key, b)
    }
    const s = timeToMinutes(r.start_time)
    const e = timeToMinutes(r.end_time)
    if (s != null && e != null) {
      b.intervals.push(slotInterval(s, e, r.is_overnight))
    }
  }
  const out = new Map<string, { work_days: number; work_hours: number }>()
  for (const b of buckets.values()) {
    let agg = out.get(b.worker)
    if (!agg) {
      agg = { work_days: 0, work_hours: 0 }
      out.set(b.worker, agg)
    }
    agg.work_days += 1
    agg.work_hours += unionIntervals(b.intervals).minutes / 60
  }
  return out
}
