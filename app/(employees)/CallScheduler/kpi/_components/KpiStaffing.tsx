'use client'
// ═══════════════════════════════════════════════════════════════════
// CX KPI — WFM 필요인원 산정 (Erlang C) — KPI-DESIGN.md §5-4
//   · 일/주/월 토글 + 날짜 (KpiDashboard 와 동일 UX)
//   · 시간대별 필요 vs 배정(커버) 인원 — 글래스 막대 표
//   · 시프트별 과부족 카드 (🔴 부족 / 🟢 적정 / 🟡 과잉)
//   · cs_wfm_config 기준 요약 줄 표시 (편집은 KPI 설정 탭으로 이관)
//   데이터: GET /api/call-scheduler/kpi/staffing
//           (산정 기준은 staffing 응답의 config 로 표시만)
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'
import KpiPeriodPicker, { type KpiPeriod, periodQuery } from './KpiPeriodPicker'

type Granularity = 'day' | 'week' | 'month'

interface WfmConfig {
  id: string | null
  target_service_level_pct: number
  target_answer_sec: number
  shrinkage_pct: number
  interval_minutes: number
  max_occupancy_pct: number
  updated_at?: string | null
}
interface HourRow {
  hour: number
  calls: number
  aht: number
  required: number
  scheduled: number
  diff: number
}
interface ShiftRow {
  shift_name: string
  hours: string
  required_peak: number
  scheduled: number
  status: 'short' | 'ok' | 'over'
  shortage: number          // 부족 인원수 (short 일 때 > 0)
  reason: string            // 부족 사유 텍스트 (short 가 아니면 '')
}
interface StaffingSummary {
  granularity: string; from: string; to: string; days: number
  interval_minutes: number
  total_calls: number; avg_aht: number
  peak_hour: number; peak_required: number
  avg_required: number; sum_required: number; sum_scheduled: number
  short_hours: number
  has_call_data: boolean; has_work_data: boolean
  target_service_level: number
  actual_service_level: number | null
  has_response_data: boolean
}
interface StaffingData {
  config: WfmConfig
  hourly: HourRow[]
  shifts: ShiftRow[]
  summary: StaffingSummary
}

