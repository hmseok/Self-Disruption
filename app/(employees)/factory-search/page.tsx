// ═══════════════════════════════════════════════════════════════
// /factory-search — 메인: 공장 추천 (사고 접수 → 가까운 공장)
// 사용자 정의: 협력공장 검색의 메인 기능 = 공장 추천
// 지도/목록/그룹 구성은 SubNav 에서 진입
// ═══════════════════════════════════════════════════════════════
export const dynamic = 'force-dynamic'

import IntakeMain from './intake/IntakeMain'

export default function FactorySearchHomePage() {
  return <IntakeMain />
}
