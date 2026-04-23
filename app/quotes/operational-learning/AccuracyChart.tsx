'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnalysisItem, periodToDateRange, useOL } from './OperationalLearningContext'
import { getAuthHeader } from '@/app/utils/auth-client'

// ═══════════════════════════════════════════════════════════════
// AccuracyChart — 카테고리별 정확도 + 월별 추이 시계열
// Phase 3.2: 탭 토글 (현재 | 추이)
// Soft Ice Level 3, blue tint border
// ═══════════════════════════════════════════════════════════════

type Props = {
  items: AnalysisItem[]
}

// 월별 추이 데이터 타입
type TrendData = {
  months: string[]
  categories: Record<string, number[]>
  overall: number[]
  snapshot_counts: number[]
}

// 카테고리별 색상
const CATEGORY_COLORS: Record<string, string> = {
  '감가상각': '#3b82f6', // blue
  '보험':     '#8b5cf6', // violet
  '정비':     '#f59e0b', // amber
  '세금':     '#10b981', // emerald
  '사고비용': '#ef4444', // red
}
const OVERALL_COLOR = '#0f172a'

export default function AccuracyChart({ items }: Props) {
  const [tab, setTab] = useState<'current' | 'trend'>('current')

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
      {/* 헤더 + 탭 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#1e40af' }}>카테고리별 정확도</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa' }}>
            {tab === 'current' ? '(100% - |편차율|)' : '월별 추이'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: 2 }}>
          <TabBtn active={tab === 'current'} onClick={() => setTab('current')}>현재</TabBtn>
          <TabBtn active={tab === 'trend'} onClick={() => setTab('trend')}>추이</TabBtn>
        </div>
      </div>

      {tab === 'current' ? (
        <CurrentBars items={items} />
      ) : (
        <TrendChart />
      )}
    </section>
  )
}

// ────────────────────────────────────────────────────────────────
// 탭 버튼
// ────────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: 6,
        border: 'none',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        background: active ? 'rgba(255,255,255,0.90)' : 'transparent',
        color: active ? '#1e40af' : '#94a3b8',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────
// 현재 바 차트 (기존 기능)
// ────────────────────────────────────────────────────────────────
function CurrentBars({ items }: { items: AnalysisItem[] }) {
  const rows = items.map(i => ({
    category: i.category,
    accuracy: Math.max(0, Math.round(100 - Math.abs(i.variance_pct))),
    variance_pct: i.variance_pct,
    status: i.status,
  }))

  if (rows.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
        실적 데이터가 있는 카테고리가 없습니다.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(r => <Bar key={r.category} {...r} />)}
    </div>
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

// ────────────────────────────────────────────────────────────────
// 월별 추이 라인 차트
// ────────────────────────────────────────────────────────────────
function TrendChart() {
  const { filter } = useOL()
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null)
  const [visibleCategories, setVisibleCategories] = useState<Record<string, boolean>>({
    '감가상각': true,
    '보험': true,
    '정비': true,
    '세금': true,
    '사고비용': true,
    '전체': true,
  })

  const loadTrend = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const auth = await getAuthHeader()
      const { from, to } = periodToDateRange(filter.period)
      const qs = new URLSearchParams()
      if (from) qs.set('from', from)
      if (to) qs.set('to', to)
      if (filter.vehicleClasses.length === 1) qs.set('vehicle_class', filter.vehicleClasses[0])
      if (filter.contractTypes.length === 1) qs.set('contract_type', filter.contractTypes[0])

      const res = await fetch(`/api/operational-learning/accuracy-trend?${qs.toString()}`, { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '추이 조회 실패')
      setTrend(json.data)
    } catch (e: any) {
      setError(e.message)
      setTrend(null)
    } finally {
      setLoading(false)
    }
  }, [filter.period, filter.vehicleClasses, filter.contractTypes])

  useEffect(() => { loadTrend() }, [loadTrend])

  const toggleCategory = (cat: string) => {
    setVisibleCategories(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  if (loading) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> 추이 데이터 로딩 중...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#ef4444', fontSize: 12 }}>
        ⚠ {error}
      </div>
    )
  }

  if (!trend || trend.months.length === 0) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
        실적 데이터가 있는 기간이 없습니다. 스냅샷에 실적을 입력하면 월별 추이가 표시됩니다.
      </div>
    )
  }

  // ── SVG 라인 차트 렌더링 ──
  const W = 520, H = 200
  const PAD = { top: 20, right: 16, bottom: 36, left: 36 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const n = trend.months.length
  const xStep = n > 1 ? chartW / (n - 1) : chartW

  // Y축: 0~100 고정
  const yScale = (v: number) => PAD.top + chartH - (v / 100) * chartH

  // X좌표
  const xPos = (i: number) => PAD.left + (n > 1 ? i * xStep : chartW / 2)

  // 라인 생성
  const makePath = (values: number[]): string => {
    return values
      .map((v, i) => {
        const x = xPos(i)
        const y = yScale(Math.max(0, v))
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ')
  }

  // Y축 그리드라인
  const yGrids = [0, 20, 40, 60, 80, 100]

  return (
    <div>
      {/* 범례 (클릭 토글) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <LegendChip
            key={cat}
            label={cat}
            color={color}
            active={visibleCategories[cat] !== false}
            onClick={() => toggleCategory(cat)}
          />
        ))}
        <LegendChip
          label="전체"
          color={OVERALL_COLOR}
          active={visibleCategories['전체'] !== false}
          onClick={() => toggleCategory('전체')}
          dashed
        />
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', maxHeight: 220 }}
        onMouseLeave={() => setHoveredMonth(null)}
      >
        {/* 배경 */}
        <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} fill="rgba(0,0,0,0.02)" rx="4" />

        {/* Y축 그리드 */}
        {yGrids.map(v => (
          <g key={v}>
            <line
              x1={PAD.left} y1={yScale(v)} x2={PAD.left + chartW} y2={yScale(v)}
              stroke="rgba(0,0,0,0.06)" strokeWidth="1"
            />
            <text
              x={PAD.left - 4} y={yScale(v) + 3}
              textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="system-ui"
            >
              {v}%
            </text>
          </g>
        ))}

        {/* 80% 기준선 (녹색) */}
        <line
          x1={PAD.left} y1={yScale(80)} x2={PAD.left + chartW} y2={yScale(80)}
          stroke="rgba(34,197,94,0.3)" strokeWidth="1.5" strokeDasharray="4 3"
        />

        {/* 카테고리 라인 */}
        {Object.entries(trend.categories).map(([cat, values]) => {
          if (visibleCategories[cat] === false) return null
          const color = CATEGORY_COLORS[cat] || '#64748b'
          // -1 값(데이터 없음)은 건너뛰기
          const validValues = values.map(v => (v < 0 ? NaN : v))
          // 연속된 유효구간만 라인 그리기
          const segments = getSegments(validValues)
          return segments.map((seg, si) => (
            <polyline
              key={`${cat}-${si}`}
              points={seg.map(({ idx, val }) => `${xPos(idx)},${yScale(val)}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
            />
          ))
        })}

        {/* 전체 평균 라인 (대시) */}
        {visibleCategories['전체'] !== false && (
          <polyline
            points={trend.overall.map((v, i) => `${xPos(i)},${yScale(v)}`).join(' ')}
            fill="none"
            stroke={OVERALL_COLOR}
            strokeWidth="2.5"
            strokeDasharray="6 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.7"
          />
        )}

        {/* 데이터 포인트 도트 */}
        {Object.entries(trend.categories).map(([cat, values]) => {
          if (visibleCategories[cat] === false) return null
          const color = CATEGORY_COLORS[cat] || '#64748b'
          return values.map((v, i) => {
            if (v < 0) return null
            return (
              <circle
                key={`${cat}-dot-${i}`}
                cx={xPos(i)} cy={yScale(v)} r="3"
                fill={color} stroke="#fff" strokeWidth="1.5"
              />
            )
          })
        })}

        {/* 전체 도트 */}
        {visibleCategories['전체'] !== false && trend.overall.map((v, i) => (
          <circle
            key={`overall-dot-${i}`}
            cx={xPos(i)} cy={yScale(v)} r="3.5"
            fill={OVERALL_COLOR} stroke="#fff" strokeWidth="1.5"
          />
        ))}

        {/* X축 월 라벨 */}
        {trend.months.map((m, i) => {
          // 너무 많으면 건너뛰기
          const showEvery = n > 12 ? 3 : n > 6 ? 2 : 1
          if (i % showEvery !== 0 && i !== n - 1) return null
          const label = m.length >= 7 ? m.slice(2) : m // "2026-01" → "26-01"
          return (
            <text
              key={m}
              x={xPos(i)} y={H - 6}
              textAnchor="middle" fontSize="9" fill="#64748b" fontFamily="system-ui"
            >
              {label}
            </text>
          )
        })}

        {/* 호버 인터랙션 영역 */}
        {trend.months.map((_, i) => (
          <rect
            key={`hover-${i}`}
            x={xPos(i) - (n > 1 ? xStep / 2 : 20)}
            y={PAD.top}
            width={n > 1 ? xStep : 40}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => setHoveredMonth(i)}
          />
        ))}

        {/* 호버 툴팁 */}
        {hoveredMonth !== null && (
          <HoverTooltip
            trend={trend}
            idx={hoveredMonth}
            x={xPos(hoveredMonth)}
            yScale={yScale}
            chartW={chartW}
            padLeft={PAD.left}
          />
        )}
      </svg>

      {/* 하단 스냅샷 수 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6 }}>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>
          총 {trend.months.length}개월 · 스냅샷 {trend.snapshot_counts.reduce((a, b) => a + b, 0)}건
        </span>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 호버 툴팁 (SVG 내부)
// ────────────────────────────────────────────────────────────────
function HoverTooltip({ trend, idx, x, yScale, chartW, padLeft }: {
  trend: TrendData
  idx: number
  x: number
  yScale: (v: number) => number
  chartW: number
  padLeft: number
}) {
  const month = trend.months[idx]
  const lines: { label: string; value: number; color: string }[] = []

  for (const [cat, values] of Object.entries(trend.categories)) {
    const v = values[idx]
    if (v >= 0) lines.push({ label: cat, value: v, color: CATEGORY_COLORS[cat] || '#64748b' })
  }
  lines.push({ label: '전체', value: trend.overall[idx], color: OVERALL_COLOR })

  const tipW = 110
  const tipH = 14 + lines.length * 14 + 18
  // 좌우 경계 확인
  let tipX = x + 8
  if (tipX + tipW > padLeft + chartW) tipX = x - tipW - 8

  const tipY = yScale(trend.overall[idx]) - tipH / 2

  return (
    <g>
      {/* 세로 가이드라인 */}
      <line x1={x} y1={yScale(100)} x2={x} y2={yScale(0)} stroke="rgba(0,0,0,0.12)" strokeWidth="1" strokeDasharray="3 2" />

      {/* 배경 */}
      <rect
        x={tipX} y={Math.max(4, tipY)}
        width={tipW} height={tipH}
        rx="6" fill="rgba(255,255,255,0.95)"
        stroke="rgba(0,0,0,0.08)" strokeWidth="1"
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
      />

      {/* 월 제목 */}
      <text x={tipX + 8} y={Math.max(4, tipY) + 14} fontSize="10" fontWeight="800" fill="#0f172a" fontFamily="system-ui">
        {month}
      </text>

      {/* 항목들 */}
      {lines.map((l, i) => (
        <g key={l.label}>
          <circle cx={tipX + 12} cy={Math.max(4, tipY) + 24 + i * 14} r="3" fill={l.color} />
          <text
            x={tipX + 20} y={Math.max(4, tipY) + 28 + i * 14}
            fontSize="9" fill="#334155" fontFamily="system-ui"
          >
            {l.label}
          </text>
          <text
            x={tipX + tipW - 8} y={Math.max(4, tipY) + 28 + i * 14}
            fontSize="9" fontWeight="700" fill={l.value >= 80 ? '#22c55e' : l.value >= 60 ? '#f59e0b' : '#ef4444'}
            textAnchor="end" fontFamily="system-ui"
          >
            {l.value}%
          </text>
        </g>
      ))}

      {/* 스냅샷 수 */}
      <text
        x={tipX + 8} y={Math.max(4, tipY) + tipH - 4}
        fontSize="8" fill="#94a3b8" fontFamily="system-ui"
      >
        스냅샷 {trend.snapshot_counts[idx]}건
      </text>
    </g>
  )
}

// ────────────────────────────────────────────────────────────────
// 범례 칩
// ────────────────────────────────────────────────────────────────
function LegendChip({ label, color, active, onClick, dashed }: {
  label: string; color: string; active: boolean; onClick: () => void; dashed?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 6,
        border: `1px solid ${active ? color : 'rgba(0,0,0,0.08)'}`,
        background: active ? `${color}10` : 'transparent',
        cursor: 'pointer', fontSize: 10, fontWeight: 600,
        color: active ? color : '#94a3b8',
        opacity: active ? 1 : 0.5,
        transition: 'all 0.15s',
      }}
    >
      <span style={{
        width: 12, height: 2,
        background: active ? color : '#ccc',
        borderTop: dashed ? `2px dashed ${active ? color : '#ccc'}` : 'none',
        display: 'inline-block',
      }} />
      {label}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────
// 유효 구간 분리 (NaN 건너뛰기)
// ────────────────────────────────────────────────────────────────
function getSegments(values: number[]): { idx: number; val: number }[][] {
  const segments: { idx: number; val: number }[][] = []
  let current: { idx: number; val: number }[] = []

  for (let i = 0; i < values.length; i++) {
    if (!isNaN(values[i])) {
      current.push({ idx: i, val: values[i] })
    } else {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
    }
  }
  if (current.length > 0) segments.push(current)
  return segments
}
