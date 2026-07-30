// ═══════════════════════════════════════════════════════════════════
// UI Tokens — FMI ERP 플랫 디자인 시스템 (2026-07 개편)
// ───────────────────────────────────────────────────────────────────
// 기준: _mockups/fmi-erp-redesign.html (REDESIGN 4장 디자인 원칙)
//   · 절제된 색 — 기본 무채색 + 의미 색 (파랑=정보, 초록=수입/정상, 빨강=지출/경고)
//   · 글래스/뉴모피즘 폐지 — 흰 카드 + 얇은 보더 + 미세 그림자
// GLASS 키는 하위 호환용으로 유지하되 값은 플랫 서피스 (60개 파일이 참조)
// 사용: import { COLORS, BTN, GLASS, SPACING, pillStyle } from '@/app/utils/ui-tokens'
// ═══════════════════════════════════════════════════════════════════

import type React from 'react'

/**
 * COLORS — 시맨틱 컬러 토큰 (목업 팔레트)
 */
export const COLORS = {
  // ── 브랜드 ──
  primary: '#2563eb',
  primaryDark: '#1d4fd7',

  // ── 재무 시맨틱 ──
  income: '#16a34a',      // 수입 (초록 — 목업 amt-in)
  expense: '#dc2626',     // 지출 (빨강)

  // ── 상태 시맨틱 ──
  success: '#16a34a',     // 완료/정상/분류완료
  warning: '#d97706',     // 주의/기타
  danger: '#dc2626',      // 위험/미분류/파괴적 액션
  info: '#2563eb',        // 정보
  neutral: '#9aa1ad',     // 중립/0원/비활성

  // ── 분류 상태 ──
  unclassified: '#dc2626',  // 미분류 — 빨강 (즉각 액션 필요)
  etc: '#d97706',           // 기타 — 앰버 (완료된 분류, 다만 세분화 여지)
  classified: '#16a34a',    // 분류완료 — 초록

  // ── 배경 (의미 색 틴트) ──
  bgBlue: '#eff4ff',
  bgGreen: '#effaf3',
  bgRed: '#fdf0f0',
  bgAmber: '#fdf6ec',
  bgViolet: '#f5f3ff',
  bgGray: '#f6f7f9',

  // ── 보더 ──
  borderBlue: '#c9dbfa',
  borderGreen: '#bfe3cd',
  borderRed: '#f3c6c6',
  borderAmber: '#f3e3c8',
  borderViolet: '#ddd6fe',
  borderSubtle: '#e6e8ec',
  borderFaint: '#f0f1f4',

  // ── 텍스트 ──
  textPrimary: '#1a1d23',
  textSecondary: '#5b626e',
  textMuted: '#9aa1ad',
  textDim: '#cbd5e1',
} as const

/**
 * BTN — 버튼 프리셋
 */
export const BTN = {
  sm: { padding: '4px 10px', fontSize: 12, borderRadius: 7, fontWeight: 600 },
  md: { padding: '8px 14px', fontSize: 13, borderRadius: 9, fontWeight: 600 },
  lg: { padding: '12px 22px', fontSize: 14, borderRadius: 10, fontWeight: 700 },
} as const

/**
 * GLASS — (구 Soft Ice Glass 5단계) → 플랫 서피스로 재정의
 * 하위 호환: 60개 파일이 GLASS.L1~L5 를 참조하므로 키는 유지, 값만 플랫.
 * L5/L4 카드·모달 = 흰 패널 / L3 스탯카드 = 흰 패널 / L2 서브 = 옅은 회색 / L1 인풋 = 회색 필드
 */
export const GLASS = {
  L5: {
    background: '#ffffff',
    border: '1px solid #e6e8ec',
  },
  L4: {
    background: '#ffffff',
    border: '1px solid #e6e8ec',
    boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
  },
  L3: {
    background: '#ffffff',
    boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
    // border는 색상 틴트로 호출측에서 주입
  },
  L2: {
    background: '#fafbfc',
    border: '1px solid #f0f1f4',
  },
  L1: {
    background: '#f6f7f9',
    border: '1px solid #e6e8ec',
  },
} as const

/**
 * SPACING — 간격 토큰 (8px 기반 스케일)
 */
export const SPACING = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
} as const

/**
 * pillStyle — 알약(Pill) 배지 스타일 생성기
 * 용도: 상태 배지, 카테고리 칩, 필터 토글 등 (목업 .badge — 사각 6px 라운드)
 */
export type PillTone = 'danger' | 'warning' | 'success' | 'info' | 'neutral' | 'primary'

export const pillStyle = (tone: PillTone): React.CSSProperties => {
  const map: Record<PillTone, { bg: string; color: string }> = {
    danger:  { bg: COLORS.bgRed,    color: COLORS.danger },
    warning: { bg: COLORS.bgAmber,  color: COLORS.warning },
    success: { bg: COLORS.bgGreen,  color: COLORS.success },
    info:    { bg: COLORS.bgBlue,   color: COLORS.info },
    neutral: { bg: COLORS.borderFaint, color: COLORS.textSecondary },
    primary: { bg: COLORS.bgBlue,   color: COLORS.primary },
  }
  const t = map[tone]
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: t.color,
    background: t.bg,
    border: 'none',
    borderRadius: 6,
    whiteSpace: 'nowrap',
  }
}

/**
 * classifyTone — 분류 상태 → Pill 톤 매핑
 */
export const classifyTone = (category: string | null | undefined): PillTone => {
  if (!category || category === '미분류' || category === 'unclassified') return 'danger'
  if (category === '기타' || category === 'etc' || category === 'other') return 'warning'
  return 'success'
}

/**
 * classifyColor — 분류 상태 → 단일 색상 매핑 (텍스트 전용)
 */
export const classifyColor = (category: string | null | undefined): string => {
  if (!category || category === '미분류' || category === 'unclassified') return COLORS.unclassified
  if (category === '기타' || category === 'etc' || category === 'other') return COLORS.etc
  return COLORS.classified
}
