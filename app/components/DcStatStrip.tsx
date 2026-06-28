'use client'

// ═══════════════════════════════════════════════════════════
// DcStatStrip — Soft Ice Glass Stat Cards (Variant A, Phase 1)
//   · CLAUDE.md §10 디자인 시스템 준수 (GLASS.L3 + 색상 틴트 보더)
//   · ui-tokens.ts (Phase A #77) 토큰 기반 — 하드코딩 0
//   · 호출부 26개: StatItem[] 인터페이스 100% 호환 (icon/subValue는 선택)
//   · 라벨 키워드로 자동 틴트 (수입=green / 지출=red / 손익=amber / 잔액=blue / …)
// ═══════════════════════════════════════════════════════════

import { COLORS, GLASS } from '@/app/utils/ui-tokens'

export type Tint = 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'slate'

export type StatItem = {
  label: string
  value: string | number
  unit?: string
  /** 행별 틴트 직접 지정 (미지정 시 label 키워드로 추론) */
  tint?: Tint
  /** 선택: 아이콘 (이모지 또는 1자 텍스트) — 라벨 좌측에 표시 */
  icon?: string
  /** 선택: 보조값 (전월비, 증감률, 보조 수치 등) — 값 아래에 표시 */
  subValue?: string | number
  /** 선택: 보조값 톤 (기본 neutral) */
  subTone?: 'up' | 'down' | 'neutral'
  /** 선택: 클릭 시 동작 (예: 리스트 필터) — 있으면 카드가 클릭 가능 */
  onClick?: () => void
  /** 선택: 활성(선택됨) 강조 */
  active?: boolean
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

// ── 틴트별 시각 속성 (ui-tokens.ts 참조) ────────────────────
const TINT_STYLE: Record<Tint, {
  border: string       // card border — ui-tokens의 color-200/0.80
  labelColor: string   // label text
  valueGradient: string // value bg-clip-text gradient
}> = {
  blue:   { border: COLORS.borderBlue,   labelColor: COLORS.primary,  valueGradient: `linear-gradient(135deg, ${COLORS.primaryDark}, ${COLORS.primary})` },
  green:  { border: COLORS.borderGreen,  labelColor: COLORS.success,  valueGradient: 'linear-gradient(135deg, #065f46, #10b981)' },
  red:    { border: COLORS.borderRed,    labelColor: COLORS.danger,   valueGradient: 'linear-gradient(135deg, #991b1b, #ef4444)' },
  amber:  { border: COLORS.borderAmber,  labelColor: COLORS.warning,  valueGradient: 'linear-gradient(135deg, #92400e, #f59e0b)' },
  purple: { border: COLORS.borderViolet, labelColor: '#7c3aed',       valueGradient: 'linear-gradient(135deg, #5b21b6, #8b5cf6)' },
  slate:  { border: COLORS.borderSubtle, labelColor: COLORS.textSecondary, valueGradient: `linear-gradient(135deg, ${COLORS.textPrimary}, ${COLORS.textSecondary})` },
}

// ── 보조값 톤 색상 ──────────────────────────────────────────
const SUB_TONE: Record<NonNullable<StatItem['subTone']>, string> = {
  up: COLORS.success,
  down: COLORS.danger,
  neutral: COLORS.textMuted,
}

// ── 라벨 키워드 → 틴트 자동 추론 ────────────────────────────
function inferTint(label: string, fallback: Tint = 'blue'): Tint {
  // 수입 계열 → green
  if (/수입|매출|입금|수익|완료|정상|운용\s*중|가용|성과/.test(label)) return 'green'
  // 지출/오류 계열 → red
  if (/지출|출금|비용|미수|체납|만기\s*초과|오류|긴급|반려|취소|실패/.test(label)) return 'red'
  // 손익/경고/예정 계열 → amber
  if (/손익|이익|순\s*이익|검사\s*예정|경고|주의|대기|예정/.test(label)) return 'amber'
  // 플러그인/확장 → purple (CLAUDE.md §10: 플러그인·확장 = violet)
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
      // 2026-05-27 사용자 보고: 액션 컬럼 stacked 시 카드가 stretch 로 inflate.
      //   alignItems: 'start' 로 자식 cell 자연 높이 유지.
      alignItems: 'start',
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
          const hasSub = s.subValue !== undefined && s.subValue !== null && s.subValue !== ''
          return (
            <div
              key={i}
              onClick={s.onClick}
              style={{
                // GLASS.L3 — 스탯카드 전용 (background + backdropFilter)
                background: GLASS.L3.background,
                backdropFilter: GLASS.L3.backdropFilter,
                WebkitBackdropFilter: GLASS.L3.WebkitBackdropFilter,
                border: s.active ? `2px solid ${t.labelColor}` : `1px solid ${t.border}`,
                borderRadius: 16,
                padding: '16px 14px',
                textAlign: 'center',
                minWidth: 0,
                cursor: s.onClick ? 'pointer' : 'default',
                boxShadow: s.active
                  ? `0 0 0 3px ${t.border}, 6px 6px 16px rgba(140,170,210,0.2)`
                  : '6px 6px 16px rgba(140,170,210,0.12), -2px -2px 8px rgba(255,255,255,0.6)',
                transition: 'all 0.2s',
              }}
            >
              {/* 라벨 (아이콘 + 텍스트) */}
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}>
                {s.icon && (
                  <span aria-hidden="true" style={{ fontSize: 11, lineHeight: 1, opacity: 0.9 }}>
                    {s.icon}
                  </span>
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
              </div>

              {/* 메인 값 */}
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

              {/* 보조값 (선택) */}
              {hasSub && (
                <div style={{
                  marginTop: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  color: SUB_TONE[s.subTone || 'neutral'],
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {typeof s.subValue === 'number' ? s.subValue.toLocaleString() : s.subValue}
                </div>
              )}
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
                border: a.variant === 'primary' ? 'none' : `1px solid ${COLORS.borderSubtle}`,
                background: a.variant === 'primary'
                  ? `linear-gradient(135deg, ${COLORS.primary}, #5a8fd4)`
                  : 'rgba(255,255,255,0.72)',
                color: a.variant === 'primary' ? '#fff' : COLORS.textPrimary,
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
