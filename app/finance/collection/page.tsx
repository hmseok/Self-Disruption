'use client'

// ═══════════════════════════════════════════════════════════════
// 수금 — 독립 페이지 (2026-08-03 사용자 확정: 장부 탭에서 사이드바 메뉴로 승격)
// 내용은 CollectionTab 재사용 — 회사 관점 채권 통합 (월별 수납·입금대기·채권 원장)
// ═══════════════════════════════════════════════════════════════

import CollectionTab from '@/app/finance/bank-card/CollectionTab'
import { COLORS } from '@/app/utils/ui-tokens'

export default function CollectionPage() {
  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, color: COLORS.textPrimary, fontSize: 14 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 21, letterSpacing: '-0.02em', fontWeight: 700 }}>수금</h1>
        <p style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 3 }}>
          회사 관점 채권 통합 — 단기·대차 청구와 장기 렌트료의 청구·수납·미수를 한곳에서 봅니다
        </p>
      </div>
      <CollectionTab />
    </div>
  )
}
