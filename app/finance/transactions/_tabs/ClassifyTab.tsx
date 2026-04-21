'use client'

// Phase G — 구 /finance/upload/page.tsx 재수출 래퍼
// Phase H에서 본문 추출 + localStorage → Context 치환 + 배지 컴포넌트 승격
import LegacyUploadPage from '../../upload/page'

export default function ClassifyTab() {
  return <LegacyUploadPage />
}
