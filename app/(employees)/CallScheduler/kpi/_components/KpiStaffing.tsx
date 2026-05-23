'use client'
// ═══════════════════════════════════════════════════════════════════
// CX KPI — WFM 필요인원 산정 (Erlang C) — CX-KPI-18 재설계
//   · 일/주/월 토글 + 날짜 (KpiPeriodPicker 공용)
//   · 요일 × 인터벌 격자 — 요일×시간대 과부족 히트맵
//   · 시프트별 과부족 카드 (🔴 부족 / 🟢 적정 / 🟡 과잉)
//   · cs_wfm_config 기준 요약 줄 표시 (편집은 KPI 설정 탭으로 이관)
//   데이터: GET /api/call-scheduler/kpi/staffing
//           (요일×인터벌 grid + dow_days + buckets_per_day 반환)
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
// (요일 × 인터벌) 격자 셀
interface GridCell {
  dow: number          // 0=월..6=일
  bucket: number       // 0..buckets_per_day-1
  calls: number
  aht: number
  required: number
  scheduled: number
  diff: number         // scheduled - required (음수 = 부족)
}
interface ShiftRow {
  shift_name: string
  code: string
  hours: string
  required_peak: number
  scheduled: number
  status: 'short' | 'ok' | 'over'
  shortage: number          // 부족 인원수 (short 일 때 > 0)
}
interface StaffingSummary {
  granularity: string; from: string; to: string
  interval_minutes: number
  buckets_per_day: number
  total_calls: number; avg_aht: number
  peak_dow: number; peak_bucket: number; peak_required: number
  sum_required: number; sum_scheduled: number
  short_cells: number; active_cells: number
  has_call_data: boolean; has_work_data: boolean
  target_service_level: number
  actual_service_level: number | null
  has_response_data: boolean
}
interface StaffingData {
  config: WfmConfig
  interval_minutes: number
  buckets_per_day: number
  dow_days: number[]
  grid: GridCell[]
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

// 요일 인덱스(0=월..6=일) → 한글 라벨
const DOW_LABEL = ['월', '화', '수', '목', '금', '토', '일']

// 버킷 시작 시각(분) → "HH:MM" 라벨
function bucketLabel(bucket: number, intervalMin: number): string {
  const m = bucket * intervalMin
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

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
  const grid = data?.grid ?? []
  const shifts = data?.shifts ?? []
  const dowDays = data?.dow_days ?? [0, 0, 0, 0, 0, 0, 0]
  const bucketsPerDay = data?.buckets_per_day ?? 24
  const intervalMin = data?.interval_minutes ?? 60
  const isEmpty = !!data && !s?.has_call_data && !s?.has_work_data

  // 격자 룩업 — `${dow}|${bucket}` → 셀
  const cellMap = new Map<string, GridCell>()
  for (const c of grid) cellMap.set(`${c.dow}|${c.bucket}`, c)
  // 표시 대상 요일 — 기간에 실제 발생한 요일만
  const activeDows: number[] = []
  for (let d = 0; d <= 6; d++) if (dowDays[d] > 0) activeDows.push(d)
  // 시각 라벨 표기 간격 — 60분: 2버킷마다(2h), 30분: 4버킷마다(2h)
  const labelEvery = intervalMin >= 60 ? 2 : 4

  // ── 상단 5 카드 ──
  const peakLabel = s
    ? `${DOW_LABEL[s.peak_dow] ?? '?'} ${bucketLabel(s.peak_bucket, intervalMin)}`
    : undefined
  const stats: StatItem[] = [
    { label: '피크 필요인원', value: s?.peak_required ?? 0, unit: '명', tint: 'red', icon: '🔺',
      subValue: peakLabel ? `${peakLabel} 피크` : undefined },
    { label: '부족 셀', value: s?.short_cells ?? 0, unit: '칸', tint: 'amber', icon: '⚠',
      subValue: s ? `필요 발생 ${s.active_cells}칸 중` : undefined },
    { label: '총 통화량', value: s?.total_calls ?? 0, unit: '콜', tint: 'green', icon: '📞',
      subValue: s ? `평균 AHT ${fmtMS(s.avg_aht)}` : undefined },
    { label: '필요 합', value: s?.sum_required ?? 0, unit: '명·칸', tint: 'blue', icon: '📊',
      subValue: s ? `커버 합 ${s.sum_scheduled}` : undefined },
    { label: '산정 인터벌', value: intervalMin, unit: '분', tint: 'purple', icon: '⏱',
      subValue: s ? `요일×시간대 격자` : undefined },
  ]

  // 히트맵 색조 스케일 — 부족·충분 양쪽 최대 |diff|
  let maxShort = 1
  let maxOver = 1
  for (const c of grid) {
    if (dowDays[c.dow] === 0) continue
    if (c.required <= 0) continue
    if (c.diff < 0 && -c.diff > maxShort) maxShort = -c.diff
    if (c.diff >= 0 && c.diff > maxOver) maxOver = c.diff
  }

  return (
    <div>
      {/* ── 기간 선택 (프리셋·이전/다음·직접범위) + 새로고침 ─────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <KpiPeriodPicker value={period} onChange={setPeriod} />
        {s && (
          <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
            📅 {s.from}{s.from !== s.to ? ` ~ ${s.to}` : ''}
            {' · '}요일 프로파일 · 인터벌 {intervalMin}분
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
                <div key={`${sh.code}-${sh.hours}`} style={{
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
                  {/* 🔴 부족 시프트 — 부족 인원수 한 줄 표시 */}
                  {sh.status === 'short' && sh.shortage > 0 && (
                    <div style={{
                      marginTop: 8, padding: '5px 8px', borderRadius: 7,
                      background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
                      fontSize: 11, fontWeight: 700, color: COLORS.danger,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      ⚠ 부족 {sh.shortage}명 — 추가 배정 필요
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 요일×시간대 과부족 히트맵 ─────────────────────────── */}
      {data && !isEmpty && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 4 }}>
            🔥 요일×시간대 과부족 히트맵
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10 }}>
            셀 = (요일 × {intervalMin}분 인터벌) 필요인원 대비 배정 커버 — 진할수록 격차 큼
          </div>
          {activeDows.length === 0 ? (
            <div style={{
              padding: 16, textAlign: 'center', fontSize: 12, color: COLORS.textMuted,
              background: COLORS.bgGray, borderRadius: 8,
            }}>표시할 요일이 없습니다</div>
          ) : (
            <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
              <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}>
                {/* ── 상단 시각 라벨 행 ── */}
                <div style={{ display: 'flex', gap: 2 }}>
                  <div style={{ width: 34, flexShrink: 0 }} />
                  {Array.from({ length: bucketsPerDay }, (_, b) => (
                    <div key={`hl-${b}`} style={{
                      width: 16, flexShrink: 0, fontSize: 8, fontWeight: 700,
                      color: COLORS.textMuted, textAlign: 'left', whiteSpace: 'nowrap',
                      overflow: 'visible',
                    }}>
                      {b % labelEvery === 0 ? bucketLabel(b, intervalMin) : ''}
                    </div>
                  ))}
                </div>
                {/* ── 요일별 셀 행 ── */}
                {activeDows.map((dow) => (
                  <div key={`row-${dow}`} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <div style={{
                      width: 34, flexShrink: 0, fontSize: 11, fontWeight: 800,
                      color: COLORS.textPrimary, whiteSpace: 'nowrap',
                    }}>
                      {DOW_LABEL[dow]}
                      <span style={{ fontSize: 9, fontWeight: 600, color: COLORS.textMuted }}>
                        {' '}{dowDays[dow]}일
                      </span>
                    </div>
                    {Array.from({ length: bucketsPerDay }, (_, b) => {
                      const cell = cellMap.get(`${dow}|${b}`)
                      const required = cell?.required ?? 0
                      const diff = cell?.diff ?? 0
                      const calls = cell?.calls ?? 0
                      const scheduled = cell?.scheduled ?? 0
                      // 색 결정
                      let bg: string = COLORS.bgGray
                      let opacity = 1
                      if (required > 0) {
                        if (diff < 0) {
                          bg = COLORS.danger
                          // 부족 클수록 진하게 — opacity 0.30~1.0
                          opacity = 0.30 + 0.70 * Math.min(1, -diff / maxShort)
                        } else {
                          bg = COLORS.success
                          opacity = 0.30 + 0.70 * Math.min(1, diff / maxOver)
                        }
                      }
                      const tip = `${DOW_LABEL[dow]} ${bucketLabel(b, intervalMin)}\n`
                        + `콜 ${calls} · 필요 ${required} · 배정 ${scheduled} · 과부족 ${diff}`
                      return (
                        <div key={`c-${dow}-${b}`} title={tip} style={{
                          width: 16, height: 16, flexShrink: 0, borderRadius: 3,
                          background: bg, opacity,
                          border: `1px solid ${COLORS.borderFaint}`,
                        }} />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* ── 범례 ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, marginTop: 10,
            fontSize: 10, color: COLORS.textMuted, flexWrap: 'wrap',
          }}>
            <LegendChip color={COLORS.danger} label="부족 (배정 < 필요)" />
            <LegendChip color={COLORS.success} label="충분 (배정 ≥ 필요)" />
            <LegendChip color={COLORS.bgGray} label="콜 없음 (필요 0)" border />
            <span style={{ whiteSpace: 'nowrap' }}>· 진할수록 격차 큼 · 셀에 마우스를 올리면 상세</span>
          </div>
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
      background: COLORS.bgBlue, border: `1px solid ${COLORS.borderBlue}`,
    }}>
      <span style={{ fontSize: 10, color: COLORS.textSecondary, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, color: COLORS.textPrimary, fontWeight: 800 }}>{value}</span>
    </span>
  )
}

// ── 히트맵 범례 칩 ──────────────────────────────────────────────
function LegendChip({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      <span style={{
        width: 12, height: 12, borderRadius: 3, background: color,
        border: border ? `1px solid ${COLORS.borderFaint}` : 'none',
      }} />
      {label}
    </span>
  )
}
