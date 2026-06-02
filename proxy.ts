import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ============================================
// 프록시 미들웨어 (Next.js 16 — proxy.ts)
//  ① CDN 캐시 방지: HTML 페이지는 항상 최신 버전 제공
//  PR-FMI-ONLY-PURGE Phase 3b (2026-06-02) — 라이드 분리: 서브도메인 company_key 멀티브랜드 쿠키 제거 (단독회사 FMI).
//  ⚠ Next.js 16 은 middleware.ts 대신 proxy.ts 사용 — 두 파일 공존 시 빌드 실패 (middleware.ts 신설 금지).
// ============================================

export async function proxy(req: NextRequest) {
  const res = NextResponse.next()

  // ── ① CDN 캐시 방지 ──
  const { pathname } = req.nextUrl
  const isStaticAsset = pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot|css|js|json)$/)

  if (!isStaticAsset) {
    res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.headers.set('CDN-Cache-Control', 'no-store')
    res.headers.set('Cloudflare-CDN-Cache-Control', 'no-store')
    res.headers.set('Pragma', 'no-cache')
    res.headers.set('Expires', '0')
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)',
  ],
}
