'use client'
// ═══════════════════════════════════════════════════════════════════
// KPI Strip — 5 타일 (충원율 / 평균시간 / 반차·F / 미배정 / 균형도)
// GLASS L3 + 색상 틴트 (CLAUDE.md §10)
// N-18 — 균형도 카드 클릭 시 펼침 (과로 / 부족 워커 list)
// N-20 — 나머지 4 카드도 드릴다운 (충원율 / 평균시간 / 반차·F / 미배정)
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '../utils/palette'
import type { ScheduleKpi, ColorTone } from '../utils/types'

interface Props { kpi: ScheduleKpi }

type DrillKey = 'fill' | 'avg' | 'half' | 'unfilled' | 'balance' | null

export default function KpiStrip({ kpi }: Props) {
  const fillPct = Math.round(kpi.fill_rate * 1000) / 10
  const [drilldown, setDrilldown] = useState<DrillKey>(null)

  // 균형도 경보 — 평균 ±20% 벗어난 워커
  const avg = kpi.avg_hours_per_worker
  const activeWorkers = kpi.workers.filter(w => w.shift_count > 0)
  const overWorkers = activeWorkers
    .filter(w => avg > 0 && (w.total_hours - avg) / avg > 0.2)
    .sort((a, b) => b.total_hours - a.total_hours)
  const underWorkers = activeWorkers
    .filter(w => avg > 0 && (w.total_hours - avg) / avg < -0.2)
    .sort((a, b) => a.total_hours - b.total_hours)
  const alertCount = overWorkers.length + underWorkers.length

  const balanceTint: 'green' | 'amber' | 'red' =
    alertCount === 0 ? 'green'
    : alertCount <= 2 ? 'amber'
    : 'red'

  const tiles: Array<{
    key: DrillKey; label: string; value: string; sub: string
    tint: 'blue' | 'green' | 'amber' | 'red' | 'gray'
    clickable?: boolean
  }> = [
    {
      key: 'fill',
      label: '충원율',
      value: `${fillPct}%`,
      sub: `${kpi.filled_assignments} / ${kpi.total_assignments}`,
      tint: 'blue',
      clickable: kpi.slots.length > 0,
    },
    {
      key: 'avg',
      label: '인당 평균시간',
      value: `${kpi.avg_hours_per_worker}h`,
      sub: `근무자 ${kpi.worker_count}명`,
      tint: 'green',
      clickable: activeWorkers.length > 0,
    },
    {
      key: 'half',
      label: '반차 · F',
      value: `${kpi.half_count + kpi.free_count}`,
      sub: `반차 ${kpi.half_count} · F ${kpi.free_count}`,
      tint: 'amber',
      clickable: (kpi.half_count + kpi.free_count) > 0,
    },
    {
      key: 'unfilled',
      label: '미배정',
      value: `${kpi.unfilled_slots}`,
      sub: `휴무 ${kpi.off_count}`,
      tint: kpi.unfilled_slots > 0 ? 'red' : 'gray',
      clickable: kpi.unfilled_slots > 0,
    },
    {
      key: 'balance',
      label: '균형도',
      value: alertCount === 0 ? '양호' : `⚠ ${alertCount}`,
      sub: alertCount === 0
        ? '모두 평균 ±20% 이내'
        : `과로 ${overWorkers.length} · 부족 ${underWorkers.length}`,
      tint: balanceTint,
      clickable: alertCount > 0,
    },
  ]

  const tintMap = {
    blue:   { bg: COLORS.bgBlue,   border: COLORS.borderBlue,   color: COLORS.info },
    green:  { bg: COLORS.bgGreen,  border: COLORS.borderGreen,  color: COLORS.success },
    amber:  { bg: COLORS.bgAmber,  border: COLORS.borderAmber,  color: COLORS.warning },
    red:    { bg: COLORS.bgRed,    border: COLORS.borderRed,    color: COLORS.danger },
    gray:   { bg: COLORS.bgGray,   border: COLORS.borderFaint,  color: COLORS.textMuted },
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {tiles.map(t => {
          const tint = tintMap[t.tint]
          const active = drilldown === t.key
          return (
            <div key={t.key as string}
                 onClick={() => {
                   if (!t.clickable) return
                   setDrilldown(d => d === t.key ? null : t.key)
                 }}
                 style={{
                   ...GLASS.L3,
                   background: tint.bg,
                   border: `${active ? '2px' : '1px'} solid ${tint.border}`,
                   borderRadius: 12,
                   padding: '14px 16px',
                   display: 'flex',
                   flexDirection: 'column',
                   gap: 4,
                   cursor: t.clickable ? 'pointer' : 'default',
                   transition: 'transform 0.12s, box-shadow 0.12s',
                   transform: active ? 'translateY(-2px)' : 'none',
                   boxShadow: active ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: 12, color: COLORS.textSecondary, fontWeight: 600,
              }}>
                <span>{t.label}</span>
                {t.clickable && (
                  <span style={{ fontSize: 10, color: tint.color, fontWeight: 800 }}>
                    {active ? '▼' : '▶'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: tint.color, lineHeight: 1.1 }}>{t.value}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>{t.sub}</div>
            </div>
          )
        })}
      </div>

      {/* 드릴다운 영역 */}
      {drilldown && (
        <div style={{
          ...GLASS.L1, borderRadius: 12, padding: 14, marginTop: 10,
          border: `1px solid ${tintMap[
            drilldown === 'fill' ? 'blue'
            : drilldown === 'avg' ? 'green'
            : drilldown === 'half' ? 'amber'
            : drilldown === 'unfilled' ? 'red'
            : balanceTint
          ].border}`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
              {drilldown === 'fill' && '🎯 슬롯별 충원율'}
              {drilldown === 'avg' && `⏱ 워커별 근무시간 — 평균 ${avg}h`}
              {drilldown === 'half' && '🌓 워커별 반차·F 사용'}
              {drilldown === 'unfilled' && '📭 슬롯별 미배정 셀'}
              {drilldown === 'balance' && `⚖️ 균형도 — 평균 ${avg}h 대비 ±20% 벗어난 워커`}
            </div>
            <button onClick={() => setDrilldown(null)}
                    style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 6,
                      background: 'transparent', border: `1px solid ${COLORS.borderFaint}`,
                      cursor: 'pointer', color: COLORS.textMuted,
                    }}>× 닫기</button>
          </div>

          {drilldown === 'fill' && <FillDrilldown slots={kpi.slots} />}
          {drilldown === 'avg' && <AvgDrilldown workers={activeWorkers} avg={avg} />}
          {drilldown === 'half' && <HalfDrilldown workers={kpi.workers} />}
          {drilldown === 'unfilled' && <UnfilledDrilldown slots={kpi.slots} />}
          {drilldown === 'balance' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <BalanceColumn title="🔥 과로" empty="과로 워커 없음"
                               workers={overWorkers} avg={avg} tone="red" />
                <BalanceColumn title="🪶 부족" empty="부족 워커 없음"
                               workers={underWorkers} avg={avg} tone="amber" />
              </div>
              <div style={{
                marginTop: 10, fontSize: 11, color: COLORS.textMuted, textAlign: 'center',
              }}>
                💡 균형 맞추려면 그룹 멤버 설정에서 「월 필수 일수」 / 「월 최대 일수」 조정
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── 충원율 드릴다운: 슬롯별 충원율 (낮은 순)
function FillDrilldown({ slots }: { slots: import('../utils/types').SlotFillRate[] }) {
  const sorted = [...slots].sort((a, b) => a.fill_rate - b.fill_rate)
  if (sorted.length === 0) {
    return <Empty text="슬롯 데이터 없음" />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.map(s => {
        const pct = Math.round(s.fill_rate * 1000) / 10
        const tone: 'green' | 'amber' | 'red' =
          s.fill_rate >= 0.9 ? 'green' : s.fill_rate >= 0.7 ? 'amber' : 'red'
        const tColor = tone === 'green' ? COLORS.success : tone === 'amber' ? COLORS.warning : COLORS.danger
        const tBg = tone === 'green' ? COLORS.bgGreen : tone === 'amber' ? COLORS.bgAmber : COLORS.bgRed
        const tBorder = tone === 'green' ? COLORS.borderGreen : tone === 'amber' ? COLORS.borderAmber : COLORS.borderRed
        return (
          <div key={s.slot_id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 8,
            background: tBg, border: `1px solid ${tBorder}`,
            fontSize: 12,
          }}>
            <span style={{ fontWeight: 700, color: COLORS.textPrimary, minWidth: 56 }}>{s.code}</span>
            <span style={{ color: COLORS.textSecondary }}>{s.label}</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: COLORS.textMuted, fontSize: 11 }}>
              {s.filled} / {s.total}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: tColor,
              background: '#fff', padding: '2px 6px', borderRadius: 4,
              border: `1px solid ${tBorder}`, minWidth: 56, textAlign: 'right',
            }}>{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

// ── 평균시간 드릴다운: 워커별 시간 막대
function AvgDrilldown({ workers, avg }: {
  workers: import('../utils/types').WorkerKpi[]; avg: number
}) {
  const sorted = [...workers].sort((a, b) => b.total_hours - a.total_hours)
  if (sorted.length === 0) {
    return <Empty text="배정된 워커 없음" />
  }
  const max = Math.max(...sorted.map(w => w.total_hours), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.map(w => {
        const pct = (w.total_hours / max) * 100
        const avgPct = (avg / max) * 100
        const delta = avg > 0 ? Math.round((w.total_hours - avg) / avg * 1000) / 10 : 0
        const tone = (w.color_tone || 'none') as ColorTone
        const chipBg = TONE_BG[tone] || COLORS.bgGray
        const chipFg = TONE_TEXT[tone] || COLORS.textPrimary
        return (
          <div key={w.worker_id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 8,
            background: COLORS.bgGray, border: `1px solid ${COLORS.borderFaint}`,
            fontSize: 12,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              padding: '2px 8px', borderRadius: 99,
              background: chipBg, color: chipFg,
              border: `1px solid ${COLORS.borderFaint}`,
              whiteSpace: 'nowrap', minWidth: 60, textAlign: 'center',
            }}>{w.name}</span>
            <span style={{ fontSize: 11, color: COLORS.textMuted, minWidth: 44 }}>
              {w.shift_count}일
            </span>
            <div style={{
              flex: 1, height: 14, position: 'relative',
              background: '#fff', borderRadius: 4,
              border: `1px solid ${COLORS.borderFaint}`,
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${pct}%`,
                background: delta > 20 ? COLORS.danger
                          : delta < -20 ? COLORS.warning
                          : COLORS.success,
                transition: 'width 0.2s',
              }} />
              <div style={{
                position: 'absolute', left: `${avgPct}%`, top: -2, bottom: -2,
                width: 1, background: COLORS.textSecondary,
              }} title="평균" />
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, color: COLORS.textPrimary,
              minWidth: 50, textAlign: 'right',
            }}>{w.total_hours}h</span>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: delta > 20 ? COLORS.danger : delta < -20 ? COLORS.warning : COLORS.textMuted,
              minWidth: 48, textAlign: 'right',
            }}>{delta > 0 ? '+' : ''}{delta}%</span>
          </div>
        )
      })}
      <div style={{
        marginTop: 4, fontSize: 11, color: COLORS.textMuted, textAlign: 'center',
      }}>
        💡 회색 세로선 = 평균 / 빨강 막대 = +20% 초과 / 앰버 막대 = -20% 미달
      </div>
    </div>
  )
}

// ── 반차·F 드릴다운: 워커별 반차/F 카운트
function HalfDrilldown({ workers }: { workers: import('../utils/types').WorkerKpi[] }) {
  const sorted = workers
    .filter(w => w.half_count + w.free_count > 0)
    .sort((a, b) => (b.half_count + b.free_count) - (a.half_count + a.free_count))
  if (sorted.length === 0) {
    return <Empty text="반차/F 사용 없음" />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.map(w => {
        const tone = (w.color_tone || 'none') as ColorTone
        const chipBg = TONE_BG[tone] || COLORS.bgGray
        const chipFg = TONE_TEXT[tone] || COLORS.textPrimary
        return (
          <div key={w.worker_id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 8,
            background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
            fontSize: 12,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              padding: '2px 8px', borderRadius: 99,
              background: chipBg, color: chipFg,
              border: `1px solid ${COLORS.borderFaint}`,
              whiteSpace: 'nowrap', minWidth: 60, textAlign: 'center',
            }}>{w.name}</span>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>
              근무 {w.shift_count}일
            </span>
            <div style={{ flex: 1 }} />
            {w.half_count > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: COLORS.warning,
                background: '#fff', padding: '2px 8px', borderRadius: 4,
                border: `1px solid ${COLORS.borderAmber}`,
              }}>반차 {w.half_count}</span>
            )}
            {w.free_count > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#7c3aed',
                background: '#fff', padding: '2px 8px', borderRadius: 4,
                border: `1px solid ${COLORS.borderViolet}`,
              }}>F {w.free_count}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 미배정 드릴다운: 슬롯별 미배정 카운트
function UnfilledDrilldown({ slots }: { slots: import('../utils/types').SlotFillRate[] }) {
  const sorted = [...slots]
    .map(s => ({ ...s, unfilled: s.total - s.filled }))
    .filter(s => s.unfilled > 0)
    .sort((a, b) => b.unfilled - a.unfilled)
  if (sorted.length === 0) {
    return <Empty text="미배정 셀 없음" />
  }
  const totalUnfilled = sorted.reduce((sum, s) => sum + s.unfilled, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.map(s => {
        const pct = totalUnfilled > 0 ? Math.round((s.unfilled / totalUnfilled) * 100) : 0
        return (
          <div key={s.slot_id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 8,
            background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            fontSize: 12,
          }}>
            <span style={{ fontWeight: 700, color: COLORS.textPrimary, minWidth: 56 }}>{s.code}</span>
            <span style={{ color: COLORS.textSecondary }}>{s.label}</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: COLORS.textMuted, fontSize: 11 }}>
              비중 {pct}%
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: COLORS.danger,
              background: '#fff', padding: '2px 8px', borderRadius: 4,
              border: `1px solid ${COLORS.borderRed}`, minWidth: 60, textAlign: 'right',
            }}>{s.unfilled}개</span>
          </div>
        )
      })}
      <div style={{
        marginTop: 4, fontSize: 11, color: COLORS.textMuted, textAlign: 'center',
      }}>
        💡 빈자리가 많은 슬롯이 위 — 그룹 멤버 추가나 시프트 조정 검토
      </div>
    </div>
  )
}

// ── 균형도 좌/우 column (기존 N-18)
function BalanceColumn({ title, empty, workers, avg, tone }: {
  title: string; empty: string
  workers: Array<{ worker_id: string; name: string; color_tone: ColorTone; total_hours: number; shift_count: number }>
  avg: number
  tone: 'red' | 'amber'
}) {
  const toneMap = {
    red:   { bg: COLORS.bgRed,   border: COLORS.borderRed,   color: COLORS.danger },
    amber: { bg: COLORS.bgAmber, border: COLORS.borderAmber, color: COLORS.warning },
  }[tone]
  return (
    <div>
      <div style={{
        fontSize: 12, fontWeight: 700, color: toneMap.color, marginBottom: 6,
      }}>
        {title} <span style={{ color: COLORS.textMuted, fontWeight: 600 }}>{workers.length}명</span>
      </div>
      {workers.length === 0 ? (
        <Empty text={empty} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {workers.map(w => {
            const delta = avg > 0 ? Math.round((w.total_hours - avg) / avg * 1000) / 10 : 0
            const wTone = (w.color_tone || 'none') as ColorTone
            const chipBg = TONE_BG[wTone] || COLORS.bgGray
            const chipFg = TONE_TEXT[wTone] || COLORS.textPrimary
            return (
              <div key={w.worker_id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 8,
                background: toneMap.bg, border: `1px solid ${toneMap.border}`,
                fontSize: 12,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 99,
                  background: chipBg, color: chipFg,
                  border: `1px solid ${COLORS.borderFaint}`,
                  whiteSpace: 'nowrap',
                }}>{w.name}</span>
                <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{w.shift_count}일</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>{w.total_hours}h</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: toneMap.color,
                  background: '#fff', padding: '2px 6px', borderRadius: 4,
                  border: `1px solid ${toneMap.border}`, minWidth: 50, textAlign: 'right',
                }}>{delta > 0 ? '+' : ''}{delta}%</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{
      padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.02)',
      fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
    }}>{text}</div>
  )
}
