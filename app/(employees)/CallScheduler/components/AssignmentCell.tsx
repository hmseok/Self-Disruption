'use client'
// ═══════════════════════════════════════════════════════════════════
// AssignmentCell — 캘린더 한 셀 (날짜 × 슬롯)
// 한 줄 표시 + 색상 토큰 + special_code 배지 (CLAUDE.md §19, §10)
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { COLORS, GLASS, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_BORDER, TONE_TEXT } from '../utils/palette'
import { SPECIAL_LABEL } from '../utils/types'
import type { Assignment, Worker, SpecialCode } from '../utils/types'

interface Props {
  assignment: Assignment | null
  worker: Worker | null
  onClick: () => void
  onQuickAction?: (action: 'off' | 'am_half' | 'pm_half' | 'am_free' | 'pm_free' | 'clear') => void
}

export default function AssignmentCell({ assignment, worker, onClick, onQuickAction }: Props) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const handler = () => setCtxMenu(null)
    setTimeout(() => {
      document.addEventListener('click', handler)
      document.addEventListener('contextmenu', handler)
    }, 0)
    return () => {
      document.removeEventListener('click', handler)
      document.removeEventListener('contextmenu', handler)
    }
  }, [ctxMenu])
  const tone = worker?.color_tone || 'none'
  const special = (assignment?.special_code || 'none') as SpecialCode

  const isOff = special === 'off'
  const isEmpty = !assignment || (!assignment.worker_id && special === 'none')

  let bg = TONE_BG[tone]
  if (isOff) bg = COLORS.bgGray
  if (isEmpty) bg = 'transparent'

  return (
    <>
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => {
        if (!onQuickAction) return
        e.preventDefault()
        setCtxMenu({ x: e.clientX, y: e.clientY })
      }}
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
        {/* PR-2QQ-b — 수동 lock 셀 표시 */}
        {assignment?.manual_lock && (
          <span style={{ marginRight: 2, fontSize: 9 }} title="수동 lock — 자동 생성 보존">🔒</span>
        )}
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

    {/* 우클릭 컨텍스트 메뉴 (PR-2Z 결근/병가 즉석 처리) */}
    {ctxMenu && onQuickAction && (
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', top: ctxMenu.y, left: ctxMenu.x,
          ...GLASS.L4, borderRadius: 10, padding: 4, minWidth: 160,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          zIndex: 1100, display: 'flex', flexDirection: 'column', gap: 1,
        }}
      >
        <div style={{
          padding: '4px 8px', fontSize: 10, fontWeight: 700, color: COLORS.textMuted,
          borderBottom: `1px solid ${COLORS.borderFaint}`, marginBottom: 2,
        }}>
          빠른 처리
        </div>
        <CtxItem icon="💤" label="휴무" tone="neutral" onClick={() => { setCtxMenu(null); onQuickAction('off') }} />
        <CtxItem icon="🌅" label="오전반차" tone="warning" onClick={() => { setCtxMenu(null); onQuickAction('am_half') }} />
        <CtxItem icon="🌇" label="오후반차" tone="warning" onClick={() => { setCtxMenu(null); onQuickAction('pm_half') }} />
        <CtxItem icon="✈" label="오전F" tone="info" onClick={() => { setCtxMenu(null); onQuickAction('am_free') }} />
        <CtxItem icon="✈" label="오후F" tone="info" onClick={() => { setCtxMenu(null); onQuickAction('pm_free') }} />
        <div style={{ height: 1, background: COLORS.borderFaint, margin: '2px 0' }} />
        <CtxItem icon="🗑" label="셀 비우기" tone="danger" onClick={() => { setCtxMenu(null); onQuickAction('clear') }} />
      </div>
    )}
    </>
  )
}

function CtxItem({ icon, label, tone, onClick }: {
  icon: string; label: string
  tone: 'neutral' | 'warning' | 'info' | 'danger'
  onClick: () => void
}) {
  const colorMap = {
    neutral: COLORS.textPrimary,
    warning: COLORS.warning,
    info: COLORS.info,
    danger: COLORS.danger,
  }
  return (
    <button type="button" onClick={onClick}
            style={{
              padding: '6px 10px', borderRadius: 6, border: 'none',
              background: 'transparent', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: colorMap[tone], fontWeight: 600,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.bgGray }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
      <span style={{ width: 16, textAlign: 'center' }}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}
