'use client'

import { ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════════════
// DarkHeader — Light Glass Morphism 헤더 컴포넌트
// A-패턴 통합: KPI 스탯 카드 → 액션 바 → 커스텀 영역
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
    background: '#2d5fa8', color: '#fff', border: 'none',
  },
  secondary: {
    background: 'rgba(255,255,255,0.70)', color: '#334155',
    border: '1px solid rgba(0,0,0,0.08)',
  },
  danger: {
    background: 'rgba(239,68,68,0.08)', color: '#dc2626',
    border: '1px solid rgba(239,68,68,0.20)',
  },
}

// ── 라이트 글래스 stat 색상 프리셋 ──
export const STAT_COLORS = {
  white: { color: '#334155', bgColor: 'rgba(255,255,255,0.60)', borderColor: 'rgba(0,0,0,0.06)', labelColor: '#94a3b8' },
  green: { color: '#059669', bgColor: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.20)', labelColor: '#6ee7b7' },
  yellow: { color: '#d97706', bgColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.20)', labelColor: '#fcd34d' },
  red: { color: '#dc2626', bgColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.20)', labelColor: '#fca5a5' },
  blue: { color: '#2563eb', bgColor: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.20)', labelColor: '#93c5fd' },
  purple: { color: '#7c3aed', bgColor: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.20)', labelColor: '#c4b5fd' },
}

export default function DarkHeader({ icon, title, subtitle, stats, actions, children }: DarkHeaderProps) {
  const hasContent = (stats && stats.length > 0) || (actions && actions.length > 0) || children
  if (!hasContent) return null

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
      {/* ── 통계/액션 바 ── */}
      {((stats && stats.length > 0) || (actions && actions.length > 0)) && (
        <div style={{
          background: 'rgba(255,255,255,0.75)',
          backdropFilter: 'blur(20px)',
          padding: '14px 20px',
          borderBottom: children ? 'none' : undefined,
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: children ? '16px 16px 0 0' : 16,
        }}>
          {/* 액션 버튼 */}
          {actions && actions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: stats && stats.length > 0 ? 10 : 0 }}>
              {actions.map((a, i) => (
                <button key={i} onClick={a.onClick} disabled={a.disabled}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12,
                    cursor: a.disabled ? 'not-allowed' : 'pointer',
                    opacity: a.disabled ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 4,
                    transition: 'all 0.15s',
                    ...(actionStyles[a.variant || 'secondary']),
                  }}>
                  {a.icon && <span>{a.icon}</span>}
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {/* 통계 뱃지 */}
          {stats && stats.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              {stats.map((s, i) => (
                <div key={i} onClick={s.onClick}
                  style={{
                    flex: 1,
                    background: s.bgColor,
                    borderRadius: 10,
                    padding: '10px 12px',
                    border: `1px solid ${s.borderColor}`,
                    textAlign: 'center',
                    cursor: s.onClick ? 'pointer' : 'default',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    minWidth: 0,
                  }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: s.labelColor || '#94a3b8', marginBottom: 3, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: s.color, lineHeight: 1 }}>{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 하단 커스텀 영역 ── */}
      {children && (
        <div style={{
          background: 'rgba(255,255,255,0.65)',
          backdropFilter: 'blur(16px)',
          borderLeft: '1px solid rgba(0,0,0,0.06)',
          borderRight: '1px solid rgba(0,0,0,0.06)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          borderRadius: '0 0 16px 16px',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// DarkHeaderTabs — 탭 (헤더 아래)
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
      background: '#2d5fa8',
      padding: '0 20px',
      display: 'flex',
      alignItems: 'flex-end',
    }}>
      <div style={{ display: 'flex', gap: 2, paddingTop: 6 }}>
        {tabs.map(tab => {
          const active = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => onTabChange(tab.key)}
              style={{
                padding: '8px 16px', border: 'none', cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                background: active ? '#f1f5f9' : 'transparent',
                fontSize: 12, fontWeight: active ? 800 : 600,
                color: active ? '#1e293b' : 'rgba(255,255,255,0.7)',
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'all 0.15s',
              }}>
              {tab.icon && <span>{tab.icon}</span>}
              {tab.label}
              {tab.count !== undefined && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: active ? '#2d5fa8' : 'rgba(255,255,255,0.5)',
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6, paddingRight: 4 }}>
          {rightContent}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// DarkHeaderFilterBar — 필터 칩 바
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
      borderBottom: '1px solid rgba(0,0,0,0.06)',
      background: 'rgba(255,255,255,0.60)',
    }}>
      {filters.map(f => {
        const active = activeFilter === f.key
        return (
          <button key={f.key} onClick={() => onFilterChange(f.key)}
            style={{
              padding: '5px 12px', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: 'pointer',
              background: active ? 'rgba(45,95,168,0.08)' : 'rgba(241,245,249,0.80)',
              color: active ? '#2d5fa8' : '#64748b',
              border: active ? '1px solid rgba(45,95,168,0.20)' : '1px solid rgba(0,0,0,0.06)',
              transition: 'all 0.15s',
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
// DarkHeaderSummaryBar — 하단 요약 바
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
      background: '#2d5fa8',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      borderRadius: '0 0 16px 16px',
    }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {i > 0 && <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.25)', display: 'inline-block' }} />}
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
            {item.label} <strong style={{ color: item.color || '#fff', fontSize: 14, fontWeight: 900 }}>
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
                padding: '6px 12px', borderRadius: 7, fontSize: 11,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                ...(a.variant === 'primary'
                  ? { background: '#fff', color: '#2d5fa8', border: 'none', fontWeight: 800 }
                  : { background: 'rgba(255,255,255,0.12)', color: '#e0ecf8', border: '1px solid rgba(255,255,255,0.2)' }
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
