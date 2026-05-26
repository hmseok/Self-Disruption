'use client'
// ═══════════════════════════════════════════════════════════════════
// CX KPI — 통합 설정 탭 — KPI-DESIGN.md §5-3
//   흩어져 있던 KPI 설정성 항목을 한 화면 5섹션으로 통합:
//     ① 목표치          — kpi/targets             (KpiTargets 컴포넌트 그대로 렌더)
//     ② WFM 산정 기준   — kpi/wfm-config          (Erlang C 입력 폼)
//     ③ 평가 항목·가중치 — kpi/eval-weights        (지표별 사용·가중치 편집)
//     ④ 근태 기준        — kpi/attendance-config   (지각·조퇴 유예시간)
//     ⑤ 날씨 기준        — kpi/weather/*           (W-1d: 권역·보정율 + OpenWeather)
//   ※ 상담원 매칭(KT·Cafe24)은 「설정 › 워커」로 이동 (WHR-B 2026-05-24)
//   각 섹션은 접이식. 저장 결과 = 글래스 패널 메시지 (CLAUDE.md 규칙 20).
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import KpiTargets from './KpiTargets'
import WeatherConfigSection from './WeatherConfigSection'

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
  const [openAttendance, setOpenAttendance] = useState(true)
  const [openWeather, setOpenWeather] = useState(true)

  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
        CX KPI 의 설정성 항목을 한 곳에 모았습니다 — 목표치 · WFM 산정 기준 · 평가 항목/가중치 · 근태 기준 · 날씨 기준.
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
        <div style={{
          height: 1, background: COLORS.borderSubtle, margin: '20px 0 4px',
        }} />
        <CustomItemsManager />
      </Section>

      {/* ── ④ 근태 기준 ──────────────────────────────────────── */}
      <Section
        emoji="🕐" title="근태 기준"
        desc="지각·조퇴 판정 유예시간 — 정시 ±N분 이내는 정상 처리"
        open={openAttendance} onToggle={() => setOpenAttendance(o => !o)}>
        <AttendanceConfigSection />
      </Section>

      {/* ── ⑤ 날씨 기준 (W-1d) ────────────────────────────────── */}
      <Section
        emoji="⛅" title="날씨 기준"
        desc="권역별 날씨 → 인입량 보정율 — WFM Erlang C λ 가산 (W-2 알림 단계)"
        open={openWeather} onToggle={() => setOpenWeather(o => !o)}>
        <WeatherConfigSection />
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
// ③-b 커스텀 평가 항목 — kpi/eval-items (cs_kpi_eval_items)
//   매니저가 직접 만드는 평가 항목(예: 친절도·모니터링 점수).
//   계산지표(EvalWeightsSection)와 별개 — 평가 탭에서 상담원별 점수 입력.
// ════════════════════════════════════════════════════════════════
interface EvalItem {
  id: string
  name: string
  description: string | null
  max_score: number
  weight: number
  sort_order: number
  is_active: number
}
// 추가/수정 폼 입력값
interface ItemDraft {
  id: string | null
  name: string
  description: string
  max_score: number
  weight: number
}
const emptyDraft: ItemDraft = { id: null, name: '', description: '', max_score: 100, weight: 0 }

