'use client'
// ═══════════════════════════════════════════════════════════════════
// CX KPI — 통합 설정 탭 — KPI-DESIGN.md §5-3
//   흩어져 있던 KPI 설정성 항목을 한 화면 3섹션으로 통합:
//     ① 목표치          — kpi/targets        (KpiTargets 컴포넌트 그대로 렌더)
//     ② WFM 산정 기준   — kpi/wfm-config     (Erlang C 입력 폼)
//     ③ 평가 항목·가중치 — kpi/eval-weights   (지표별 사용·가중치 편집)
//   각 섹션은 접이식. 저장 결과 = 글래스 패널 메시지 (CLAUDE.md 규칙 20).
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import KpiTargets from './KpiTargets'

// ── WFM 산정 기준 ──────────────────────────────────────────────
interface WfmConfig {
  id: string | null
  target_service_level_pct: number
  target_answer_sec: number
  shrinkage_pct: number
  interval_minutes: number
  max_occupancy_pct: number
  updated_at?: string | null
}

// ── 평가 항목·가중치 ───────────────────────────────────────────
interface WeightRow {
  metric: string
  label: string
  enabled: number
  weight: number
  sort_order: number
}

// 저장 결과 글래스 패널 데이터
interface SaveResult {
  ok: boolean
  text: string
  detail?: string
  at: string
}
const nowLabel = () =>
  new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

export default function KpiSettings() {
  // 섹션 접이식 상태 — 기본 전부 펼침
  const [openTargets, setOpenTargets] = useState(true)
  const [openWfm, setOpenWfm] = useState(true)
  const [openWeights, setOpenWeights] = useState(true)

  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
        CX KPI 의 설정성 항목을 한 곳에 모았습니다 — 목표치 · WFM 산정 기준 · 평가 항목/가중치.
      </div>

      {/* ── ① 목표치 ─────────────────────────────────────────── */}
      <Section
        emoji="🎯" title="목표치"
        desc="팀·상담원별 월간 KPI 목표 — 대시보드 달성률의 기준"
        open={openTargets} onToggle={() => setOpenTargets(o => !o)}>
        <KpiTargets />
      </Section>

      {/* ── ② WFM 산정 기준 ──────────────────────────────────── */}
      <Section
        emoji="🧮" title="WFM 산정 기준"
        desc="Erlang C 필요인원 산정 기준 — 목표 응대율·응대시간·부재율·인터벌·점유율"
        open={openWfm} onToggle={() => setOpenWfm(o => !o)}>
        <WfmConfigSection />
      </Section>

      {/* ── ③ 평가 항목·가중치 ───────────────────────────────── */}
      <Section
        emoji="🏅" title="평가 항목·가중치"
        desc="상담원 종합점수의 평가 지표 사용여부·가중치 — 평가 탭에 반영"
        open={openWeights} onToggle={() => setOpenWeights(o => !o)}>
        <EvalWeightsSection />
      </Section>
    </div>
  )
}

// ── 접이식 섹션 래퍼 ───────────────────────────────────────────
function Section({ emoji, title, desc, open, onToggle, children }: {
  emoji: string; title: string; desc: string
  open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, marginBottom: 14,
      border: `1px solid ${COLORS.borderSubtle}`, overflow: 'hidden',
    }}>
      <button type="button" onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', cursor: 'pointer', textAlign: 'left',
          background: open ? COLORS.bgBlue : 'transparent',
          border: 'none', borderBottom: open ? `1px solid ${COLORS.borderBlue}` : 'none',
        }}>
        <span style={{ fontSize: 15 }}>{emoji}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600 }}>
          {desc}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 800 }}>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div style={{ padding: 16 }}>{children}</div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ② WFM 산정 기준 — kpi/wfm-config 폼 (KpiStaffing 인라인 패널 이식)
