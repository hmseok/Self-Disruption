// 정산 확정·지급 작업 화면 (전환기) — 구 정산 대시보드 전체 기능
// 2026-07-30 개편: /finance/settlement 는 4단계 흐름 페이지로 교체.
// 정산서 발송·이체 파일·지급 완료 처리는 검증된 본 화면을 그대로 사용하고,
// 이후 단계에서 흐름 페이지 안으로 흡수 후 삭제 예정.
import SettlementDashboard from '../SettlementDashboard'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <SettlementDashboard />
}
