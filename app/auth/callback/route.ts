import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  // 이동할 주소 (없으면 대시보드)
  const next = requestUrl.searchParams.get('next') || '/'

  if (code) {
    // 🚨 [핵심 수정] cookies() 앞에 await를 붙여야 합니다! (Next.js 최신 버전 대응)
    const cookieStore = await cookies()

    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    try {
      // 1. 코드를 세션으로 교환
      await supabase.auth.exchangeCodeForSession(code)

      // 2. 세션 확인 (로그용)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
         console.log('Login Success:', session.user.email)
      }

    } catch (error) {
      console.error('Auth Callback Error:', error)
      return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_callback_failed`)
    }
  }

  // 성공 시 이동
  return NextResponse.redirect(`${requestUrl.origin}${next}`)
}