'use client'

// ═══════════════════════════════════════════════════════════
// Design G — Soft Ice Glass Stat Cards (Level 3)
//   · 반투명 white/0.60 + backdrop-blur + 컬러 틴트 보더
//   · 라벨 키워드로 자동 틴트(수입=green, 지출=red, 손익=amber, 잔액=blue 등)
//   · 기존 호출부(26개)는 수정 없이 동작 — `StatItem[]` 인터페이스 유지
// ═══════════════════════════════════════════════════════════

export type Tint = 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'slate'

export type StatItem = {
  label: string
  value: string | number
  unit?: string
  /** 행별 틴트 직접 지정 (미지정 시 label 키워드로 추론) */
  tint?: Tint
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
  /** 전체 기본 틴트 (개별 tint가 없을 때 fallback) */
  defaultTint?: Tint
}

// ── 틴트별 시각 속성 ────────────────────────────────────────
const TINT_STYLE: Record<Tint, {
  border: string       // card border (color-100 @ 0.80)
  labelColor: string   // label text
  valueGradient: string // value bg-clip-text gradient
}> = {
  blue:   { border: 'rgba(191,219,254,0.80)',  labelColor: '#2563eb', valueGradient: 'linear-gradient(135deg, #1e3a8a, #3b82f6)' },
  green:  { border: 'rgba(167,243,208,0.80)',  labelColor: '#059669', valueGradient: 'linear-gradient(135deg, #065f46, #10b981)' },
  red:    { border: 'rgba(254,202,202,0.80)',  labelColor: '#dc2626', valueGradient: 'linear-gradient(135deg, #991b1b, #ef4444)' },
  amber:  { border: 'rgba(253,230,138,0.80)',  labelColor: '#d97706', valueGradient: 'linear-gradient(135deg, #92400e, #f59e0b)' },
  purple: { border: 'rgba(233,213,255,0.80)',  labelColor: '#9333ea', valueGradient: 'linear-gradient(135deg, #6b21a8, #a855f7)' },
  slate:  { border: 'rgba(0,0,0,0.06)',        labelColor: '#64748b', valueGradient: 'linear-gradient(135deg, #1e293b, #64748b)' },
}

// ── 라벨 키워드 → 틴트 자동 추론 ────────────────────────────
function inferTint(label: string, fallback: Tint = 'blue'): Tint {
  const l = label.toLowerCase()
  // 수입 계열 → green
  if (/수입|매출|입금|수익|완료|정상|운용\s*중|가용|성과/.test(label)) return 'green'
  // 지출/오류 계열 → red
  if (/지출|출금|비용|미수|체납|만기\s*초과|오류|긴급|반려|취소|실패/.test(label)) return 'red'
  // 손익/경고/예정 계열 → amber
  if (/손익|이익|순\s*이익|검사\s*예정|경고|주의|대기|예정/.test(label)) return 'amber'
  // 플러그인/확장 → purple
  if (/플러그인|확장|모듈/.test(label)) return 'purple'
  // 잔액/전체/기본 정보 → blue
  if (/잔액|전체|총\s*건수|총\s*건|진행|등록/.test(label)) return 'blue'
  return fallback
}

export default function DcStatStrip({ stats, actions, fullWidth, defaultTint = 'blue' }: Props) {
  const hasActions = actions && actions.length > 0 && !fullWidth

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: hasActions ? '1fr 260px' : '1fr',
      gap: 16,
      marginBottom: 16,
    }}>
      {/* ── 글래스 스탯 카드 그리드 ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
        gap: 10,
      }}>
        {stats.map((s, i) => {
          const tint = s.tint || inferTint(s.label, defaultTint)
          const t = TINT_STYLE[tint]
          return (
            <div
              key={i}
              style={{
                background: 'rgba(255,255,255,0.60)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: `1px solid ${t.border}`,
                borderRadius: 16,
                padding: '16px 14px',
                textAlign: 'center',
                minWidth: 0,
                boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -2px -2px 8px rgba(255,255,255,0.6)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{
                fontSize: 10,
                color: t.labelColor,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 6,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {s.label}
              </div>
              <div style={{
                fontSize: stats.length > 5 ? 18 : 22,
                fontWeight: 800,
                lineHeight: 1.15,
                whiteSpace: 'nowrap',
                backgroundImage: t.valueGradient,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}>
                {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
                {s.unit && (
                  <span style={{
                    fontSize: 11,
                    marginLeft: 3,
                    fontWeight: 700,
                    opacity: 0.55,
                  }}>
                    {s.unit}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 액션 버튼 (우측 컬럼) ── */}
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
                  ? '4px 4px 12px rgba(59,110,181,0.25), -2px -2px 6px rgba(255,255,255,0.3)'
                  : '4px 4px 10px rgba(140,170,210,0.15), -2px -2px 6px rgba(255,255,255,0.6)',
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
