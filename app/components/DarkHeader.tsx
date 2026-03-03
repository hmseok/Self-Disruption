'use client'

import { ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════════════
// DarkHeader — 전체 페이지 공통 헤더 컴포넌트
// 디자인: 라이트 프리미엄 (글래스 헤더 + 다크 연결 탭 + 다크 요약 바)
// 메인 컬러: #2d5fa8 (steel blue)
// ═══════════════════════════════════════════════════════════════════════

export interface DarkHeaderStat {
  label: string
  value: number | string
  color: string        // 값 텍스트 색상
  bgColor: string      // 뱃지 배경
  borderColor: string  // 뱃지 테두리
  labelColor?: string  // 라벨 색상
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
    background: '#fff', color: '#334155',
    border: '1px solid #d1d5db',
  },
  danger: {
    background: '#fef2f2', color: '#dc2626',
    border: '1px solid #fecaca',
  },
}

// ── 라이트 프리미엄 stat 색상 프리셋 ──
// 페이지에서 사용할 표준 색상
export const STAT_COLORS = {
  white: { color: '#334155', bgColor: '#fff', borderColor: '#e2e8f0', labelColor: '#94a3b8' },
  green: { color: '#059669', bgColor: '#ecfdf5', borderColor: '#bbf7d0', labelColor: '#6ee7b7' },
  yellow: { color: '#d97706', bgColor: '#fffbeb', borderColor: '#fde68a', labelColor: '#fcd34d' },
  red: { color: '#dc2626', bgColor: '#fef2f2', borderColor: '#fecaca', labelColor: '#fca5a5' },
  blue: { color: '#2563eb', bgColor: '#eff6ff', borderColor: '#bfdbfe', labelColor: '#93c5fd' },
  purple: { color: '#7c3aed', bgColor: '#f5f3ff', borderColor: '#ddd6fe', labelColor: '#c4b5fd' },
}

export default function DarkHeader({ icon, title, subtitle, stats, actions, children }: DarkHeaderProps) {
  // stats도 actions도 children도 없으면 렌더링 안 함 (PageTitle이 레이아웃에서 제공)
  const hasContent = (stats && stats.length > 0) || (actions && actions.length > 0) || children
  if (!hasContent) return null

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 16, boxShadow: '0 2px 16px rgba(45,95,168,0.08)' }}>
      {/* ── 통계/액션 바 (제목은 PageTitle에서 제공) ── */}
      {((stats && stats.length > 0) || (actions && actions.length > 0)) && (
        <div style={{
          background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
          padding: '12px 20px',
          borderBottom: children ? 'none' : undefined,
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
                    padding: '9px 12px',
                    border: `1px solid ${s.borderColor}`,
                    textAlign: 'center',
                    cursor: s.onClick ? 'pointer' : 'default',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    minWidth: 0,
                  }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: s.labelColor || '#94a3b8', marginBottom: 3, letterSpacing: '0.02em' }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: s.color, lineHeight: 1 }}>{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 하단 커스텀 영역 ── */}
      {children && (
        <div style={{ background: '#fff' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// DarkHeaderTabs — 다크 연결 탭 (헤더 아래 #2d5fa8 배경)
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
    <div style={{ background: '#2d5fa8', padding: '0 20px', display: 'flex', alignItems: 'flex-end' }}>
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
    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', gap: 6, borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
      {filters.map(f => {
        const active = activeFilter === f.key
        return (
          <button key={f.key} onClick={() => onFilterChange(f.key)}
            style={{
              padding: '5px 12px', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: 'pointer',
              background: active ? 'rgba(45,95,168,0.08)' : '#f8fafc',
              color: active ? '#2d5fa8' : '#64748b',
              border: active ? '1px solid rgba(45,95,168,0.3)' : '1px solid #e2e8f0',
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
// DarkHeaderSummaryBar — 다크 하단 요약 바 (#2d5fa8 배경)
// ═══════════════════════════════════════════════════════════════════════

export interface SummaryItem {
  label: string
  value: string | number
  color?: string  // 값 색상 (기본: #fff)
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
