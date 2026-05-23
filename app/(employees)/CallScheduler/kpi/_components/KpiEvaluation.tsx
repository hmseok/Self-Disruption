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
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
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
interface AgentEval {
  worker_id: string | null
  kt_id: string | null
  name: string
  total_score: number
  rank: number
  metrics: AgentMetrics
  strengths: string[]
  weaknesses: string[]
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
}

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

      {/* ── 상담원별 평가 테이블 ──────────────────────────────── */}
      {data && !isEmpty && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, margin: '4px 2px 8px' }}>
            🏅 상담원별 종합 평가
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginLeft: 8 }}>
              컬럼 클릭으로 정렬 · 종합 점수 75↑ 우수 / 50↑ 보통 / 미만 미흡
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
