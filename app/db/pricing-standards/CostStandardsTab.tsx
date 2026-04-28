'use client'

import { useEffect, useMemo, useState } from 'react'
import { getAuthHeader } from '@/app/utils/pricing-standards'

// ============================================================
// 원가기준 통합 탭 — 3-Layer (시장원가 / 우리원가 / 편차)
//   좌: 스코프 리스트 (class + model)
//   우: 선택한 스코프의 6컴포넌트 market/our/편차 편집
// ============================================================

type Component = 'insurance' | 'maintenance' | 'tax' | 'inspection' | 'finance_rate' | 'registration'

interface Value {
  id: string
  component: Component
  unit: 'monthly' | 'annual' | 'percent' | 'fixed'
  market_value: number | null
  our_value: number | null
  sample_count: number
  market_source: string | null
  market_synced_at: string | null
  our_updated_at: string | null
  is_locked: boolean
}

interface Scope {
  id: string
  scope_type: 'class' | 'model'
  vehicle_class: string | null
  fuel_type: string | null
  brand: string | null
  model: string | null
  display_label: string
  values: Value[]
}

const COMPONENT_LABEL: Record<Component, { icon: string; label: string }> = {
  insurance:    { icon: '🛡️', label: '보험료' },
  maintenance:  { icon: '🔧', label: '정비비' },
  tax:          { icon: '🏛️', label: '자동차세' },
  inspection:   { icon: '🔍', label: '검사비' },
  finance_rate: { icon: '🏦', label: '금융금리' },
  registration: { icon: '📋', label: '등록비' },
}

const UNIT_LABEL: Record<string, string> = {
  monthly: '원/월', annual: '원/년', percent: '%', fixed: '원',
}

function fmt(v: number | null, unit: string): string {
  if (v === null || v === undefined) return '-'
  if (unit === 'percent') return v.toFixed(2)
  return Math.round(v).toLocaleString('ko-KR')
}

function deltaPct(market: number | null, our: number | null): number | null {
  if (market === null || our === null || market === 0) return null
  return ((our - market) / market) * 100
}

