import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════════
// PR-MULTI-BRAND P2 — 서브도메인 → 회사 키 미들웨어
// 설계서: _docs/MULTI-BRAND-DESIGN.md
// ───────────────────────────────────────────────────────────────
// host 헤더만 보고 company_key 쿠키를 세팅한다.
//   ride.hmseok.com  → RIDE
//   그 외(hmseok.com 등) → FMI  (기본 — DNS 매핑 전에도 안전)
// 리다이렉트·rewrite·차단 없음 — 쿠키 1개만 세팅하고 통과시킨다.
// 쿠키는 httpOnly 아님 → 로그인 페이지(클라이언트)에서 읽어 브랜딩.
// ═══════════════════════════════════════════════════════════════

export function middleware(req: NextRequest) {
  try {
    const host = (req.headers.get('host') || '').toLowerCase()
    const companyKey = host.startsWith('ride.') ? 'RIDE' : 'FMI'
    const res = NextResponse.next()
    if (req.cookies.get('company_key')?.value !== companyKey) {
      res.cookies.set('company_key', companyKey, { path: '/', sameSite: 'lax' })
    }
    return res
  } catch {
    // 어떤 경우에도 요청을 막지 않는다 (글로벌 미들웨어 — 안전 최우선)
    return NextResponse.next()
  }
}

export const config = {
  // 정적 자원 / 이미지 / API 제외 — 페이지 라우트에서만 동작
  matcher: ['/((?!_next/static|_next/image|favicon|.*\\.(?:png|svg|ico|jpg|jpeg|webp)$|api/).*)'],
}
