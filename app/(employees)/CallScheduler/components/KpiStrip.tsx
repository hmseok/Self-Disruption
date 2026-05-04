'use client'
// ═══════════════════════════════════════════════════════════════════
// KPI Strip — 4 타일 (충원율 / 평균시간 / 반차·F / 미배정)
// GLASS L3 + 색상 틴트 (CLAUDE.md §10)
// ═══════════════════════════════════════════════════════════════════
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import type { ScheduleKpi } from '../utils/types'

interface Props { kpi: ScheduleKpi }

export default function KpiStrip({ kpi }: Props) {
  const fillPct = Math.round(kpi.fill_rate * 1000) / 10

  // 균형도 경보 — 평균 ±20% 벗어난 워커 카운트
  const avg = kpi.avg_hours_per_worker
  const activeWorkers = kpi.workers.filter(w => w.shift_count > 0)
  const overWorkers = activeWorkers.filter(w => avg > 0 && (w.total_hours - avg) / avg > 0.2)
  const underWorkers = activeWorkers.filter(w => avg > 0 && (w.total_hours - avg) / avg < -0.2)
  const alertCount = overWorkers.length + underWorkers.length

  const balanceTint: 'green' | 'amber' | 'red' =
    alertCount === 0 ? 'green'
    : alertCount <= 2 ? 'amber'
    : 'red'

  const tiles = [
    {
      label: '충원율',
      value: `${fillPct}%`,
      sub: `${kpi.filled_assignments} / ${kpi.total_assignments}`,
      tint: 'blue' as const,
    },
    {
      label: '인당 평균시간',
      value: `${kpi.avg_hours_per_worker}h`,
      sub: `근무자 ${kpi.worker_count}명`,
      tint: 'green' as const,
    },
    {
      label: '반차 · F',
      value: `${kpi.half_count + kpi.free_count}`,
      sub: `반차 ${kpi.half_count} · F ${kpi.free_count}`,
      tint: 'amber' as const,
    },
    {
      label: '미배정',
      value: `${kpi.unfilled_slots}`,
      sub: `휴무 ${kpi.off_count}`,
      tint: kpi.unfilled_slots > 0 ? 'red' as const : 'gray' as const,
    },
    {
      label: '균형도',
      value: alertCount === 0 ? '양호' : `⚠ ${alertCount}`,
      sub: alertCount === 0
        ? '모두 평균 ±20% 이내'
        : `과로 ${overWorkers.length} · 부족 ${underWorkers.length}`,
      tint: balanceTint,
    },
  ]

  const tintMap = {
    blue:   { bg: COLORS.bgBlue,   border: COLORS.borderBlue,   color: COLORS.info },
    green:  { bg: COLORS.bgGreen,  border: COLORS.borderGreen,  color: COLORS.success },
    amber:  { bg: COLORS.bgAmber,  border: COLORS.borderAmber,  color: COLORS.warning },
    red:    { bg: COLORS.bgRed,    border: COLORS.borderRed,    color: COLORS.danger },
    gray:   { bg: COLORS.bgGray,   border: COLORS.borderFaint,  color: COLORS.textMuted },
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
      {tiles.map(t => {
        const tint = tintMap[t.tint]
        return (
          <div key={t.label} style={{
            ...GLASS.L3,
            background: tint.bg,
            border: `1px solid ${tint.border}`,
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>{t.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: tint.color, lineHeight: 1.1 }}>{t.value}</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>{t.sub}</div>
          </div>
        )
      })}
    </div>
  )
}
