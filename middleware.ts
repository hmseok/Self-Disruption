import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ============================================
// 미들웨어: 세션 갱신만 담당 (리다이렉트 안 함)
// 리다이렉트는 클라이언트에서 처리 → 프로덕션 쿠키 유실 문제 회피
// ============================================

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // 세션 갱신만 수행 — 리다이렉트 없이 항상 res 반환
  await supabase.auth.getSession()

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)',
  ],
}
