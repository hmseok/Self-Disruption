'use client'
// ═══════════════════════════════════════════════════════════════════
// CX KPI — 통합 설정 탭 — KPI-DESIGN.md §5-3
//   흩어져 있던 KPI 설정성 항목을 한 화면 4섹션으로 통합:
//     ① 목표치          — kpi/targets        (KpiTargets 컴포넌트 그대로 렌더)
//     ② WFM 산정 기준   — kpi/wfm-config     (Erlang C 입력 폼)
//     ③ 평가 항목·가중치 — kpi/eval-weights   (지표별 사용·가중치 편집)
//     ④ 상담원 매칭      — kpi/agent-mapping  (KT ID ↔ 콜센터 워커 연결)
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
  const [openMapping, setOpenMapping] = useState(true)

  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
        CX KPI 의 설정성 항목을 한 곳에 모았습니다 — 목표치 · WFM 산정 기준 · 평가 항목/가중치 · 상담원 매칭.
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

      {/* ── ④ 상담원 매칭 ────────────────────────────────────── */}
      <Section
        emoji="🔗" title="상담원 매칭"
        desc="KT 엑셀의 상담사 ID ↔ 콜센터 워커 연결 — 동명이인·표기차 깨짐 방지"
        open={openMapping} onToggle={() => setOpenMapping(o => !o)}>
        <AgentMappingSection />
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

// ════════════════════════════════════════════════════════════════
// ④ 상담원 매칭 — kpi/agent-mapping
//   KT 상담사 ID(agent_kt_id) ↔ 콜센터 워커(cs_workers) 직접 연결.
//   워커별 KT ID 드롭다운 + 이름 일치 자동 추천 + 미매칭 강조.
// ════════════════════════════════════════════════════════════════
interface KtAgent {
  kt_id: string
  agent_name: string
  call_rows: number
  prod_rows: number
  total_rows: number
  active: boolean
}
interface MappingWorker {
  id: string
  name: string
  kt_id: string | null
}

