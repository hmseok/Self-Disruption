'use client'

import { useState } from 'react'
import { useOL, RuleSuggestion } from './OperationalLearningContext'
import { getAuthHeader } from '@/app/utils/auth-client'

// ═══════════════════════════════════════════════════════════════
// RuleSuggestionPanel — BusinessRules 자동 추천 (Soft Ice Level 3, purple tint)
// POST /api/operational-learning/apply-rule 호출 → business_rules UPDATE
// ═══════════════════════════════════════════════════════════════

type Props = {
  onApplied: () => void
}

export default function RuleSuggestionPanel({ onApplied }: Props) {
  const { suggestions, suggestionMeta, loadingSuggestions } = useOL()
  const [applyingKey, setApplyingKey] = useState<string | null>(null)
  const [appliedKeys, setAppliedKeys] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const apply = async (s: RuleSuggestion) => {
    if (!confirm(`「${s.key}」 기준값을 ${s.current_value} → ${s.suggested_value}(으)로 변경하시겠습니까?\n\n이유: ${s.reason}`)) return
    setApplyingKey(s.key)
    setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/operational-learning/apply-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          rule_key: s.key,
          new_value: s.suggested_value,
          reason: s.reason,
          confidence: s.confidence,
          sample_size: suggestionMeta.sample_size,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '적용 실패')
      setAppliedKeys(prev => {
        const next = new Set(prev)
        next.add(s.key)
        return next
      })
      onApplied()
    } catch (e: any) {
      setError(e.message || '적용 실패')
    } finally {
      setApplyingKey(null)
    }
  }

  return (
    <section style={{
      background: 'rgba(255,255,255,0.60)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(221,214,254,0.80)',
      borderRadius: 14,
      padding: '14px 18px',
      boxShadow: '4px 4px 12px rgba(139,92,246,0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#6d28d9' }}>🧠 BusinessRules 자동 추천</span>
          {suggestionMeta.sample_size > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6' }}>
              (샘플 {suggestionMeta.sample_size}건 · {suggestionMeta.analysis_period})
            </span>
          )}
        </div>
        {loadingSuggestions && <span style={{ fontSize: 11, color: '#8b5cf6' }}>분석 중…</span>}
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12,
          color: '#b91c1c',
          marginBottom: 10,
        }}>
          ⚠ {error}
        </div>
      )}

      {suggestions.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
          {suggestionMeta.sample_size < 5
            ? `분석을 위해 최소 5건의 스냅샷이 필요합니다. (현재 ${suggestionMeta.sample_size}건)`
            : '현재 기준값이 적정 범위에 있습니다. 추천할 항목이 없습니다.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {suggestions.map(s => {
            const applied = appliedKeys.has(s.key)
            const applying = applyingKey === s.key
            return (
              <div key={s.key} style={{
                background: 'rgba(255,255,255,0.65)',
                border: '1px solid rgba(221,214,254,0.60)',
                borderRadius: 10,
                padding: '10px 12px',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 12,
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', fontFamily: 'monospace' }}>{s.key}</span>
                    <ConfidenceBadge c={s.confidence} />
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                    <span style={{ color: '#94a3b8' }}>{s.current_value}</span>
                    <span style={{ color: '#6d28d9', margin: '0 6px', fontWeight: 700 }}>→</span>
                    <span style={{ fontWeight: 800, color: '#6d28d9' }}>{s.suggested_value}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{s.reason}</div>
                </div>
                <button
                  onClick={() => apply(s)}
                  disabled={applied || applying}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 10,
                    border: 'none',
                    background: applied
                      ? 'rgba(52,211,153,0.20)'
                      : 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
                    color: applied ? '#059669' : '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: applied || applying ? 'default' : 'pointer',
                    opacity: applying ? 0.6 : 1,
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {applied ? '✓ 적용됨' : applying ? '적용 중…' : '적용'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ConfidenceBadge({ c }: { c: 'high' | 'medium' | 'low' }) {
  const map = {
    high:   { label: 'HIGH',   bg: 'rgba(34,197,94,0.15)',  fg: '#15803d' },
    medium: { label: 'MEDIUM', bg: 'rgba(245,158,11,0.15)', fg: '#b45309' },
    low:    { label: 'LOW',    bg: 'rgba(148,163,184,0.18)', fg: '#475569' },
  }
  const v = map[c]
  return (
    <span style={{
      padding: '1px 6px',
      borderRadius: 4,
      fontSize: 9,
      fontWeight: 800,
      background: v.bg,
      color: v.fg,
      letterSpacing: '0.05em',
    }}>
      {v.label}
    </span>
  )
}
