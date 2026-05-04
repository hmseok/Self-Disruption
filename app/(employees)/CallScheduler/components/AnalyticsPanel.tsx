'use client'
// ═══════════════════════════════════════════════════════════════════
// AnalyticsPanel — 인당 KPI 테이블 + 균형도 상세 (PR-2QQ-c)
// 컬럼: 이름 / 그룹 / 시프트 / 시간 / 야간 / 금야간 / 일야간 / 주말 / 반차 / F
// 균형도 점수 카드 (전체 야간 / 금야간 / 일야간) — 편차 시각화
// CLAUDE.md 규칙 18 — 모든 컬럼 sortBy 정의
// ═══════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { COLORS, GLASS, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_TEXT } from '../utils/palette'
import type { WorkerKpi, ColorTone } from '../utils/types'

type SortKey = 'name' | 'group' | 'shift' | 'hours' | 'overnight'
                | 'fri_overnight' | 'sun_overnight' | 'weekend' | 'half' | 'free'
type SortDir = 'asc' | 'desc'

interface Props { workers: WorkerKpi[] }

// 균형도 점수: max - min (낮을수록 공정)
function balanceStats(values: number[]) {
  if (values.length === 0) return { max: 0, min: 0, avg: 0, range: 0, std: 0 }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length
  const std = Math.sqrt(variance)
  return { max, min, avg, range: max - min, std }
}

function balanceTone(range: number): 'success' | 'warning' | 'danger' {
  if (range <= 1) return 'success'
  if (range <= 3) return 'warning'
  return 'danger'
}

