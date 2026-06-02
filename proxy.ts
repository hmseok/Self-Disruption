import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getModuleProfile, isPathEnabled } from '@/lib/module-profile'

// ============================================
// 프록시 미들웨어 (Next.js 16 — proxy.ts)
//  ① CDN 캐시 방지: HTML 페이지는 항상 최신 버전 제공
//  ② PR-MULTI-BRAND P2 — 서브도메인 → company_key 쿠키
//       ride.hmseok.com → RIDE / 그 외(hmseok.com 등) → FMI (기본)
//       쿠키 1개만 세팅, 리다이렉트·rewrite·차단 없음.
//  ⚠ Next.js 16 은 middleware.ts 대신 proxy.ts 사용 — 두 파일 공존 시 빌드 실패.
//     서브도메인 로직은 반드시 본 파일에 둘 것 (middleware.ts 신설 금지).
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

  // ── ②a 모듈 프로파일 가드 (PR-FMI-ONLY-RUNTIME Phase 1) ──
  //   profile=fmi (hmseok.com) 에서만 라이드 경로 직접 접근 차단 (URL 직접 입력 방지).
  //   profile=fmi 일 때 !isPathEnabled = "ride 전용 경로"(shared·global 제외) → 그것만 차단.
  //   profile=ride/all 이면 무동작 — ride 앱의 전역경로(auth/dashboard 등) 오차단 방지 + 기존 동작 유지.
  if (!isStaticAsset && getModuleProfile() === 'fmi' && !isPathEnabled(pathname)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'not_available', message: '이 배포에서는 제공되지 않는 기능입니다.' },
        { status: 404 },
      )
    }
    return NextResponse.redirect(new URL('/', req.url))
  }

  // ── ② 서브도메인 → company_key 쿠키 (PR-MULTI-BRAND P2) ──
  //   httpOnly 아님 → 로그인 페이지(클라이언트)가 읽어 브랜딩.
  try {
    const host = (req.headers.get('host') || '').toLowerCase()
    const companyKey = host.startsWith('ride.') ? 'RIDE' : 'FMI'
    if (req.cookies.get('company_key')?.value !== companyKey) {
      res.cookies.set('company_key', companyKey, { path: '/', sameSite: 'lax' })
    }
  } catch {
    // 쿠키 세팅 실패해도 요청은 통과 — 브랜딩은 기본 FMI 로 폴백
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)',
  ],
}
