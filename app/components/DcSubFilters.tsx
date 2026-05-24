'use client'

// ═══════════════════════════════════════════════════════════
// Design C — Sub-filter badge row
// Inline badge pills for secondary filtering (status, category, etc.)
// Multiple groups separated by dividers
// ═══════════════════════════════════════════════════════════

export type SubFilterGroup = {
  key: string
  activeKey: string
  onSelect: (key: string) => void
  items: { key: string; label: string }[]
}

type Props = {
  groups: SubFilterGroup[]
}

export default function DcSubFilters({ groups }: Props) {
  return (
    <div style={{
      display: 'flex',
      gap: 6,
      marginBottom: 12,
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      {groups.map((group, gi) => (
        <div key={group.key} style={{ display: 'contents' }}>
          {gi > 0 && (
            <span style={{
              width: 1,
              height: 16,
              background: 'rgba(0,0,0,0.08)',
              margin: '0 4px',
              flexShrink: 0,
            }} />
          )}
          {group.items.map(item => (
            <button
              key={item.key}
              onClick={() => group.onSelect(item.key)}
              style={{
                padding: '5px 12px',
                borderRadius: 8,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                background: group.activeKey === item.key ? '#3b6eb5' : 'rgba(100,116,139,0.08)',
                color: group.activeKey === item.key ? '#fff' : '#64748b',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
