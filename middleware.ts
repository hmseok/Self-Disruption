import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // 1. Supabase 클라이언트 생성
  const supabase = createMiddlewareClient({ req, res })

  // 2. 현재 로그인 세션 확인 (서버 측에서 확인)
  const { data: { session } } = await supabase.auth.getSession()

  const path = req.nextUrl.pathname

  // [보안 규칙 1] 로그인을 안 했는데 -> 보호된 페이지에 접근하면 -> 로그인 페이지로 쫓아냄
  // 보호할 페이지: 메인(/), 관리자(/admin), 차량관리(/cars) 등등...
  // (단, 로그인 페이지, 회원가입, auth 관련 api는 제외해야 함)
  if (!session && path !== '/login' && path !== '/signup' && !path.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // [보안 규칙 2] 이미 로그인을 했는데 -> 또 로그인 페이지(/login)에 오면 -> 메인으로 보냄
  if (session && (path === '/login' || path === '/signup')) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return res
}

// ⚠️ 아래 파일들은 문지기가 검사하지 않음 (이미지, 폰트, API 등)
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}