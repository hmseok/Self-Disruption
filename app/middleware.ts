import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // 🔄 세션을 갱신하여 로그인이 풀리지 않게 합니다.
  await supabase.auth.getSession()

  return res
}

// 이 미들웨어가 적용될 경로 설정
export const config = {
  matcher: [
    /*
     * 아래 경로를 제외한 모든 경로에서 실행:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico (파비콘)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}