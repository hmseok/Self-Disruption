'use client'

import { ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════════════
// DarkHeader — Neumorphism (Style E) 헤더 컴포넌트
// 인터페이스 100% 호환 — 기존 사용처 변경 불필요
// ═══════════════════════════════════════════════════════════════════════

export interface DarkHeaderStat {
  label: string
  value: number | string
  color: string
  bgColor: string
  borderColor: string
  labelColor?: string
  onClick?: () => void
}

export interface DarkHeaderAction {
  label: string
  icon?: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
}

export interface DarkHeaderProps {
  icon: string
  title: string
  subtitle?: string
  stats?: DarkHeaderStat[]
  actions?: DarkHeaderAction[]
  children?: ReactNode
}

const actionStyles: Record<string, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)',
    color: '#fff',
    border: 'none',
    boxShadow: '3px 3px 8px rgba(140,170,210,0.19), -1px -1px 4px rgba(255,255,255,0.47)',
  },
  secondary: {
    background: 'rgba(255,255,255,0.60)',
    color: '#3b6eb5',
    border: '1px solid rgba(255,255,255,0.30)',
    boxShadow: '2px 2px 6px rgba(140,170,210,0.19), -2px -2px 6px rgba(255,255,255,0.47)',
  },
  danger: {
    background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    color: '#fff',
    border: 'none',
    boxShadow: '2px 2px 6px rgba(220,38,38,0.15)',
  },
}

// ── 뉴모피즘 stat 색상 프리셋 (클래식 팔레트) ──
export const STAT_COLORS = {
  white: { color: '#1e293b', bgColor: 'rgba(255,255,255,0.60)', borderColor: 'rgba(255,255,255,0.30)', labelColor: '#64748b' },
  green: { color: '#166534', bgColor: '#d1fae5', borderColor: 'rgba(34,197,94,0.15)', labelColor: '#16a34a' },
  yellow: { color: '#92400e', bgColor: '#fef3c7', borderColor: 'rgba(245,158,11,0.15)', labelColor: '#d97706' },
  red: { color: '#991b1b', bgColor: '#fee2e2', borderColor: 'rgba(239,68,68,0.15)', labelColor: '#dc2626' },
  blue: { color: '#1e40af', bgColor: '#dbeafe', borderColor: 'rgba(59,130,246,0.15)', labelColor: '#3b82f6' },
  purple: { color: '#5b21b6', bgColor: '#ede9fe', borderColor: 'rgba(139,92,246,0.15)', labelColor: '#8b5cf6' },
}

