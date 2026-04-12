'use client'

import { useState, useEffect } from 'react'
import { f, parseNum } from '@/lib/quote-utils'

// ============================================
// 원가 비중 바
// ============================================
export const CostBar = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => {
  const pct = total > 0 ? Math.abs(value) / total * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', width: 28, textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
        <div className={color} style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', width: 60, textAlign: 'right', fontWeight: 600 }}>{f(value)}원</span>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 28, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
    </div>
  )
}

// ============================================
// 섹션 카드 래퍼 (접기/펼치기)
// ============================================
export const Section = ({ icon, title, children, className = '', defaultOpen = true, summary }: {
  icon: string; title: string; children: React.ReactNode; className?: string; defaultOpen?: boolean; summary?: React.ReactNode
}) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }} className={className}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', cursor: 'pointer', border: 'none', background: 'transparent',
          transition: 'background 0.15s', userSelect: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{title}</span>
          {!open && summary && <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{summary}</span>}
        </div>
        <span style={{ color: '#9ca3af', fontSize: 12, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
      </button>
      {open && <div style={{ padding: '0 18px 18px' }}>{children}</div>}
    </div>
  )
}

// ============================================
// 입력 행 (money / percent 타입)
// ============================================
export const InputRow = ({ label, value, onChange, suffix = '원', type = 'money', sub = '' }: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string; type?: string; sub?: string
}) => {
  const [localStr, setLocalStr] = useState(type === 'percent' ? String(value) : '')
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused && type === 'percent') setLocalStr(String(value))
  }, [value, isFocused, type])

  return (
    <div className="flex items-center justify-between py-1.5">
      <div>
        <span className="text-slate-400 text-xs">{label}</span>
        {sub && <span className="block text-[11px] text-slate-500">{sub}</span>}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode={type === 'percent' ? 'decimal' : 'numeric'}
          className="w-28 text-right border border-black/[0.06] rounded-lg px-2 py-1.5 text-xs font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
          style={{ background: 'rgba(255,255,255,0.40)', boxShadow: 'inset 2px 2px 4px rgba(140,170,210,0.12)' }}
          value={type === 'percent' ? (isFocused ? localStr : value) : f(value)}
          onFocus={() => {
            if (type === 'percent') {
              setLocalStr(String(value))
              setIsFocused(true)
            }
          }}
          onBlur={() => {
            if (type === 'percent') {
              setIsFocused(false)
              const parsed = parseFloat(localStr)
              if (!isNaN(parsed)) onChange(parsed)
            }
          }}
          onChange={(e) => {
            if (type === 'percent') {
              const raw = e.target.value
              if (/^-?\d*\.?\d*$/.test(raw)) {
                setLocalStr(raw)
                const parsed = parseFloat(raw)
                if (!isNaN(parsed)) onChange(parsed)
              }
            } else {
              onChange(parseNum(e.target.value))
            }
          }}
        />
        <span className="text-xs text-slate-500 w-8">{suffix}</span>
      </div>
    </div>
  )
}

// ============================================
// 결과 행 (하이라이트/일반)
// ============================================
export const ResultRow = ({ label, value, highlight = false, negative = false }: {
  label: string; value: number; highlight?: boolean; negative?: boolean
}) => (
  highlight ? (
    <div className="flex justify-between items-center py-2 px-2.5 rounded-lg" style={{ background: 'rgba(59,110,181,0.06)' }}>
      <span className="font-bold text-xs text-slate-600">{label}</span>
      <span className={`font-black text-sm ${negative ? 'text-green-600' : 'text-steel-700'}`}>
        {negative ? '-' : ''}{f(Math.abs(value))}원
      </span>
    </div>
  ) : (
    <div className="flex justify-between items-center py-1">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className={`font-bold text-xs ${negative ? 'text-green-600' : 'text-slate-700'}`}>
        {negative ? '-' : ''}{f(Math.abs(value))}원
      </span>
    </div>
  )
)
