import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ============================================
// 미들웨어: CDN 캐시 방지만 담당 (인증은 클라이언트에서 처리)
// ============================================

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // ============================================
  // CDN 캐시 방지: HTML 페이지는 항상 최신 버전 제공
  // ============================================
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
