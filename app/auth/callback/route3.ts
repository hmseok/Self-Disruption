import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  // 구글 로그인 등에서 전달받은 이동할 주소 (없으면 대시보드)
  const next = requestUrl.searchParams.get('next') || '/'

  if (code) {
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    try {
      // 1. 코드를 세션으로 교환
      await supabase.auth.exchangeCodeForSession(code)

      // 2. [추가됨] 세션이 확실히 있는지 한 번 더 확인 (구글 로그인 안정성 확보)
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
         console.log('Google Login Success, User:', session.user.email)
      }

    } catch (error) {
      console.error('Auth Callback Error:', error)
      // 에러 나면 로그인 페이지로
      return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_callback_failed`)
    }
  }

  // 성공 시 원래 가려던 곳으로 이동 (보통 대시보드 '/')
  return NextResponse.redirect(`${requestUrl.origin}${next}`)
}