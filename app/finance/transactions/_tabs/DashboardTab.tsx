'use client'

// Phase G — 구 /finance/page.tsx 재수출 래퍼
// Phase H에서 본문 추출 + Context 치환 + QuickTxModal 분리
import LegacyFinancePage from '../../page'

export default function DashboardTab() {
  return <LegacyFinancePage />
}
