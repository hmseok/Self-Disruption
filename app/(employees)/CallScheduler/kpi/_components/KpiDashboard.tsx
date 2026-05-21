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
interface DashboardData {
  meta: { granularity: string; from: string; to: string; prod_label: string; prod_kind: string; agent_count: number }
  summary: Summary
  agents: AgentKpi[]
  byClient: ByClient[]
  byType: ByType[]
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

export default function KpiDashboard() {
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [date, setDate] = useState<string>(todayIso())
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drill, setDrill] = useState<'client' | 'type'>('client')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/kpi/dashboard?granularity=${granularity}&date=${date}`,
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
  }, [granularity, date])

  useEffect(() => { load() }, [load])

  const s = data?.summary
  const agents = data?.agents ?? []
  const isEmpty = !!data && !s?.has_call_data && !s?.has_prod_data && !s?.has_work_data

  // ── 상단 5 카드 ──
  const ibObRatio = s && s.call_count > 0
    ? `${Math.round((s.ib / s.call_count) * 100)} : ${Math.round((s.ob / s.call_count) * 100)}`
    : '—'
  const stats: StatItem[] = [
    { label: '총 통화량', value: s?.call_count ?? 0, unit: '콜', tint: 'blue', icon: '📞',
      subValue: s ? `IB ${s.ib.toLocaleString()} · OB ${s.ob.toLocaleString()}` : undefined },
    { label: '평균 AHT', value: s ? fmtMS(s.aht) : '—', tint: 'green', icon: '⏱',
      subValue: s && s.avg_duration_sec > 0 ? '통화시간 실측' : (s?.has_prod_data ? '생산성 기준' : undefined) },
    { label: 'IB/OB 비율', value: ibObRatio, tint: 'amber', icon: '🔀',
      subValue: s && s.etc > 0 ? `기타 ${s.etc.toLocaleString()}` : undefined },
    { label: s?.cafe24_ok ? '접수 건수' : '로그인 시간',
      value: s?.cafe24_ok ? (s?.intake_count ?? 0) : (s ? fmtDuration(s.login_sec) : '—'),
      unit: s?.cafe24_ok ? '건' : undefined, tint: 'purple', icon: s?.cafe24_ok ? '📥' : '🔓',
      subValue: s?.cafe24_ok && s?.has_prod_data ? `로그인 ${fmtDuration(s.login_sec)}` : undefined },
    { label: '충원율', value: s ? `${Math.round(s.fill_rate * 1000) / 10}%` : '—', tint: 'red', icon: '🎯',
      subValue: s ? `근무 ${s.work_days}일 · ${Math.round(s.work_hours)}h` : undefined },
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
      key: 'call_count', label: '통화량 (IB/OB)', width: 150, align: 'right',
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
      key: 'aht', label: 'AHT', width: 80, align: 'right',
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
  ]

  return (
    <div>
      {/* ── 기간 토글 + 날짜 ─────────────────────────────────── */}
      <div style={{
        ...GLASS.L1, borderRadius: 10, padding: '10px 14px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['day', 'week', 'month'] as Granularity[]).map((g) => {
            const active = g === granularity
            return (
              <button key={g} type="button" onClick={() => setGranularity(g)}
                style={{
                  padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, fontWeight: 700,
                  background: active ? COLORS.primary : 'transparent',
                  color: active ? '#fff' : COLORS.textSecondary,
                  border: `1px solid ${active ? COLORS.primary : COLORS.borderFaint}`,
                }}>
                {GRAN_LABEL[g]}
              </button>
            )
          })}
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          style={{
            padding: '6px 10px', borderRadius: 8, fontSize: 13,
            border: `1px solid ${COLORS.borderFaint}`, color: COLORS.textPrimary,
            background: '#fff', fontFamily: 'inherit',
          }} />
        {data && (
          <span style={{ fontSize: 11, color: COLORS.textMuted }}>
            📅 {data.meta.from}{data.meta.from !== data.meta.to ? ` ~ ${data.meta.to}` : ''}
            {' · '}상담원 {data.meta.agent_count}명
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

      {/* ── 상담원별 테이블 ───────────────────────────────────── */}
      {data && !isEmpty && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, margin: '4px 2px 8px' }}>
            👥 상담원별 KPI
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginLeft: 8 }}>
              컬럼 클릭으로 정렬 · 목표달성률은 후속 단계
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
              subtitle: (r) => `통화 ${r.call_count.toLocaleString()} (IB ${r.ib}/OB ${r.ob})`,
              trailing: (r) => `AHT ${fmtMS(r.aht)}`,
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
