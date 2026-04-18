'use client'

import { useMemo } from 'react'
import { useOL } from './OperationalLearningContext'

// ═══════════════════════════════════════════════════════════════
// KpiStrip — 상단 KPI 4카드 (Soft Ice Level 3, 틴트 보더)
// 스냅샷수 / 평균정확도 / 추천대기 / 적용완료
// ═══════════════════════════════════════════════════════════════

export default function KpiStrip({
  appliedCount,
}: {
  appliedCount: number
}) {
  const { snapshots, suggestions, analysis } = useOL()

  const avgAccuracy = useMemo(() => {
    // snapshot.accuracy가 있으면 그 평균, 없으면 선택된 분석의 overall_accuracy만 활용
    const withAcc = snapshots.filter(s => typeof s.accuracy === 'number')
    if (withAcc.length > 0) {
      const sum = withAcc.reduce((a, b) => a + (b.accuracy as number), 0)
      return Math.round(sum / withAcc.length)
    }
    return analysis?.analysis?.overall_accuracy ?? null
  }, [snapshots, analysis])

  const pending = suggestions.length

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12,
      marginBottom: 16,
    }}>
      <KpiCard
        title="스냅샷"
        value={`${snapshots.length}`}
        unit="건"
        tint="blue"
      />
      <KpiCard
        title="평균 정확도"
        value={avgAccuracy === null ? '-' : `${avgAccuracy}`}
        unit={avgAccuracy === null ? '' : '%'}
        tint="green"
      />
      <KpiCard
        title="추천 대기"
        value={`${pending}`}
        unit="건"
        tint="amber"
      />
      <KpiCard
        title="적용 완료"
        value={`${appliedCount}`}
        unit="건"
        tint="purple"
      />
    </div>
  )
}

type Tint = 'blue' | 'green' | 'amber' | 'purple'

const TINTS: Record<Tint, { border: string; title: string; value: string; dot: string }> = {
  blue:   { border: 'rgba(96,165,250,0.80)',  title: '#1e40af', value: '#1e3a8a', dot: '#3b82f6' },
  green:  { border: 'rgba(134,239,172,0.80)', title: '#15803d', value: '#14532d', dot: '#22c55e' },
  amber:  { border: 'rgba(253,230,138,0.80)', title: '#b45309', value: '#78350f', dot: '#f59e0b' },
  purple: { border: 'rgba(221,214,254,0.80)', title: '#6d28d9', value: '#4c1d95', dot: '#8b5cf6' },
}

function KpiCard({ title, value, unit, tint }: { title: string; value: string; unit: string; tint: Tint }) {
  const c = TINTS[tint]
  return (
    <div style={{
      // Soft Ice Level 3
      background: 'rgba(255,255,255,0.60)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: `1px solid ${c.border}`,
      borderRadius: 14,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      boxShadow: '4px 4px 12px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.5)',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot }} />
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: c.title,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {title}
        </div>
      </div>
      <div style={{
        fontSize: 26,
        fontWeight: 800,
        color: c.value,
        lineHeight: 1.1,
        display: 'flex',
        alignItems: 'baseline',
        gap: 4,
      }}>
        {value}
        {unit && <span style={{ fontSize: 13, fontWeight: 600, color: c.title, opacity: 0.7 }}>{unit}</span>}
      </div>
    </div>
  )
}
