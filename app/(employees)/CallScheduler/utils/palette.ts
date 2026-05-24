// ═══════════════════════════════════════════════════════════════════
// CallScheduler — color_tone → 디자인 토큰(COLORS) 매핑
// CLAUDE.md §10 Soft Ice 글래스 + ui-tokens.ts 의 단일 소스 사용
// PR-2QQ-a — 14 색상 옵션 (워커 + 그룹 색상 다양화)
// ═══════════════════════════════════════════════════════════════════
import { COLORS } from '@/app/utils/ui-tokens'
import type { ColorTone } from './types'

/** 셀 배경 (연한 틴트) */
export const TONE_BG: Record<ColorTone, string> = {
  blue:   COLORS.bgBlue,
  gray:   COLORS.bgGray,
  green:  COLORS.bgGreen,
  amber:  COLORS.bgAmber,
  violet: COLORS.bgViolet,
  red:    COLORS.bgRed,
  none:   'transparent',
  // PR-2QQ-a 확장
  indigo: 'rgba(99, 102, 241, 0.10)',
  sky:    'rgba(14, 165, 233, 0.10)',
  teal:   'rgba(20, 184, 166, 0.10)',
  lime:   'rgba(132, 204, 22, 0.12)',
  orange: 'rgba(249, 115, 22, 0.10)',
  pink:   'rgba(236, 72, 153, 0.10)',
  slate:  'rgba(100, 116, 139, 0.10)',
}

/** 셀 보더 (회색 톤만 무색에 가깝게) */
export const TONE_BORDER: Record<ColorTone, string> = {
  blue:   COLORS.borderBlue,
  gray:   COLORS.borderFaint,
  green:  COLORS.borderGreen,
  amber:  COLORS.borderAmber,
  violet: COLORS.borderViolet,
  red:    COLORS.borderRed,
  none:   COLORS.borderFaint,
  // PR-2QQ-a 확장
  indigo: 'rgba(99, 102, 241, 0.35)',
  sky:    'rgba(14, 165, 233, 0.35)',
  teal:   'rgba(20, 184, 166, 0.35)',
  lime:   'rgba(132, 204, 22, 0.40)',
  orange: 'rgba(249, 115, 22, 0.35)',
  pink:   'rgba(236, 72, 153, 0.35)',
  slate:  'rgba(100, 116, 139, 0.35)',
}

/** 텍스트 강조 색상 (이름 표시용) */
export const TONE_TEXT: Record<ColorTone, string> = {
  blue:   COLORS.info,
  gray:   COLORS.textSecondary,
  green:  COLORS.success,
  amber:  COLORS.warning,
  violet: '#7c3aed',
  red:    COLORS.danger,
  none:   COLORS.textPrimary,
  // PR-2QQ-a 확장
  indigo: '#4f46e5',
  sky:    '#0284c7',
  teal:   '#0d9488',
  lime:   '#65a30d',
  orange: '#ea580c',
  pink:   '#db2777',
  slate:  '#475569',
}

/**
 * 시프트 시간대 → 개념 색상 (내용에 맞는 기본색).
 *   야간(overnight) → indigo / 저녁(시작 18시~) → orange / 주간 → sky
 * 대시보드 칩 등에서 시프트 컨셉을 색으로 구분할 때 사용.
 * (cs_shift_slots.color_tone 마이그레이션 미적용 환경에서도 동작 — 시각 기반)
 */
export function shiftConceptTone(
  isOvernight: boolean, startHHMM: string | null | undefined,
): ColorTone {
  if (isOvernight) return 'indigo'
  const h = Number(String(startHHMM || '').split(':')[0])
  if (Number.isFinite(h) && h >= 18) return 'orange'
  return 'sky'
}

/** 진한 색상 (chip/badge 배경, dot 등) */
export const TONE_SOLID: Record<ColorTone, string> = {
  blue:   '#3b82f6',
  gray:   '#9ca3af',
  green:  '#22c55e',
  amber:  '#f59e0b',
  violet: '#7c3aed',
  red:    '#ef4444',
  none:   '#e5e7eb',
  // PR-2QQ-a 확장
  indigo: '#6366f1',
  sky:    '#0ea5e9',
  teal:   '#14b8a6',
  lime:   '#84cc16',
  orange: '#f97316',
  pink:   '#ec4899',
  slate:  '#64748b',
}
