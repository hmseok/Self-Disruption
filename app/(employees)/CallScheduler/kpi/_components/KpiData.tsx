'use client'
// ═══════════════════════════════════════════════════════════════════
// CX KPI — 데이터 관리·검수 탭
//   업로드된 KT 베이스 데이터(4개 소스)가 「전체 다 들어왔는지 /
//   중복은 없는지 / 며칠치 기준인지」 를 한 화면에서 검수·관리.
//
//   · 일/주/월 토글 + 날짜 (KpiDashboard 동일 UX)
//   · 상단 요약 — 4개 소스 평균 충족율 등 DcStatStrip
//   · 소스 4개 카드 — 충족율 막대 / 총 행수 / 데이터 기간 / 중복 안전 배지 / 빠진 날짜
//   · 카드 펼침 — 날짜별 행수 표(이상치 강조) + 빠진 날짜 목록
//   · 「기간 데이터 삭제」 — 글래스 확인 패널(confirm() 금지 — 규칙 20) → DELETE
//   데이터: GET / DELETE /api/call-scheduler/kpi/data-status
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'

type Granularity = 'day' | 'week' | 'month'

type SourceKey = 'call_records' | 'productivity' | 'response_ivr' | 'response_queue'

interface SourceStatus {
  source: SourceKey
  label: string
  available: boolean
  total_rows: number
  covered_dates: number
  period_days: number
  coverage_pct: number
  missing_dates: string[]
  by_date: { date: string; rows: number }[]
  date_min: string | null
  date_max: string | null
  unique_ok: boolean
  monthly_rows?: number
}

interface DataStatus {
  meta: { granularity: string; from: string; to: string; period_days: number }
  sources: Record<SourceKey, SourceStatus>
}

// 소스 표시 메타 (이모지 + 단위 라벨)
const SOURCE_META: Record<SourceKey, { emoji: string; unit: string; note: string }> = {
  call_records: { emoji: '📞', unit: '통화', note: 'KT 상담이력조회 — 통화 1건 = 1행 (콜키 고유)' },
  productivity: { emoji: '📊', unit: '행', note: 'KT 생산성(상담사) — 일자 기준 충족율 (월별 행은 별도 표기)' },
  response_ivr: { emoji: '📲', unit: '행', note: 'KT 응대현황(IVR) — 일자 × 착신번호' },
  response_queue: { emoji: '📡', unit: '행', note: 'KT 응대현황(큐) — 일자 × 스킬' },
}
const SOURCE_ORDER: SourceKey[] = ['call_records', 'productivity', 'response_ivr', 'response_queue']

const GRAN_LABEL: Record<Granularity, string> = { day: '일', week: '주', month: '월' }

const pad = (n: number) => String(n).padStart(2, '0')
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 충족율 → 색상 (90%+ 녹 / 50%+ 노랑 / 미만 빨강)
function coverageColor(pct: number): string {
  if (pct >= 90) return COLORS.success
  if (pct >= 50) return COLORS.warning
  return COLORS.danger
}
function coverageBg(pct: number): string {
  if (pct >= 90) return COLORS.bgGreen
  if (pct >= 50) return COLORS.bgAmber
  return COLORS.bgRed
}

// 삭제 확인 패널 상태
interface DeleteState {
  source: SourceKey
  label: string
  from: string
  to: string
}

