'use client'
// ═══════════════════════════════════════════════════════════════════
// N-17 — KPI 일렬 (운영 인력 5 + 카페24 부하 4)
// 2줄 grid — 1줄당 5 KPI, 2줄차 4 KPI + 1 빈 칸
// ═══════════════════════════════════════════════════════════════════
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

export interface DashboardKpi {
  avg_workdays: number
  max_workdays: { name: string; days: number } | null
  min_workdays: { name: string; days: number } | null
  active_workers: number
  required_workers: number
  night_ratio: number
  load_stddev: number
  fill_rate: number
  accidents_this_month: number | null
  dispatch_this_month: number | null
  orders_this_month: number
  consultations_this_month: number
}

interface Tile {
  label: string
  value: string
  sub: string
  tone: 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'slate'
  alarm?: boolean
}

const TONE: Record<Tile['tone'], { bg: string; border: string; color: string }> = {
  blue:   { bg: COLORS.bgBlue,   border: COLORS.borderBlue,   color: COLORS.info },
  green:  { bg: COLORS.bgGreen,  border: COLORS.borderGreen,  color: COLORS.success },
  amber:  { bg: COLORS.bgAmber,  border: COLORS.borderAmber,  color: COLORS.warning },
  red:    { bg: COLORS.bgRed,    border: COLORS.borderRed,    color: COLORS.danger },
  violet: { bg: COLORS.bgViolet, border: COLORS.borderViolet, color: '#7c3aed' },
  slate:  { bg: COLORS.bgGray,   border: COLORS.borderFaint,  color: COLORS.textSecondary },
}

export default function KpiStrip({ kpi }: { kpi: DashboardKpi }) {
  // 운영 인력 5개
  const opsTiles: Tile[] = [
    {
      label: '인당 근무일',
      value: kpi.avg_workdays > 0 ? `${kpi.avg_workdays}일` : '—',
      sub: kpi.max_workdays && kpi.min_workdays
        ? `최대 ${kpi.max_workdays.name} ${kpi.max_workdays.days}d / 최소 ${kpi.min_workdays.days}d`
        : '이번 달 평균',
      tone: 'blue',
    },
    {
      label: '활성 / 필요',
      value: `${kpi.active_workers} / ${kpi.required_workers}`,
      sub: kpi.required_workers > 0 && kpi.active_workers < kpi.required_workers
        ? `${kpi.required_workers - kpi.active_workers}명 부족`
        : '워커 vs 최소 인원',
      tone: kpi.required_workers > 0 && kpi.active_workers < kpi.required_workers ? 'red' : 'green',
      alarm: kpi.required_workers > 0 && kpi.active_workers < kpi.required_workers,
    },
    {
      label: '야간 근무 비율',
      value: kpi.night_ratio > 0 ? `${Math.round(kpi.night_ratio * 100)}%` : '—',
      sub: '전체 배정 중',
      tone: 'violet',
    },
    {
      label: '부하 편차 (σ)',
      value: kpi.load_stddev > 0 ? `${kpi.load_stddev}` : '—',
      sub: kpi.load_stddev > 3 ? '워커간 불균형 ↑' : '균형 양호',
      tone: kpi.load_stddev > 3 ? 'red' : 'green',
      alarm: kpi.load_stddev > 5,
    },
    {
      label: '충원율',
      value: kpi.fill_rate > 0 ? `${Math.round(kpi.fill_rate * 100)}%` : '—',
      sub: kpi.fill_rate >= 0.9 ? '양호' : kpi.fill_rate >= 0.7 ? '주의' : '미달',
      tone: kpi.fill_rate >= 0.9 ? 'green' : kpi.fill_rate >= 0.7 ? 'amber' : 'red',
    },
  ]
  // 카페24 부하 4개 + 1 (총합)
  const cafe24Total = (kpi.accidents_this_month ?? 0)
    + (kpi.dispatch_this_month ?? 0) + kpi.orders_this_month + kpi.consultations_this_month
  const cafeTiles: Tile[] = [
    {
      label: '사고접수',
      value: kpi.accidents_this_month != null ? `${kpi.accidents_this_month}건` : '—',
      sub: kpi.accidents_this_month != null ? '카페24 aceesosh' : '카페24 연결 안 됨',
      tone: kpi.accidents_this_month != null ? 'red' : 'slate',
    },
    {
      label: '긴급출동',
      value: kpi.dispatch_this_month != null ? `${kpi.dispatch_this_month}건` : '—',
      sub: kpi.dispatch_this_month != null ? '카페24 acrotpth' : '카페24 연결 안 됨',
      tone: kpi.dispatch_this_month != null ? 'amber' : 'slate',
    },
    {
      label: '기타 접수',
      value: `${kpi.orders_this_month}건`,
      sub: 'operations_dispatch_orders',
      tone: 'blue',
    },
    {
      label: '상담등록',
      value: `${kpi.consultations_this_month}건`,
      sub: '추가 업무량',
      tone: 'violet',
    },
    {
      label: '카페24 부하',
      value: `${cafe24Total}건`,
      sub: '이번 달 누적',
      tone: 'slate',
    },
  ]

  return (
    <div style={{ marginBottom: 16 }}>
      <KpiRow tiles={opsTiles} caption="📊 운영 인력 지표" />
      <div style={{ height: 8 }} />
      <KpiRow tiles={cafeTiles} caption="🌐 외부 업무 부하 (카페24 + 자체)" />
    </div>
  )
}

function KpiRow({ tiles, caption }: { tiles: Tile[]; caption: string }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: COLORS.textMuted,
        marginBottom: 6, paddingLeft: 2,
      }}>{caption}</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tiles.length}, 1fr)`,
        gap: 8,
      }}>
        {tiles.map((t, i) => {
          const tint = TONE[t.tone]
          return (
            <div key={i} style={{
              ...GLASS.L3, background: tint.bg,
              border: `1px solid ${tint.border}`,
              borderRadius: 10,
              padding: '10px 12px',
              display: 'flex', flexDirection: 'column', gap: 2,
              position: 'relative',
            }}>
              {t.alarm && (
                <div style={{
                  position: 'absolute', top: 6, right: 8,
                  width: 6, height: 6, borderRadius: '50%',
                  background: COLORS.danger,
                  boxShadow: `0 0 0 3px ${COLORS.bgRed}`,
                }} />
              )}
              <div style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 600 }}>
                {t.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: tint.color, lineHeight: 1.1 }}>
                {t.value}
              </div>
              <div style={{ fontSize: 10, color: COLORS.textMuted, lineHeight: 1.3 }}>
                {t.sub}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
