'use client'

// ═══════════════════════════════════════════════════════════════════
// Finance Transactions Hub — 주 랜딩 (탭 허브)
// ───────────────────────────────────────────────────────────────────
// Phase G (Consolidation v1) — Decisions 6~9 구현
//  ✓ FinanceProvider 하위에서 탭 전환 상태 공유
//  ✓ URL 쿼리 ↔ Context 양방향 동기화 (useFinanceUrlSync)
//  ✓ 탭 바 — Soft Ice Glass L5 + ui-tokens 토큰화
// Phase H에서 _tabs/* 각 컴포넌트 본문을 이전 + 디자인 시스템 적용
// ═══════════════════════════════════════════════════════════════════

import { Suspense } from 'react'
import { GLASS, COLORS, BTN, SPACING } from '@/app/utils/ui-tokens'
import { FinanceProvider, useFinance } from './_context/FinanceContext'
import { useFinanceUrlSync } from './_context/useFinanceUrlSync'
import DashboardTab from './_tabs/DashboardTab'
import ClassifyTab from './_tabs/ClassifyTab'
import UploadsTab from './_tabs/UploadsTab'
import CardsTab from './_tabs/CardsTab'
import CodefTab from './_tabs/CodefTab'
import type { FinanceTab } from './_context/FinanceContext'

// ──────────────────────────────────────────────────────────────
// 탭 메타
// ──────────────────────────────────────────────────────────────

const TABS: { key: FinanceTab; label: string }[] = [
  { key: 'dashboard', label: '📊 입출금 대시보드' },
  { key: 'classify',  label: '🏷️ 거래 분류 매칭' },
  { key: 'uploads',   label: '📂 업로드 이력' },
  { key: 'cards',     label: '💳 법인카드' },
  { key: 'codef',     label: '🔌 Codef 자동연동' },
]

function TabLoading() {
  return (
    <div
      style={{
        padding: 80,
        textAlign: 'center',
        color: COLORS.textMuted,
        fontWeight: 700,
      }}
    >
      데이터를 불러오는 중...
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 탭 바 (Soft Ice Glass L5 + BTN.md 토큰)
// ──────────────────────────────────────────────────────────────

function HubTabBar() {
  const { state, setTab } = useFinance()
  return (
    <div
      className="max-w-[1400px] mx-auto pt-4 px-4 md:pt-5 md:px-6"
      style={{ position: 'relative', zIndex: 1 }}
    >
      <div
        style={{
          display: 'flex',
          gap: SPACING.xs,
          marginBottom: -SPACING.md,
          padding: SPACING.xs,
          borderRadius: 12,
          ...GLASS.L5,
        }}
      >
        {TABS.map((t) => {
          const active = state.tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1,
                padding: BTN.md.padding,
                fontSize: BTN.md.fontSize,
                fontWeight: active ? 700 : 500,
                color: active ? COLORS.textPrimary : COLORS.textSecondary,
                background: active ? 'rgba(255,255,255,0.85)' : 'transparent',
                border: active
                  ? `1px solid ${COLORS.borderSubtle}`
                  : '1px solid transparent',
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: active
                  ? '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)'
                  : 'none',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow =
                  '0 0 0 2px rgba(59,110,181,0.35), 6px 6px 16px rgba(140,170,210,0.12)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = active
                  ? '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)'
                  : 'none'
              }}
              aria-current={active ? 'page' : undefined}
            >
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 탭 콘텐츠 라우터
// ──────────────────────────────────────────────────────────────

function HubContent() {
  const { state } = useFinance()
  switch (state.tab) {
    case 'dashboard': return <DashboardTab />
    case 'classify':  return <ClassifyTab />
    case 'uploads':   return <UploadsTab />
    case 'cards':     return <CardsTab />
    case 'codef':     return <CodefTab />
    default:          return <DashboardTab />
  }
}

// ──────────────────────────────────────────────────────────────
// 내부 허브 (Provider 하위)
// ──────────────────────────────────────────────────────────────

function InnerHub() {
  useFinanceUrlSync() // URL ↔ Context 양방향 동기화
  return (
    <>
      <HubTabBar />
      <Suspense fallback={<TabLoading />}>
        <HubContent />
      </Suspense>
    </>
  )
}

// ──────────────────────────────────────────────────────────────
// Export — FinanceProvider 감쌈
// ──────────────────────────────────────────────────────────────

export default function TransactionsHub() {
  return (
    <Suspense fallback={<TabLoading />}>
      <FinanceProvider>
        <InnerHub />
      </FinanceProvider>
    </Suspense>
  )
}
