'use client'
// ═══════════════════════════════════════════════════════════════════
// CX KPI 대시보드 — KPI-DESIGN.md §5-2
//   · 일/주/월 토글 + 날짜 선택
//   · DcStatStrip 5 카드 (총 통화량·평균 AHT·IB/OB·로그인시간·충원율)
//   · NeuDataTable 상담원별 — 전 컬럼 sortBy (CLAUDE.md 규칙 18)
//   · 드릴다운 — 캐피탈사별 / 유형별 (간단 막대 표)
//   데이터: GET /api/call-scheduler/kpi/dashboard
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import KpiPeriodPicker, { type KpiPeriod, periodQuery } from './KpiPeriodPicker'

type Granularity = 'day' | 'week' | 'month'

interface AgentKpi {
  worker_id: string | null
  kt_id: string | null
  name: string
  call_count: number; ib: number; ob: number; etc: number
  aht: number; call_duration_sec: number
  login_sec: number; prod_ib: number; prod_ob: number; ob_attempt: number
  acw_sec: number; away_sec: number; wait_sec: number; hold_sec: number
  prod_active: boolean
  work_days: number; work_hours: number
}
interface Summary {
  granularity: string; from: string; to: string
  call_count: number; ib: number; ob: number; etc: number
  call_duration_sec: number; avg_duration_sec: number
  login_sec: number; aht: number
  acw_sec: number; away_sec: number
  work_days: number; work_hours: number
  required_workers: number; fill_rate: number
  intake_count: number
  has_call_data: boolean; has_prod_data: boolean; has_work_data: boolean
  cafe24_ok: boolean
}
interface ByClient { client: string; count: number; ib: number; ob: number; duration_sec: number }
interface ByType { type: string; count: number; ib: number; ob: number; duration_sec: number }
interface ResponseAgg {
  has_queue_data: boolean
  has_ivr_data: boolean
  queue_inbound: number
  queue_answered: number
  queue_abandoned: number
  answer_rate: number | null
  abandon_rate: number | null
  service_level: number | null
  avg_wait_sec: number | null
}
interface BySkill {
  skill: string; inbound: number; answered: number; abandoned: number
  answer_rate: number; service_level: number
}
interface ByScenario {
  scenario: string; callee_number: string
  total_inbound: number; answered: number; abandoned: number
}
interface DashboardData {
  meta: { granularity: string; from: string; to: string; prod_label: string; prod_kind: string; agent_count: number }
  summary: Summary
  agents: AgentKpi[]
  byClient: ByClient[]
  byType: ByType[]
  response?: ResponseAgg
  bySkill?: BySkill[]
  byScenario?: ByScenario[]
}

// ── Cafe24 접수 업무량 (kpi/cafe24-intake — 독립 호출) ──────────
interface Cafe24Daily { date: string; accident: number; dispatch: number }
interface Cafe24Intake {
  from: string; to: string
  daily: Cafe24Daily[]
  accident_total: number
  dispatch_total: number
  cafe24_ok: boolean
}