// ════════════════════════════════════════════════════════════════
function WfmConfigSection() {
  const [cfg, setCfg] = useState<WfmConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/wfm-config', { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      setCfg(json.data)
    } catch (e: any) {
      setResult({ ok: false, text: '❌ 산정 기준 조회 실패', detail: e?.message, at: nowLabel() })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!cfg) return
    setSaving(true); setResult(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/wfm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          target_service_level_pct: cfg.target_service_level_pct,
          target_answer_sec: cfg.target_answer_sec,
          shrinkage_pct: cfg.shrinkage_pct,
          interval_minutes: cfg.interval_minutes,
          max_occupancy_pct: cfg.max_occupancy_pct,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      setCfg(json.data)
      setResult({
        ok: true, text: '🧮 WFM 산정 기준 저장 완료',
        detail: '필요인원(WFM) 탭에서 이 기준으로 재계산됩니다.', at: nowLabel(),
      })
    } catch (e: any) {
      setResult({ ok: false, text: '❌ WFM 산정 기준 저장 실패', detail: e?.message, at: nowLabel() })
    } finally {
      setSaving(false)
    }
  }

  if (loading && !cfg) {
    return <div style={{ fontSize: 12, color: COLORS.textMuted }}>조회 중...</div>
  }
  if (!cfg) {
    return <div style={{ fontSize: 12, color: COLORS.textMuted }}>산정 기준을 불러오지 못했습니다.</div>
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
        목표 응대율·응대시간·부재율·점유율 — 저장 시 시간대별 필요인원이 재계산됩니다.
      </div>

      <ResultPanel result={result} onClose={() => setResult(null)} />

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10,
      }}>
        <CfgField label="목표 응대율 (%)" hint="예: 80 → 80%"
          value={cfg.target_service_level_pct} min={1} max={100}
          onChange={(v) => setCfg({ ...cfg, target_service_level_pct: v })} />
        <CfgField label="목표 응대시간 (초)" hint="예: 20 → 20초 내"
          value={cfg.target_answer_sec} min={1} max={600}
          onChange={(v) => setCfg({ ...cfg, target_answer_sec: v })} />
        <CfgField label="부재율 (%)" hint="휴식·후처리·교육"
          value={cfg.shrinkage_pct} min={0} max={90}
          onChange={(v) => setCfg({ ...cfg, shrinkage_pct: v })} />
        <CfgField label="최대 점유율 (%)" hint="상한 가드"
          value={cfg.max_occupancy_pct} min={1} max={100}
          onChange={(v) => setCfg({ ...cfg, max_occupancy_pct: v })} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
            산정 단위
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[30, 60].map((iv) => {
              const active = cfg.interval_minutes === iv
              return (
                <button key={iv} type="button"
                  onClick={() => setCfg({ ...cfg, interval_minutes: iv })}
                  style={{
                    flex: 1, padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                    fontSize: 12, fontWeight: 700,
                    background: active ? COLORS.primary : 'transparent',
                    color: active ? '#fff' : COLORS.textSecondary,
                    border: `1px solid ${active ? COLORS.primary : COLORS.borderFaint}`,
                  }}>
                  {iv}분
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>
            30분 또는 60분
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={save} disabled={saving}
          style={{
            ...BTN.md, background: COLORS.success, color: '#fff', border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}>
          {saving ? '저장 중...' : '✓ 산정 기준 저장 & 재계산'}
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ③ 평가 항목·가중치 — kpi/eval-weights
// ════════════════════════════════════════════════════════════════
function EvalWeightsSection() {
  const [rows, setRows] = useState<WeightRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [migrationPending, setMigrationPending] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/eval-weights', { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      setRows(((json?.data?.weights ?? []) as WeightRow[]).map(w => ({
        metric: String(w.metric),
        label: String(w.label || w.metric),
        enabled: Number(w.enabled) ? 1 : 0,
        weight: Number(w.weight) || 0,
        sort_order: Number(w.sort_order) || 0,
      })))
      setMigrationPending(!!json?.data?._migration_pending)
    } catch (e: any) {
      setResult({ ok: false, text: '❌ 평가 항목 조회 실패', detail: e?.message, at: nowLabel() })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const setRow = (metric: string, patch: Partial<WeightRow>) => {
    setRows(rs => rs.map(r => (r.metric === metric ? { ...r, ...patch } : r)))
  }

  // enabled 항목 가중치 합
  const enabledSum = rows
    .filter(r => r.enabled)
    .reduce((s, r) => s + (Number(r.weight) || 0), 0)
  const sumOk = enabledSum === 100
  const anyEnabled = rows.some(r => r.enabled)

  const save = async () => {
    setSaving(true); setResult(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/eval-weights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          weights: rows.map(r => ({
            metric: r.metric, enabled: r.enabled, weight: r.weight,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      const d = json.data || {}
      const errs: string[] = Array.isArray(d.errors) ? d.errors : []
      if (errs.length > 0 && Number(d.updated || 0) === 0) {
        setResult({
          ok: false, text: '❌ 평가 항목 저장 실패',
          detail: errs.slice(0, 4).join(' / ') +
            (migrationPending ? ' — 마이그레이션(cs_kpi_eval_weights) 미적용으로 보입니다.' : ''),
          at: nowLabel(),
        })
      } else {
        setResult({
          ok: true, text: '🏅 평가 항목·가중치 저장 완료',
          detail: `갱신 ${Number(d.updated || 0)}건` +
            (errs.length > 0 ? ` · 일부 제외 ${errs.length}건` : '') +
            ' — 평가 탭에 반영됩니다.',
          at: nowLabel(),
        })
      }
      await load()
    } catch (e: any) {
      setResult({ ok: false, text: '❌ 평가 항목 저장 실패', detail: e?.message, at: nowLabel() })
    } finally {
      setSaving(false)
    }
  }

  if (loading && rows.length === 0) {
    return <div style={{ fontSize: 12, color: COLORS.textMuted }}>조회 중...</div>
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
        평가 탭 종합점수에 쓰이는 지표를 선택하고 가중치(%)를 정합니다.
        가중치 합 100 을 권장하나, 100 이 아니어도 저장됩니다 (평가 시 비례 정규화).
      </div>

      {migrationPending && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning,
        }}>
          ⚠ cs_kpi_eval_weights 테이블이 아직 적용되지 않은 것으로 보입니다 —
          현재는 기본값을 표시합니다. 마이그레이션 적용 전에는 저장이 반영되지 않습니다.
        </div>
      )}

      <ResultPanel result={result} onClose={() => setResult(null)} />

      {/* 지표별 행 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => (
          <div key={r.metric} style={{
            ...GLASS.L1, borderRadius: 8, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            opacity: r.enabled ? 1 : 0.55,
          }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              minWidth: 160,
            }}>
              <input type="checkbox" checked={!!r.enabled}
                onChange={(e) => setRow(r.metric, { enabled: e.target.checked ? 1 : 0 })}
                style={{ width: 15, height: 15, cursor: 'pointer' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
                {r.label}
              </span>
              <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600 }}>
                {r.metric}
              </span>
            </label>
            <span style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary }}>
                가중치
              </span>
              <input type="number" min={0} max={1000}
                value={r.weight}
                disabled={!r.enabled}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setRow(r.metric, { weight: Number.isFinite(n) && n >= 0 ? n : 0 })
                }}
                style={{
                  ...GLASS.L1, width: 78, boxSizing: 'border-box',
                  padding: '5px 8px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                  color: COLORS.textPrimary, fontFamily: 'inherit', textAlign: 'right',
                  cursor: r.enabled ? 'text' : 'not-allowed',
                }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted }}>%</span>
            </div>
          </div>
        ))}
      </div>

      {/* 가중치 합 안내 */}
      <div style={{
        ...GLASS.L3,
        background: sumOk ? COLORS.bgGreen : COLORS.bgAmber,
        border: `1px solid ${sumOk ? COLORS.borderGreen : COLORS.borderAmber}`,
        borderRadius: 10, padding: '8px 14px', marginTop: 10,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 12, fontWeight: 800,
          color: sumOk ? COLORS.success : COLORS.warning,
        }}>
          사용 항목 가중치 합 {enabledSum}%
        </span>
        <span style={{ fontSize: 11, color: COLORS.textSecondary }}>
          {!anyEnabled
            ? '사용 항목이 없습니다 — 최소 1개 지표를 선택하세요.'
            : sumOk
              ? '권장 값(100%)과 일치합니다.'
              : '100% 가 아니어도 저장됩니다 — 평가 시 가중치 합 기준으로 비례 정규화됩니다.'}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={save} disabled={saving || !anyEnabled}
          style={{
            ...BTN.md, background: COLORS.success, color: '#fff', border: 'none',
            cursor: (saving || !anyEnabled) ? 'not-allowed' : 'pointer',
            opacity: (saving || !anyEnabled) ? 0.6 : 1,
          }}>
          {saving ? '저장 중...' : '✓ 평가 항목 저장'}
        </button>
      </div>
    </div>
  )
}

