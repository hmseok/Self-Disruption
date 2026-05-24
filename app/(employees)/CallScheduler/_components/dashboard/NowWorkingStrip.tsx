'use client'
// ═══════════════════════════════════════════════════════════════════
// N-17 — 지금 일하는 사람 (현재 시각 기준 active workers)
// 24/365 운영 가시화 — 누가 일하고 있는지, 다음 교대 시각
// ═══════════════════════════════════════════════════════════════════
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '../../utils/palette'
import type { ColorTone } from '../../utils/types'

export interface WorkerChip {
  worker_id: string
  name: string
  color_tone: string
  shift_label: string
  shift_start: string
  shift_end: string
  is_overnight: boolean
  group_name: string | null
}

export default function NowWorkingStrip({
  nowIso, workers, todayAssignments,
}: {
  nowIso: string
  workers: WorkerChip[]
  todayAssignments: WorkerChip[]
}) {
  const now = new Date(nowIso)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

  // 다음 교대 — todayAssignments 중 nowMin 보다 미래의 첫 start
  const futureStarts = todayAssignments
    .map(a => ({
      a,
      startMin: (() => {
        const [h, m] = a.shift_start.split(':').map(Number)
        return (h || 0) * 60 + (m || 0)
      })(),
    }))
    .filter(x => x.startMin > nowMin)
    .sort((a, b) => a.startMin - b.startMin)
  const nextShift = futureStarts[0]?.a

  // 다음 퇴근 — workers 중 가장 가까운 종료
  const exits = workers.map(w => {
    const [h, m] = w.shift_end.split(':').map(Number)
    let endMin = (h || 0) * 60 + (m || 0)
    if (w.is_overnight && endMin <= nowMin) endMin += 24 * 60  // 자정 넘어감
    return { w, endMin }
  }).sort((a, b) => a.endMin - b.endMin)
  const nextExit = exits[0]

  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, padding: '14px 16px', marginBottom: 12,
      border: `1px solid ${COLORS.borderFaint}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>🕐</span>
        <div>
          <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
            {hhmm} 기준 — 지금 일하는 사람
          </span>
          <span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: 8, fontWeight: 600 }}>
            {workers.length}명
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {nextShift && (
          <div style={{
            fontSize: 11, color: COLORS.info, fontWeight: 600,
            background: COLORS.bgBlue, padding: '4px 10px', borderRadius: 99,
            border: `1px solid ${COLORS.borderBlue}`,
          }}>
            ⏰ {nextShift.shift_start} {nextShift.name} 시작
          </div>
        )}
        {nextExit && !nextShift && (
          <div style={{
            fontSize: 11, color: COLORS.textSecondary, fontWeight: 600,
            background: COLORS.bgGray, padding: '4px 10px', borderRadius: 99,
            border: `1px solid ${COLORS.borderFaint}`,
          }}>
            ⏰ {nextExit.w.shift_end} {nextExit.w.name} 퇴근
          </div>
        )}
      </div>
      {workers.length === 0 ? (
        <div style={{
          padding: 16, textAlign: 'center',
          color: COLORS.textMuted, fontSize: 12,
        }}>
          현재 배정된 근무자가 없습니다 — 이번 달 스케줄 확인 필요
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {workers.map(w => {
            const tone = (w.color_tone || 'none') as ColorTone
            const bg = TONE_BG[tone] || COLORS.bgGray
            const fg = TONE_TEXT[tone] || COLORS.textPrimary
            return (
              <div key={w.worker_id + w.shift_label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', borderRadius: 99,
                background: bg, color: fg, fontSize: 12, fontWeight: 700,
                border: `1px solid ${COLORS.borderFaint}`,
              }}>
                <span>{w.is_overnight ? '🌙' : '☀️'}</span>
                <span>{w.name}</span>
                <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 500 }}>
                  {w.shift_start}~{w.shift_end}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
