'use client'
// ═══════════════════════════════════════════════════════════════════
// KPI Strip — 5 타일 (충원율 / 평균시간 / 반차·F / 미배정 / 균형도)
// GLASS L3 + 색상 틴트 (CLAUDE.md §10)
// N-18 — 균형도 카드 클릭 시 펼침 (과로 / 부족 워커 list)
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '../utils/palette'
import type { ScheduleKpi, ColorTone } from '../utils/types'

interface Props { kpi: ScheduleKpi }

export default function KpiStrip({ kpi }: Props) {
  const fillPct = Math.round(kpi.fill_rate * 1000) / 10
  const [drilldown, setDrilldown] = useState<'balance' | null>(null)

  // 균형도 경보 — 평균 ±20% 벗어난 워커 카운트
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
    key: string; label: string; value: string; sub: string
    tint: 'blue' | 'green' | 'amber' | 'red' | 'gray'
    clickable?: boolean
  }> = [
    {
      key: 'fill',
      label: '충원율',
      value: `${fillPct}%`,
      sub: `${kpi.filled_assignments} / ${kpi.total_assignments}`,
      tint: 'blue',
    },
    {
      key: 'avg',
      label: '인당 평균시간',
      value: `${kpi.avg_hours_per_worker}h`,
      sub: `근무자 ${kpi.worker_count}명`,
      tint: 'green',
    },
    {
      key: 'half',
      label: '반차 · F',
      value: `${kpi.half_count + kpi.free_count}`,
      sub: `반차 ${kpi.half_count} · F ${kpi.free_count}`,
      tint: 'amber',
    },
    {
      key: 'unfilled',
      label: '미배정',
      value: `${kpi.unfilled_slots}`,
      sub: `휴무 ${kpi.off_count}`,
      tint: kpi.unfilled_slots > 0 ? 'red' : 'gray',
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
            <div key={t.key}
                 onClick={() => {
                   if (!t.clickable) return
                   setDrilldown(d => d === t.key ? null : (t.key as 'balance'))
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

      {/* 균형도 드릴다운 */}
      {drilldown === 'balance' && (
        <div style={{
          ...GLASS.L1, borderRadius: 12, padding: 14, marginTop: 10,
          border: `1px solid ${tintMap[balanceTint].border}`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
              ⚖️ 균형도 — 평균 {avg}h 대비 ±20% 벗어난 워커
            </div>
            <button onClick={() => setDrilldown(null)}
                    style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 6,
                      background: 'transparent', border: `1px solid ${COLORS.borderFaint}`,
                      cursor: 'pointer', color: COLORS.textMuted,
                    }}>× 닫기</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <DrilldownColumn
              title="🔥 과로"
              empty="과로 워커 없음"
              workers={overWorkers}
              avg={avg}
              tone="red"
            />
            <DrilldownColumn
              title="🪶 부족"
              empty="부족 워커 없음"
              workers={underWorkers}
              avg={avg}
              tone="amber"
            />
          </div>
          <div style={{
            marginTop: 10, fontSize: 11, color: COLORS.textMuted, textAlign: 'center',
          }}>
            💡 균형 맞추려면 그룹 멤버 설정에서 「월 필수 일수」 / 「월 최대 일수」 조정
          </div>
        </div>
      )}
    </div>
  )
}

function DrilldownColumn({ title, empty, workers, avg, tone }: {
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
        <div style={{
          padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.02)',
          fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
        }}>
          {empty}
        </div>
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
                <span style={{ color: COLORS.textMuted, fontSize: 11 }}>
                  {w.shift_count}일
                </span>
                <div style={{ flex: 1 }} />
                <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>
                  {w.total_hours}h
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: toneMap.color,
                  background: '#fff', padding: '2px 6px', borderRadius: 4,
                  border: `1px solid ${toneMap.border}`, minWidth: 50, textAlign: 'right',
                }}>
                  {delta > 0 ? '+' : ''}{delta}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
