'use client'

// ═══════════════════════════════════════════════════════════
// Design C — Stat Strip + Action Grid (Top Section)
// Blue gradient stat bar on left, action buttons on right
// ═══════════════════════════════════════════════════════════

export type StatItem = {
  label: string
  value: string | number
  unit?: string
}

export type ActionButton = {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
  icon?: string
}

type Props = {
  stats: StatItem[]
  actions?: ActionButton[]
  /** If true, stats span full width (no action column) */
  fullWidth?: boolean
}

export default function DcStatStrip({ stats, actions, fullWidth }: Props) {
  const hasActions = actions && actions.length > 0 && !fullWidth

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: hasActions ? '1fr 260px' : '1fr',
      gap: 16,
      marginBottom: 16,
    }}>
      {/* ── Blue Gradient Strip ── */}
      <div style={{
        display: 'flex',
        background: 'linear-gradient(135deg, #3b6eb5, #2d5a9e)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '6px 6px 16px rgba(59,110,181,0.2), -2px -2px 8px rgba(255,255,255,0.15)',
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            flex: 1,
            padding: '16px 12px',
            textAlign: 'center',
            borderRight: i < stats.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none',
            minWidth: 0,
          }}>
            <div style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.55)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {s.label}
            </div>
            <div style={{
              fontSize: stats.length > 5 ? 18 : 22,
              fontWeight: 800,
              color: '#fff',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
            }}>
              {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
              {s.unit && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginLeft: 2, fontWeight: 600 }}>
                  {s.unit}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Action Buttons (right column) ── */}
      {hasActions && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          justifyContent: 'center',
        }}>
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={a.onClick}
              style={{
                padding: '10px 16px',
                borderRadius: 12,
                border: a.variant === 'primary' ? 'none' : '1px solid rgba(0,0,0,0.06)',
                background: a.variant === 'primary'
                  ? 'linear-gradient(135deg, #3b6eb5, #5a8fd4)'
                  : 'rgba(255,255,255,0.72)',
                color: a.variant === 'primary' ? '#fff' : '#1e293b',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s',
                boxShadow: a.variant === 'primary'
                  ? '4px 4px 12px rgba(59,110,181,0.25)'
                  : '4px 4px 10px rgba(140,170,210,0.15), -2px -2px 6px rgba(255,255,255,0.4)',
                fontFamily: 'inherit',
              }}
            >
              {a.icon && <span>{a.icon}</span>}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
