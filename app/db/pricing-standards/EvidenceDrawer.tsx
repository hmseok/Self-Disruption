'use client'

import { useEffect, useState } from 'react'
import { getAuthHeader } from '@/app/utils/pricing-standards'

// ============================================================
// EvidenceDrawer — 기준값 1개에 대한 "왜 이 값인가?" 근거 패널
//   (1) 변경 이력: pricing_standard_changes 최근 50건 (LEFT JOIN profiles)
//   (2) 실운영 대비: operational_actuals 와 비교 (지원 테이블만)
//   (3) 표준 범위: 부모 탭이 주입한 rangeText (선택)
//   Phase A-1 — BusinessRulesTab 파일럿
// ============================================================

export interface EvidenceContext {
  table: string
  rowId: string
  title: string          // "1년차 감가율", "기본 마진율" 등
  subtitle?: string      // key 또는 row 식별자
  currentValue?: any     // 현재 값 (표시용)
  unit?: string          // '%', '원' 등
  range?: string         // 업계 참고 범위
  industryRef?: string   // 업계 참고 비교치
  // 실운영 비교가 가능한 경우 매핑
  //   예: business_rules/DEP_YEAR_1 → 감가율은 operational_actuals.actual_depreciation 기반
  //   v0: mapping 은 Drawer 가 자체 판단 (null 이면 "비교 데이터 없음")
  actualField?: 'actual_depreciation' | 'actual_insurance' | 'actual_maintenance' | 'actual_tax' | 'actual_accident_cost' | null
}

interface ChangeRow {
  id: string
  table_name: string
  row_id: string
  field: string
  old_value: string | null
  new_value: string | null
  user_id: string | null
  user_name: string | null
  user_email: string | null
  reason: string | null
  changed_at: string
}

interface ActualSummary {
  sampleCount: number
  averageMonthly: number
  median: number
}

interface Props {
  ctx: EvidenceContext | null
  onClose: () => void
  /** 선택: AI 추천값을 이 값으로 반영할 때 호출됨. 부모가 실제 저장/로깅 담당. */
  onApply?: (newValue: number, reason: string) => Promise<void> | void
}

interface AiSuggestion {
  suggestedValue: number | null
  confidence: 'high' | 'medium' | 'low' | 'unknown'
  reasoning: string
  sources: string[]
  deviationPct: number | null
  searchedAt: string
}

async function fetchChanges(table: string, rowId: string): Promise<ChangeRow[]> {
  const headers = await getAuthHeader()
  const r = await fetch(`/api/pricing-standards?table=${encodeURIComponent(table)}&id=${encodeURIComponent(rowId)}&history=1`, { headers })
  if (!r.ok) return []
  const j = await r.json()
  return Array.isArray(j?.data) ? j.data : []
}

// 실운영 비교는 별도 헬퍼 API 가 없으므로 v0 는 공란 — UI 스켈레톤만 준비
// (Phase A-2 에서 /api/pricing-standards/actuals 추가 예정)
async function fetchActualSummary(_field: string | null): Promise<ActualSummary | null> {
  return null
}

function formatDateTime(iso: string) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatDelta(oldV: string | null, newV: string | null) {
  const a = oldV ?? '—'
  const b = newV ?? '—'
  return { a, b }
}

function prettyField(field: string, table: string) {
  if (table === 'business_rules' && field === 'value') return '값'
  return field
}

