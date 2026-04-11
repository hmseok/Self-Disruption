'use client'

// ═══════════════════════════════════════════════════════════════
// NeuFilterTabs — 뉴모피즘 필터 탭 (인셋 컨테이너 + 레이즈드 활성 탭)
// 모든 리스트 페이지 상태/카테고리 필터 통일 컴포넌트
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
      gap: 6,
      padding: compact ? '4px 6px' : '5px 8px',
      background: 'rgba(255,255,255,0.40)',
      borderRadius: 12,
      border: '1px solid rgba(0,0,0,0.05)',
      boxShadow: 'inset 2px 2px 5px rgba(140,170,210,0.10), inset -2px -2px 5px rgba(255,255,255,0.30)',
      marginBottom: 12,
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
              gap: 4,
              padding: compact ? '5px 10px' : '7px 14px',
              fontSize: compact ? 11 : 12,
              fontWeight: isActive ? 700 : 500,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease',
              ...(isActive ? {
                background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)',
                color: '#fff',
                boxShadow: '2px 2px 6px rgba(140,170,210,0.22), -1px -1px 4px rgba(255,255,255,0.40)',
              } : {
                background: 'transparent',
                color: '#64748b',
              }),
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span style={{
                fontSize: compact ? 9 : 10,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 6,
                ...(isActive ? {
                  background: 'rgba(255,255,255,0.25)',
                  color: '#fff',
                } : {
                  background: 'rgba(0,0,0,0.04)',
                  color: '#8aabc7',
                }),
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
