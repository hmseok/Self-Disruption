import { redirect } from 'next/navigation'

// ═══════════════════════════════════════════════════════════════════
// /admin/cards 는 /finance/cards 로 통합되었습니다.
// 이 파일은 북마크 보존용 얇은 리다이렉트 래퍼입니다.
// 실제 구현: app/finance/cards/page.tsx (2,500+ 줄 / 지갑 UI / 한도·배정·엑셀 포함)
// ═══════════════════════════════════════════════════════════════════

export default function AdminCardsRedirect() {
  redirect('/finance/cards')
}
