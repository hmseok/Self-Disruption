// ═══════════════════════════════════════════════════════════════════
// UI Tokens — FMI ERP Soft Ice Glass 디자인 시스템
// ───────────────────────────────────────────────────────────────────
// CLAUDE.md §10 Soft Ice 디자인 시스템 + Phase A 결정사항 구현
// 목적: finance 모듈 ~13,400줄 전역 토큰화 / 색상·버튼·글래스 통일
// 사용: import { COLORS, BTN, GLASS, SPACING, pillStyle } from '@/app/utils/ui-tokens'
// ═══════════════════════════════════════════════════════════════════

import type React from 'react'

/**
 * COLORS — 시맨틱 컬러 토큰
 * Decision 1 α: 미분류(danger/red) ≠ 기타(warning/amber) 구분
 */
export const COLORS = {
  // ── 브랜드 ──
  primary: '#3b6eb5',
  primaryDark: '#2a4a6b',

  // ── 재무 시맨틱 ──
  income: '#3b6eb5',      // 수입 (파랑 — 플러스)
  expense: '#ef4444',     // 지출 (빨강 — 마이너스)

  // ── 상태 시맨틱 ──
  success: '#10b981',     // 완료/정상/분류완료
  warning: '#f59e0b',     // 주의/기타
  danger: '#dc2626',      // 위험/미분류/파괴적 액션
  info: '#3b6eb5',        // 정보/수입과 동일 톤
  neutral: '#94a3b8',     // 중립/0원/비활성

  // ── 분류 상태 (Decision 1 α) ──
  unclassified: '#dc2626',  // 미분류 — 빨강 (즉각 액션 필요)
  etc: '#f59e0b',           // 기타 — 앰버 (완료된 분류, 다만 세분화 여지)
  classified: '#10b981',    // 분류완료 — 초록

  // ── 배경 (글래스 틴트 베이스) ──
  bgBlue: '#eff6ff',
  bgGreen: '#f0fdf4',
  bgRed: '#fef2f2',
  bgAmber: '#fffbeb',
  bgViolet: '#f5f3ff',
  bgGray: '#f8fafc',

  // ── 보더 (Level 3 색상 틴트) ──
  borderBlue: 'rgba(191,219,254,0.80)',
  borderGreen: 'rgba(187,247,208,0.80)',
  borderRed: 'rgba(252,165,165,0.80)',
  borderAmber: 'rgba(253,230,138,0.80)',
  borderViolet: 'rgba(221,214,254,0.80)',
  borderSubtle: 'rgba(0,0,0,0.06)',   // Level 5, 4
  borderFaint: 'rgba(0,0,0,0.05)',    // Level 2, 1

  // ── 텍스트 ──
  textPrimary: '#1e293b',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  textDim: '#cbd5e1',
} as const

/**
 * BTN — 버튼 프리셋
 * Decision 4 β: sm(4×10)/md(8×14)/lg(12×22) — 조밀 비율
 */
export const BTN = {
  sm: { padding: '4px 10px', fontSize: 12, borderRadius: 6, fontWeight: 600 },
  md: { padding: '8px 14px', fontSize: 13, borderRadius: 8, fontWeight: 700 },
  lg: { padding: '12px 22px', fontSize: 14, borderRadius: 10, fontWeight: 700 },
} as const

/**
 * GLASS — Soft Ice Glass 5단계 (CLAUDE.md §10)
 * L5 최상위 (네비) ≥ L4 테이블/모달 ≥ L3 스탯카드 ≥ L2 사이드/서브 ≥ L1 인풋(오목)
 */
export const GLASS = {
  L5: {
    background: 'rgba(255,255,255,0.75)',
    border: '1px solid rgba(0,0,0,0.06)',
    backdropFilter: 'blur(20px) saturate(160%)',
    WebkitBackdropFilter: 'blur(20px) saturate(160%)',
  },
  L4: {
    background: 'rgba(255,255,255,0.72)',
    border: '1px solid rgba(0,0,0,0.06)',
    backdropFilter: 'blur(16px) saturate(150%)',
    WebkitBackdropFilter: 'blur(16px) saturate(150%)',
  },
  L3: {
    background: 'rgba(255,255,255,0.60)',
    backdropFilter: 'blur(12px) saturate(140%)',
    WebkitBackdropFilter: 'blur(12px) saturate(140%)',
    // border는 색상 틴트로 호출측에서 주입
  },
  L2: {
    background: 'rgba(255,255,255,0.35)',
    border: '1px solid rgba(0,0,0,0.05)',
    backdropFilter: 'blur(8px) saturate(130%)',
    WebkitBackdropFilter: 'blur(8px) saturate(130%)',
  },
  L1: {
    background: 'rgba(255,255,255,0.40)',
    border: '1px solid rgba(0,0,0,0.05)',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
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
 * 용도: 상태 배지, 카테고리 칩, 필터 토글 등
 */
export type PillTone = 'danger' | 'warning' | 'success' | 'info' | 'neutral' | 'primary'

export const pillStyle = (tone: PillTone): React.CSSProperties => {
  const map: Record<PillTone, { bg: string; color: string; border: string }> = {
    danger:  { bg: COLORS.bgRed,    color: COLORS.danger,     border: COLORS.borderRed },
    warning: { bg: COLORS.bgAmber,  color: COLORS.warning,    border: COLORS.borderAmber },
    success: { bg: COLORS.bgGreen,  color: COLORS.success,    border: COLORS.borderGreen },
    info:    { bg: COLORS.bgBlue,   color: COLORS.info,       border: COLORS.borderBlue },
    neutral: { bg: COLORS.bgGray,   color: COLORS.textMuted,  border: COLORS.borderFaint },
    primary: { bg: COLORS.bgBlue,   color: COLORS.primary,    border: COLORS.borderBlue },
  }
  const t = map[tone]
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 700,
    color: t.color,
    background: t.bg,
    border: `1px solid ${t.border}`,
    borderRadius: 999,
    whiteSpace: 'nowrap',
  }
}

/**
 * classifyTone — 분류 상태 → Pill 톤 매핑
 * Decision 1 α: 미분류=danger, 기타=warning, 분류=success
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
