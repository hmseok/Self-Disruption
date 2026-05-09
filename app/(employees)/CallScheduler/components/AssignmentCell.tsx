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
  // Phase D — 워커 조건 색상 layer (요일 매치 시 보더 hint)
  dow?: number  // 0=일 ~ 6=토 (선택 — 미전달 시 색상 layer 비활성)
  // Phase E — 가드 위반 시각화
  violations?: Set<'time_conflict' | 'next_day_block' | 'consec_limit'>
  // Phase F — 빈 셀 사유 분석 (그룹 회피 멤버 등)
  emptyReason?: string  // hover 툴팁용
}

// Phase D — 요일 매치 검사 헬퍼
function matchDow(csv: string | null | undefined, dow: number): boolean {
  if (!csv || dow == null) return false
  return String(csv)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(Number)
    .includes(dow)
}

export default function AssignmentCell({ assignment, worker, onClick, onQuickAction, dow, violations, emptyReason }: Props) {
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

  // Phase K (2026-05-09) — 워커 dow 설정 → 그룹멤버 설정으로 이동
  //   본 셀은 그룹 컨텍스트 모름 → 색상 layer 임시 비활성
  //   (향후 ScheduleGrid 가 멤버 설정 prop 으로 내려서 재활성)
  const dowAvoidMatch = false
  const dowPreferMatch = false
  // 미사용 워닝 회피 (matchDow 헬퍼는 추후 그룹 멤버 prop 받을 때 다시 활용)
  void matchDow
  // Phase E — 가드 위반 우선순위: time_conflict > next_day_block > consec_limit > Phase D
  const hasTimeConflict = violations?.has('time_conflict')
  const hasNextDayBlock = violations?.has('next_day_block')
  const hasConsecLimit = violations?.has('consec_limit')
  const violationBorder = hasTimeConflict
    ? 'rgba(220,38,38,0.95)'    // 시간 겹침 — 강한 빨강
    : hasNextDayBlock
    ? 'rgba(239,68,68,0.85)'    // 익일 휴식 — 빨강
    : hasConsecLimit
    ? 'rgba(245,158,11,0.85)'   // 연속 한도 — 노랑
    : null
  const tintBorder = violationBorder
    ?? (dowPreferMatch ? 'rgba(34,197,94,0.55)'
        : dowAvoidMatch ? 'rgba(239,68,68,0.55)'
        : null)
  const violationIcon = hasTimeConflict ? '⏱'
    : hasNextDayBlock ? '🌙'
    : hasConsecLimit ? '📅'
    : ''

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
        height: 32,  // Phase C — 24 → 32 (사용자 원칙: 작은 버튼 지양)
        padding: '0 6px',
        background: bg,
        border: `${tintBorder ? '2px' : '1px'} solid ${
          tintBorder ? tintBorder : (isEmpty ? COLORS.borderFaint : TONE_BORDER[tone])
        }`,
        borderRadius: 6,
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
      title={(() => {
        // Phase D/E/F — 모든 layer 통합 툴팁
        const base = worker
          ? `${worker.name}${special !== 'none' ? ' · ' + SPECIAL_LABEL[special] : ''}`
          : (special !== 'none' ? SPECIAL_LABEL[special]
             : (emptyReason ? `비어있음 — ${emptyReason}` : '비어있음 — 클릭해서 배정'))
        const dowLayer = dowPreferMatch ? ' [✓ 희망 요일]'
                       : dowAvoidMatch ? ' [⚠ 비선호 요일]'
                       : ''
        const vioLayer = hasTimeConflict ? ' [⏱ 시간 겹침]'
                       : hasNextDayBlock ? ' [🌙 익일 휴식 위반]'
                       : hasConsecLimit ? ' [📅 연속 한도 도달]'
                       : ''
        return base + dowLayer + vioLayer
      })()}
    >
      <span style={{
        fontSize: 12,  // Phase C — 11 → 12
        fontWeight: worker ? 700 : 400,
        color: worker ? TONE_TEXT[tone] : COLORS.textMuted,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {/* PR-2QQ-b — 수동 lock 셀 표시 */}
        {assignment?.manual_lock && (
          <span style={{ marginRight: 2, fontSize: 9 }} title="수동 lock — 자동 생성 보존">🔒</span>
        )}
        {/* Phase E — 가드 위반 아이콘 */}
        {violationIcon && (
          <span style={{ marginRight: 2, fontSize: 11 }}>{violationIcon}</span>
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
