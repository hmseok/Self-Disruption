// 정산 — 4단계 흐름 (2026-07-30 개편, REDESIGN 3장)
// 구 6탭 대시보드는 /finance/settlement/execute (확정·지급 작업 화면) 로 이동.
import SettlementFlow from './SettlementFlow'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <SettlementFlow />
}
