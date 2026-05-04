'use client'

import { useState } from 'react'

// ───────────────────────────────────────────────────────────────
// 공용 UI 컴포넌트 (RideEmployees/factory-map 격리본)
// FactoryMap 원본을 그대로 가져옴 — Tailwind v4 + 메인 globals.css 환경에서 동작
// 메인의 @/app/utils/ui-tokens 와 병행 사용 가능
// ───────────────────────────────────────────────────────────────

export function ScreenWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden">
        <TrafficLights />
        {children}
      </div>
    </div>
  )
}

function TrafficLights() {
  return (
    <div className="px-5 pt-4 pb-1 flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-full bg-red-400" />
      <span className="w-3 h-3 rounded-full bg-amber-400" />
      <span className="w-3 h-3 rounded-full bg-emerald-400" />
    </div>
  )
}

export function PageHeader({ breadcrumb, title, emoji = '📄', right }: {
  breadcrumb: string[]
  title: string
  emoji?: string
  right?: React.ReactNode
}) {
  return (
    <div className="px-6 pt-2 pb-2">
      <nav className="flex items-center gap-1.5 text-[13px] text-slate-500 mb-3">
        {breadcrumb.map((b, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className={i === breadcrumb.length - 1 ? 'text-slate-800 font-semibold' : ''}>{b}</span>
            {i < breadcrumb.length - 1 && <span className="text-slate-300">›</span>}
          </span>
        ))}
      </nav>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-[24px] font-bold text-slate-900 tracking-tight">
          <span className="mr-2">{emoji}</span>{title}
        </h1>
        {right && <div className="flex gap-2 flex-wrap items-center">{right}</div>}
      </div>
    </div>
  )
}

const KPI_TONE: Record<string, { ring: string; text: string; bg: string }> = {
  emerald: { ring: 'ring-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  blue:    { ring: 'ring-blue-200',    text: 'text-blue-700',    bg: 'bg-blue-50' },
  violet:  { ring: 'ring-violet-200',  text: 'text-violet-700',  bg: 'bg-violet-50' },
  amber:   { ring: 'ring-amber-200',   text: 'text-amber-700',   bg: 'bg-amber-50' },
  red:     { ring: 'ring-red-200',     text: 'text-red-700',     bg: 'bg-red-50' },
  slate:   { ring: 'ring-slate-200',   text: 'text-slate-700',   bg: 'bg-slate-50' },
}

export function KpiCard({ label, value, tone = 'slate', icon, hint }: {
  label: string
  value: number | string
  tone?: keyof typeof KPI_TONE
  icon?: string
  hint?: string
}) {
  const t = KPI_TONE[tone] ?? KPI_TONE.slate
  return (
    <div className={`bg-white rounded-2xl ring-1 ${t.ring} px-5 py-4 min-w-[160px] flex-1`}>
      <div className={`text-[12px] font-semibold ${t.text} flex items-center gap-1.5 mb-1`}>
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div className={`text-[28px] font-bold ${t.text} leading-tight`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {hint && <div className={`text-[11px] ${t.text} opacity-70 mt-0.5`}>{hint}</div>}
    </div>
  )
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="px-8 pt-2 pb-4 flex gap-3 flex-wrap">{children}</div>
}

export function FilterPill({ active, count, onClick, children, tone = 'navy' }: {
  active?: boolean
  count?: number
  onClick?: () => void
  children: React.ReactNode
  tone?: 'navy' | 'plain'
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold transition-colors
        ${active
          ? (tone === 'navy' ? 'bg-slate-900 text-white' : 'bg-blue-600 text-white')
          : 'bg-white text-slate-600 hover:bg-slate-50 ring-1 ring-slate-200'}`}
    >
      {children}
      {typeof count === 'number' && (
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md
          ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-3">
      <div className="bg-slate-50 rounded-2xl ring-1 ring-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        {children}
      </div>
    </div>
  )
}

export function Cell({ label, children, span = 1 }: {
  label: string
  children?: React.ReactNode
  span?: number
}) {
  return (
    <div className={span > 1 ? `col-span-${span}` : ''}>
      <div className="text-[10px] font-medium text-slate-400 mb-0.5 tracking-wide uppercase">{label}</div>
      <div className="text-[13px] text-slate-800 font-medium leading-snug min-h-[18px]">
        {children || <span className="text-slate-300">-</span>}
      </div>
    </div>
  )
}

export function Section({ title, color = 'border-slate-300', defaultOpen = true, children }: {
  title: string
  color?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`border-l-[3px] ${color} bg-white rounded-r-xl ring-1 ring-slate-100 mb-3 overflow-hidden`}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
        <span className="text-[13px] font-bold text-slate-700 tracking-tight">{title}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-3 pt-1">{children}</div>}
    </div>
  )
}

const BADGE_PRESET: Record<string, { dot: string; bg: string }> = {
  ok: { dot: 'bg-emerald-400', bg: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  info: { dot: 'bg-blue-400', bg: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  cyan: { dot: 'bg-cyan-400', bg: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200' },
  warn: { dot: 'bg-amber-400', bg: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  danger: { dot: 'bg-red-400', bg: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  muted: { dot: 'bg-slate-400', bg: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
}

export function StatusBadge({ tone = 'muted', children }: {
  tone?: keyof typeof BADGE_PRESET
  children: React.ReactNode
}) {
  const st = BADGE_PRESET[tone] ?? BADGE_PRESET.muted
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${st.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {children}
    </span>
  )
}

export function Spinner({ label = '불러오는 중...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-3">
      <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
      <span className="text-sm text-slate-500 font-medium">{label}</span>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// Form 컴포넌트
// ───────────────────────────────────────────────────────────────

export function Field({ label, hint, required, children }: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1 block">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-slate-400 mt-1 block">{hint}</span>}
    </label>
  )
}

const inputBase =
  'w-full px-3 py-2.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 ' +
  'placeholder:text-slate-400 transition-colors'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className || ''}`} />
}

export function Select({ options, ...rest }: {
  options: { value: string; label: string }[]
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`${inputBase} ${rest.className || ''}`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }: {
  variant?: 'primary' | 'danger' | 'ghost' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children: React.ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>) {
  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-[12px]',
    md: 'px-5 py-2.5 text-[13px]',
    lg: 'px-6 py-3 text-[14px]',
  }
  const variants: Record<string, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
    secondary: 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100',
    ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
  }
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}
