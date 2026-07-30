'use client'

// ═══════════════════════════════════════════════════════════
// DcToolbar — 검색 + 필터 칩 통합 바 (2026-07 개편: 플랫, 목업 .toolbar/.chip)
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
      gap: 8,
      marginBottom: 14,
      background: '#ffffff',
      borderRadius: 12,
      padding: '10px 12px',
      boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
      border: '1px solid #e6e8ec',
      flexWrap: 'wrap',
      minHeight: 48,
    }}>
      {/* Leading content */}
      {leading}

      {/* Search input (hidden when noSearch) */}
      {!noSearch && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          flex: '0 1 260px', minWidth: 140,
          border: '1px solid #e6e8ec', borderRadius: 8,
          padding: '7px 11px', background: '#f6f7f9',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa1ad" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={placeholder}
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              fontWeight: 500,
              outline: 'none',
              color: '#1a1d23',
              fontFamily: 'inherit',
            }}
          />
        </div>
      )}

      {/* Filter chips (검색 바로 옆 고정 — trailing 유무와 무관하게 위치 변동 없음) */}
      {filters && filters.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'nowrap' }}>
          {filters.map(f => {
            const on = activeFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => onFilterChange?.(f.key)}
                style={{
                  padding: '6px 13px',
                  borderRadius: 99,
                  border: `1px solid ${on ? '#1a1d23' : '#e6e8ec'}`,
                  fontSize: 12.5,
                  fontWeight: 500,
                  background: on ? '#1a1d23' : '#ffffff',
                  color: on ? '#ffffff' : '#5b626e',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.12s',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {f.label}
                {f.count !== undefined && (
                  <span style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 9,
                    background: on ? 'rgba(255,255,255,0.2)' : '#f0f1f4',
                    color: on ? '#ffffff' : '#9aa1ad',
                  }}>
                    {f.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Spacer before trailing so filters stay anchored left regardless of trailing presence */}
      <div style={{ flex: 1 }} />

      {/* Trailing content */}
      {trailing}
    </div>
  )
}
