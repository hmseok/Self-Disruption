'use client'

import { useState } from 'react'
import { COLORS, GLASS, BTN, pillStyle, type PillTone } from '@/app/utils/ui-tokens'

// ───────────────────────────────────────────────────────────────
// 공용 UI 컴포넌트 — 메인 ERP Soft Ice 디자인 시스템 (CLAUDE.md §10) 통일본
//   COLORS / GLASS L1~L5 / BTN sm·md·lg / pillStyle 사용
//   API 시그니처는 기존 ScreenWrap·PageHeader·KpiCard·Toolbar 등과 동일 → 4페이지 import 그대로
// ───────────────────────────────────────────────────────────────

// ── ScreenWrap : 메인 layout 이 padding/배경 처리하므로 단순 콘텐츠 패딩만 ─
export function ScreenWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '0', width: '100%' }}>
      {children}
    </div>
  )
}

// ── PageHeader : 글래스 L5 헤더 ─
export function PageHeader({ breadcrumb, title, emoji = '📄', right }: {
  breadcrumb: string[]
  title: string
  emoji?: string
  right?: React.ReactNode
}) {
  return (
    <div style={{
      padding: '14px 24px 10px',
      borderBottom: `1px solid ${COLORS.borderSubtle}`,
    }}>
      <nav style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: COLORS.textSecondary, marginBottom: 8, flexWrap: 'wrap',
      }}>
        {breadcrumb.map((b, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              color: i === breadcrumb.length - 1 ? COLORS.textPrimary : COLORS.textSecondary,
              fontWeight: i === breadcrumb.length - 1 ? 700 : 500,
            }}>{b}</span>
            {i < breadcrumb.length - 1 && <span style={{ color: COLORS.textDim, fontSize: 11 }}>›</span>}
          </span>
        ))}
      </nav>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
      }}>
        <h1 style={{
          fontSize: 22, fontWeight: 800, color: COLORS.textPrimary,
          margin: 0, letterSpacing: '-0.01em',
        }}>
          <span style={{ marginRight: 8 }}>{emoji}</span>{title}
        </h1>
        {right && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>
        )}
      </div>
    </div>
  )
}

// ── KpiCard : Glass L3 + 색 틴트 ─
const KPI_TONE_MAP: Record<string, { bg: string; border: string; color: string }> = {
  emerald: { bg: COLORS.bgGreen, border: COLORS.borderGreen, color: COLORS.success },
  blue:    { bg: COLORS.bgBlue,  border: COLORS.borderBlue,  color: COLORS.info },
  violet:  { bg: COLORS.bgViolet, border: COLORS.borderViolet, color: '#7c3aed' },
  amber:   { bg: COLORS.bgAmber, border: COLORS.borderAmber, color: COLORS.warning },
  red:     { bg: COLORS.bgRed,   border: COLORS.borderRed,   color: COLORS.danger },
  slate:   { bg: COLORS.bgGray,  border: COLORS.borderFaint, color: COLORS.textMuted },
}

export function KpiCard({ label, value, tone = 'slate', icon, hint }: {
  label: string
  value: number | string
  tone?: keyof typeof KPI_TONE_MAP
  icon?: string
  hint?: string
}) {
  const t = KPI_TONE_MAP[tone] ?? KPI_TONE_MAP.slate
  const display = typeof value === 'number' ? value.toLocaleString() : value
  return (
    <div style={{
      ...GLASS.L3, background: t.bg, border: `1px solid ${t.border}`,
      borderRadius: 12, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 2,
      minWidth: 160, flex: 1,
    }}>
      <div style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {icon && <span>{icon}</span>}
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: t.color, lineHeight: 1.1 }}>{display}</div>
      {hint && (
        <div style={{
          fontSize: 11, color: COLORS.textMuted,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{hint}</div>
      )}
    </div>
  )
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '12px 24px',
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12,
    }}>{children}</div>
  )
}

// ── FilterPill : 활성 navy/primary / 비활성 Glass L4 ─
export function FilterPill({ active, count, onClick, children, tone = 'navy' }: {
  active?: boolean
  count?: number
  onClick?: () => void
  children: React.ReactNode
  tone?: 'navy' | 'plain'
}) {
  const activeStyle: React.CSSProperties = active
    ? {
        background: tone === 'navy' ? COLORS.textPrimary : COLORS.primary,
        color: '#fff',
        border: `1px solid ${tone === 'navy' ? COLORS.textPrimary : COLORS.primary}`,
      }
    : {
        ...GLASS.L4,
        color: COLORS.textSecondary,
      }
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 14px', borderRadius: 999,
        fontSize: 13, fontWeight: 700,
        cursor: 'pointer', transition: 'all 0.15s',
        ...activeStyle,
      }}
    >
      <span>{children}</span>
      {typeof count === 'number' && (
        <span style={{
          fontSize: 11, fontWeight: 800,
          padding: '1px 6px', borderRadius: 6,
          background: active ? 'rgba(255,255,255,0.20)' : COLORS.bgGray,
          color: active ? '#fff' : COLORS.textMuted,
        }}>{count}</span>
      )}
    </button>
  )
}

