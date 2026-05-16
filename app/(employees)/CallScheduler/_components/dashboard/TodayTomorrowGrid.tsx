'use client'
// ═══════════════════════════════════════════════════════════════════
// N-17 — 오늘 / 내일 근무자 그리드 (2 컬럼)
// ═══════════════════════════════════════════════════════════════════
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '../../utils/palette'
import type { ColorTone } from '../../utils/types'
import type { WorkerChip } from './NowWorkingStrip'

export default function TodayTomorrowGrid({
  todayLabel, todayAssignments, todayIsHoliday,
  tomorrowLabel, tomorrowAssignments, tomorrowIsHoliday,
}: {
  todayLabel: string
  todayAssignments: WorkerChip[]
  todayIsHoliday: boolean
  tomorrowLabel: string
  tomorrowAssignments: WorkerChip[]
  tomorrowIsHoliday: boolean
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
      marginBottom: 12,
    }}>
      <DayCard title="오늘" subtitle={todayLabel} isHoliday={todayIsHoliday}
               assignments={todayAssignments} />
      <DayCard title="내일" subtitle={tomorrowLabel} isHoliday={tomorrowIsHoliday}
               assignments={tomorrowAssignments} />
    </div>
  )
}

function DayCard({ title, subtitle, isHoliday, assignments }: {
  title: string; subtitle: string; isHoliday: boolean
  assignments: WorkerChip[]
}) {
  // 그룹 / shift 별 grouping
  const groups = new Map<string, WorkerChip[]>()
  for (const a of assignments) {
    const key = `${a.shift_start}-${a.shift_end} ${a.shift_label}`
    const arr = groups.get(key) || []
    arr.push(a)
    groups.set(key, arr)
  }
  const groupKeys = Array.from(groups.keys()).sort()

  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, padding: '14px 16px',
      border: `1px solid ${COLORS.borderFaint}`,
      minHeight: 140,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
            📅 {title}
          </span>
          <span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: 8 }}>
            {subtitle}
          </span>
          {isHoliday && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: COLORS.danger,
              background: COLORS.bgRed, padding: '2px 8px', borderRadius: 99,
              border: `1px solid ${COLORS.borderRed}`, marginLeft: 8,
            }}>🎌 휴일</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600 }}>
          {assignments.length}명
        </span>
      </div>
      {assignments.length === 0 ? (
        <div style={{
          padding: 12, textAlign: 'center',
          color: COLORS.textMuted, fontSize: 12,
        }}>
          {isHoliday ? '휴일 — 주중 그룹 자동 제외' : '배정된 근무자가 없습니다'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {groupKeys.map(k => {
            const arr = groups.get(k) || []
            const first = arr[0]
            return (
              <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: COLORS.textSecondary,
                  background: COLORS.bgGray, padding: '4px 8px', borderRadius: 6,
                  minWidth: 100, textAlign: 'center', whiteSpace: 'nowrap',
                  border: `1px solid ${COLORS.borderFaint}`,
                }}>
                  {first.is_overnight ? '🌙' : '☀️'} {first.shift_start}~{first.shift_end}
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
                  {arr.map(w => {
                    const tone = (w.color_tone || 'none') as ColorTone
                    const bg = TONE_BG[tone] || COLORS.bgGray
                    const fg = TONE_TEXT[tone] || COLORS.textPrimary
                    return (
                      <span key={w.worker_id} style={{
                        fontSize: 12, fontWeight: 700, color: fg, background: bg,
                        padding: '4px 10px', borderRadius: 99,
                        border: `1px solid ${COLORS.borderFaint}`, whiteSpace: 'nowrap',
                      }}>{w.name}</span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
