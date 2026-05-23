'use client'
// ═══════════════════════════════════════════════════════════════════
// CX KPI 근태 — 지각·조퇴 체크
//   근무표 예정 시각 ↔ KT 생산성 실측 로그인/로그아웃 매칭.
//   · 일/주/월 토글
//   · DcStatStrip 요약 (근무일·지각·조퇴·정상·미집계)
//   · NeuDataTable 워커별 — 전 컬럼 sortBy (규칙 18)
//   · 지각·조퇴 상세 패널 — 적발 일자 목록
//   데이터: GET /api/call-scheduler/kpi/attendance
//   그룹 시간 겹침(부엉+달빛)은 서버에서 union 처리 — 중복 제거.
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'

type Granularity = 'day' | 'week' | 'month'

interface DayResult {
  date: string
  slots: { code: string; label: string }[]
  is_overnight: boolean
  sched_start: string
  sched_end: string
  sched_hours: number
  login_first: string | null
  login_last: string | null
  late_min: number
  early_min: number
  status: 'ok' | 'late' | 'early' | 'late_early' | 'no_data' | 'unmatched'
}
interface WorkerResult {
  worker_id: string
  name: string
  kt_id: string | null
  work_days: number
  late_count: number
  late_total_min: number
  early_count: number
  early_total_min: number
  no_data_days: number
  days: DayResult[]
}
interface AttendanceData {
  from: string; to: string; granularity: string
  grace_minutes: number
  has_daily_prod: boolean
  migration_pending: boolean
  summary: {
    worker_count: number; work_day_count: number
    late_count: number; early_count: number
    no_data_count: number; unmatched_count: number; ok_count: number
  }
  workers: WorkerResult[]
}

const pad = (n: number) => String(n).padStart(2, '0')
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const GRAN_LABEL: Record<Granularity, string> = { day: '일', week: '주', month: '월' }

