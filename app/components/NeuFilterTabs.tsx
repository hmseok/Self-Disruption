'use client'

// ═══════════════════════════════════════════════════════════════
// NeuFilterTabs — 페이지 탭 (2026-07 개편: 언더라인 탭, 목업 .tabs)
// 모든 리스트 페이지 상태/카테고리 필터 통일 컴포넌트
// (파일명은 하위 호환 유지 — 뉴모피즘 스타일은 폐지)
// ═══════════════════════════════════════════════════════════════

export interface FilterTab {
  key: string
  label: string
  count?: number
}

interface NeuFilterTabsProps {
  tabs: FilterTab[]
  activeKey: string
  onSelect: (key: string) => void
  /** 탭 우측 추가 요소 (정렬 드롭다운 등) */
  trailing?: React.ReactNode
  /** 컴팩트 모드 (padding 줄임) */
  compact?: boolean
}

export default function NeuFilterTabs({ tabs, activeKey, onSelect, trailing, compact }: NeuFilterTabsProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      borderBottom: '1px solid #e6e8ec',
      marginBottom: 14,
      overflowX: 'auto',
      flexWrap: 'nowrap',
    }}>
      {tabs.map(tab => {
        const isActive = activeKey === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => onSelect(tab.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: compact ? '8px 12px' : '10px 16px',
              fontSize: compact ? 12.5 : 13.5,
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              color: isActive ? '#2563eb' : '#9aa1ad',
              borderBottom: `2px solid ${isActive ? '#2563eb' : 'transparent'}`,
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span style={{
                fontSize: compact ? 10 : 11,
                fontWeight: 600,
                color: isActive ? '#2563eb' : '#9aa1ad',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        )
      })}

      {/* 우측 추가 요소 (정렬 등) */}
      {trailing && (
        <>
          <div style={{ flex: 1 }} />
          {trailing}
        </>
      )}
    </div>
  )
}