// 초 → "1시간 23분" / "5분 12초" / "42초"
function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return '0초'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}시간 ${m}분`
  if (m > 0) return `${m}분 ${s}초`
  return `${s}초`
}
// 초 → "MM:SS" (AHT 표시용 — 간결)
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
// granularity → cs_kpi_targets.period_kind
const GRAN_TO_PERIOD: Record<Granularity, string> = { day: 'daily', week: 'weekly', month: 'monthly' }

// ── 목표 (cs_kpi_targets) ─────────────────────────────────────
interface TargetRow {
  scope: string
  worker_id: string | null
  metric: string
  period_kind: string
  target_value: number
}
// 낮을수록 좋은 지표 (AHT) — 달성률 역방향
const LOWER_IS_BETTER = new Set(['aht'])

// 실측 ÷ 목표 → 달성률 % (역방향 지표는 목표 ÷ 실측)
function achievePct(metric: string, actual: number, target: number): number | null {
  if (!target || target <= 0) return null
  if (LOWER_IS_BETTER.has(metric)) {
    if (actual <= 0) return null
    return Math.round((target / actual) * 1000) / 10
  }
  return Math.round((actual / target) * 1000) / 10
}
// 달성률 → 색상 (달성 녹색 / 근접 노랑 / 미달 빨강)
function achieveColor(pct: number | null): string {
  if (pct == null) return COLORS.textMuted
  if (pct >= 100) return COLORS.success
  if (pct >= 80) return COLORS.warning
  return COLORS.danger
}

export default function KpiDashboard() {
  const [period, setPeriod] = useState<KpiPeriod>(
    { granularity: 'month', date: todayIso(), from: null, to: null })
  // 빈 상태 안내 등에서 쓰는 표시용 granularity (직접범위면 'day' fallback)
  const granularity = period.granularity
  const [data, setData] = useState<DashboardData | null>(null)
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drill, setDrill] = useState<'client' | 'type'>('client')
  // Cafe24 접수 업무량 — 외부 DB 지연이 대시보드 본체를 막지 않도록 독립 로딩
  const [cafe24, setCafe24] = useState<Cafe24Intake | null>(null)
  const [cafe24Loading, setCafe24Loading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      // 목표는 기준일(직접범위면 시작일)의 연·월로 조회
      const base = new Date(period.date + 'T00:00:00')
      const ty = isNaN(base.getTime()) ? new Date().getFullYear() : base.getFullYear()
      const tm = isNaN(base.getTime()) ? new Date().getMonth() + 1 : base.getMonth() + 1
      const [dRes, tRes] = await Promise.all([
        fetch(`/api/call-scheduler/kpi/dashboard?${periodQuery(period)}`, { headers: auth }),
        fetch(`/api/call-scheduler/kpi/targets?year=${ty}&month=${tm}`, { headers: auth }),
      ])
      const json = await dRes.json()
      if (!dRes.ok) throw new Error(json?.error || '조회 실패')
      setData(json.data)
      // 목표 — 실패해도 대시보드는 표시 (graceful)
      try {
        const tJson = await tRes.json()
        setTargets(tRes.ok ? (tJson?.data?.targets ?? []) : [])
      } catch { setTargets([]) }
    } catch (e: any) {
      setError(e?.message || '오류')
      setData(null)
      setTargets([])
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  // Cafe24 접수 업무량 — 대시보드와 별개로 호출 (느린 외부 DB 격리)
  const loadCafe24 = useCallback(async () => {
    setCafe24Loading(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/kpi/cafe24-intake?${periodQuery(period)}`,
        { headers: auth },
      )
      const json = await res.json()
      setCafe24(res.ok ? json.data : null)
    } catch {
      setCafe24(null)
    } finally {
      setCafe24Loading(false)
    }
  }, [period])

  useEffect(() => { loadCafe24() }, [loadCafe24])

  const s = data?.summary
  const agents = data?.agents ?? []
  const isEmpty = !!data && !s?.has_call_data && !s?.has_prod_data && !s?.has_work_data
    && !data?.response?.has_queue_data && !data?.response?.has_ivr_data

  // ── 목표 조회 헬퍼 — granularity 의 period_kind 기준 ──
  const periodKind = GRAN_TO_PERIOD[granularity]
  // 팀 목표: metric → target_value
  const teamTargets = new Map<string, number>()
  // 상담원 목표: `${worker_id}|${metric}` → target_value
  const agentTargets = new Map<string, number>()
  for (const t of targets) {
    if (t.period_kind !== periodKind) continue
    if (t.scope === 'team' && !t.worker_id) {
      teamTargets.set(t.metric, Number(t.target_value || 0))
    } else if (t.scope === 'agent' && t.worker_id) {
      agentTargets.set(`${t.worker_id}|${t.metric}`, Number(t.target_value || 0))
    }
  }
  // 상담원별 지표 실측값 (목표와 비교할 키)
  const agentActual = (r: AgentKpi, metric: string): number => {
    if (metric === 'call_count') return r.call_count
    if (metric === 'aht') return r.aht
    if (metric === 'login_sec') return r.login_sec
    if (metric === 'work_hours') return r.work_hours
    return 0
  }
  const hasAnyTarget = teamTargets.size > 0 || agentTargets.size > 0

  // ── 상단 5 카드 ──
  const ibObRatio = s && s.call_count > 0
    ? `${Math.round((s.ib / s.call_count) * 100)} : ${Math.round((s.ob / s.call_count) * 100)}`
    : '—'
  // ── 팀 통화량 목표 달성률 (대표 지표 — 카드 표시) ──
  const teamCallTarget = teamTargets.get('call_count') ?? 0
  const teamCallPct = s ? achievePct('call_count', s.call_count, teamCallTarget) : null

  const stats: StatItem[] = [
    { label: '총 통화량', value: s?.call_count ?? 0, unit: '콜', tint: 'blue', icon: '📞',
      subValue: s ? `수신 ${s.ib.toLocaleString()} · 발신 ${s.ob.toLocaleString()}` : undefined },
    { label: '평균 처리시간', value: s ? fmtMS(s.aht) : '—', tint: 'green', icon: '⏱',
      subValue: s && s.avg_duration_sec > 0 ? '통화시간 실측' : (s?.has_prod_data ? '생산성 기준' : undefined) },
    { label: '수신/발신 비율', value: ibObRatio, tint: 'amber', icon: '🔀',
      subValue: s && s.etc > 0 ? `기타 ${s.etc.toLocaleString()}` : undefined },
    { label: '로그인 시간',
      value: s ? fmtDuration(s.login_sec) : '—',
      tint: 'purple', icon: '🔓',
      subValue: s && s.has_prod_data ? '생산성 기준' : undefined },
    { label: '충원율', value: s ? `${Math.round(s.fill_rate * 1000) / 10}%` : '—', tint: 'red', icon: '🛡',
      subValue: s ? `근무 ${s.work_days}일 · ${Math.round(s.work_hours)}h` : undefined },
    { label: '통화량 달성률',
      value: teamCallPct != null ? `${teamCallPct}%` : '—',
      tint: teamCallPct == null ? 'slate' : teamCallPct >= 100 ? 'green' : teamCallPct >= 80 ? 'amber' : 'red',
      icon: '🎯',
      subValue: teamCallTarget > 0
        ? `목표 ${teamCallTarget.toLocaleString()}콜`
        : '목표 미설정 — 「🎯 목표」 탭' },
  ]

  // ── 응대현황 카드 (cs_response_queue — 큐 데이터 있을 때만 실측) ──
  const resp = data?.response
  const hasQueue = !!resp?.has_queue_data
  const responseStats: StatItem[] = [
    { label: '응대율', value: hasQueue && resp?.answer_rate != null ? `${resp.answer_rate}%` : '—',
      tint: !hasQueue ? 'slate' : (resp!.answer_rate ?? 0) >= 90 ? 'green' : (resp!.answer_rate ?? 0) >= 80 ? 'amber' : 'red',
      icon: '✅',
      subValue: hasQueue ? `인입 ${resp!.queue_inbound.toLocaleString()} · 응대 ${resp!.queue_answered.toLocaleString()}` : '응대현황(큐) 미적재' },
    { label: '포기율', value: hasQueue && resp?.abandon_rate != null ? `${resp.abandon_rate}%` : '—',
      tint: !hasQueue ? 'slate' : (resp!.abandon_rate ?? 0) <= 5 ? 'green' : (resp!.abandon_rate ?? 0) <= 10 ? 'amber' : 'red',
      icon: '📉',
      subValue: hasQueue ? `포기호 ${resp!.queue_abandoned.toLocaleString()}` : undefined },
    { label: '서비스레벨', value: hasQueue && resp?.service_level != null ? `${resp.service_level}%` : '—',
      tint: !hasQueue ? 'slate' : (resp!.service_level ?? 0) >= 80 ? 'green' : (resp!.service_level ?? 0) >= 70 ? 'amber' : 'red',
      icon: '⚡',
      subValue: hasQueue ? `평균대기 ${fmtMS(resp!.avg_wait_sec ?? 0)} · 20초내` : undefined },
  ]

  // ── 상담원 테이블 컬럼 (전 컬럼 sortBy — 규칙 18) ──
  const columns: TableColumn<AgentKpi>[] = [
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
      key: 'call_count', label: '통화량 (수신/발신)', width: 150, align: 'right',
      sortBy: (r) => r.call_count,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          <b style={{ color: COLORS.textPrimary }}>{r.call_count.toLocaleString()}</b>
          <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 6 }}>
            {r.ib.toLocaleString()} / {r.ob.toLocaleString()}
          </span>
        </span>
      ),
    },
    {
      key: 'aht', label: '평균처리시간', width: 92, align: 'right',
      sortBy: (r) => r.aht,
      render: (r) => <span style={{ whiteSpace: 'nowrap', color: COLORS.success, fontWeight: 700 }}>{fmtMS(r.aht)}</span>,
    },
    {
      key: 'login_sec', label: '로그인시간', width: 110, align: 'right',
      sortBy: (r) => r.login_sec,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', color: r.login_sec > 0 ? COLORS.textPrimary : COLORS.textDim }}>
          {fmtDuration(r.login_sec)}
        </span>
      ),
    },
    {
      key: 'acw_away', label: '후처리 · 이석', width: 140, align: 'right',
      sortBy: (r) => r.acw_sec + r.away_sec,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: COLORS.textSecondary }}>
          <span title="후처리">{fmtDuration(r.acw_sec)}</span>
          <span style={{ color: COLORS.textDim, margin: '0 4px' }}>·</span>
          <span title="이석" style={{ color: r.away_sec > 0 ? COLORS.warning : COLORS.textDim }}>
            {fmtDuration(r.away_sec)}
          </span>
        </span>
      ),
    },
    {
      key: 'work_hours', label: '근무시간', width: 110, align: 'right',
      sortBy: (r) => r.work_hours,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', color: r.work_hours > 0 ? COLORS.textPrimary : COLORS.textDim }}>
          {r.work_hours > 0
            ? <><b>{Math.round(r.work_hours * 10) / 10}</b><span style={{ fontSize: 11, color: COLORS.textMuted }}>h · {r.work_days}일</span></>
            : '—'}
        </span>
      ),
    },
    {
      // 통화량 달성률 — 상담원 목표 우선, 없으면 팀 목표 fallback
      key: 'achieve', label: '목표 달성률', width: 130, align: 'right',
      sortBy: (r) => {
        const tgt = (r.worker_id ? agentTargets.get(`${r.worker_id}|call_count`) : 0)
          || teamTargets.get('call_count') || 0
        return achievePct('call_count', r.call_count, tgt) ?? -1
      },
      render: (r) => {
        const agentTgt = r.worker_id ? agentTargets.get(`${r.worker_id}|call_count`) : undefined
        const tgt = agentTgt || teamTargets.get('call_count') || 0
        const pct = achievePct('call_count', r.call_count, tgt)
        if (pct == null) {
          return <span style={{ color: COLORS.textDim, whiteSpace: 'nowrap' }}>—</span>
        }
        return (
          <span style={{ whiteSpace: 'nowrap' }}>
            <b style={{ color: achieveColor(pct) }}>{pct}%</b>
            <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 4 }}>
              {agentTgt ? '개인' : '팀'} {tgt.toLocaleString()}
            </span>
          </span>
        )
      },
    },
  ]

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
            {' · '}상담원 {data.meta.agent_count}명
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => { load(); loadCafe24() }} disabled={loading}
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
          ...GLASS.L4, borderRadius: 12, padding: 40, textAlign: 'center',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
            이 기간에 표시할 KPI 데이터가 없습니다
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 6 }}>
            상단 「{GRAN_LABEL[granularity]}」 기준 통화·생산성·근무 데이터가 비어 있습니다.
            <br />아래 업로드 섹션에서 KT 엑셀(상담이력 / 생산성)을 먼저 업로드하세요.
          </div>
        </div>
      )}

      {/* ── 5 스탯 카드 ───────────────────────────────────────── */}
      {data && !isEmpty && <DcStatStrip stats={stats} fullWidth />}

      {/* ── 응대현황 카드 (응대율·포기율·서비스레벨) ───────────── */}
      {data && !isEmpty && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, margin: '8px 2px 8px' }}>
            ☎ 응대현황 (IVR + 큐)
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginLeft: 8 }}>
              {hasQueue ? 'cs_response_queue 가중평균 (인입 기준)' : '응대현황(큐) 미적재 — 업로드 탭에서 적재'}
            </span>
          </div>
          <DcStatStrip stats={responseStats} fullWidth />
        </div>
      )}

      {/* ── Cafe24 접수 업무량 (사고 / 긴급출동 일별) ───────────── */}
      {(cafe24 || cafe24Loading) && (
        <Cafe24IntakePanel data={cafe24} loading={cafe24Loading} />
      )}

      {/* ── 응대현황 드릴다운 — 스킬별 / 시나리오별 ─────────────── */}
      {data && !isEmpty && ((data.bySkill && data.bySkill.length > 0) || (data.byScenario && data.byScenario.length > 0)) && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 10 }}>
            ☎ 응대현황 드릴다운
          </div>
          {/* 스킬별 (큐) */}
          {data.bySkill && data.bySkill.length > 0 && (
            <div style={{ marginBottom: data.byScenario && data.byScenario.length > 0 ? 14 : 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
                📡 스킬별 (큐)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                      <th style={dth}>스킬</th>
                      <th style={{ ...dth, textAlign: 'right' }}>인입</th>
                      <th style={{ ...dth, textAlign: 'right' }}>응대</th>
                      <th style={{ ...dth, textAlign: 'right' }}>포기</th>
                      <th style={{ ...dth, textAlign: 'right' }}>응대율</th>
                      <th style={{ ...dth, textAlign: 'right' }}>서비스레벨</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bySkill.map((sk) => (
                      <tr key={sk.skill} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                        <td style={{ ...dtd, fontWeight: 700, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>{sk.skill}</td>
                        <td style={{ ...dtd, textAlign: 'right' }}>{sk.inbound.toLocaleString()}</td>
                        <td style={{ ...dtd, textAlign: 'right' }}>{sk.answered.toLocaleString()}</td>
                        <td style={{ ...dtd, textAlign: 'right', color: sk.abandoned > 0 ? COLORS.danger : COLORS.textMuted }}>{sk.abandoned.toLocaleString()}</td>
                        <td style={{ ...dtd, textAlign: 'right', fontWeight: 700,
                          color: sk.answer_rate >= 90 ? COLORS.success : sk.answer_rate >= 80 ? COLORS.warning : COLORS.danger }}>{sk.answer_rate}%</td>
                        <td style={{ ...dtd, textAlign: 'right', fontWeight: 700,
                          color: sk.service_level >= 80 ? COLORS.success : sk.service_level >= 70 ? COLORS.warning : COLORS.danger }}>{sk.service_level}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* 시나리오별 (IVR) */}
          {data.byScenario && data.byScenario.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
                📲 시나리오별 (IVR)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                      <th style={dth}>시나리오</th>
                      <th style={dth}>착신번호</th>
                      <th style={{ ...dth, textAlign: 'right' }}>총인입</th>
                      <th style={{ ...dth, textAlign: 'right' }}>응대</th>
                      <th style={{ ...dth, textAlign: 'right' }}>포기</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byScenario.map((sc) => (
                      <tr key={`${sc.scenario}-${sc.callee_number}`} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                        <td style={{ ...dtd, fontWeight: 700, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>{sc.scenario}</td>
                        <td style={{ ...dtd, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{sc.callee_number}</td>
                        <td style={{ ...dtd, textAlign: 'right' }}>{sc.total_inbound.toLocaleString()}</td>
                        <td style={{ ...dtd, textAlign: 'right' }}>{sc.answered.toLocaleString()}</td>
                        <td style={{ ...dtd, textAlign: 'right', color: sc.abandoned > 0 ? COLORS.danger : COLORS.textMuted }}>{sc.abandoned.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 상담원별 테이블 ───────────────────────────────────── */}
      {data && !isEmpty && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, margin: '4px 2px 8px' }}>
            👥 상담원별 KPI
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginLeft: 8 }}>
              컬럼 클릭으로 정렬 · 달성률 = 통화량 실측 ÷ 목표
              {!hasAnyTarget && ' · 목표 미설정 시 「🎯 목표」 탭에서 입력'}
            </span>
          </div>
          <NeuDataTable
            columns={columns}
            data={agents}
            rowKey={(r) => r.worker_id ?? r.kt_id ?? r.name}
            defaultSort={{ key: 'call_count', dir: 'desc' }}
            emptyIcon="👥"
            emptyMessage="집계된 상담원이 없습니다"
            mobileCard={{
              title: (r) => r.name,
              subtitle: (r) => `통화 ${r.call_count.toLocaleString()} (수신 ${r.ib}/발신 ${r.ob})`,
              trailing: (r) => `평균처리 ${fmtMS(r.aht)}`,
              badges: (r) => (
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                  로그인 {fmtDuration(r.login_sec)} · 근무 {Math.round(r.work_hours)}h
                </span>
              ),
            }}
          />
        </div>
      )}

      {/* ── 드릴다운 — 캐피탈사 / 유형 ────────────────────────── */}
      {data && !isEmpty && (data.byClient.length > 0 || data.byType.length > 0) && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
              📈 통화 분포 드릴다운
            </span>
            <div style={{ flex: 1 }} />
            {(['client', 'type'] as const).map((k) => {
              const active = k === drill
              return (
                <button key={k} type="button" onClick={() => setDrill(k)}
                  style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    cursor: 'pointer',
                    background: active ? COLORS.bgBlue : 'transparent',
                    color: active ? COLORS.primary : COLORS.textMuted,
                    border: `1px solid ${active ? COLORS.borderBlue : COLORS.borderFaint}`,
                  }}>
                  {k === 'client' ? '캐피탈사별' : '유형별'}
                </button>
              )
            })}
          </div>
          {drill === 'client'
            ? <DistBars rows={data.byClient.map(c => ({ label: c.client, count: c.count, ib: c.ib, ob: c.ob }))} />
            : <DistBars rows={data.byType.map(t => ({ label: t.type, count: t.count, ib: t.ib, ob: t.ob }))} />}
        </div>
      )}

      {/* ── 부분 데이터 안내 ──────────────────────────────────── */}
      {data && !isEmpty && (!s?.has_call_data || !s?.has_prod_data || !s?.has_work_data) && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning,
        }}>
          ⚠ 일부 소스만 적재됨 —
          {!s?.has_call_data && ' 통화이력 없음'}
          {!s?.has_prod_data && ' 생산성 없음'}
          {!s?.has_work_data && ' 근무배정 없음'}
          {' '}· 누락 소스의 지표는 0 으로 표시됩니다.
        </div>
      )}
    </div>
  )
}

// ── Cafe24 접수 업무량 패널 (사고 / 긴급출동 일별 시계열) ──────
function Cafe24IntakePanel({ data, loading }: {
  data: Cafe24Intake | null; loading: boolean
}) {
  const panelStyle: React.CSSProperties = {
    ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 14,
  }
  const titleRow = (
    <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
      📥 Cafe24 접수 업무량
    </span>
  )

  // 첫 로딩 — 자리만 표시 (이후엔 직전 데이터 유지)
  if (loading && !data) {
    return (
      <div style={panelStyle}>
        <div style={{ marginBottom: 6 }}>{titleRow}</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted }}>Cafe24 조회 중...</div>
      </div>
    )
  }
  if (!data) return null

  // Cafe24 미연결 — graceful 안내
  if (!data.cafe24_ok) {
    return (
      <div style={panelStyle}>
        <div style={{ marginBottom: 6 }}>{titleRow}</div>
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning,
        }}>
          ⚠ Cafe24 ERP 에 연결하지 못했습니다 — 접수량을 표시할 수 없습니다.
        </div>
      </div>
    )
  }

  const daily = data.daily
  const total = data.accident_total + data.dispatch_total
  const maxDay = Math.max(...daily.map((d) => d.accident + d.dispatch), 1)

  return (
    <div style={panelStyle}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap',
      }}>
        {titleRow}
        <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>
          유효 접수만 (취소 제외) · 일별
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: COLORS.primary }} />
          <span style={{ fontSize: 12, color: COLORS.textSecondary }}>사고</span>
          <b style={{ fontSize: 13, color: COLORS.textPrimary }}>
            {data.accident_total.toLocaleString()}
          </b>
        </span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', marginLeft: 6,
        }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: COLORS.warning }} />
          <span style={{ fontSize: 12, color: COLORS.textSecondary }}>긴급출동</span>
          <b style={{ fontSize: 13, color: COLORS.textPrimary }}>
            {data.dispatch_total.toLocaleString()}
          </b>
        </span>
      </div>

      {total === 0 ? (
        <div style={{
          padding: 16, textAlign: 'center', fontSize: 12, color: COLORS.textMuted,
          background: 'rgba(0,0,0,0.02)', borderRadius: 8,
        }}>이 기간에 Cafe24 접수 건이 없습니다</div>
      ) : (
        <DayColumns daily={daily} maxDay={maxDay} />
      )}
    </div>
  )
}

