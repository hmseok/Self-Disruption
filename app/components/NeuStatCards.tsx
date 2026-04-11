'use client'
import { useState } from 'react'

// ═══════════════════════════════════════════════════════════════
// NeuStatCards — 뉴모피즘 스탯 카드 그리드
// 모든 리스트 페이지 상단 KPI 영역 통일 컴포넌트
// ═══════════════════════════════════════════════════════════════

// ── 색상 프리셋 ──
const TINT: Record<string, {
  border: string; bg: string; labelColor: string; valueColor: string; shadow: string
}> = {
  blue:   { border: 'rgba(59,130,246,0.15)', bg: '#dbeafe', labelColor: '#3b6eb5', valueColor: '#1e3a5f', shadow: 'rgba(59,130,246,0.08)' },
  green:  { border: 'rgba(34,197,94,0.15)',  bg: '#d1fae5', labelColor: '#16a34a', valueColor: '#166534', shadow: 'rgba(34,197,94,0.08)' },
  red:    { border: 'rgba(239,68,68,0.15)',  bg: '#fee2e2', labelColor: '#dc2626', valueColor: '#991b1b', shadow: 'rgba(239,68,68,0.08)' },
  amber:  { border: 'rgba(245,158,11,0.15)', bg: '#fef3c7', labelColor: '#d97706', valueColor: '#92400e', shadow: 'rgba(245,158,11,0.08)' },
  purple: { border: 'rgba(139,92,246,0.15)', bg: '#ede9fe', labelColor: '#7c3aed', valueColor: '#5b21b6', shadow: 'rgba(139,92,246,0.08)' },
  slate:  { border: 'rgba(100,116,139,0.12)', bg: '#f1f5f9', labelColor: '#64748b', valueColor: '#1e293b', shadow: 'rgba(100,116,139,0.06)' },
}

export interface StatCardItem {
  key: string
  label: string
  value: number | string
  /** 숫자 포맷팅 여부 (기본 true) */
  format?: boolean
  /** 값 뒤에 붙는 단위 (대, 건, 원 등) */
  unit?: string
  /** 카드 아래 보조 텍스트 */
  subtitle?: string
  /** 아이콘 (이모지 또는 React 노드) */
  icon?: React.ReactNode
  /** 색상 키: blue | green | red | amber | purple | slate */
  color?: string
}

interface NeuStatCardsProps {
  items: StatCardItem[]
  /** 현재 선택된 필터 키 */
  activeKey?: string | null
  /** 카드 클릭 시 필터 변경 */
  onSelect?: (key: string) => void
  /** 그리드 컬럼 수 (기본 sm:5) */
  columns?: 3 | 4 | 5 | 6
}

export default function NeuStatCards({ items, activeKey, onSelect, columns = 5 }: NeuStatCardsProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const colClass: Record<number, string> = {
    3: 'grid-cols-2 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  }

  const formatValue = (val: number | string, fmt?: boolean): string => {
    if (fmt === false) return String(val)
    if (typeof val === 'number') return val.toLocaleString()
    const num = Number(val)
    return isNaN(num) ? String(val) : num.toLocaleString()
  }

  return (
    <div className={`grid ${colClass[columns] || colClass[5]} gap-3 mb-4`}>
      {items.map(item => {
        const tint = TINT[item.color || 'slate'] || TINT.slate
        const isActive = activeKey === item.key
        const isHovered = hoveredKey === item.key
        const isClickable = !!onSelect

        return (
          <div
            key={item.key}
            onClick={() => onSelect?.(item.key)}
            onMouseEnter={() => setHoveredKey(item.key)}
            onMouseLeave={() => setHoveredKey(null)}
            style={{
              background: 'rgba(255,255,255,0.72)',
              border: `1.5px solid ${isActive ? tint.border : 'rgba(255,255,255,0.30)'}`,
              borderRadius: 14,
              padding: '14px 16px',
              textAlign: 'center',
              cursor: isClickable ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              transform: isHovered && isClickable ? 'translateY(-2px)' : 'none',
              boxShadow: isActive
                ? `6px 6px 16px ${tint.shadow}, -4px -4px 12px rgba(255,255,255,0.47), inset 0 0 0 1px ${tint.border}`
                : isHovered && isClickable
                  ? '6px 6px 16px rgba(140,170,210,0.22), -4px -4px 12px rgba(255,255,255,0.5)'
                  : '4px 4px 12px rgba(140,170,210,0.14), -4px -4px 12px rgba(255,255,255,0.47)',
            }}
          >
            {/* 아이콘 */}
            {item.icon && (
              <div style={{ fontSize: 16, marginBottom: 4, lineHeight: 1 }}>
                {item.icon}
              </div>
            )}
            {/* 라벨 */}
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              color: isActive ? tint.labelColor : '#64748b',
              marginBottom: 4,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}>
              {item.label}
            </div>
            {/* 값 */}
            <div style={{
              fontSize: 22,
              fontWeight: 900,
              color: isActive ? tint.valueColor : '#0f2440',
              lineHeight: 1.1,
            }}>
              {formatValue(item.value, item.format)}
              {item.unit && (
                <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginLeft: 2 }}>
                  {item.unit}
                </span>
              )}
            </div>
            {/* 서브텍스트 */}
            {item.subtitle && (
              <div style={{ fontSize: 10, color: '#8aabc7', marginTop: 4 }}>
                {item.subtitle}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