export default function DarkHeader({ icon, title, subtitle, stats, actions, children }: DarkHeaderProps) {
  const hasContent = (stats && stats.length > 0) || (actions && actions.length > 0) || children
  if (!hasContent) return null

  return (
    <div style={{
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 16,
      boxShadow: '8px 8px 20px rgba(140,170,210,0.19), -8px -8px 20px rgba(255,255,255,0.47)',
    }}>
      {/* ── 통계/액션 바 ── */}
      {((stats && stats.length > 0) || (actions && actions.length > 0)) && (
        <div style={{
          background: 'rgba(255,255,255,0.72)',
          padding: '14px 20px',
          borderBottom: children ? 'none' : undefined,
          border: '1px solid rgba(255,255,255,0.30)',
          borderRadius: children ? '16px 16px 0 0' : 16,
        }}>
          {/* 액션 버튼 */}
          {actions && actions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: stats && stats.length > 0 ? 10 : 0 }}>
              {actions.map((a, i) => (
                <button key={i} onClick={a.onClick} disabled={a.disabled}
                  style={{
                    padding: '7px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12,
                    cursor: a.disabled ? 'not-allowed' : 'pointer',
                    opacity: a.disabled ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 4,
                    transition: 'all 0.2s',
                    ...(actionStyles[a.variant || 'secondary']),
                  }}>
                  {a.icon && <span>{a.icon}</span>}
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {/* 통계 카드 */}
          {stats && stats.length > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
              {stats.map((s, i) => (
                <div key={i} onClick={s.onClick}
                  style={{
                    flex: 1,
                    background: s.bgColor,
                    borderRadius: 12,
                    padding: '12px 14px',
                    border: `1px solid ${s.borderColor}`,
                    textAlign: 'center',
                    cursor: s.onClick ? 'pointer' : 'default',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    boxShadow: '4px 4px 12px rgba(140,170,210,0.19), -4px -4px 12px rgba(255,255,255,0.47)',
                    minWidth: 0,
                  }}
                  onMouseEnter={e => {
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
                    ;(e.currentTarget as HTMLDivElement).style.boxShadow = '6px 6px 16px rgba(140,170,210,0.25), -6px -6px 16px rgba(255,255,255,0.55)'
                  }}
                  onMouseLeave={e => {
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'none'
                    ;(e.currentTarget as HTMLDivElement).style.boxShadow = '4px 4px 12px rgba(140,170,210,0.19), -4px -4px 12px rgba(255,255,255,0.47)'
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 600, color: s.labelColor || '#64748b', marginBottom: 4, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 하단 커스텀 영역 ── */}
      {children && (
        <div style={{
          background: 'rgba(255,255,255,0.60)',
          borderLeft: '1px solid rgba(255,255,255,0.30)',
          borderRight: '1px solid rgba(255,255,255,0.30)',
          borderBottom: '1px solid rgba(255,255,255,0.30)',
          borderRadius: '0 0 16px 16px',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// DarkHeaderTabs — 뉴모피즘 탭 (필 스타일)
// ═══════════════════════════════════════════════════════════════════════

export interface TabItem {
  key: string
  label: string
  icon?: string
  count?: number
}

export function DarkHeaderTabs({ tabs, activeTab, onTabChange, rightContent }: {
  tabs: TabItem[]
  activeTab: string
  onTabChange: (key: string) => void
  rightContent?: ReactNode
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.40)',
      padding: '8px 20px',
      display: 'flex',
      alignItems: 'center',
      boxShadow: 'inset 2px 2px 6px rgba(140,170,210,0.12), inset -2px -2px 6px rgba(255,255,255,0.35)',
    }}>
      <div style={{ display: 'flex', gap: 4, paddingTop: 0 }}>
        {tabs.map(tab => {
          const active = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => onTabChange(tab.key)}
              style={{
                padding: '8px 16px', border: 'none', cursor: 'pointer',
                borderRadius: 10,
                background: active
                  ? 'linear-gradient(135deg, #3b6eb5, #5a8fd4)'
                  : 'transparent',
                fontSize: 12, fontWeight: active ? 700 : 600,
                color: active ? '#fff' : '#64748b',
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'all 0.2s',
                boxShadow: active ? '3px 3px 8px rgba(140,170,210,0.19)' : 'none',
              }}>
              {tab.icon && <span>{tab.icon}</span>}
              {tab.label}
              {tab.count !== undefined && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: active ? 'rgba(255,255,255,0.8)' : '#8aabc7',
                  marginLeft: 2,
                }}>
                  ({tab.count})
                </span>
              )}
            </button>
          )
        })}
      </div>
      {rightContent && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {rightContent}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// DarkHeaderFilterBar — 뉴모피즘 필터 칩 바
// ═══════════════════════════════════════════════════════════════════════

export interface FilterItem {
  key: string
  label: string
  count?: number
  color?: string
}

export function DarkHeaderFilterBar({ filters, activeFilter, onFilterChange, rightContent }: {
  filters: FilterItem[]
  activeFilter: string
  onFilterChange: (key: string) => void
  rightContent?: ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '8px 20px', gap: 6,
      borderBottom: '1px solid rgba(0,0,0,0.03)',
      background: 'rgba(255,255,255,0.50)',
    }}>
      {filters.map(f => {
        const active = activeFilter === f.key
        return (
          <button key={f.key} onClick={() => onFilterChange(f.key)}
            style={{
              padding: '5px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: 'pointer',
              background: active ? 'linear-gradient(135deg, #3b6eb5, #5a8fd4)' : 'rgba(255,255,255,0.50)',
              color: active ? '#fff' : '#64748b',
              border: active ? 'none' : '1px solid rgba(255,255,255,0.30)',
              boxShadow: active
                ? '2px 2px 6px rgba(140,170,210,0.19)'
                : '2px 2px 6px rgba(140,170,210,0.12), -2px -2px 6px rgba(255,255,255,0.30)',
              transition: 'all 0.2s',
            }}>
            {f.label}{f.count !== undefined ? ` ${f.count}` : ''}
          </button>
        )
      })}
      {rightContent && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {rightContent}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// DarkHeaderSummaryBar — 뉴모피즘 하단 요약 바
// ═══════════════════════════════════════════════════════════════════════

export interface SummaryItem {
  label: string
  value: string | number
  color?: string
}

export interface SummaryAction {
  label: string
  icon?: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

export function DarkHeaderSummaryBar({ items, actions }: {
  items: SummaryItem[]
  actions?: SummaryAction[]
}) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      borderRadius: '0 0 16px 16px',
      boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.15)',
    }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {i > 0 && <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.25)', display: 'inline-block' }} />}
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
            {item.label} <strong style={{ color: item.color || '#fff', fontSize: 14, fontWeight: 800 }}>
              {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
            </strong>
          </span>
        </div>
      ))}
      {actions && actions.length > 0 && (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {actions.map((a, i) => (
            <button key={i} onClick={a.onClick}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 11,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                ...(a.variant === 'primary'
                  ? {
                      background: 'rgba(255,255,255,0.95)', color: '#3b6eb5', border: 'none', fontWeight: 800,
                      boxShadow: '2px 2px 6px rgba(0,0,0,0.1)',
                    }
                  : {
                      background: 'rgba(255,255,255,0.12)', color: '#e0ecf8',
                      border: '1px solid rgba(255,255,255,0.2)',
                    }
                ),
              }}>
              {a.icon && <span>{a.icon}</span>}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
