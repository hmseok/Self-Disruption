'use client'

// ═══════════════════════════════════════════════════════════
// Design C — Unified Toolbar (Search + Filter Tabs in one bar)
// Single bar containing: search input + filter pill buttons
// ═══════════════════════════════════════════════════════════

import { ReactNode } from 'react'

export type FilterItem = {
  key: string
  label: string
  count?: number
}

type Props = {
  /** Search value */
  search: string
  onSearchChange: (v: string) => void
  placeholder?: string
  /** Hide search input entirely (for pure tab bars) */
  noSearch?: boolean
  /** Filter tabs inside the bar */
  filters?: FilterItem[]
  activeFilter?: string
  onFilterChange?: (key: string) => void
  /** Extra content after filters (e.g., sort dropdown) */
  trailing?: ReactNode
  /** Extra content before search (e.g., month label) */
  leading?: ReactNode
}

export default function DcToolbar({
  search, onSearchChange, placeholder = '검색...',
  noSearch = false,
  filters, activeFilter, onFilterChange,
  trailing, leading,
}: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
      background: 'rgba(255,255,255,0.72)',
      borderRadius: 14,
      padding: '8px 8px 8px 20px',
      boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)',
      border: '1px solid rgba(0,0,0,0.05)',
      flexWrap: 'wrap',
      minHeight: 48,
    }}>
      {/* Leading content */}
      {leading}

      {/* Search icon + input (hidden when noSearch) */}
      {!noSearch && (
        <>
          <span style={{ color: '#8aabc7', fontSize: 14, flexShrink: 0 }}>🔍</span>
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={placeholder}
            style={{
              flex: '0 1 240px',
              minWidth: 120,
              maxWidth: 320,
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              fontWeight: 500,
              outline: 'none',
              color: '#2a4a6b',
              fontFamily: 'inherit',
            }}
          />
        </>
      )}

      {/* Filter pills (검색 바로 옆 고정 — trailing 유무와 무관하게 위치 변동 없음) */}
      {filters && filters.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'nowrap' }}>
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => onFilterChange?.(f.key)}
              style={{
                padding: '7px 14px',
                borderRadius: 10,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                background: activeFilter === f.key ? '#0f2440' : 'transparent',
                color: activeFilter === f.key ? '#fff' : '#64748b',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {f.label}
              {f.count !== undefined && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: 6,
                  background: activeFilter === f.key ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                  color: activeFilter === f.key ? 'rgba(255,255,255,0.8)' : '#8aabc7',
                }}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Spacer before trailing so filters stay anchored left regardless of trailing presence */}
      <div style={{ flex: 1 }} />

      {/* Trailing content */}
      {trailing}
    </div>
  )
}