function CustomItemsManager() {
  const [items, setItems] = useState<EvalItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [migrationPending, setMigrationPending] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)
  // 폼 — null 이면 닫힘, 값 있으면 추가/수정 패널 열림
  const [draft, setDraft] = useState<ItemDraft | null>(null)
  // 삭제 인라인 확인 — 대상 item id ('' = 없음)
  const [confirmDelId, setConfirmDelId] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/eval-items', { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      const list: EvalItem[] = Array.isArray(json?.data?.items) ? json.data.items : []
      setItems(list.map(it => ({
        id: String(it.id),
        name: String(it.name || ''),
        description: it.description ?? null,
        max_score: Number(it.max_score) || 0,
        weight: Number(it.weight) || 0,
        sort_order: Number(it.sort_order) || 0,
        is_active: Number(it.is_active) ? 1 : 0,
      })))
      setMigrationPending(!!json?.data?._migration_pending)
    } catch (e: any) {
      setResult({ ok: false, text: '❌ 커스텀 평가 항목 조회 실패', detail: e?.message, at: nowLabel() })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── 항목 저장 (생성/수정 공용) — id 있으면 수정, 없으면 생성 ──
  const saveItem = async (payload: {
    id?: string; name: string; description?: string
    max_score?: number; weight?: number; sort_order?: number; is_active?: number
  }) => {
    setSaving(true); setResult(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/eval-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      setResult({
        ok: true,
        text: payload.id ? '🏅 평가 항목 수정 완료' : '🏅 평가 항목 추가 완료',
        detail: `「${payload.name}」 — 평가 탭의 커스텀 점수 입력에 반영됩니다.`,
        at: nowLabel(),
      })
      setDraft(null)
      await load()
    } catch (e: any) {
      setResult({
        ok: false, text: '❌ 평가 항목 저장 실패',
        detail: (e?.message || '') +
          (migrationPending ? ' — 마이그레이션(cs_kpi_eval_items) 미적용으로 보입니다.' : ''),
        at: nowLabel(),
      })
    } finally {
      setSaving(false)
    }
  }

  // ── 사용 여부 토글 — 행 체크박스 (즉시 저장) ──
  const toggleActive = (it: EvalItem) => {
    saveItem({
      id: it.id, name: it.name, description: it.description ?? '',
      max_score: it.max_score, weight: it.weight, sort_order: it.sort_order,
      is_active: it.is_active ? 0 : 1,
    })
  }

  // ── 삭제 — 인라인 확인 후 DELETE ──
  const deleteItem = async (id: string) => {
    setSaving(true); setResult(null); setConfirmDelId('')
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/kpi/eval-items?id=${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: auth,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '삭제 실패')
      setResult({
        ok: true, text: '🗑 평가 항목 삭제 완료',
        detail: json?.data?.deleted
          ? '항목과 입력된 점수가 함께 제거되었습니다.'
          : '이미 삭제된 항목입니다.',
        at: nowLabel(),
      })
      await load()
    } catch (e: any) {
      setResult({ ok: false, text: '❌ 평가 항목 삭제 실패', detail: e?.message, at: nowLabel() })
    } finally {
      setSaving(false)
    }
  }

  if (loading && items.length === 0) {
    return <div style={{ fontSize: 12, color: COLORS.textMuted }}>조회 중...</div>
  }

  return (
    <div>
      <div style={{
        fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 4,
      }}>
        ✏ 커스텀 평가 항목
      </div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
        친절도·모니터링 점수 등 매니저가 직접 만드는 평가 항목입니다 — 위 계산 지표와 별개로,
        평가 탭에서 상담원별 점수를 입력하면 종합점수에 가중 반영됩니다.
      </div>

      {migrationPending && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning,
        }}>
          ⚠ cs_kpi_eval_items 테이블이 아직 적용되지 않은 것으로 보입니다 —
          마이그레이션 적용 전에는 추가·수정·삭제가 반영되지 않습니다.
        </div>
      )}

      <ResultPanel result={result} onClose={() => setResult(null)} />

      {/* ── 항목 목록 ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 && (
          <div style={{
            ...GLASS.L1, borderRadius: 8, padding: '12px',
            fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
          }}>
            등록된 커스텀 평가 항목이 없습니다 — 「+ 항목 추가」로 만드세요.
          </div>
        )}
        {items.map((it) => {
          const confirming = confirmDelId === it.id
          return (
            <div key={it.id} style={{
              ...GLASS.L1, borderRadius: 8, padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              opacity: it.is_active ? 1 : 0.55,
            }}>
              {/* 사용 여부 + 이름 + 설명 */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                minWidth: 200,
              }}>
                <input type="checkbox" checked={!!it.is_active}
                  onChange={() => toggleActive(it)} disabled={saving}
                  style={{ width: 15, height: 15, cursor: 'pointer' }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
                  {it.name}
                </span>
              </label>
              <span style={{
                flex: 1, minWidth: 120, fontSize: 11, color: COLORS.textMuted,
                fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {it.description || '— 설명 없음'}
              </span>
              {/* 만점 / 가중치 */}
              <span style={{
                fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, whiteSpace: 'nowrap',
              }}>
                만점 {it.max_score}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, color: COLORS.primary, whiteSpace: 'nowrap',
              }}>
                가중치 {it.weight}%
              </span>
              {/* 액션 — 수정 / 삭제 (삭제는 인라인 확인) */}
              {!confirming ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" disabled={saving}
                    onClick={() => setDraft({
                      id: it.id, name: it.name, description: it.description ?? '',
                      max_score: it.max_score, weight: it.weight,
                    })}
                    style={{
                      ...BTN.sm, background: 'transparent', color: COLORS.primary,
                      border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}>
                    수정
                  </button>
                  <button type="button" disabled={saving}
                    onClick={() => setConfirmDelId(it.id)}
                    style={{
                      ...BTN.sm, background: 'transparent', color: COLORS.danger,
                      border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}>
                    삭제
                  </button>
                </div>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
                  borderRadius: 8, padding: '4px 8px',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.danger }}>
                    「{it.name}」 삭제할까요?
                  </span>
                  <button type="button" disabled={saving}
                    onClick={() => deleteItem(it.id)}
                    style={{
                      ...BTN.sm, background: COLORS.danger, color: '#fff', border: 'none',
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                    삭제
                  </button>
                  <button type="button" disabled={saving}
                    onClick={() => setConfirmDelId('')}
                    style={{
                      ...BTN.sm, background: 'transparent', color: COLORS.textSecondary,
                      border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}>
                    취소
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── 추가/수정 폼 ──────────────────────────────────────── */}
      {draft ? (
        <ItemForm
          draft={draft} saving={saving}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSubmit={() => {
            const name = draft.name.trim()
            if (!name) {
              setResult({ ok: false, text: '❌ 항목 이름을 입력하세요', at: nowLabel() })
              return
            }
            saveItem({
              ...(draft.id ? { id: draft.id } : {}),
              name,
              description: draft.description.trim(),
              max_score: draft.max_score,
              weight: draft.weight,
            })
          }}
        />
      ) : (
        <div style={{ marginTop: 12 }}>
          <button type="button" disabled={saving || loading}
            onClick={() => setDraft({ ...emptyDraft })}
            style={{
              ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
              cursor: (saving || loading) ? 'not-allowed' : 'pointer',
              opacity: (saving || loading) ? 0.6 : 1,
            }}>
            + 항목 추가
          </button>
        </div>
      )}
    </div>
  )
}

// ── 커스텀 항목 추가/수정 폼 (글래스 패널) ────────────────────────
function ItemForm({ draft, saving, onChange, onCancel, onSubmit }: {
  draft: ItemDraft; saving: boolean
  onChange: (d: ItemDraft) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div style={{
      ...GLASS.L3, background: COLORS.bgBlue,
      border: `1px solid ${COLORS.borderBlue}`,
      borderRadius: 10, padding: 14, marginTop: 12,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 10,
      }}>
        {draft.id ? '✏ 평가 항목 수정' : '＋ 새 평가 항목'}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
            항목 이름 *
          </div>
          <input type="text" value={draft.name} maxLength={60}
            placeholder="예: 친절도"
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            style={{
              ...GLASS.L1, width: '100%', boxSizing: 'border-box',
              padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              color: COLORS.textPrimary, fontFamily: 'inherit',
            }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
            설명
          </div>
          <input type="text" value={draft.description} maxLength={200}
            placeholder="예: 모니터링 청취 평가"
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
            style={{
              ...GLASS.L1, width: '100%', boxSizing: 'border-box',
              padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              color: COLORS.textPrimary, fontFamily: 'inherit',
            }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
            만점
          </div>
          <input type="number" value={draft.max_score} min={1} max={10000}
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange({ ...draft, max_score: Number.isFinite(n) && n > 0 ? n : draft.max_score })
            }}
            style={{
              ...GLASS.L1, width: '100%', boxSizing: 'border-box',
              padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              color: COLORS.textPrimary, fontFamily: 'inherit', textAlign: 'right',
            }} />
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>기본 100</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
            가중치 (%)
          </div>
          <input type="number" value={draft.weight} min={0} max={1000}
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange({ ...draft, weight: Number.isFinite(n) && n >= 0 ? n : 0 })
            }}
            style={{
              ...GLASS.L1, width: '100%', boxSizing: 'border-box',
              padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              color: COLORS.textPrimary, fontFamily: 'inherit', textAlign: 'right',
            }} />
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>
            종합점수 반영 비율
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button type="button" onClick={onCancel} disabled={saving}
          style={{
            ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
            border: `1px solid ${COLORS.borderFaint}`,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>
          취소
        </button>
        <button type="button" onClick={onSubmit} disabled={saving}
          style={{
            ...BTN.md, background: COLORS.success, color: '#fff', border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}>
          {saving ? '저장 중...' : (draft.id ? '✓ 수정 저장' : '✓ 항목 추가')}
        </button>
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════
// ④ 근태 기준 — kpi/attendance-config
//   지각·조퇴 판정 유예시간(grace) — 정시 ±N분 이내는 정상.
// ════════════════════════════════════════════════════════════════
function AttendanceConfigSection() {
  const [grace, setGrace] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [migrationPending, setMigrationPending] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/attendance-config', { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      setGrace(Number(json?.data?.grace_minutes) || 0)
      setMigrationPending(!!json?.data?._migration_pending)
    } catch (e: any) {
      setResult({ ok: false, text: '❌ 근태 기준 조회 실패', detail: e?.message, at: nowLabel() })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true); setResult(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/attendance-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ grace_minutes: grace }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      const saved = Number(json?.data?.grace_minutes) || 0
      setGrace(saved)
      setResult({
        ok: true, text: '🕐 근태 기준 저장 완료',
        detail: `유예시간 ${saved}분 — 「🕐 근태」 탭 지각·조퇴 판정에 반영됩니다.`,
        at: nowLabel(),
      })
    } catch (e: any) {
      setResult({
        ok: false, text: '❌ 근태 기준 저장 실패',
        detail: (e?.message || '') +
          (migrationPending ? ' — 마이그레이션(cs_kpi_attendance_config) 미적용으로 보입니다.' : ''),
        at: nowLabel(),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
        지각·조퇴 판정 시 정시 ±유예시간 이내는 정상으로 처리합니다. 0분이면 정시 엄격 기준
        (1분만 늦어도 지각). {loading ? ' · 조회 중...' : ''}
      </div>

      {migrationPending && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning,
        }}>
          ⚠ cs_kpi_attendance_config 테이블이 아직 적용되지 않은 것으로 보입니다 —
          마이그레이션 적용 전에는 저장이 반영되지 않습니다 (현재 0분으로 판정).
        </div>
      )}

      <ResultPanel result={result} onClose={() => setResult(null)} />

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 140 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
            유예시간 (분)
          </div>
          <input type="number" min={0} max={120} value={grace}
            onChange={(e) => {
              const n = Number(e.target.value)
              setGrace(Number.isFinite(n) && n >= 0 ? Math.min(120, Math.round(n)) : 0)
            }}
            style={{
              ...GLASS.L1, width: 120, boxSizing: 'border-box',
              padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              color: COLORS.textPrimary, fontFamily: 'inherit',
            }} />
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>
            0~120분 · 기본 0분
          </div>
        </div>
        <button type="button" onClick={save} disabled={saving}
          style={{
            ...BTN.md, background: COLORS.success, color: '#fff', border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}>
          {saving ? '저장 중...' : '✓ 근태 기준 저장'}
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
