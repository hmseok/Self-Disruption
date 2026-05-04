'use client'
// ═══════════════════════════════════════════════════════════════════
// AssignmentCell — 캘린더 한 셀 (날짜 × 슬롯)
// 한 줄 표시 + 색상 토큰 + special_code 배지 (CLAUDE.md §19, §10)
// ═══════════════════════════════════════════════════════════════════
import { COLORS, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_BORDER, TONE_TEXT } from '../utils/palette'
import { SPECIAL_LABEL } from '../utils/types'
import type { Assignment, Worker, SpecialCode } from '../utils/types'

interface Props {
  assignment: Assignment | null
  worker: Worker | null
  onClick: () => void
}

export default function AssignmentCell({ assignment, worker, onClick }: Props) {
  const tone = worker?.color_tone || 'none'
  const special = (assignment?.special_code || 'none') as SpecialCode

  const isOff = special === 'off'
  const isEmpty = !assignment || (!assignment.worker_id && special === 'none')

  let bg = TONE_BG[tone]
  if (isOff) bg = COLORS.bgGray
  if (isEmpty) bg = 'transparent'

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        height: 24,
        padding: '0 4px',
        background: bg,
        border: `1px solid ${isEmpty ? COLORS.borderFaint : TONE_BORDER[tone]}`,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 4,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textAlign: 'left',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      title={
        worker
          ? `${worker.name}${special !== 'none' ? ' · ' + SPECIAL_LABEL[special] : ''}`
          : (special !== 'none' ? SPECIAL_LABEL[special] : '비어있음 — 클릭해서 배정')
      }
    >
      <span style={{
        fontSize: 11,
        fontWeight: worker ? 700 : 400,
        color: worker ? TONE_TEXT[tone] : COLORS.textMuted,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {worker?.name || (isOff ? '휴' : '')}
      </span>
      {special !== 'none' && special !== 'off' && (
        <span style={{
          ...pillStyle(special.endsWith('_half') ? 'warning' : 'info'),
          fontSize: 9,
          padding: '0 4px',
          lineHeight: 1.2,
        }}>
          {special === 'am_half' ? '오반' : special === 'pm_half' ? '오후반' : special === 'am_free' ? '오F' : 'F'}
        </span>
      )}
    </button>
  )
}