// ── 일별 컬럼 차트 (사고 아래 / 긴급출동 위 — 스택) ────────────
function DayColumns({ daily, maxDay }: { daily: Cafe24Daily[]; maxDay: number }) {
  const H = 92 // 차트 높이 px
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 3, height: H, padding: '0 2px',
      }}>
        {daily.map((d) => {
          const tot = d.accident + d.dispatch
          const accH = (d.accident / maxDay) * H
          const dispH = (d.dispatch / maxDay) * H
          return (
            <div key={d.date}
              title={`${d.date}\n사고 ${d.accident}건 · 긴급출동 ${d.dispatch}건 · 합계 ${tot}건`}
              style={{
                flex: 1, minWidth: 6, display: 'flex', flexDirection: 'column',
                justifyContent: 'flex-end', height: '100%',
              }}>
              <div style={{
                height: dispH, background: COLORS.warning,
                borderRadius: '2px 2px 0 0',
              }} />
              <div style={{
                height: accH, background: COLORS.primary,
                borderRadius: dispH > 0 ? 0 : '2px 2px 0 0',
              }} />
            </div>
          )
        })}
      </div>
      {/* x축 날짜 — 1일·5의배수만 (혼잡 방지), 14일 이하면 전부 */}
      <div style={{
        display: 'flex', gap: 3, padding: '4px 2px 0',
        borderTop: `1px solid ${COLORS.borderFaint}`,
      }}>
        {daily.map((d) => {
          const dayNum = Number(d.date.slice(8, 10))
          const show = daily.length <= 14 || dayNum === 1 || dayNum % 5 === 0
          return (
            <div key={d.date} style={{
              flex: 1, minWidth: 6, textAlign: 'center', fontSize: 9,
              color: COLORS.textMuted, whiteSpace: 'nowrap', overflow: 'hidden',
            }}>{show ? dayNum : ''}</div>
          )
        })}
      </div>
    </div>
  )
}

