// ═══════════════════════════════════════════════════════════════════
// CallScheduler — color_tone → 디자인 토큰(COLORS) 매핑
// CLAUDE.md §10 Soft Ice 글래스 + ui-tokens.ts 의 단일 소스 사용
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
}