function AgentMappingSection() {
  const [ktAgents, setKtAgents] = useState<KtAgent[]>([])
  const [workers, setWorkers] = useState<MappingWorker[]>([])
  // 편집 중 매핑 — worker_id → kt_id ('' = 매칭 해제)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/agent-mapping', { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      const d = json?.data || {}
      const agents: KtAgent[] = Array.isArray(d.kt_agents) ? d.kt_agents : []
      const wks: MappingWorker[] = Array.isArray(d.workers) ? d.workers : []
      setKtAgents(agents)
      setWorkers(wks)
      // draft 초기화 — 현재 저장된 kt_id 로
      const init: Record<string, string> = {}
      for (const w of wks) init[w.id] = w.kt_id || ''
      setDraft(init)
    } catch (e: any) {
      setResult({ ok: false, text: '❌ 상담원 매칭 조회 실패', detail: e?.message, at: nowLabel() })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── 자동 추천: 워커 이름 == agent_name 이고 데이터 최다 활성 ID ──
  const recommendFor = useCallback((workerName: string): KtAgent | null => {
    const name = (workerName || '').trim()
    if (!name) return null
    const cands = ktAgents.filter(a => (a.agent_name || '').trim() === name)
    if (cands.length === 0) return null
    // 활성 우선 → 데이터(total_rows) 최다
    const sorted = [...cands].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      return b.total_rows - a.total_rows
    })
    return sorted[0] || null
  }, [ktAgents])

  // 한 워커에 KT ID 배정 — 같은 kt_id 쓰던 다른 워커는 화면에서도 비움
  const assign = (workerId: string, ktId: string) => {
    setDraft(prev => {
      const next = { ...prev }
      if (ktId) {
        for (const wid of Object.keys(next)) {
          if (wid !== workerId && next[wid] === ktId) next[wid] = ''
        }
      }
      next[workerId] = ktId
      return next
    })
  }

  // 전체 자동 매칭 — 이름 일치 + 활성 ID 일괄 적용 (중복 시 데이터 최다 우선)
  const autoMatchAll = () => {
    const next: Record<string, string> = {}
    for (const w of workers) next[w.id] = draft[w.id] || ''
    // kt_id → 가장 적합한 worker 후보 수집 후 충돌 해소
    const claims: { workerId: string; agent: KtAgent }[] = []
    for (const w of workers) {
      const rec = recommendFor(w.name)
      if (rec) claims.push({ workerId: w.id, agent: rec })
    }
    // 같은 kt_id 를 여러 워커가 추천받으면 데이터 최다 행이 차지 (1:1 보장)
    const byKt = new Map<string, { workerId: string; rows: number }>()
    for (const c of claims) {
      const cur = byKt.get(c.agent.kt_id)
      if (!cur || c.agent.total_rows > cur.rows) {
        byKt.set(c.agent.kt_id, { workerId: c.workerId, rows: c.agent.total_rows })
      }
    }
    for (const [ktId, owner] of byKt) next[owner.workerId] = ktId
    setDraft(next)
    setResult({
      ok: true, text: '🔗 전체 자동 매칭 적용',
      detail: `이름 일치 ${byKt.size}건 — 활성 KT ID 를 워커에 임시 배정했습니다. 저장 버튼으로 확정하세요.`,
      at: nowLabel(),
    })
  }

  const save = async () => {
    setSaving(true); setResult(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/agent-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          mappings: workers.map(w => ({ worker_id: w.id, kt_id: draft[w.id] || '' })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      const d = json.data || {}
      const errs: string[] = Array.isArray(d.errors) ? d.errors : []
      setResult({
        ok: errs.length === 0,
        text: errs.length === 0 ? '🔗 상담원 매칭 저장 완료' : '⚠ 상담원 매칭 일부 저장',
        detail: `연결 ${Number(d.updated || 0)}건 · 해제 ${Number(d.cleared || 0)}건` +
          (Number(d.released || 0) > 0 ? ` · 중복 해제 ${Number(d.released)}건` : '') +
          (errs.length > 0 ? ` · 실패 ${errs.length}건 (${errs.slice(0, 3).join(' / ')})` : '') +
          ' — KPI 집계에 이 매칭이 반영됩니다.',
        at: nowLabel(),
      })
      await load()
    } catch (e: any) {
      setResult({ ok: false, text: '❌ 상담원 매칭 저장 실패', detail: e?.message, at: nowLabel() })
    } finally {
      setSaving(false)
    }
  }

  // ── 미매칭 집계 (draft 기준 실시간) ────────────────────────────
  const usedKtIds = new Set(Object.values(draft).filter(Boolean))
  const unmatchedWorkers = workers.filter(w => !draft[w.id])
  const unmatchedKt = ktAgents.filter(a => !usedKtIds.has(a.kt_id))

  if (loading && workers.length === 0 && ktAgents.length === 0) {
    return <div style={{ fontSize: 12, color: COLORS.textMuted }}>조회 중...</div>
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
        KT 엑셀의 상담사 ID 를 콜센터 워커에 직접 연결합니다 — 한 사람당 KT ID 가 여러 개일 수 있어,
        데이터가 있는 활성 ID 를 선택하세요. 이름 매칭은 동명이인·표기차로 깨질 수 있습니다.
      </div>

      <ResultPanel result={result} onClose={() => setResult(null)} />

      {/* 미매칭 요약 + 전체 자동 매칭 */}
      <div style={{
        ...GLASS.L3,
        background: (unmatchedWorkers.length > 0 || unmatchedKt.length > 0)
          ? COLORS.bgRed : COLORS.bgGreen,
        border: `1px solid ${(unmatchedWorkers.length > 0 || unmatchedKt.length > 0)
          ? COLORS.borderRed : COLORS.borderGreen}`,
        borderRadius: 10, padding: '8px 14px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 12, fontWeight: 800,
          color: (unmatchedWorkers.length > 0 || unmatchedKt.length > 0)
            ? COLORS.danger : COLORS.success,
        }}>
          {(unmatchedWorkers.length > 0 || unmatchedKt.length > 0)
            ? `미매칭 ${unmatchedWorkers.length + unmatchedKt.length}건`
            : '모든 워커·KT ID 가 매칭됨'}
        </span>
        <span style={{ fontSize: 11, color: COLORS.textSecondary }}>
          {`워커 미매칭 ${unmatchedWorkers.length}명 · 미사용 KT ID ${unmatchedKt.length}개 · KT 상담사 ${ktAgents.length}명`}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={autoMatchAll} disabled={ktAgents.length === 0}
          style={{
            ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none',
            cursor: ktAgents.length === 0 ? 'not-allowed' : 'pointer',
            opacity: ktAgents.length === 0 ? 0.5 : 1,
          }}>
          ✨ 전체 자동 매칭
        </button>
      </div>

      {ktAgents.length === 0 && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning,
        }}>
          ⚠ KT 상담이력·생산성 데이터가 아직 없습니다 — 엑셀 업로드 후 매칭할 수 있습니다.
        </div>
      )}

      {/* 워커 목록 표 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {workers.length === 0 && (
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            활성 콜센터 워커가 없습니다.
          </div>
        )}
        {workers.map((w) => {
          const cur = draft[w.id] || ''
          const rec = recommendFor(w.name)
          const isRecommended = !!rec && cur === rec.kt_id
          const unmatched = !cur
          const matchedAgent = ktAgents.find(a => a.kt_id === cur)
          return (
            <div key={w.id} style={{
              ...GLASS.L1, borderRadius: 8, padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              border: unmatched ? `1px solid ${COLORS.borderRed}` : undefined,
            }}>
              {/* 워커 이름 */}
              <div style={{
                minWidth: 130, display: 'flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: unmatched ? COLORS.danger : COLORS.success,
                }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
                  {w.name}
                </span>
              </div>

              {/* KT ID 드롭다운 */}
              <select
                value={cur}
                onChange={(e) => assign(w.id, e.target.value)}
                style={{
                  ...GLASS.L1, flex: 1, minWidth: 220, boxSizing: 'border-box',
                  padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  color: cur ? COLORS.textPrimary : COLORS.textMuted,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}>
                <option value="">— 매칭 해제 (KT ID 없음) —</option>
                {ktAgents.map((a) => (
                  <option key={a.kt_id} value={a.kt_id}>
                    {`${a.agent_name || '?'}(${a.kt_id}) · 데이터 ${a.total_rows}건`}
                    {a.active ? ' · 활성' : ''}
                  </option>
                ))}
              </select>

              {/* 추천 배지 / 추천 적용 버튼 */}
              {rec && !isRecommended && (
                <button type="button" onClick={() => assign(w.id, rec.kt_id)}
                  style={{
                    ...BTN.sm, background: 'transparent', color: COLORS.primary,
                    border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}>
                  💡 추천 {rec.kt_id}
                </button>
              )}
              {isRecommended && (
                <span style={{
                  fontSize: 10, fontWeight: 800, color: COLORS.success,
                  background: COLORS.bgGreen, border: `1px solid ${COLORS.borderGreen}`,
                  borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap',
                }}>
                  ✓ 추천 일치
                </span>
              )}

              {/* 매칭 상태 */}
              <span style={{
                fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                color: unmatched ? COLORS.danger : COLORS.textMuted,
              }}>
                {unmatched
                  ? '미매칭'
                  : matchedAgent
                    ? `${matchedAgent.total_rows}건`
                    : 'KT 데이터 없음'}
              </span>
            </div>
          )
        })}
      </div>

      {/* 미사용 KT ID 안내 */}
      {unmatchedKt.length > 0 && (
        <div style={{
          ...GLASS.L1, borderRadius: 8, padding: '8px 12px', marginTop: 10,
          border: `1px solid ${COLORS.borderRed}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.danger, marginBottom: 4 }}>
            어떤 워커에도 안 묶인 KT ID {unmatchedKt.length}개
          </div>
          <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.6 }}>
            {unmatchedKt
              .slice(0, 20)
              .map(a => `${a.agent_name || '?'}(${a.kt_id})·${a.total_rows}건`)
              .join('  /  ')}
            {unmatchedKt.length > 20 && `  …외 ${unmatchedKt.length - 20}개`}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={save} disabled={saving || workers.length === 0}
          style={{
            ...BTN.md, background: COLORS.success, color: '#fff', border: 'none',
            cursor: (saving || workers.length === 0) ? 'not-allowed' : 'pointer',
            opacity: (saving || workers.length === 0) ? 0.6 : 1,
          }}>
          {saving ? '저장 중...' : '✓ 상담원 매칭 저장'}
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