// ── 분포 막대 표 (recharts 미설치 → 글래스 막대) ──────────────
function DistBars({ rows }: { rows: { label: string; count: number; ib: number; ob: number }[] }) {
  if (rows.length === 0) {
    return (
      <div style={{
        padding: 16, textAlign: 'center', fontSize: 12, color: COLORS.textMuted,
        background: 'rgba(0,0,0,0.02)', borderRadius: 8,
      }}>분포 데이터 없음</div>
    )
  }
  const max = Math.max(...rows.map(r => r.count), 1)
  const total = rows.reduce((s, r) => s + r.count, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map((r) => {
        const pct = (r.count / max) * 100
        const share = total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0
        return (
          <div key={r.label} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 8,
            background: COLORS.bgGray, border: `1px solid ${COLORS.borderFaint}`,
            fontSize: 12,
          }}>
            <span style={{
              fontWeight: 700, color: COLORS.textPrimary,
              minWidth: 110, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }} title={r.label}>{r.label}</span>
            <div style={{
              flex: 1, height: 14, position: 'relative',
              background: '#fff', borderRadius: 4,
              border: `1px solid ${COLORS.borderFaint}`, overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${pct}%`, background: COLORS.primary, transition: 'width 0.2s',
              }} />
            </div>
            <span style={{ fontSize: 11, color: COLORS.textMuted, minWidth: 96, textAlign: 'right', whiteSpace: 'nowrap' }}>
              IB {r.ib.toLocaleString()} · OB {r.ob.toLocaleString()}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: COLORS.primary,
              background: '#fff', padding: '2px 6px', borderRadius: 4,
              border: `1px solid ${COLORS.borderBlue}`, minWidth: 88, textAlign: 'right', whiteSpace: 'nowrap',
            }}>{r.count.toLocaleString()} ({share}%)</span>
          </div>
        )
      })}
    </div>
  )
}

// ── 응대현황 드릴다운 표 셀 스타일 ─────────────────────────────
const dth: React.CSSProperties = {
  padding: '5px 8px', textAlign: 'left',
  color: COLORS.textMuted, fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
}
const dtd: React.CSSProperties = {
  padding: '5px 8px', fontSize: 11, color: COLORS.textSecondary,
}
