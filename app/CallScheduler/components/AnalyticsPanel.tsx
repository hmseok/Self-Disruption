'use client'
// ═══════════════════════════════════════════════════════════════════
// AnalyticsPanel — 인당 KPI 테이블
// CLAUDE.md 규칙 18 — 모든 컬럼 sortBy 정의
// ═══════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { COLORS, GLASS, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_TEXT } from '../utils/palette'
import type { WorkerKpi, ColorTone } from '../utils/types'

type SortKey = 'name' | 'group' | 'shift' | 'hours' | 'overnight' | 'half' | 'free'
type SortDir = 'asc' | 'desc'

interface Props { workers: WorkerKpi[] }

export default function AnalyticsPanel({ workers }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('hours')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    const arr = [...workers]
    arr.sort((a, b) => {
      let av: any, bv: any
      switch (sortKey) {
        case 'name':      av = a.name; bv = b.name; break
        case 'group':     av = a.group_label || ''; bv = b.group_label || ''; break
        case 'shift':     av = a.shift_count; bv = b.shift_count; break
        case 'hours':     av = a.total_hours; bv = b.total_hours; break
        case 'overnight': av = a.overnight_count; bv = b.overnight_count; break
        case 'half':      av = a.half_count; bv = b.half_count; break
        case 'free':      av = a.free_count; bv = b.free_count; break
      }
      const cmp = typeof av === 'string'
        ? av.localeCompare(bv as string)
        : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [workers, sortKey, sortDir])

  const avg = workers.length > 0
    ? workers.reduce((s, w) => s + w.total_hours, 0) / workers.length
    : 0

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const headers: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
    { key: 'name', label: '이름', align: 'left' },
    { key: 'group', label: '그룹', align: 'left' },
    { key: 'shift', label: '시프트', align: 'right' },
    { key: 'hours', label: '시간', align: 'right' },
    { key: 'overnight', label: '야간', align: 'right' },
    { key: 'half', label: '반차', align: 'right' },
    { key: 'free', label: 'F', align: 'right' },
  ]

  return (
    <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12, overflow: 'auto' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
          인당 분석 ({workers.length}명)
        </div>
        <div style={{ fontSize: 11, color: COLORS.textMuted }}>
          평균 {Math.round(avg * 10) / 10}h
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
            {headers.map(h => (
              <th
                key={h.key}
                onClick={() => toggle(h.key)}
                style={{
                  textAlign: h.align,
                  padding: '6px 8px',
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
            const dev = avg > 0 ? (w.total_hours - avg) / avg : 0
            const devTone: 'success' | 'warning' | 'danger' | 'neutral' =
              Math.abs(dev) > 0.2 ? 'warning'
              : Math.abs(dev) > 0.4 ? 'danger'
              : 'neutral'
            return (
              <tr key={w.worker_id} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                <td style={{
                  padding: '6px 8px', color: TONE_TEXT[tone],
                  fontWeight: 700, whiteSpace: 'nowrap',
                }}>
                  {w.name}
                </td>
                <td style={{ padding: '6px 8px', color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                  {w.group_label || '-'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: COLORS.textPrimary }}>
                  {w.shift_count}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  <span style={{ ...pillStyle(devTone), fontSize: 11 }}>
                    {Math.round(w.total_hours * 10) / 10}h
                  </span>
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: COLORS.textPrimary }}>
                  {w.overnight_count || '·'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: COLORS.textPrimary }}>
                  {w.half_count || '·'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: COLORS.textPrimary }}>
                  {w.free_count || '·'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
