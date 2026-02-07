import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    try {
      // 1. 코드를 세션으로 교환 (로그인 처리)
      await supabase.auth.exchangeCodeForSession(code)
    } catch (error) {
      console.error('Auth Callback Error:', error)
      return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_callback_failed`)
    }
  }

  // 🚨 [수정됨] 메인('/')으로 보내지 말고, '인증 완료 페이지'로 보냅니다.
  return NextResponse.redirect(`${requestUrl.origin}/auth/verified`)
}