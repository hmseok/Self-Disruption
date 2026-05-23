// ═══════════════════════════════════════════════════════════════════
// lib/cs-kpi-period.ts — CX KPI 평가 기간 키 (공용)
//
// granularity + 기준일 → (period_kind, period_label).
// 커스텀 평가 점수(cs_kpi_eval_scores)의 기간 식별 키 — 주간/월간/일간
// 평가 점수를 구분 저장·조회한다. eval-scores route 와 evaluation route 공용.
//   · monthly → '2026-05'
//   · weekly  → 그 주 월요일 날짜 '2026-05-19'
//   · daily   → '2026-05-23'
// ═══════════════════════════════════════════════════════════════════
const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export type EvalPeriodKind = 'daily' | 'weekly' | 'monthly'

export function evalPeriodKey(
  granularity: 'day' | 'week' | 'month',
  dateStr: string,
): { period_kind: EvalPeriodKind; period_label: string } {
  const parsed = new Date(dateStr + 'T00:00:00')
  const base = isNaN(parsed.getTime()) ? new Date() : parsed
  if (granularity === 'month') {
    return {
      period_kind: 'monthly',
      period_label: `${base.getFullYear()}-${pad(base.getMonth() + 1)}`,
    }
  }
  if (granularity === 'week') {
    const dow = (base.getDay() + 6) % 7 // 0 = 월
    const mon = new Date(base)
    mon.setDate(base.getDate() - dow)
    return { period_kind: 'weekly', period_label: isoOf(mon) }
  }
  return { period_kind: 'daily', period_label: isoOf(base) }
}
