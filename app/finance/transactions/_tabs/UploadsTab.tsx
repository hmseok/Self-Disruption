'use client'

// Phase G — 구 /finance/uploads/page.tsx 재수출 래퍼
// Phase H에서 본문 추출 + onMouseEnter 렌더 중 스타일 변경 → CSS :hover 치환
import LegacyUploadsPage from '../../uploads/page'

export default function UploadsTab() {
  return <LegacyUploadsPage />
}