// ── 저장 결과 글래스 패널 (규칙 20 — alert 금지) ──────────────────
function ResultPanel({ result, onClose }: {
  result: SaveResult | null; onClose: () => void
}) {
  if (!result) return null
  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 12,
      border: `1px solid ${result.ok ? COLORS.borderGreen : COLORS.borderRed}`,
      background: result.ok ? COLORS.bgGreen : COLORS.bgRed,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 13, fontWeight: 800,
          color: result.ok ? COLORS.success : COLORS.danger,
        }}>
          {result.text}
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginLeft: 6 }}>
            {result.at}
          </span>
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 13, color: COLORS.textMuted, fontWeight: 700,
          }}>× 닫기</button>
      </div>
      {result.detail && (
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 6 }}>
          {result.detail}
        </div>
      )}
    </div>
  )
}

// ── 산정 기준 입력 필드 (KpiStaffing 의 CfgField 이식) ─────────────
function CfgField({ label, hint, value, min, max, onChange }: {
  label: string; hint: string; value: number
  min: number; max: number; onChange: (v: number) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
        {label}
      </div>
      <input type="number" value={value} min={min} max={max}
        onChange={(e) => {
          const n = Number(e.target.value)
          onChange(Number.isFinite(n) ? n : value)
        }}
        style={{
          ...GLASS.L1, width: '100%', boxSizing: 'border-box',
          padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
          color: COLORS.textPrimary, fontFamily: 'inherit',
        }} />
      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>{hint}</div>
    </div>
  )
}
