'use client'

import { AnalysisItem } from './OperationalLearningContext'

// ═══════════════════════════════════════════════════════════════
// AccuracyChart — 카테고리별 정확도 SVG 수평 막대
// Soft Ice Level 3, blue tint border
// ═══════════════════════════════════════════════════════════════

type Props = {
  items: AnalysisItem[]
}

export default function AccuracyChart({ items }: Props) {
  // 각 항목의 정확도(%) = max(0, 100 - |variance_pct|)
  const rows = items.map(i => ({
    category: i.category,
    accuracy: Math.max(0, Math.round(100 - Math.abs(i.variance_pct))),
    variance_pct: i.variance_pct,
    status: i.status,
  }))

  return (
    <section style={{
      background: 'rgba(255,255,255,0.60)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(96,165,250,0.80)',
      borderRadius: 14,
      padding: '14px 18px',
      boxShadow: '4px 4px 12px rgba(59,110,181,0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#1e40af' }}>카테고리별 정확도</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa' }}>(100% - |편차율|)</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
          실적 데이터가 있는 카테고리가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(r => <Bar key={r.category} {...r} />)}
        </div>
      )}
    </section>
  )
}

function Bar({ category, accuracy, variance_pct, status }: {
  category: string
  accuracy: number
  variance_pct: number
  status: 'accurate' | 'underestimate' | 'overestimate'
}) {
  const color =
    accuracy >= 80 ? '#22c55e' :
    accuracy >= 60 ? '#f59e0b' :
    '#ef4444'

  const statusText =
    status === 'accurate'      ? '정확' :
    status === 'underestimate' ? `과소 ${Math.abs(variance_pct)}%` :
                                 `과대 ${Math.abs(variance_pct)}%`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 80px', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{category}</span>
      <svg width="100%" height={16} style={{ display: 'block' }}>
        <rect x="0" y="2" rx="4" ry="4" width="100%" height="12" fill="rgba(0,0,0,0.05)" />
        <rect
          x="0" y="2" rx="4" ry="4"
          width={`${accuracy}%`}
          height="12"
          fill={color}
        />
        <text
          x="8" y="12"
          fill="#fff"
          fontSize="10"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          {accuracy}%
        </text>
      </svg>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textAlign: 'right' }}>{statusText}</span>
    </div>
  )
}
