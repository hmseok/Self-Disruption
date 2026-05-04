// /factory-search/mapping — 공장 ↔ 분류 매핑 부여
// 매니저가 각 공장에 정산/고객사/관리유형/사고유형 등 분류 항목을 부여
// localStorage('ride_op_factory_classifications') 에 저장
export const dynamic = 'force-dynamic'

import MappingMain from './MappingMain'

export default function MappingPage() {
  return <MappingMain />
}