export default function CostStandardsTab() {
  const [scopes, setScopes] = useState<Scope[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'class' | 'model'>('all')
  const [search, setSearch] = useState('')

  async function load() {
    try {
      setLoading(true)
      const headers = await getAuthHeader()
      const res = await fetch('/api/cost-standards?view=tree', { headers })
      const json = await res.json()
      const data: Scope[] = json.data || []
      setScopes(data)
      if (!selectedId && data.length > 0) setSelectedId(data[0].id)
    } catch (e) {
      console.error('load failed', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function runMarketSync(scopeId?: string) {
    const target = scopeId ? '선택된 스코프 1개' : '전체 활성 스코프'
    if (!confirm(`Gemini AI로 ${target}의 시장 평균 원가를 조회해서 시장원가를 갱신합니다.\n\n${scopeId ? '약 5~10초' : '전체는 1~2분 소요'} 걸려요.\n\n계속할까요?`)) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/cost-standards/market-sync', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(scopeId ? { scope_id: scopeId } : { all: true }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(`시장 조회 실패: ${json.error || res.status}`)
        return
      }
      alert(
        `✓ 시장 조회 완료\n\n` +
        `· 처리 스코프: ${json.processed}\n` +
        `· 성공: ${json.success}\n` +
        `· 갱신된 컴포넌트: ${json.total_components_updated}건`
      )
      await load()
    } catch (e: any) {
      alert(`시장 조회 오류: ${e.message}`)
    }
  }

  async function runRollup() {
    if (!confirm('운영 실적(operational_actuals) 최근 12개월 데이터로 우리원가를 일괄 갱신합니다.\n\n계속할까요?')) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/cost-standards/rollup?months=12', {
        method: 'POST',
        headers,
      })
      const json = await res.json()
      if (!res.ok) {
        alert(`롤업 실패: ${json.error || res.status}`)
        return
      }
      alert(
        `✓ 롤업 완료\n\n` +
        `· 그룹 수: ${json.actuals_groups}\n` +
        `· 업데이트: ${json.updated}건\n` +
        `· 알림: ${json.notifications}건\n\n` +
        (json.message ? json.message : '우리원가가 실적 평균으로 갱신되었습니다.')
      )
      await load()
    } catch (e: any) {
      alert(`롤업 오류: ${e.message}`)
    }
  }

  async function saveValue(scopeId: string, component: Component, field: 'market_value' | 'our_value', value: string) {
    try {
      setSaving(true)
      const headers = await getAuthHeader()
      const res = await fetch('/api/cost-standards?op=value', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope_id: scopeId, component, field,
          value: value === '' ? null : Number(value),
          trigger_type: 'manual',
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(`저장 실패: ${err.error}`)
        return
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  const filtered = useMemo(() => {
    return scopes.filter(s => {
      if (filter !== 'all' && s.scope_type !== filter) return false
      if (search && !s.display_label.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [scopes, filter, search])

  const selected = scopes.find(s => s.id === selectedId)

  return (
    <div className="flex gap-4" style={{ minHeight: 600 }}>
      {/* ─── 좌: 스코프 리스트 ─── */}
      <div style={{
        width: 320, flexShrink: 0,
        background: 'rgba(255,255,255,0.72)', borderRadius: 14,
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)',
        padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* 필터 */}
        <div className="flex gap-1">
          {(['all', 'class', 'model'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 700, borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.06)',
                background: filter === f ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.4)',
                color: filter === f ? '#3b82f6' : '#64748b', cursor: 'pointer',
              }}
            >
              {f === 'all' ? '전체' : f === 'class' ? '클래스' : '모델'}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="검색..."
          style={{
            padding: '8px 12px', fontSize: 12, borderRadius: 8,
            border: '1px solid rgba(0,0,0,0.05)', background: 'rgba(255,255,255,0.4)',
            outline: 'none',
          }}
        />

        {/* 운영학습 롤업 트리거 */}
        <button
          onClick={runRollup}
          style={{
            padding: '8px 12px', fontSize: 11, fontWeight: 700, borderRadius: 8,
            border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)',
            color: '#15803d', cursor: 'pointer',
          }}
        >🔄 운영실적 → 우리원가</button>

        {/* Gemini 시장조회 (전체) */}
        <button
          onClick={() => runMarketSync()}
          style={{
            padding: '8px 12px', fontSize: 11, fontWeight: 700, borderRadius: 8,
            border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.08)',
            color: '#7e22ce', cursor: 'pointer',
          }}
        >🌐 시장원가 일괄 갱신</button>

        {/* 리스트 */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {loading && <div className="text-xs text-slate-500 text-center py-4">로딩 중...</div>}
          {!loading && filtered.length === 0 && (
            <div className="text-xs text-slate-500 text-center py-4">항목 없음</div>
          )}
          {filtered.map(s => {
            const filled = s.values.filter(v => v.market_value !== null || v.our_value !== null).length
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                style={{
                  textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                  border: selectedId === s.id ? '1px solid #3b82f6' : '1px solid rgba(0,0,0,0.05)',
                  background: selectedId === s.id ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.35)',
                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: selectedId === s.id ? 700 : 500 }}>
                  {s.scope_type === 'class' ? '🏷️' : '🚘'} {s.display_label}
                </span>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 6,
                  background: filled === 6 ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                  color: filled === 6 ? '#16a34a' : '#d97706', fontWeight: 700,
                }}>
                  {filled}/6
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── 우: 선택 스코프 상세 ─── */}
      <div className="flex-1 min-w-0">
        {!selected && (
          <div style={{
            background: 'rgba(255,255,255,0.72)', borderRadius: 14, padding: 40,
            border: '1px solid rgba(0,0,0,0.06)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👈</div>
            <div className="text-sm text-slate-500">왼쪽에서 스코프를 선택하세요</div>
          </div>
        )}

        {selected && (
          <div style={{
            background: 'rgba(255,255,255,0.72)', borderRadius: 14, padding: 20,
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)',
          }}>
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-black/5">
              <div>
                <div className="text-xs text-slate-500 font-bold mb-1">
                  {selected.scope_type === 'class' ? '클래스 스코프' : '모델 스코프'}
                </div>
                <div className="text-lg font-bold text-slate-800">{selected.display_label}</div>
              </div>
              <div className="flex items-center gap-2">
                {saving && <div className="text-xs text-blue-500">저장 중...</div>}
                <button
                  onClick={() => runMarketSync(selected.id)}
                  style={{
                    padding: '6px 10px', fontSize: 11, fontWeight: 700, borderRadius: 8,
                    border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.08)',
                    color: '#7e22ce', cursor: 'pointer',
                  }}
                >🌐 이 스코프 시장조회</button>
              </div>
            </div>

            {/* 6컴포넌트 테이블 */}
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '160px 1fr 1fr 100px',
                gap: 8, fontSize: 11, fontWeight: 700, color: '#64748b',
                padding: '6px 10px',
              }}>
                <div>원가 항목</div>
                <div>시장원가 (AI/외부)</div>
                <div>우리원가 (실적)</div>
                <div style={{ textAlign: 'right' }}>편차</div>
              </div>

              {(Object.keys(COMPONENT_LABEL) as Component[]).map(comp => {
                const v = selected.values.find(x => x.component === comp)
                const unit = v?.unit || (comp === 'finance_rate' ? 'percent' : comp === 'registration' ? 'fixed' : 'monthly')
                const pct = v ? deltaPct(v.market_value, v.our_value) : null
                return (
                  <div key={comp} style={{
                    display: 'grid', gridTemplateColumns: '160px 1fr 1fr 100px',
                    gap: 8, alignItems: 'center',
                    padding: '8px 10px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.45)',
                    border: '1px solid rgba(0,0,0,0.04)',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      <span style={{ marginRight: 6 }}>{COMPONENT_LABEL[comp].icon}</span>
                      {COMPONENT_LABEL[comp].label}
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>{UNIT_LABEL[unit]}</div>
                    </div>

                    <ValueInput
                      value={v?.market_value ?? null}
                      placeholder="미설정"
                      onSave={val => selected && saveValue(selected.id, comp, 'market_value', val)}
                    />

                    <div>
                      <ValueInput
                        value={v?.our_value ?? null}
                        placeholder="실적 없음"
                        onSave={val => selected && saveValue(selected.id, comp, 'our_value', val)}
                      />
                      {v && v.sample_count > 0 && (
                        <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                          표본 {v.sample_count}건
                        </div>
                      )}
                    </div>

                    <div style={{
                      textAlign: 'right', fontSize: 12, fontWeight: 700,
                      color: pct === null ? '#cbd5e1'
                           : Math.abs(pct) < 5 ? '#16a34a'
                           : Math.abs(pct) < 15 ? '#d97706'
                           : '#dc2626',
                    }}>
                      {pct === null ? '-' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 가이드 */}
            <div style={{
              marginTop: 16, padding: 10, borderRadius: 10,
              background: 'rgba(59,130,246,0.06)', fontSize: 11,
              color: '#475569', lineHeight: 1.6,
            }}>
              💡 <b>편차 색상</b> — 초록(±5% 내 정상) / 주황(±15% 내 주의) / 빨강(15% 초과, 시장과 크게 차이).
              우리원가가 비어 있으면 견적 엔진은 시장원가를 사용합니다.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────
// 인라인 편집 인풋
// ────────────────────────────────
function ValueInput({ value, placeholder, onSave }: {
  value: number | null
  placeholder: string
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    setDraft(value !== null ? String(value) : '')
  }, [value])

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{
          textAlign: 'left', fontSize: 13, padding: '6px 10px', borderRadius: 8,
          background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.05)',
          width: '100%', cursor: 'pointer',
          color: value === null ? '#cbd5e1' : '#1e293b',
          fontWeight: value === null ? 400 : 600,
        }}
      >
        {value !== null ? value.toLocaleString('ko-KR') : placeholder}
      </button>
    )
  }

  return (
    <input
      autoFocus
      type="number"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== (value !== null ? String(value) : '')) onSave(draft) }}
      onKeyDown={e => {
        if (e.key === 'Enter') { setEditing(false); onSave(draft) }
        if (e.key === 'Escape') { setEditing(false); setDraft(value !== null ? String(value) : '') }
      }}
      style={{
        fontSize: 13, padding: '6px 10px', borderRadius: 8,
        border: '1px solid #3b82f6', width: '100%', outline: 'none',
        background: 'white',
      }}
    />
  )
}
