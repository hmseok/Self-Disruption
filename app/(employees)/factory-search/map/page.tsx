// /factory-search/map — 카카오맵 협력공장 + 사고 마커 (지도 뷰)
// FactoryMapMain.tsx 는 root 에 있고 import 경로(./_hooks/_lib/_components) 가 root 기준이라 그대로 재사용
export const dynamic = 'force-dynamic'

import FactoryMapMain from '../FactoryMapMain'

export default function FactoryMapPage() {
  return <FactoryMapMain />
}