// 분 → "1시간 5분" / "23분"
function fmtMin(min: number): string {
  if (!min || min <= 0) return '0분'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`
  return `${m}분`
}

const STATUS_META: Record<DayResult['status'], { label: string; color: string; bg: string }> = {
  ok:         { label: '정상',   color: COLORS.success, bg: COLORS.bgGreen },
  late:       { label: '지각',   color: COLORS.danger,  bg: COLORS.bgRed },
  early:      { label: '조퇴',   color: COLORS.warning, bg: COLORS.bgAmber },
  late_early: { label: '지각+조퇴', color: COLORS.danger, bg: COLORS.bgRed },
  no_data:    { label: '데이터없음', color: COLORS.textMuted, bg: COLORS.bgGray },
  unmatched:  { label: 'KT 미연결', color: COLORS.textMuted, bg: COLORS.bgGray },
}

export default function KpiAttendance() {
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [date, setDate] = useState<string>(todayIso())
  const [data, setData] = useState<AttendanceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/kpi/attendance?granularity=${granularity}&date=${date}`,
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

  const sm = data?.summary
  const workers = data?.workers ?? []
  const isEmpty = !!data && workers.length === 0

  // ── 적발 일자 (지각·조퇴) 평탄화 — 날짜 desc ───────────────────
  const flagged: { worker: string; day: DayResult }[] = []
  for (const w of workers) {
    for (const d of w.days) {
      if (d.status === 'late' || d.status === 'early' || d.status === 'late_early') {
        flagged.push({ worker: w.name, day: d })
      }
    }
  }
  flagged.sort((a, b) => (a.day.date < b.day.date ? 1 : a.day.date > b.day.date ? -1 : 0))

  // ── 요약 카드 ──────────────────────────────────────────────────
  const stats: StatItem[] = [
    { label: '근무일 (셀)', value: sm?.work_day_count ?? 0, unit: '일', tint: 'blue', icon: '📅',
      subValue: sm ? `상담원 ${sm.worker_count}명` : undefined },
    { label: '지각', value: sm?.late_count ?? 0, unit: '회', tint: 'red', icon: '🔺',
      subValue: sm && sm.late_count > 0 ? '상세 아래 표' : '없음' },
    { label: '조퇴', value: sm?.early_count ?? 0, unit: '회', tint: 'amber', icon: '🔻',
      subValue: sm && sm.early_count > 0 ? '상세 아래 표' : '없음' },
    { label: '정상', value: sm?.ok_count ?? 0, unit: '일', tint: 'green', icon: '✅',
      subValue: sm && sm.work_day_count > 0
        ? `${Math.round((sm.ok_count / sm.work_day_count) * 100)}%` : undefined },
    { label: '미집계', value: (sm?.no_data_count ?? 0) + (sm?.unmatched_count ?? 0), unit: '일',
      tint: 'slate', icon: '❔',
      subValue: sm ? `데이터없음 ${sm.no_data_count} · KT미연결 ${sm.unmatched_count}` : undefined },
  ]

  // ── 워커별 표 (전 컬럼 sortBy — 규칙 18) ───────────────────────
  const columns: TableColumn<WorkerResult>[] = [
    {
      key: 'name', label: '상담원', width: 130,
      sortBy: (r) => r.name,
      render: (r) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>{r.name}</span>
          {!r.kt_id && (
            <span title="KT ID 미연결 — 「⚙ 설정 › 상담원 매칭」 필요" style={{
              width: 6, height: 6, borderRadius: 99, background: COLORS.warning,
              display: 'inline-block',
            }} />
          )}
        </span>
      ),
    },
    {
      key: 'work_days', label: '근무일', width: 80, align: 'right',
      sortBy: (r) => r.work_days,
      render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{r.work_days}일</span>,
    },
    {
      key: 'late', label: '지각', width: 130, align: 'right',
      sortBy: (r) => r.late_total_min,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {r.late_count > 0
            ? <><b style={{ color: COLORS.danger }}>{r.late_count}회</b>
                <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 5 }}>
                  {fmtMin(r.late_total_min)}</span></>
            : <span style={{ color: COLORS.textDim }}>—</span>}
        </span>
      ),
    },
    {
      key: 'early', label: '조퇴', width: 130, align: 'right',
      sortBy: (r) => r.early_total_min,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {r.early_count > 0
            ? <><b style={{ color: COLORS.warning }}>{r.early_count}회</b>
                <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 5 }}>
                  {fmtMin(r.early_total_min)}</span></>
            : <span style={{ color: COLORS.textDim }}>—</span>}
        </span>
      ),
    },
    {
      key: 'untracked', label: '미집계', width: 96, align: 'right',
      sortBy: (r) => (r.kt_id ? r.no_data_days : r.work_days),
      render: (r) => {
        const n = r.kt_id ? r.no_data_days : r.work_days
        return (
          <span style={{ whiteSpace: 'nowrap', color: n > 0 ? COLORS.textSecondary : COLORS.textDim }}>
            {n > 0 ? `${n}일` : '—'}
          </span>
        )
      },
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
            📅 {data.from}{data.from !== data.to ? ` ~ ${data.to}` : ''}
            {' · '}유예 {data.grace_minutes}분
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

      {/* ── 마이그레이션 미적용 안내 ──────────────────────────── */}
      {data?.migration_pending && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning,
        }}>
          ⚠ cs_kpi_attendance_config 테이블이 아직 적용되지 않았습니다 —
          유예시간 0분으로 판정 중입니다. 마이그레이션 적용 후 「⚙ 설정」 에서 조정할 수 있습니다.
        </div>
      )}

      {/* ── daily 생산성 없음 안내 ────────────────────────────── */}
      {data && !data.has_daily_prod && !isEmpty && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning,
        }}>
          ⚠ 이 기간에 <b>일자별 생산성 데이터</b>가 없습니다 — 지각·조퇴는 KT 생산성(상담사)
          엑셀을 <b>일 단위</b>로 업로드해야 산출됩니다. (월 단위 파일만 있으면 판정 불가)
        </div>
      )}

      {/* ── 빈 상태 ───────────────────────────────────────────── */}
      {isEmpty && !loading && (
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: 40, textAlign: 'center', marginBottom: 12,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🕐</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
            이 기간에 근무 배정이 없습니다
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 6 }}>
            「{GRAN_LABEL[granularity]}」 기준 cs_assignments 근무 배정이 비어 있습니다.
          </div>
        </div>
      )}

      {/* ── 요약 카드 ─────────────────────────────────────────── */}
      {data && !isEmpty && <DcStatStrip stats={stats} fullWidth />}

      {/* ── 워커별 근태 표 ────────────────────────────────────── */}
      {data && !isEmpty && (
        <div style={{ marginTop: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, margin: '4px 2px 8px' }}>
            👥 상담원별 근태
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginLeft: 8 }}>
              컬럼 클릭으로 정렬 · 정시 ±{data.grace_minutes}분 이내는 정상
            </span>
          </div>
          <NeuDataTable
            columns={columns}
            data={workers}
            rowKey={(r) => r.worker_id}
            defaultSort={{ key: 'late', dir: 'desc' }}
            emptyIcon="👥"
            emptyMessage="집계된 상담원이 없습니다"
            mobileCard={{
              title: (r) => r.name,
              subtitle: (r) => `근무 ${r.work_days}일`,
              trailing: (r) => `지각 ${r.late_count} · 조퇴 ${r.early_count}`,
            }}
          />
        </div>
      )}

      {/* ── 지각·조퇴 상세 (적발 일자) ───────────────────────────── */}
      {data && !isEmpty && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 10 }}>
            ⚠ 지각·조퇴 상세
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginLeft: 8 }}>
              {flagged.length > 0 ? `${flagged.length}건 — 날짜순` : '적발 건 없음'}
            </span>
          </div>
          {flagged.length === 0 ? (
            <div style={{
              padding: 16, textAlign: 'center', fontSize: 12, color: COLORS.textMuted,
              background: 'rgba(0,0,0,0.02)', borderRadius: 8,
            }}>이 기간에 지각·조퇴가 없습니다</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                    <th style={th}>날짜</th>
                    <th style={th}>상담원</th>
                    <th style={th}>시프트</th>
                    <th style={{ ...th, textAlign: 'right' }}>예정</th>
                    <th style={{ ...th, textAlign: 'right' }}>실측 로그인</th>
                    <th style={{ ...th, textAlign: 'right' }}>판정</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map(({ worker, day }, i) => {
                    const meta = STATUS_META[day.status]
                    return (
                      <tr key={`${worker}-${day.date}-${i}`}
                        style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                        <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>
                          {day.date}{day.is_overnight ? ' 🌙' : ''}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700, color: COLORS.textPrimary }}>
                          {worker}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap', color: COLORS.textMuted }}>
                          {day.slots.map((s) => s.code).join('+') || '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {day.sched_start}~{day.sched_end}
                        </td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {day.login_first ?? '—'}~{day.login_last ?? '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                            fontWeight: 800, color: meta.color, background: meta.bg,
                          }}>
                            {day.late_min > 0 && `지각 ${fmtMin(day.late_min)}`}
                            {day.late_min > 0 && day.early_min > 0 && ' · '}
                            {day.early_min > 0 && `조퇴 ${fmtMin(day.early_min)}`}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '5px 8px', textAlign: 'left',
  color: COLORS.textMuted, fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '5px 8px', fontSize: 11, color: COLORS.textSecondary,
}
