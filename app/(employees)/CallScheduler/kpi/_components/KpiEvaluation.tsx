'use client'
// ═══════════════════════════════════════════════════════════════════
// CX KPI 종합 평가 — KPI-DESIGN.md §5 (평가 탭)
//   · 일/주/월 토글 + 날짜 선택 (KpiDashboard 동일 UX)
//   · DcStatStrip — 팀 평균 점수·평가 인원·최고/최저 점수
//   · NeuDataTable 상담원별 — 순위·종합점수·지표별 점수·강점·약점
//     전 컬럼 sortBy (CLAUDE.md 규칙 18), 기본 정렬 종합점수 desc
//   데이터: GET /api/call-scheduler/kpi/evaluation
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import KpiPeriodPicker, { type KpiPeriod, periodQuery } from './KpiPeriodPicker'

type Granularity = 'day' | 'week' | 'month'

interface AgentMetrics {
  call_count: number
  aht: number
  acw_sec: number
  away_sec: number
  acw_away_ratio: number
  login_sec: number
  work_hours: number
  call_count_score: number | null
  aht_score: number | null
  acw_away_score: number | null
  work_hours_score: number | null
}
// 커스텀 평가 항목 (cs_kpi_eval_items) — evaluation 응답에 포함
interface CustomItem {
  id: string
  name: string
  max_score: number
  weight: number
}
// 상담원별 커스텀 점수 — { score(원점수), norm(0~100 정규화) } 또는 null(미입력)
type CustomScore = { score: number; norm: number } | null
interface AgentEval {
  worker_id: string | null
  kt_id: string | null
  name: string
  total_score: number
  rank: number
  metrics: AgentMetrics
  strengths: string[]
  weaknesses: string[]
  custom_scores?: Record<string, CustomScore>
}
interface EvalData {
  meta: {
    granularity: string; from: string; to: string; prod_label: string
    agent_count: number
    has_call_data: boolean; has_prod_data: boolean; has_work_data: boolean
    active_metrics: string[]
  }
  weights: { call_count: number; aht: number; acw_away_ratio: number; work_hours: number }
  team_avg: {
    score: number; call_count: number; aht: number
    acw_away_ratio: number; work_hours: number
    best_score: number; worst_score: number
  }
  agents: AgentEval[]
  custom_items?: CustomItem[]
}

// ── 커스텀 점수 입력 패널 — kpi/eval-scores ──────────────────────
interface EvalScoresItem { id: string; name: string; max_score: number; weight: number; sort_order: number }
interface EvalScoresWorker { id: string; name: string }
interface EvalScoreRow { item_id: string; worker_id: string; score: number; note: string | null }
interface EvalScoresData {
  period_kind: string
  period_label: string
  items: EvalScoresItem[]
  workers: EvalScoresWorker[]
  scores: EvalScoreRow[]
  _migration_pending?: boolean
}
// 점수 저장 결과 글래스 패널
interface ScoreResult { ok: boolean; text: string; detail?: string; at: string }
const scoreNowLabel = () =>
  new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