const pad = (n: number) => String(n).padStart(2, '0')
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// 초 → "MM:SS"
function fmtMS(sec: number): string {
  if (!sec || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
const GRAN_LABEL: Record<Granularity, string> = { day: '일', week: '주', month: '월' }

// 과부족 상태 → 시각 토큰
const STATUS_META: Record<ShiftRow['status'], { emoji: string; label: string; bg: string; border: string; color: string }> = {
  short: { emoji: '🔴', label: '부족', bg: COLORS.bgRed,   border: COLORS.borderRed,   color: COLORS.danger },
  ok:    { emoji: '🟢', label: '적정', bg: COLORS.bgGreen, border: COLORS.borderGreen, color: COLORS.success },
  over:  { emoji: '🟡', label: '과잉', bg: COLORS.bgAmber, border: COLORS.borderAmber, color: COLORS.warning },
}

export default function KpiStaffing() {
  const [period, setPeriod] = useState<KpiPeriod>(
    { granularity: 'month', date: todayIso(), from: null, to: null })
  const granularity = period.granularity
  const [data, setData] = useState<StaffingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/kpi/staffing?${periodQuery(period)}`,
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

  // 산정 기준 — staffing 응답의 config (표시 전용, 편집은 KPI 설정 탭)
  const cfg = data?.config ?? null
  const s = data?.summary
  const hourly = data?.hourly ?? []
  const shifts = data?.shifts ?? []
  // 데이터 표시 시간대 — 콜 또는 배정이 있는 시간대만 (0건 시간 다 보여주면 노이즈)
  const activeHours = hourly.filter(h => h.calls > 0 || h.scheduled > 0 || h.required > 0)
  const isEmpty = !!data && !s?.has_call_data && !s?.has_work_data

  // ── 상단 5 카드 ──
  const stats: StatItem[] = [
    { label: '피크 필요인원', value: s?.peak_required ?? 0, unit: '명', tint: 'red', icon: '🔺',
      subValue: s ? `${pad(s.peak_hour)}시 기준` : undefined },
    { label: '평균 필요인원', value: s?.avg_required ?? 0, unit: '명', tint: 'blue', icon: '📊',
      subValue: s ? `인터벌 ${s.interval_minutes}분` : undefined },
    { label: '총 통화량', value: s?.total_calls ?? 0, unit: '콜', tint: 'green', icon: '📞',
      subValue: s ? `평균 AHT ${fmtMS(s.avg_aht)}` : undefined },
    { label: '부족 시간대', value: s?.short_hours ?? 0, unit: '개', tint: 'amber', icon: '⚠',
      subValue: s ? `필요 발생 시간대 중` : undefined },
    { label: '커버 인원', value: s?.sum_scheduled ?? 0, unit: '명·시', tint: 'purple', icon: '👥',
      subValue: s ? `필요 합 ${s.sum_required}` : undefined },
  ]

  // 막대 표 스케일 — 필요·배정 중 최댓값
  const maxAgents = Math.max(
    ...activeHours.map(h => Math.max(h.required, h.scheduled)), 1,
  )

  return (
    <div>
      {/* ── 기간 선택 (프리셋·이전/다음·직접범위) + 새로고침 ─────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <KpiPeriodPicker value={period} onChange={setPeriod} />
        {s && (
          <span style={{ fontSize: 11, color: COLORS.textMuted }}>
            📅 {s.from}{s.from !== s.to ? ` ~ ${s.to}` : ''}
            {' · '}{s.days}일 평균 · 인터벌 {s.interval_minutes}분
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

      {/* ── WFM 산정 기준 요약 줄 (상시 표시 — 편집은 KPI 설정 탭) ──── */}
      {cfg && (
        <div style={{
          ...GLASS.L3, background: COLORS.bgBlue, border: `1px solid ${COLORS.borderBlue}`,
          borderRadius: 10, padding: '8px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.primary, whiteSpace: 'nowrap' }}>
            🧮 산정 기준
          </span>
          <SummaryChip label="목표 응대율" value={`${cfg.target_service_level_pct}%`} />
          <SummaryChip label="목표 응대시간" value={`${cfg.target_answer_sec}초 내`} />
          <SummaryChip label="부재율" value={`${cfg.shrinkage_pct}%`} />
          <SummaryChip
            label="평균 AHT"
            value={s && s.avg_aht > 0 ? fmtMS(s.avg_aht) : '—'} />
          <SummaryChip label="산정 단위" value={`${cfg.interval_minutes}분`} />
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
            Erlang C — 산정 기준 편집은 「⚙ 설정」 탭에서
          </span>
        </div>
      )}

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
          <div style={{ fontSize: 32, marginBottom: 8 }}>🧮</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
            이 기간에 산정할 통화·근무 데이터가 없습니다
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 6 }}>
            「{GRAN_LABEL[granularity]}」 기준 콜 인입량(cs_call_records)이 비어 있습니다.
            <br />업로드 탭에서 KT 상담이력 엑셀을 먼저 적재하세요.
          </div>
        </div>
      )}

      {/* ── 5 스탯 카드 ───────────────────────────────────────── */}
      {data && !isEmpty && <DcStatStrip stats={stats} fullWidth />}

      {/* ── 목표 SL vs 실제 SL (cs_response_queue) ────────────── */}
      {data && !isEmpty && s && (() => {
        const target = s.target_service_level
        const actual = s.actual_service_level
        const hasActual = s.has_response_data && actual != null
        const below = hasActual && actual! < target
        const tone = !hasActual
          ? { bg: COLORS.bgGray, border: COLORS.borderFaint, color: COLORS.textMuted }
          : below
            ? { bg: COLORS.bgRed, border: COLORS.borderRed, color: COLORS.danger }
            : { bg: COLORS.bgGreen, border: COLORS.borderGreen, color: COLORS.success }
        return (
          <div style={{
            ...GLASS.L3, background: tone.bg, border: `1px solid ${tone.border}`,
            borderRadius: 12, padding: 14, marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>
              🎯 목표 SL vs 실제 SL
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 700 }}>목표</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, lineHeight: 1 }}>
                {target}%
              </span>
            </div>
            <span style={{ fontSize: 16, color: COLORS.textMuted }}>→</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 700 }}>실제</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: tone.color, lineHeight: 1 }}>
                {hasActual ? `${actual}%` : '—'}
              </span>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 800, color: tone.color, whiteSpace: 'nowrap',
            }}>
              {!hasActual
                ? '응대현황(큐) 미적재 — 업로드 탭에서 적재'
                : below
                  ? `🔴 목표 미달 (${Math.round((actual! - target) * 10) / 10}%p)`
                  : `🟢 목표 달성 (+${Math.round((actual! - target) * 10) / 10}%p)`}
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
              실제 = cs_response_queue 가중평균 (20초내 응대 ÷ 인입)
            </span>
          </div>
        )
      })()}

      {/* ── 시프트별 과부족 카드 ──────────────────────────────── */}
      {data && !isEmpty && shifts.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, margin: '4px 2px 8px' }}>
            🗂 시프트별 과부족
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginLeft: 8 }}>
              피크 필요인원 대비 평균 배정인원
            </span>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10,
          }}>
            {shifts.map((sh) => {
              const m = STATUS_META[sh.status]
              return (
                <div key={`${sh.shift_name}-${sh.hours}`} style={{
                  ...GLASS.L3, background: m.bg, border: `1px solid ${m.border}`,
                  borderRadius: 12, padding: 12,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                  }}>
                    <span style={{
                      fontSize: 13, fontWeight: 800, color: COLORS.textPrimary,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={sh.shift_name}>{sh.shift_name}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 800, color: m.color, whiteSpace: 'nowrap',
                    }}>{m.emoji} {m.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                    {sh.hours}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8,
                  }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: m.color, lineHeight: 1 }}>
                      {sh.scheduled}
                    </span>
                    <span style={{ fontSize: 12, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
                      / 필요 {sh.required_peak}명
                    </span>
                  </div>
                  {/* 🔴 부족 시프트 — 사유 한 줄 표시 */}
                  {sh.status === 'short' && sh.reason && (
                    <div style={{
                      marginTop: 8, padding: '5px 8px', borderRadius: 7,
                      background: '#fff', border: `1px solid ${COLORS.borderRed}`,
                      fontSize: 11, fontWeight: 700, color: COLORS.danger,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={sh.reason}>
                      ⚠ {sh.reason}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 시간대별 필요 vs 배정 — 막대 표 ───────────────────── */}
      {data && !isEmpty && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 4 }}>
            ⏰ 시간대별 필요인원 vs 배정(커버) 인원
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10 }}>
            <span style={{ color: COLORS.primary, fontWeight: 700 }}>■ 필요(Erlang C)</span>
            <span style={{ margin: '0 6px' }}>·</span>
            <span style={{ color: COLORS.success, fontWeight: 700 }}>■ 배정 커버</span>
            {' '}— 콜·배정이 있는 시간대만 표시
          </div>
          {activeHours.length === 0 ? (
            <div style={{
              padding: 16, textAlign: 'center', fontSize: 12, color: COLORS.textMuted,
              background: 'rgba(0,0,0,0.02)', borderRadius: 8,
            }}>표시할 시간대가 없습니다</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* 헤더 행 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '2px 10px',
                fontSize: 10, fontWeight: 700, color: COLORS.textMuted,
              }}>
                <span style={{ minWidth: 52 }}>시간</span>
                <span style={{ minWidth: 64, textAlign: 'right' }}>콜/처리시간</span>
                <span style={{ flex: 1 }}>필요 / 배정</span>
                <span style={{ minWidth: 70, textAlign: 'right' }}>과부족</span>
              </div>
              {activeHours.map((h) => {
                const reqPct = (h.required / maxAgents) * 100
                const schPct = (h.scheduled / maxAgents) * 100
                const short = h.required > 0 && h.diff < 0
                return (
                  <div key={h.hour} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 10px', borderRadius: 8,
                    background: short ? COLORS.bgRed : COLORS.bgGray,
                    border: `1px solid ${short ? COLORS.borderRed : COLORS.borderFaint}`,
                    fontSize: 12,
                  }}>
                    <span style={{
                      minWidth: 52, fontWeight: 700, color: COLORS.textPrimary, whiteSpace: 'nowrap',
                    }}>{pad(h.hour)}시</span>
                    <span style={{
                      minWidth: 56, textAlign: 'right', fontSize: 10, color: COLORS.textMuted,
                      whiteSpace: 'nowrap',
                    }}>{h.calls} / {fmtMS(h.aht)}</span>
                    {/* 막대 — 필요(파랑) + 배정(녹색) 2단 */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Bar pct={reqPct} value={h.required} color={COLORS.primary} label="필요" />
                      <Bar pct={schPct} value={h.scheduled} color={COLORS.success} label="배정" />
                    </div>
                    <span style={{
                      minWidth: 70, textAlign: 'right', fontSize: 11, fontWeight: 800,
                      whiteSpace: 'nowrap',
                      color: h.diff < 0 ? COLORS.danger : h.diff > 0 ? COLORS.warning : COLORS.success,
                    }}>
                      {h.diff < 0 ? `${h.diff}명` : h.diff > 0 ? `+${h.diff}명` : '적정'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 부분 데이터 안내 ──────────────────────────────────── */}
      {data && !isEmpty && (!s?.has_call_data || !s?.has_work_data) && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning,
        }}>
          ⚠ 일부 소스만 적재됨 —
          {!s?.has_call_data && ' 통화이력 없음 (필요인원 0)'}
          {!s?.has_work_data && ' 근무배정 없음 (배정 커버 0)'}
          {' '}· 누락 소스의 지표는 0 으로 표시됩니다.
        </div>
      )}
    </div>
  )
}

// ── 산정 기준 요약 칩 (label 약 / value 강) ─────────────────────
function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 4,
      padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap',
      background: '#fff', border: `1px solid ${COLORS.borderBlue}`,
    }}>
      <span style={{ fontSize: 10, color: COLORS.textSecondary, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, color: COLORS.textPrimary, fontWeight: 800 }}>{value}</span>
    </span>
  )
}

// ── 단일 막대 (필요 또는 배정) ─────────────────────────────────
function Bar({ pct, value, color, label }: {
  pct: number; value: number; color: string; label: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        fontSize: 9, color: COLORS.textMuted, minWidth: 24, whiteSpace: 'nowrap',
      }}>{label}</span>
      <div style={{
        flex: 1, height: 12, position: 'relative',
        background: '#fff', borderRadius: 4,
        border: `1px solid ${COLORS.borderFaint}`, overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${Math.min(pct, 100)}%`, background: color, transition: 'width 0.2s',
        }} />
      </div>
      <span style={{
        fontSize: 11, fontWeight: 800, color, minWidth: 30, textAlign: 'right',
        whiteSpace: 'nowrap',
      }}>{value}명</span>
    </div>
  )
}