export default function EvidenceDrawer({ ctx, onClose, onApply }: Props) {
  const [loading, setLoading] = useState(false)
  const [changes, setChanges] = useState<ChangeRow[]>([])
  const [actual, setActual] = useState<ActualSummary | null>(null)

  // ── AI 추천값 섹션 ──
  const [ai, setAi] = useState<AiSuggestion | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (!ctx) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setAi(null)
      setAiError(null)
      try {
        const [c, a] = await Promise.all([
          fetchChanges(ctx.table, ctx.rowId),
          fetchActualSummary(ctx.actualField ?? null),
        ])
        if (cancelled) return
        setChanges(c)
        setActual(a)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [ctx?.table, ctx?.rowId])

  const runAiSuggest = async () => {
    if (!ctx) return
    setAiLoading(true)
    setAiError(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const r = await fetch('/api/pricing-standards/ai-suggest', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          key: ctx.subtitle || ctx.rowId,
          currentValue: ctx.currentValue,
          label: ctx.title,
          unit: ctx.unit,
          range: ctx.range,
          industryRef: ctx.industryRef,
          context: { table: ctx.table },
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setAi({
        suggestedValue: j.suggestedValue ?? null,
        confidence: j.confidence ?? 'unknown',
        reasoning: j.reasoning ?? '',
        sources: Array.isArray(j.sources) ? j.sources : [],
        deviationPct: typeof j.deviationPct === 'number' ? j.deviationPct : null,
        searchedAt: j.searchedAt ?? new Date().toISOString(),
      })
    } catch (e: any) {
      setAiError(e?.message || 'AI 추천 조회 실패')
    } finally {
      setAiLoading(false)
    }
  }

  const applyAiSuggestion = async () => {
    if (!ctx || !ai || ai.suggestedValue === null || !onApply) return
    const reasonBase = `AI 추천 반영 (신뢰도: ${ai.confidence})`
    const reasoning = ai.reasoning ? `${reasonBase} — ${ai.reasoning.slice(0, 150)}` : reasonBase
    setApplying(true)
    try {
      await onApply(ai.suggestedValue, reasoning)
    } catch (e: any) {
      setAiError(e?.message || '반영 실패')
    } finally {
      setApplying(false)
    }
  }

  if (!ctx) return null

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(15,23,42,0.18)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer (우측 슬라이드) */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 51,
          width: 'min(480px, 92vw)',
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(24px) saturate(140%)',
          WebkitBackdropFilter: 'blur(24px) saturate(140%)',
          borderLeft: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '-20px 0 40px rgba(140,170,210,0.16)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.3 }}>📜 근거 / 학습 데이터</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
              {ctx.title}
            </div>
            {ctx.subtitle && (
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8', marginTop: 1 }}>{ctx.subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.06)',
              background: 'rgba(255,255,255,0.6)', cursor: 'pointer',
              fontSize: 14, color: '#64748b',
            }}
            aria-label="닫기"
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {/* ── 현재 값 + 업계 참고 ── */}
          <section style={panelStyle}>
            <div style={sectionLabel}>현재 값</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
                {ctx.currentValue ?? '—'}
              </span>
              {ctx.unit && <span style={{ fontSize: 12, color: '#64748b' }}>{ctx.unit}</span>}
            </div>
            {(ctx.range || ctx.industryRef) && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ctx.range && (
                  <span style={chipStyle('#dbeafe', '#1e3a8a')}>적정 범위 {ctx.range}</span>
                )}
                {ctx.industryRef && (
                  <span style={chipStyle('#dcfce7', '#14532d')}>업계 {ctx.industryRef}</span>
                )}
              </div>
            )}
          </section>

          {/* ── 실운영 비교 ── */}
          <section style={{ ...panelStyle, marginTop: 12 }}>
            <div style={sectionLabel}>📊 실운영 대비 (operational_actuals)</div>
            {actual ? (
              <div style={{ marginTop: 8, fontSize: 12, color: '#334155' }}>
                최근 기록 {actual.sampleCount}건 · 평균 월 {actual.averageMonthly.toLocaleString()}원 · 중앙값 {actual.median.toLocaleString()}원
              </div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                {ctx.actualField
                  ? '아직 누적된 실운영 데이터가 없습니다. 계약/정산이 쌓이면 자동으로 비교됩니다.'
                  : '이 기준값과 직접 비교 가능한 실운영 지표가 정의되어 있지 않습니다.'}
              </div>
            )}
          </section>

          {/* ── AI 추천값 (Gemini 검증) ── */}
          <section style={{ ...panelStyle, marginTop: 12, borderColor: 'rgba(139,92,246,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={sectionLabel}>🤖 AI 추천값 (Gemini 검색)</div>
              <button
                type="button"
                onClick={runAiSuggest}
                disabled={aiLoading}
                style={{
                  padding: '4px 10px',
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 7,
                  border: '1px solid rgba(139,92,246,0.30)',
                  background: aiLoading ? 'rgba(139,92,246,0.06)' : 'rgba(139,92,246,0.10)',
                  color: '#6d28d9',
                  cursor: aiLoading ? 'wait' : 'pointer',
                }}
              >
                {aiLoading ? '조회 중…' : ai ? '다시 조회' : 'AI 추천 조회'}
              </button>
            </div>

            {aiError && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#b91c1c' }}>❌ {aiError}</div>
            )}

            {!ai && !aiLoading && !aiError && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                "AI 추천 조회" 를 누르면 Gemini 가 공식 자료 기반으로 추천값을 제시합니다.
              </div>
            )}

            {ai && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: '#64748b' }}>추천값</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: '#6d28d9' }}>
                    {ai.suggestedValue !== null ? ai.suggestedValue.toLocaleString('ko-KR') : '—'}
                  </span>
                  {ctx.unit && <span style={{ fontSize: 11, color: '#64748b' }}>{ctx.unit}</span>}
                  <span
                    style={{
                      padding: '2px 8px',
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 999,
                      background:
                        ai.confidence === 'high'
                          ? 'rgba(16,185,129,0.14)'
                          : ai.confidence === 'medium'
                          ? 'rgba(245,158,11,0.16)'
                          : ai.confidence === 'low'
                          ? 'rgba(244,63,94,0.14)'
                          : 'rgba(100,116,139,0.12)',
                      color:
                        ai.confidence === 'high'
                          ? '#047857'
                          : ai.confidence === 'medium'
                          ? '#b45309'
                          : ai.confidence === 'low'
                          ? '#9f1239'
                          : '#475569',
                    }}
                  >
                    신뢰도 {ai.confidence}
                  </span>
                  {ai.deviationPct !== null && (
                    <span
                      style={{
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 700,
                        borderRadius: 999,
                        background:
                          Math.abs(ai.deviationPct) > 15
                            ? 'rgba(244,63,94,0.12)'
                            : 'rgba(59,130,246,0.10)',
                        color: Math.abs(ai.deviationPct) > 15 ? '#9f1239' : '#1e40af',
                      }}
                    >
                      현재 대비 {ai.deviationPct > 0 ? '+' : ''}
                      {ai.deviationPct.toFixed(1)}%
                    </span>
                  )}
                </div>

                {ai.reasoning && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      background: 'rgba(255,255,255,0.55)',
                      borderRadius: 8,
                      fontSize: 11,
                      color: '#334155',
                      lineHeight: 1.55,
                      border: '1px solid rgba(0,0,0,0.04)',
                    }}
                  >
                    {ai.reasoning}
                  </div>
                )}

                {ai.sources.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>출처</div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10, color: '#475569', lineHeight: 1.6 }}>
                      {ai.sources.slice(0, 5).map((u, i) => (
                        <li key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <a href={u} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8' }}>
                            {u}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {onApply && ai.suggestedValue !== null && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={applyAiSuggestion}
                      disabled={applying}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: 12,
                        fontWeight: 800,
                        borderRadius: 10,
                        border: '1px solid rgba(139,92,246,0.40)',
                        background: applying
                          ? 'rgba(139,92,246,0.10)'
                          : 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(109,40,217,0.16))',
                        color: '#4c1d95',
                        cursor: applying ? 'wait' : 'pointer',
                      }}
                      title="현재 기준값을 AI 추천값으로 한 번에 교체하고 변경 이력에 근거를 자동 기록"
                    >
                      {applying ? '반영 중…' : `✨ 이 추천값으로 한 번에 반영`}
                    </button>
                  </div>
                )}
                {!onApply && (
                  <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
                    * 이 탭은 아직 한 클릭 반영이 연결되지 않았습니다. (우선 참고용)
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── 변경 이력 ── */}
          <section style={{ ...panelStyle, marginTop: 12 }}>
            <div style={sectionLabel}>🕓 변경 이력</div>
            {loading ? (
              <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>불러오는 중…</div>
            ) : changes.length === 0 ? (
              <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                기록된 변경 이력이 아직 없습니다. 이 기준값을 한 번 저장하면 이곳에 자동 누적됩니다.
              </div>
            ) : (
              <ul style={{ marginTop: 10, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {changes.map((c) => {
                  const { a, b } = formatDelta(c.old_value, c.new_value)
                  return (
                    <li key={c.id} style={changeRowStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>
                          {prettyField(c.field, c.table_name)}
                        </span>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{formatDateTime(c.changed_at)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={pillOld}>{a}</span>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>→</span>
                        <span style={pillNew}>{b}</span>
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: '#64748b' }}>
                          👤 {c.user_name || c.user_email || (c.user_id ? c.user_id.slice(0, 8) : '시스템')}
                        </span>
                        {c.reason && (
                          <span style={{ fontSize: 10, color: '#475569', fontStyle: 'italic', textAlign: 'right' }}>
                            "{c.reason}"
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Footer hint */}
          <div style={{ marginTop: 16, fontSize: 10, color: '#94a3b8', lineHeight: 1.6, textAlign: 'center' }}>
            AI 추천 반영 시 변경 이력이 자동 기록됩니다.
          </div>
        </div>
      </div>
    </>
  )
}

// ============ styles ============
const panelStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: 14,
  padding: 14,
  boxShadow: '6px 6px 14px rgba(140,170,210,0.10), -4px -4px 10px rgba(255,255,255,0.45)',
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.3,
  color: '#475569',
  textTransform: 'uppercase',
}

const changeRowStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: 'rgba(255,255,255,0.72)',
  border: '1px solid rgba(0,0,0,0.05)',
}

const pillOld: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 6,
  fontSize: 11,
  fontFamily: 'monospace',
  background: 'rgba(244,63,94,0.08)',
  color: '#9f1239',
  border: '1px solid rgba(244,63,94,0.18)',
  maxWidth: 180,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const pillNew: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 6,
  fontSize: 11,
  fontFamily: 'monospace',
  background: 'rgba(34,197,94,0.10)',
  color: '#14532d',
  border: '1px solid rgba(34,197,94,0.22)',
  maxWidth: 180,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

function chipStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    background: bg,
    color,
  }
}