// 초 → "MM:SS" (AHT 표시용)
function fmtMS(sec: number): string {
  if (!sec || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
const pad = (n: number) => String(n).padStart(2, '0')
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const GRAN_LABEL: Record<Granularity, string> = { day: '일', week: '주', month: '월' }

// 종합 점수 → 색상 (우수 ≥75 녹 / 보통 ≥50 노랑 / 미흡 빨강)
function scoreColor(score: number): string {
  if (score >= 75) return COLORS.success
  if (score >= 50) return COLORS.warning
  return COLORS.danger
}
function scoreLabel(score: number): string {
  if (score >= 75) return '우수'
  if (score >= 50) return '보통'
  return '미흡'
}
// 순위 메달
function rankMedal(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
}

export default function KpiEvaluation() {
  const [period, setPeriod] = useState<KpiPeriod>(
    { granularity: 'month', date: todayIso(), from: null, to: null })
  const granularity = period.granularity
  const [data, setData] = useState<EvalData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/kpi/evaluation?${periodQuery(period)}`,
        { headers: auth },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      setData(json.data)
    } catch (e: any) {
      setError(e?.message || '오류')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  const agents = data?.agents ?? []
  const isEmpty = !!data && agents.length === 0
  const customItems: CustomItem[] = data?.custom_items ?? []
  const hasCustomItems = customItems.length > 0

  // ── 상단 요약 카드 ──
  const ta = data?.team_avg
  const stats: StatItem[] = [
    { label: '팀 평균 점수', value: ta ? `${ta.score}` : '—', unit: ta ? '점' : undefined,
      tint: 'blue', icon: '🏅',
      subValue: data ? `평가 ${data.meta.agent_count}명` : undefined },
    { label: '평가 대상 인원', value: data?.meta.agent_count ?? 0, unit: '명',
      tint: 'purple', icon: '👥',
      subValue: data ? `${GRAN_LABEL[granularity]} 기준 집계` : undefined },
    { label: '최고 점수', value: ta ? `${ta.best_score}` : '—', unit: ta ? '점' : undefined,
      tint: 'green', icon: '⭐',
      subValue: agents.length > 0 ? `1위 ${agents[0]?.name ?? '—'}` : undefined },
    { label: '최저 점수', value: ta ? `${ta.worst_score}` : '—', unit: ta ? '점' : undefined,
      tint: 'red', icon: '⚠',
      subValue: agents.length > 0
        ? `${agents.length}위 ${agents[agents.length - 1]?.name ?? '—'}` : undefined },
    { label: '점수 편차', value: ta ? `${Math.round((ta.best_score - ta.worst_score) * 10) / 10}` : '—',
      unit: ta ? '점' : undefined, tint: 'amber', icon: '📊',
      subValue: '최고 − 최저' },
  ]

  // ── 지표별 점수 셀 (정규화 0~100, 평가 제외 시 —) ──
  const renderScore = (score: number | null, raw: string) => {
    if (score == null) {
      return <span style={{ color: COLORS.textDim, whiteSpace: 'nowrap' }}>—</span>
    }
    return (
      <span style={{ whiteSpace: 'nowrap' }}>
        <b style={{ color: scoreColor(score) }}>{score}</b>
        <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 5 }}>{raw}</span>
      </span>
    )
  }

  // ── 상담원별 평가 테이블 (전 컬럼 sortBy — 규칙 18) ──
  const columns: TableColumn<AgentEval>[] = [
    {
      key: 'rank', label: '순위', width: 64, align: 'center',
      sortBy: (r) => r.rank,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontWeight: 800, color: COLORS.textPrimary }}>
          {rankMedal(r.rank)} {r.rank}
        </span>
      ),
    },
    {
      key: 'name', label: '상담원', width: 130,
      sortBy: (r) => r.name,
      render: (r) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>{r.name}</span>
          {!r.worker_id && (
            <span title="cs_workers 미연결" style={{
              width: 6, height: 6, borderRadius: 99, background: COLORS.warning, display: 'inline-block',
            }} />
          )}
        </span>
      ),
    },
    {
      key: 'total_score', label: '종합 점수', width: 124, align: 'right',
      sortBy: (r) => r.total_score,
      render: (r) => {
        const c = scoreColor(r.total_score)
        return (
          <span style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <b style={{ fontSize: 16, color: c }}>{r.total_score}</b>
            <span style={{
              fontSize: 10, fontWeight: 800, color: c,
              padding: '1px 6px', borderRadius: 999,
              background: r.total_score >= 75 ? COLORS.bgGreen
                : r.total_score >= 50 ? COLORS.bgAmber : COLORS.bgRed,
              border: `1px solid ${r.total_score >= 75 ? COLORS.borderGreen
                : r.total_score >= 50 ? COLORS.borderAmber : COLORS.borderRed}`,
            }}>{scoreLabel(r.total_score)}</span>
          </span>
        )
      },
    },
    {
      key: 'call_count_score', label: '통화량', width: 100, align: 'right',
      sortBy: (r) => r.metrics.call_count_score ?? -1,
      render: (r) => renderScore(r.metrics.call_count_score, `${r.metrics.call_count.toLocaleString()}콜`),
    },
    {
      key: 'aht_score', label: '평균처리시간', width: 110, align: 'right',
      sortBy: (r) => r.metrics.aht_score ?? -1,
      render: (r) => renderScore(r.metrics.aht_score, fmtMS(r.metrics.aht)),
    },
    {
      key: 'acw_away_score', label: '후처리·이석', width: 110, align: 'right',
      sortBy: (r) => r.metrics.acw_away_score ?? -1,
      render: (r) => renderScore(
        r.metrics.acw_away_score,
        r.metrics.acw_away_ratio >= 0
          ? `${Math.round(r.metrics.acw_away_ratio * 1000) / 10}%` : '—',
      ),
    },
    {
      key: 'work_hours_score', label: '근무시간', width: 100, align: 'right',
      sortBy: (r) => r.metrics.work_hours_score ?? -1,
      render: (r) => renderScore(
        r.metrics.work_hours_score,
        r.metrics.work_hours > 0 ? `${Math.round(r.metrics.work_hours * 10) / 10}h` : '—',
      ),
    },
    {
      key: 'strengths', label: '강점', width: 150,
      sortBy: (r) => r.strengths.length,
      render: (r) => (
        r.strengths.length > 0 ? (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {r.strengths.map((s) => (
              <span key={s} style={{
                fontSize: 10, fontWeight: 700, color: COLORS.success,
                padding: '1px 6px', borderRadius: 999, whiteSpace: 'nowrap',
                background: COLORS.bgGreen, border: `1px solid ${COLORS.borderGreen}`,
              }}>▲ {s}</span>
            ))}
          </span>
        ) : <span style={{ color: COLORS.textDim }}>—</span>
      ),
    },
    {
      key: 'weaknesses', label: '약점', width: 150,
      sortBy: (r) => r.weaknesses.length,
      render: (r) => (
        r.weaknesses.length > 0 ? (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {r.weaknesses.map((w) => (
              <span key={w} style={{
                fontSize: 10, fontWeight: 700, color: COLORS.danger,
                padding: '1px 6px', borderRadius: 999, whiteSpace: 'nowrap',
                background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
              }}>▼ {w}</span>
            ))}
          </span>
        ) : <span style={{ color: COLORS.textDim }}>—</span>
      ),
    },
    // ── 커스텀 항목별 점수 (item 당 1컬럼, custom_items 있을 때만) ──
    ...customItems.map<TableColumn<AgentEval>>((it) => ({
      key: `custom_${it.id}`,
      label: `✏ ${it.name}`,
      width: 100,
      align: 'right' as const,
      sortBy: (r: AgentEval) => r.custom_scores?.[it.id]?.score ?? -1,
      render: (r: AgentEval) => {
        const cs = r.custom_scores?.[it.id]
        if (!cs) return <span style={{ color: COLORS.textDim, whiteSpace: 'nowrap' }}>—</span>
        return (
          <span style={{ whiteSpace: 'nowrap' }}>
            <b style={{ color: scoreColor(cs.norm) }}>{cs.score}</b>
            <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 4 }}>
              /{it.max_score}
            </span>
          </span>
        )
      },
    })),
  ]

  const w = data?.weights

  return (
    <div>
      {/* ── 기간 선택 (프리셋·이전/다음·직접범위) + 새로고침 ─────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <KpiPeriodPicker value={period} onChange={setPeriod} />
        {data && (
          <span style={{ fontSize: 11, color: COLORS.textMuted }}>
            📅 {data.meta.from}{data.meta.from !== data.meta.to ? ` ~ ${data.meta.to}` : ''}
            {' · '}평가 {data.meta.agent_count}명
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={load} disabled={loading}
          style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: COLORS.bgGray, border: `1px solid ${COLORS.borderFaint}`,
            color: COLORS.textSecondary, cursor: loading ? 'not-allowed' : 'pointer',
          }}>
          {loading ? '조회 중...' : '↻ 새로고침'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 12,
        }}>❌ {error}</div>
      )}

      {/* ── 빈 상태 ───────────────────────────────────────────── */}
      {isEmpty && !loading && (
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: 40, textAlign: 'center', marginBottom: 12,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏅</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
            이 기간에 평가할 상담원 데이터가 없습니다
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 6 }}>
            상단 「{GRAN_LABEL[granularity]}」 기준 통화·생산성·근무 데이터가 비어 있습니다.
            <br />「📤 KT 엑셀 업로드」 탭에서 KT 엑셀을 먼저 업로드하세요.
          </div>
        </div>
      )}

      {/* ── 요약 카드 ─────────────────────────────────────────── */}
      {data && !isEmpty && <DcStatStrip stats={stats} fullWidth />}

      {/* ── 점수 산정 방식 안내 (가중치 공개 — 투명) ───────────── */}
      {data && !isEmpty && w && (
        <div style={{
          ...GLASS.L1, borderRadius: 8, padding: '8px 12px', marginBottom: 12,
          fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.6,
        }}>
          <b style={{ color: COLORS.textPrimary }}>📐 점수 산정</b> — 각 지표를 팀 내
          최저~최고 0~100 정규화 후 가중 평균.
          <span style={{ color: COLORS.primary, fontWeight: 700, marginLeft: 4 }}>
            통화량 {w.call_count} · 평균처리시간 {w.aht} · 후처리·이석 {w.acw_away_ratio} · 근무시간 {w.work_hours}
          </span>
          {' '}(평균처리시간·후처리·이석은 낮을수록 우수 — 역방향).
          데이터 없는 지표는 평가에서 제외하고 가중치를 비례 재분배합니다.
          강점/약점은 팀 평균 대비 ±10% 초과 편차 기준.
        </div>
      )}

      {/* ── 부분 데이터 안내 ──────────────────────────────────── */}
      {data && !isEmpty && (!data.meta.has_call_data || !data.meta.has_prod_data || !data.meta.has_work_data) && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning,
        }}>
          ⚠ 일부 소스만 적재됨 —
          {!data.meta.has_call_data && ' 통화이력 없음'}
          {!data.meta.has_prod_data && ' 생산성 없음'}
          {!data.meta.has_work_data && ' 근무배정 없음'}
          {' '}· 누락 지표는 평가에서 제외되고 남은 지표로 점수가 산정됩니다.
        </div>
      )}

      {/* ── 커스텀 평가 항목 점수 입력 ─────────────────────────── */}
      {data && !isEmpty && (
        hasCustomItems ? (
          <CustomScorePanel period={period} onSaved={load} />
        ) : (
          <div style={{
            ...GLASS.L1, borderRadius: 8, padding: '8px 12px', marginBottom: 12,
            fontSize: 11, color: COLORS.textSecondary,
          }}>
            ✏ 커스텀 평가 항목이 없습니다 — 「⚙ 설정」 ▸ 「🏅 평가 항목·가중치」에서
            친절도·모니터링 점수 등 커스텀 평가 항목을 먼저 만드세요.
          </div>
        )
      )}

      {/* ── 상담원별 평가 테이블 ──────────────────────────────── */}
      {data && !isEmpty && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, margin: '4px 2px 8px' }}>
            🏅 상담원별 종합 평가
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginLeft: 8 }}>
              컬럼 클릭으로 정렬 · 종합 점수 75↑ 우수 / 50↑ 보통 / 미만 미흡
              {hasCustomItems ? ' · ✏ 표시는 커스텀 항목' : ''}
            </span>
          </div>
          <NeuDataTable
            columns={columns}
            data={agents}
            rowKey={(r) => r.worker_id ?? r.kt_id ?? r.name}
            defaultSort={{ key: 'total_score', dir: 'desc' }}
            emptyIcon="🏅"
            emptyMessage="평가된 상담원이 없습니다"
            mobileCard={{
              title: (r) => `${rankMedal(r.rank)} ${r.rank}위 ${r.name}`,
              subtitle: (r) => `통화 ${r.metrics.call_count.toLocaleString()} · 평균처리 ${fmtMS(r.metrics.aht)}`,
              trailing: (r) => (
                <span style={{ fontWeight: 800, color: scoreColor(r.total_score) }}>
                  {r.total_score}점
                </span>
              ),
              badges: (r) => (
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                  {r.strengths.length > 0 && (
                    <span style={{ color: COLORS.success }}>▲ {r.strengths.join(', ')} </span>
                  )}
                  {r.weaknesses.length > 0 && (
                    <span style={{ color: COLORS.danger }}>▼ {r.weaknesses.join(', ')}</span>
                  )}
                  {r.strengths.length === 0 && r.weaknesses.length === 0 && '강·약점 없음 (팀 평균 근접)'}
                </span>
              ),
            }}
          />
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// 커스텀 평가 항목 점수 입력 패널 — kpi/eval-scores
//   행 = 상담원(workers), 열 = 커스텀 항목(items). 셀 = 0~max_score 입력.
//   저장 후 onSaved() 로 evaluation 재조회 → 종합점수 갱신.
//   직접범위(custom) 모드면 점수 입력 비활성 — 월/주 단위 입력 안내.
// ════════════════════════════════════════════════════════════════
function CustomScorePanel({ period, onSaved }: {
  period: KpiPeriod
  onSaved: () => void
}) {
  // 직접범위 모드 — from/to 둘 다 있으면 점수 입력 비활성
  const isCustomRange = !!(period.from && period.to)
  const [open, setOpen] = useState(false)
  const [sd, setSd] = useState<EvalScoresData | null>(null)
  // 입력 중 점수 — `${item_id}|${worker_id}` → 문자열(input value)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<ScoreResult | null>(null)

  const cellKey = (itemId: string, workerId: string) => `${itemId}|${workerId}`

  const loadScores = useCallback(async () => {
    setLoading(true); setResult(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/kpi/eval-scores?granularity=${period.granularity}&date=${period.date}`,
        { headers: auth },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      const d: EvalScoresData = json.data
      setSd(d)
      // draft 초기화 — 기존 점수로 채움
      const init: Record<string, string> = {}
      for (const s of (d?.scores ?? [])) {
        init[cellKey(s.item_id, s.worker_id)] = String(s.score)
      }
      setDraft(init)
    } catch (e: any) {
      setResult({ ok: false, text: '❌ 커스텀 점수 조회 실패', detail: e?.message, at: scoreNowLabel() })
      setSd(null)
    } finally {
      setLoading(false)
    }
  }, [period.granularity, period.date])

  // 패널 열릴 때 / 기간 바뀔 때 로드 (직접범위 모드는 제외)
  useEffect(() => {
    if (open && !isCustomRange) loadScores()
  }, [open, isCustomRange, loadScores])

  const save = async () => {
    if (!sd) return
    setSaving(true); setResult(null)
    try {
      // draft 의 모든 셀을 scores 배열로 — 빈 값은 0 처리
      const scores: { item_id: string; worker_id: string; score: number }[] = []
      for (const it of sd.items) {
        for (const w of sd.workers) {
          const raw = draft[cellKey(it.id, w.id)]
          if (raw == null || raw === '') continue
          const n = Number(raw)
          if (!Number.isFinite(n)) continue
          const clamped = Math.max(0, Math.min(it.max_score, n))
          scores.push({ item_id: it.id, worker_id: w.id, score: clamped })
        }
      }
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/eval-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          granularity: period.granularity, date: period.date, scores,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      const d = json.data || {}
      const errs: string[] = Array.isArray(d.errors) ? d.errors : []
      setResult({
        ok: errs.length === 0,
        text: errs.length === 0 ? '✏ 커스텀 점수 저장 완료' : '⚠ 커스텀 점수 일부 저장',
        detail: `${d.period_label || ''} · 저장 ${Number(d.saved || 0)}건` +
          (errs.length > 0 ? ` · 실패 ${errs.length}건 (${errs.slice(0, 3).join(' / ')})` : '') +
          ' — 종합점수에 반영됩니다.',
        at: scoreNowLabel(),
      })
      await loadScores()
      onSaved() // evaluation 재조회 — 종합점수 갱신
    } catch (e: any) {
      setResult({ ok: false, text: '❌ 커스텀 점수 저장 실패', detail: e?.message, at: scoreNowLabel() })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, marginBottom: 12,
      border: `1px solid ${COLORS.borderViolet}`, overflow: 'hidden',
    }}>
      {/* 헤더 — 토글 */}
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
          background: open ? COLORS.bgViolet : 'transparent',
          border: 'none',
          borderBottom: open ? `1px solid ${COLORS.borderViolet}` : 'none',
        }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
          ✏ 커스텀 항목 점수 입력
        </span>
        <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600 }}>
          매니저가 만든 평가 항목의 상담원별 점수 — 종합점수에 가중 반영
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 800 }}>
          {open ? '▾ 접기' : '▸ 펼치기'}
        </span>
      </button>

      {open && (
        <div style={{ padding: 14 }}>
          {/* 직접범위 모드 — 입력 비활성 안내 */}
          {isCustomRange ? (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
              fontSize: 12, color: COLORS.warning, fontWeight: 600,
            }}>
              ⚠ 「직접」 범위 모드에서는 커스텀 점수를 입력할 수 없습니다 —
              상단 기간 선택을 「일·주·월」 프리셋으로 바꾸면 해당 단위로 점수를 입력할 수 있습니다.
            </div>
          ) : (
            <>
              <ScoreResultPanel result={result} onClose={() => setResult(null)} />

              {sd?._migration_pending && (
                <div style={{
                  padding: '8px 12px', borderRadius: 8, marginBottom: 12,
                  background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
                  fontSize: 11, color: COLORS.warning,
                }}>
                  ⚠ cs_kpi_eval_items / cs_kpi_eval_scores 테이블이 아직 적용되지 않은 것으로 보입니다 —
                  마이그레이션 적용 전에는 점수 저장이 반영되지 않습니다.
                </div>
              )}

              {loading && !sd && (
                <div style={{ fontSize: 12, color: COLORS.textMuted }}>조회 중...</div>
              )}

              {sd && (
                <>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10 }}>
                    {sd.period_label} 기준 — 각 상담원의 항목별 점수(0~만점)를 입력하고 저장하세요.
                    저장 즉시 위 종합 평가에 반영됩니다.
                  </div>

                  {sd.items.length === 0 || sd.workers.length === 0 ? (
                    <div style={{
                      ...GLASS.L1, borderRadius: 8, padding: 12,
                      fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
                    }}>
                      {sd.items.length === 0
                        ? '커스텀 평가 항목이 없습니다 — 「⚙ 설정」에서 먼저 만드세요.'
                        : '점수를 입력할 상담원이 없습니다.'}
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{
                        borderCollapse: 'separate', borderSpacing: 0, width: '100%',
                        fontSize: 12,
                      }}>
                        <thead>
                          <tr>
                            <th style={{
                              textAlign: 'left', padding: '6px 10px', whiteSpace: 'nowrap',
                              color: COLORS.textSecondary, fontWeight: 800,
                              borderBottom: `1px solid ${COLORS.borderSubtle}`,
                              position: 'sticky', left: 0, background: COLORS.bgGray,
                            }}>
                              상담원
                            </th>
                            {sd.items.map((it) => (
                              <th key={it.id} style={{
                                textAlign: 'right', padding: '6px 10px', whiteSpace: 'nowrap',
                                color: COLORS.textSecondary, fontWeight: 800,
                                borderBottom: `1px solid ${COLORS.borderSubtle}`,
                              }}>
                                ✏ {it.name}
                                <span style={{
                                  fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginLeft: 4,
                                }}>
                                  /{it.max_score}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sd.workers.map((w) => (
                            <tr key={w.id}>
                              <td style={{
                                padding: '6px 10px', whiteSpace: 'nowrap',
                                fontWeight: 700, color: COLORS.textPrimary,
                                borderBottom: `1px solid ${COLORS.borderFaint}`,
                                position: 'sticky', left: 0, background: COLORS.bgGray,
                              }}>
                                {w.name}
                              </td>
                              {sd.items.map((it) => {
                                const k = cellKey(it.id, w.id)
                                return (
                                  <td key={it.id} style={{
                                    padding: '4px 8px', textAlign: 'right',
                                    borderBottom: `1px solid ${COLORS.borderFaint}`,
                                  }}>
                                    <input
                                      type="number" min={0} max={it.max_score}
                                      value={draft[k] ?? ''}
                                      placeholder="—"
                                      disabled={saving}
                                      onChange={(e) => setDraft(prev => ({
                                        ...prev, [k]: e.target.value,
                                      }))}
                                      style={{
                                        ...GLASS.L1, width: 70, boxSizing: 'border-box',
                                        padding: '5px 8px', borderRadius: 6,
                                        fontSize: 13, fontWeight: 700, textAlign: 'right',
                                        color: COLORS.textPrimary, fontFamily: 'inherit',
                                      }} />
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div style={{
                    display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12,
                  }}>
                    <button type="button" onClick={loadScores} disabled={loading || saving}
                      style={{
                        padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: COLORS.bgGray, border: `1px solid ${COLORS.borderFaint}`,
                        color: COLORS.textSecondary,
                        cursor: (loading || saving) ? 'not-allowed' : 'pointer',
                      }}>
                      ↻ 다시 불러오기
                    </button>
                    <button type="button" onClick={save}
                      disabled={saving || loading || sd.items.length === 0 || sd.workers.length === 0}
                      style={{
                        ...BTN.md, background: COLORS.success, color: '#fff', border: 'none',
                        cursor: (saving || loading || sd.items.length === 0 || sd.workers.length === 0)
                          ? 'not-allowed' : 'pointer',
                        opacity: (saving || loading || sd.items.length === 0 || sd.workers.length === 0)
                          ? 0.6 : 1,
                      }}>
                      {saving ? '저장 중...' : '✓ 커스텀 점수 저장'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── 점수 저장 결과 글래스 패널 (규칙 20 — alert 금지) ──────────────
function ScoreResultPanel({ result, onClose }: {
  result: ScoreResult | null; onClose: () => void
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
