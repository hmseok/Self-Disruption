import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  // 1. 기본 응답 생성
  const res = NextResponse.next()

  // 2. Supabase 클라이언트 생성
  const supabase = createMiddlewareClient({ req, res })

  // 3. ⚠️ 핵심: 세션만 갱신하고, 강제 이동(Redirect)은 시키지 않음!
  // (여기서 redirect 코드를 다 뺐기 때문에 무한루프가 물리적으로 불가능해집니다)
  await supabase.auth.getSession()

  return res
}

export const config = {
  // 미들웨어가 돌아야 하는 경로
  matcher: ['/', '/admin/:path*'],
}