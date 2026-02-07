import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // 세션(로그인 여부) 확인
  const { data: { session } } = await supabase.auth.getSession()

  // 1. 로그인이 안 된 상태로 '/admin'에 가려고 하면 -> 대문('/')으로 보냄
  if (!session && req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // 2. 이미 로그인한 사람이 대문('/')에 오면 -> 대시보드('/admin')로 보냄
  if (session && req.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  return res
}

export const config = {
  matcher: ['/', '/admin/:path*'],
}