export default function AnalyticsPanel({ workers }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('hours')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    const arr = [...workers]
    arr.sort((a, b) => {
      let av: any, bv: any
      switch (sortKey) {
        case 'name':           av = a.name; bv = b.name; break
        case 'group':          av = a.group_label || ''; bv = b.group_label || ''; break
        case 'shift':          av = a.shift_count; bv = b.shift_count; break
        case 'hours':          av = a.total_hours; bv = b.total_hours; break
        case 'overnight':      av = a.overnight_count; bv = b.overnight_count; break
        case 'fri_overnight':  av = a.fri_overnight || 0; bv = b.fri_overnight || 0; break
        case 'sun_overnight':  av = a.sun_overnight || 0; bv = b.sun_overnight || 0; break
        case 'weekend':        av = a.weekend_count || 0; bv = b.weekend_count || 0; break
        case 'half':           av = a.half_count; bv = b.half_count; break
        case 'free':           av = a.free_count; bv = b.free_count; break
      }
      const cmp = typeof av === 'string'
        ? av.localeCompare(bv as string)
        : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [workers, sortKey, sortDir])

  // 활성 워커만 (shift_count > 0)
  const activeWorkers = useMemo(() => workers.filter(w => w.shift_count > 0), [workers])

  // 균형도 통계 (활성 워커 기준)
  const balanceMetrics = useMemo(() => {
    const overnightStats = balanceStats(activeWorkers.map(w => w.overnight_count))
    const friStats       = balanceStats(activeWorkers.map(w => w.fri_overnight || 0))
    const sunStats       = balanceStats(activeWorkers.map(w => w.sun_overnight || 0))
    const hoursStats     = balanceStats(activeWorkers.map(w => w.total_hours))
    return { overnightStats, friStats, sunStats, hoursStats }
  }, [activeWorkers])

  // 야간 워커 (야간 횟수 1+) — 금/일 균형은 야간 워커 안에서만 의미
  const nightWorkers = useMemo(
    () => activeWorkers.filter(w => w.overnight_count > 0),
    [activeWorkers],
  )
  const nightFriStats = useMemo(() => balanceStats(nightWorkers.map(w => w.fri_overnight || 0)), [nightWorkers])
  const nightSunStats = useMemo(() => balanceStats(nightWorkers.map(w => w.sun_overnight || 0)), [nightWorkers])
  const nightOvernightStats = useMemo(() => balanceStats(nightWorkers.map(w => w.overnight_count)), [nightWorkers])

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const headers: { key: SortKey; label: string; align: 'left' | 'right'; sub?: string }[] = [
    { key: 'name',          label: '이름',      align: 'left' },
    { key: 'group',         label: '그룹',      align: 'left' },
    { key: 'shift',         label: '시프트',    align: 'right' },
    { key: 'hours',         label: '시간',      align: 'right' },
    { key: 'overnight',     label: '야간',      align: 'right', sub: '전체' },
    { key: 'fri_overnight', label: '금야',      align: 'right', sub: '금요일 야간' },
    { key: 'sun_overnight', label: '일야',      align: 'right', sub: '일요일 야간' },
    { key: 'weekend',       label: '주말',      align: 'right', sub: '토+일 근무' },
    { key: 'half',          label: '반차',      align: 'right' },
    { key: 'free',          label: 'F',         align: 'right' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 균형도 점수 카드 */}
      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
            ⚖️ 균형도
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted }}>
            편차 = 최대 − 최소 (낮을수록 공정)
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <BalanceTile
            label="전체 야간"
            range={nightOvernightStats.range}
            avg={nightOvernightStats.avg}
            min={nightOvernightStats.min}
            max={nightOvernightStats.max}
            sub={`야간 워커 ${nightWorkers.length}명`}
          />
          <BalanceTile
            label="시간 편차"
            range={Math.round(balanceMetrics.hoursStats.range * 10) / 10}
            avg={Math.round(balanceMetrics.hoursStats.avg * 10) / 10}
            min={Math.round(balanceMetrics.hoursStats.min * 10) / 10}
            max={Math.round(balanceMetrics.hoursStats.max * 10) / 10}
            sub={`활성 워커 ${activeWorkers.length}명`}
            unit="h"
          />
          <BalanceTile
            label="금요일 야간"
            range={nightFriStats.range}
            avg={Math.round(nightFriStats.avg * 10) / 10}
            min={nightFriStats.min}
            max={nightFriStats.max}
            sub="비선호 요일 #1"
            warn
          />
          <BalanceTile
            label="일요일 야간"
            range={nightSunStats.range}
            avg={Math.round(nightSunStats.avg * 10) / 10}
            min={nightSunStats.min}
            max={nightSunStats.max}
            sub="비선호 요일 #2"
            warn
          />
        </div>
        {/* 알림 — 편차 큰 항목 */}
        {(nightFriStats.range >= 3 || nightSunStats.range >= 3) && (
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 8,
            background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            fontSize: 11, color: COLORS.danger,
          }}>
            ⚠️ 금/일 야간 분배 편차가 큽니다 (3회 이상). 매니저 확인 권장.
          </div>
        )}
      </div>

      {/* 인당 분석 테이블 */}
      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12, overflow: 'auto' }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
            인당 분석 ({workers.length}명)
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>
            평균 {Math.round(balanceMetrics.hoursStats.avg * 10) / 10}h
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
              {headers.map(h => (
                <th
                  key={h.key}
                  onClick={() => toggle(h.key)}
                  title={h.sub}
                  style={{
                    textAlign: h.align,
                    padding: '5px 6px',
                    color: COLORS.textSecondary,
                    fontWeight: 700,
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h.label}{sortKey === h.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(w => {
              const tone: ColorTone = w.color_tone || 'none'
              const dev = balanceMetrics.hoursStats.avg > 0
                ? (w.total_hours - balanceMetrics.hoursStats.avg) / balanceMetrics.hoursStats.avg
                : 0
              const devTone: 'success' | 'warning' | 'danger' | 'neutral' =
                Math.abs(dev) > 0.4 ? 'danger'
                : Math.abs(dev) > 0.2 ? 'warning'
                : 'neutral'
              // 금/일 야간 — 편차 평균 보다 1.5배 많으면 빨강
              const friOver = (w.fri_overnight || 0) > nightFriStats.avg * 1.5 && (w.fri_overnight || 0) > 1
              const sunOver = (w.sun_overnight || 0) > nightSunStats.avg * 1.5 && (w.sun_overnight || 0) > 1
              return (
                <tr key={w.worker_id} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                  <td style={{
                    padding: '5px 6px', color: TONE_TEXT[tone],
                    fontWeight: 700, whiteSpace: 'nowrap',
                  }}>
                    {w.name}
                  </td>
                  <td style={{ padding: '5px 6px', color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                    {w.group_label || '-'}
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', color: COLORS.textPrimary }}>
                    {w.shift_count}
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'right' }}>
                    <span style={{ ...pillStyle(devTone), fontSize: 11 }}>
                      {Math.round(w.total_hours * 10) / 10}h
                    </span>
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', color: COLORS.textPrimary, fontWeight: 600 }}>
                    {w.overnight_count || '·'}
                  </td>
                  <td style={{
                    padding: '5px 6px', textAlign: 'right',
                    color: friOver ? COLORS.danger : COLORS.textPrimary,
                    fontWeight: friOver ? 800 : 400,
                  }}>
                    {w.fri_overnight || '·'}
                  </td>
                  <td style={{
                    padding: '5px 6px', textAlign: 'right',
                    color: sunOver ? COLORS.danger : COLORS.textPrimary,
                    fontWeight: sunOver ? 800 : 400,
                  }}>
                    {w.sun_overnight || '·'}
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', color: COLORS.textMuted }}>
                    {w.weekend_count || '·'}
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', color: COLORS.textPrimary }}>
                    {w.half_count || '·'}
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', color: COLORS.textPrimary }}>
                    {w.free_count || '·'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BalanceTile({ label, range, avg, min, max, sub, unit = '', warn = false }: {
  label: string
  range: number
  avg: number
  min: number
  max: number
  sub?: string
  unit?: string
  warn?: boolean
}) {
  const tone = balanceTone(range)
  const tintMap = {
    success: { bg: COLORS.bgGreen, border: COLORS.borderGreen, text: COLORS.success },
    warning: { bg: COLORS.bgAmber, border: COLORS.borderAmber, text: COLORS.warning },
    danger:  { bg: COLORS.bgRed,   border: COLORS.borderRed,   text: COLORS.danger },
  }[tone]
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 8,
      background: warn && tone === 'success' ? COLORS.bgGray : tintMap.bg,
      border: `1px solid ${warn && tone === 'success' ? COLORS.borderFaint : tintMap.border}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 4,
      }}>
        <div style={{ fontSize: 10, color: COLORS.textSecondary, fontWeight: 700 }}>
          {label}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: tintMap.text, lineHeight: 1.1 }}>
          ±{range}{unit}
        </div>
      </div>
      <div style={{
        fontSize: 9, color: COLORS.textMuted, marginTop: 2,
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{sub}</span>
        <span>최소 {min}{unit} · 평균 {avg}{unit} · 최대 {max}{unit}</span>
      </div>
    </div>
  )
}
