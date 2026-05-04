// /factory-search/intake → 메인 /factory-search 로 redirect (UX 정리 Phase 1)
// 외부 링크/북마크 보존 위해 유지 — 메인 페이지가 IntakeMain 으로 swap 됨
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function IntakeRedirectPage() {
  redirect('/factory-search')
}