// ── Toolbar : Glass L4 카드 행 ─
export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '8px 24px' }}>
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>{children}</div>
    </div>
  )
}

// ── Cell : 라벨 + 값 컬럼 ─
export function Cell({ label, children, span = 1 }: {
  label: string
  children?: React.ReactNode
  span?: number
}) {
  return (
    <div style={{ gridColumn: span > 1 ? `span ${span}` : undefined }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.04em', color: COLORS.textMuted, marginBottom: 2,
      }}>{label}</div>
      <div style={{
        fontSize: 13, fontWeight: 500, lineHeight: 1.4,
        color: COLORS.textPrimary, minHeight: 18,
      }}>
        {children || <span style={{ color: COLORS.textDim }}>-</span>}
      </div>
    </div>
  )
}

// ── Section : 접기 가능한 카드 (Glass L4 + 좌측 컬러 보더) ─
export function Section({ title, color = COLORS.borderFaint, defaultOpen = true, children }: {
  title: string
  color?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  // Tailwind 클래스 폴백 처리
  const borderColor = color.startsWith('border-') ? COLORS.primary : color
  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, marginBottom: 12,
      borderLeft: `3px solid ${borderColor}`, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'transparent', border: 0, cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textSecondary, letterSpacing: '-0.01em' }}>
          {title}
        </span>
        <span style={{ fontSize: 12, color: COLORS.textMuted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>
      {open && <div style={{ padding: '4px 14px 12px' }}>{children}</div>}
    </div>
  )
}

// ── StatusBadge : pillStyle 기반 ─
const TONE_TO_PILL: Record<string, PillTone> = {
  ok: 'success', info: 'info', cyan: 'info', warn: 'warning', danger: 'danger', muted: 'neutral',
}

export function StatusBadge({ tone = 'muted', children }: {
  tone?: 'ok' | 'info' | 'cyan' | 'warn' | 'danger' | 'muted'
  children: React.ReactNode
}) {
  const pTone = TONE_TO_PILL[tone] ?? 'neutral'
  return <span style={pillStyle(pTone)}>{children}</span>
}

// ── Spinner ─
export function Spinner({ label = '불러오는 중...' }: { label?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: 192, gap: 12,
    }}>
      <div style={{
        width: 32, height: 32,
        border: `2px solid ${COLORS.borderBlue}`,
        borderTopColor: COLORS.primary,
        borderRadius: '50%',
        animation: 'fs-spin 0.8s linear infinite',
      }} />
      <span style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: 500 }}>{label}</span>
      <style>{`@keyframes fs-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Form 컴포넌트 ──────────────────────────────────────────────

export function Field({ label, hint, required, children }: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.04em', color: COLORS.textMuted, marginBottom: 4,
      }}>
        {label}{required && <span style={{ color: COLORS.danger, marginLeft: 4 }}>*</span>}
      </span>
      {children}
      {hint && (
        <span style={{ display: 'block', fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
          {hint}
        </span>
      )}
    </label>
  )
}

const inputBase: React.CSSProperties = {
  ...GLASS.L1,
  width: '100%',
  padding: '7px 12px',
  fontSize: 13,
  borderRadius: 8,
  color: COLORS.textPrimary,
  outline: 'none',
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { style, className, ...rest } = props
  void className
  return (
    <input
      {...rest}
      style={{ ...inputBase, ...(rest.disabled ? { opacity: 0.5 } : {}), ...style }}
    />
  )
}

export function Select({ options, ...rest }: {
  options: { value: string; label: string }[]
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { style, className, ...selRest } = rest
  void className
  return (
    <select
      {...selRest}
      style={{ ...inputBase, ...(selRest.disabled ? { opacity: 0.5 } : {}), ...style }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Button({ variant = 'primary', size = 'md', children, ...rest }: {
  variant?: 'primary' | 'danger' | 'ghost' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'>) {
  const sizeStyle = BTN[size]
  const variantStyle: React.CSSProperties = (() => {
    switch (variant) {
      case 'primary':   return { background: COLORS.primary, color: '#fff', border: `1px solid ${COLORS.primary}` }
      case 'danger':    return { background: COLORS.danger,  color: '#fff', border: `1px solid ${COLORS.danger}` }
      case 'secondary': return { ...GLASS.L4, color: COLORS.textPrimary }
      case 'ghost':     return { background: 'transparent', color: COLORS.textSecondary, border: '1px solid transparent' }
    }
  })()
  return (
    <button
      {...rest}
      style={{
        ...sizeStyle, ...variantStyle,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        cursor: rest.disabled ? 'not-allowed' : 'pointer', opacity: rest.disabled ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}