export default function KpiData() {
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [date, setDate] = useState<string>(todayIso())
  const [data, setData] = useState<DataStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<SourceKey>>(new Set())
  // 삭제 확인 패널 / 진행 / 결과
  const [delConfirm, setDelConfirm] = useState<DeleteState | null>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [delResult, setDelResult] = useState<{ label: string; deleted: number } | null>(null)
  const [delError, setDelError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/kpi/data-status?granularity=${granularity}&date=${date}`,
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

  const toggleExpand = (k: SourceKey) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  // 삭제 실행 (글래스 확인 패널에서 「삭제」 클릭)
  const runDelete = async () => {
    if (!delConfirm) return
    setDelBusy(true); setDelError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/kpi/data-status?source=${delConfirm.source}`
        + `&from=${delConfirm.from}&to=${delConfirm.to}`,
        { method: 'DELETE', headers: auth },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '삭제 실패')
      setDelResult({ label: delConfirm.label, deleted: Number(json?.data?.deleted || 0) })
      setDelConfirm(null)
      await load()   // 삭제 후 새로고침
    } catch (e: any) {
      setDelError(e?.message || '삭제 오류')
    } finally {
      setDelBusy(false)
    }
  }

  const sources: SourceStatus[] = data
    ? SOURCE_ORDER.map((k) => data.sources[k]).filter(Boolean)
    : []
  const anyAvailable = sources.some((s) => s.available && (s.total_rows > 0 || !!s.monthly_rows))
  const isEmpty = !!data && !anyAvailable

  // ── 상단 요약 — 4개 소스 평균 충족율 ──
  const availForAvg = sources.filter((s) => s.available)
  const avgCoverage = availForAvg.length > 0
    ? Math.round(
        (availForAvg.reduce((sum, s) => sum + s.coverage_pct, 0) / availForAvg.length) * 10,
      ) / 10
    : 0
  const totalRowsAll = sources.reduce((sum, s) => sum + s.total_rows, 0)
  const loadedSources = sources.filter(
    (s) => s.available && (s.total_rows > 0 || !!s.monthly_rows),
  ).length
  const dupSources = sources.filter((s) => s.available && !s.unique_ok).length
  const missingTotal = sources.reduce(
    (sum, s) => sum + (s.available ? s.missing_dates.length : 0), 0,
  )

  const summaryStats: StatItem[] = [
    {
      label: '평균 충족율', value: data ? `${avgCoverage}%` : '—',
      tint: !data ? 'slate' : avgCoverage >= 90 ? 'green' : avgCoverage >= 50 ? 'amber' : 'red',
      icon: '📈',
      subValue: data ? `${data.meta.period_days}일 기준` : undefined,
    },
    {
      label: '적재 소스', value: `${loadedSources} / 4`, tint: 'blue', icon: '🗂',
      subValue: '데이터 있는 소스 수',
    },
    {
      label: '총 행수', value: totalRowsAll, unit: '행', tint: 'blue', icon: '🧮',
      subValue: '기간 내 4개 소스 합계',
    },
    {
      label: '중복 의심', value: dupSources, unit: '소스',
      tint: dupSources > 0 ? 'red' : 'green', icon: dupSources > 0 ? '⚠' : '✓',
      subValue: dupSources > 0 ? '중복 키 발견 — 카드 확인' : '모두 고유',
    },
    {
      label: '빠진 날짜', value: missingTotal, unit: '일',
      tint: missingTotal > 0 ? 'amber' : 'green', icon: '📅',
      subValue: missingTotal > 0 ? '4개 소스 누락 합계' : '누락 없음',
    },
  ]

  return (
    <div>
      {/* ── 기간 토글 + 날짜 ──────────────────────────────────── */}
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
            {' · '}{data.meta.period_days}일
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

      {/* ── 삭제 결과 패널 (규칙 20 — 글래스 패널) ────────────── */}
      {delResult && (
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: 12, marginBottom: 12,
          border: `1px solid ${COLORS.borderGreen}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.success }}>
            ✅ {delResult.label} — {delResult.deleted.toLocaleString()}행 삭제 완료
          </div>
          <button onClick={() => setDelResult(null)}
            style={{
              ...BTN.sm, background: 'transparent', color: COLORS.textSecondary,
              border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
            }}>
            × 닫기
          </button>
        </div>
      )}

      {/* ── 빈 상태 ───────────────────────────────────────────── */}
      {isEmpty && !loading && (
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: 40, textAlign: 'center', marginBottom: 12,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
            아직 업로드된 데이터가 없습니다
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 6 }}>
            「{GRAN_LABEL[granularity]}」 기준 4개 소스 모두 비어 있습니다.
            <br />「📤 KT 엑셀 업로드」 탭에서 KT 엑셀을 올리세요.
          </div>
        </div>
      )}

      {/* ── 상단 요약 ─────────────────────────────────────────── */}
      {data && !isEmpty && <DcStatStrip stats={summaryStats} fullWidth />}

      {/* ── 소스 4개 카드 ─────────────────────────────────────── */}
      {data && !isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {SOURCE_ORDER.map((k) => (
            <SourceCard
              key={k}
              status={data.sources[k]}
              expanded={expanded.has(k)}
              onToggle={() => toggleExpand(k)}
              onDelete={() => {
                setDelError(null)
                setDelConfirm({
                  source: k, label: data.sources[k].label,
                  from: data.meta.from, to: data.meta.to,
                })
              }}
            />
          ))}
        </div>
      )}

      {/* ── 안내 ──────────────────────────────────────────────── */}
      {data && !isEmpty && (
        <div style={{
          marginTop: 16, padding: 12, borderRadius: 8,
          background: COLORS.bgGray, border: `1px solid ${COLORS.borderFaint}`,
          fontSize: 11, color: COLORS.textMuted,
        }}>
          ℹ 충족율 = 데이터가 있는 날짜 수 ÷ 기간 일수. 90%+ 녹색 · 50%+ 노랑 · 미만 빨강.
          중복 안전은 UNIQUE 키 기준 행수 비교입니다. 잘못 올린 분은
          소스 카드의 「기간 데이터 삭제」 로 제거 후 다시 업로드하세요.
        </div>
      )}

      {/* ── 삭제 확인 글래스 패널 (confirm() 금지 — 규칙 20) ───── */}
      {delConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(15,23,42,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}
          onClick={() => { if (!delBusy) setDelConfirm(null) }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...GLASS.L4, borderRadius: 14, padding: 20, maxWidth: 420, width: '100%',
              border: `1px solid ${COLORS.borderRed}`,
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.danger }}>
              🗑 기간 데이터 삭제
            </div>
            <div style={{ fontSize: 13, color: COLORS.textPrimary, marginTop: 10, lineHeight: 1.6 }}>
              <b>{delConfirm.label}</b> 의 다음 기간 데이터를 삭제합니다.
              <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 8,
                background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
                fontSize: 12, color: COLORS.danger, fontWeight: 700,
              }}>
                📅 {delConfirm.from}
                {delConfirm.from !== delConfirm.to ? ` ~ ${delConfirm.to}` : ''}
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>
                이 작업은 되돌릴 수 없습니다. 잘못 올린 업로드분을 정리할 때만 사용하세요.
                {delConfirm.source === 'productivity'
                  && ' 생산성은 일자(daily) 행만 삭제됩니다 — 월별(monthly) 행은 유지됩니다.'}
              </div>
            </div>

            {delError && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 8,
                background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
                color: COLORS.danger, fontSize: 12,
              }}>❌ {delError}</div>
            )}

            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16,
            }}>
              <button onClick={() => setDelConfirm(null)} disabled={delBusy}
                style={{
                  ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                  border: `1px solid ${COLORS.borderFaint}`,
                  cursor: delBusy ? 'not-allowed' : 'pointer',
                }}>
                취소
              </button>
              <button onClick={runDelete} disabled={delBusy}
                style={{
                  ...BTN.md, background: COLORS.danger, color: '#fff', border: 'none',
                  cursor: delBusy ? 'not-allowed' : 'pointer', opacity: delBusy ? 0.6 : 1,
                }}>
                {delBusy ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 소스 카드 — 충족율 막대 + 펼침 상세 ──────────────────────────
function SourceCard({ status, expanded, onToggle, onDelete }: {
  status: SourceStatus
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const meta = SOURCE_META[status.source]
  const hasData = status.available && (status.total_rows > 0 || !!status.monthly_rows)

  // 미적재 — 안내만
  if (!status.available) {
    return (
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: 14,
        border: `1px solid ${COLORS.borderFaint}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textMuted }}>
            {meta.emoji} {status.label}
          </span>
          <span style={{
            padding: '3px 9px', borderRadius: 999,
            background: COLORS.bgGray, border: `1px solid ${COLORS.borderFaint}`,
            color: COLORS.textMuted, fontSize: 11, fontWeight: 700,
          }}>
            테이블 미적재
          </span>
        </div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6 }}>
          {meta.note} — 아직 데이터가 없습니다.
        </div>
      </div>
    )
  }

  const pct = status.coverage_pct
  const barColor = coverageColor(pct)

  // 이상치 — 날짜별 행수 중앙값 대비 40% 미만이면 빨강 강조
  const rowsArr = status.by_date.map((d) => d.rows).filter((r) => r > 0).sort((a, b) => a - b)
  const median = rowsArr.length > 0
    ? rowsArr[Math.floor(rowsArr.length / 2)]
    : 0
  const isOutlier = (rows: number) => median > 0 && rows > 0 && rows < median * 0.4

  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, padding: 14,
      border: `1px solid ${hasData ? coverageBg(pct) : COLORS.borderFaint}`,
    }}>
      {/* 헤더 — 소스명 / 배지 / 펼침 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
          {meta.emoji} {status.label}
        </span>
        {/* 중복 안전 배지 */}
        {status.unique_ok ? (
          <span style={{
            padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
            background: COLORS.bgGreen, border: `1px solid ${COLORS.borderGreen}`,
            color: COLORS.success, fontSize: 11, fontWeight: 800,
          }}>
            ✓ 고유 (중복 없음)
          </span>
        ) : (
          <span style={{
            padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
            background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            color: COLORS.danger, fontSize: 11, fontWeight: 800,
          }}>
            ⚠ 중복 의심
          </span>
        )}
        {status.missing_dates.length > 0 && (
          <span style={{
            padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
            background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
            color: COLORS.warning, fontSize: 11, fontWeight: 800,
          }}>
            📅 빠진 날짜 {status.missing_dates.length}일
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={onDelete}
          style={{
            ...BTN.sm, background: COLORS.bgRed, color: COLORS.danger,
            border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
          🗑 기간 데이터 삭제
        </button>
        <button onClick={onToggle}
          style={{
            ...BTN.sm, background: 'transparent', color: COLORS.textSecondary,
            border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
          {expanded ? '▲ 접기' : '▼ 상세'}
        </button>
      </div>

      {/* 충족율 막대 */}
      <div style={{ marginTop: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4,
        }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: barColor }}>
            {pct}%
          </span>
          <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
            충족 ({status.covered_dates} / {status.period_days}일)
          </span>
        </div>
        <div style={{
          height: 12, borderRadius: 6, overflow: 'hidden',
          background: '#fff', border: `1px solid ${COLORS.borderFaint}`,
        }}>
          <div style={{
            width: `${Math.min(pct, 100)}%`, height: '100%',
            background: barColor, transition: 'width 0.25s',
          }} />
        </div>
      </div>

      {/* 핵심 수치 — 한 줄 (줄바꿈 최소화 — 규칙 19) */}
      <div style={{
        marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 16,
        fontSize: 12, color: COLORS.textSecondary,
      }}>
        <span style={{ whiteSpace: 'nowrap' }}>
          🧮 총 행수{' '}
          <b style={{ color: COLORS.textPrimary }}>
            {status.total_rows.toLocaleString()}
          </b>{' '}{meta.unit}
        </span>
        <span style={{ whiteSpace: 'nowrap' }}>
          📅 데이터 기간{' '}
          <b style={{ color: COLORS.textPrimary }}>
            {status.date_min && status.date_max
              ? (status.date_min === status.date_max
                  ? status.date_min
                  : `${status.date_min} ~ ${status.date_max}`)
              : '—'}
          </b>
        </span>
        {status.source === 'productivity' && (
          <span style={{ whiteSpace: 'nowrap', color: COLORS.textMuted }}>
            🗓 월별 행 {(status.monthly_rows ?? 0).toLocaleString()}건
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6 }}>
        {meta.note}
      </div>

      {/* ── 펼침 — 날짜별 행수 표 + 빠진 날짜 ─────────────────── */}
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {/* 날짜별 행수 표 */}
          <div style={{
            fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6,
          }}>
            📆 날짜별 행수
            <span style={{ fontWeight: 600, color: COLORS.textMuted, marginLeft: 6 }}>
              (중앙값 대비 급감한 날 빨강 강조)
            </span>
          </div>
          {status.by_date.length > 0 ? (
            <div style={{
              ...GLASS.L1, borderRadius: 8, padding: 8,
              maxHeight: 240, overflowY: 'auto',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                    <th style={cellTh}>날짜</th>
                    <th style={{ ...cellTh, textAlign: 'right' }}>행수</th>
                    <th style={cellTh}>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {status.by_date.map((d) => {
                    const outlier = isOutlier(d.rows)
                    return (
                      <tr key={d.date} style={{
                        borderBottom: `1px solid ${COLORS.borderFaint}`,
                        background: outlier ? COLORS.bgRed : 'transparent',
                      }}>
                        <td style={{ ...cellTd, whiteSpace: 'nowrap' }}>{d.date}</td>
                        <td style={{
                          ...cellTd, textAlign: 'right', fontWeight: 700,
                          color: outlier ? COLORS.danger : COLORS.textPrimary,
                        }}>
                          {d.rows.toLocaleString()}
                        </td>
                        <td style={{ ...cellTd, color: COLORS.danger, fontWeight: 700 }}>
                          {outlier ? '⚠ 급감' : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{
              padding: 12, textAlign: 'center', fontSize: 11, color: COLORS.textMuted,
              background: COLORS.bgGray, borderRadius: 8,
            }}>
              이 기간에 행이 없습니다.
            </div>
          )}

          {/* 빠진 날짜 목록 */}
          {status.missing_dates.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: COLORS.warning, marginBottom: 6,
              }}>
                ⚠ 빠진 날짜 ({status.missing_dates.length}일)
              </div>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 6,
                padding: 10, borderRadius: 8,
                background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
              }}>
                {status.missing_dates.map((d) => (
                  <span key={d} style={{
                    fontSize: 11, fontWeight: 700, color: COLORS.warning,
                    background: '#fff', padding: '2px 8px', borderRadius: 999,
                    border: `1px solid ${COLORS.borderAmber}`, whiteSpace: 'nowrap',
                  }}>
                    {d}
                  </span>
                ))}
                {status.missing_dates.length >= 31 && (
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                    … (최대 31일 표시)
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
                이 날짜들은 데이터가 없습니다 — 해당 일자 KT 엑셀을 추가로 업로드하세요.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const cellTh: React.CSSProperties = {
  padding: '4px 8px', textAlign: 'left',
  color: COLORS.textMuted, fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
}
const cellTd: React.CSSProperties = {
  padding: '4px 8px', fontSize: 11, color: COLORS.textSecondary,
}
