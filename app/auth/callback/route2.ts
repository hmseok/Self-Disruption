import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  // 💡 URL에서 '어디로 갈지(next)' 정보를 가져옵니다. (없으면 기본값 '/')
  const next = requestUrl.searchParams.get('next') || '/'

  if (code) {
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    try {
      await supabase.auth.exchangeCodeForSession(code)
    } catch (error) {
      console.error('Auth Error:', error)
    }
  }

  // ✅ 구글 로그인이면 '/'로, 이메일이면 '/auth/verified'로 알아서 이동합니다!
  return NextResponse.redirect(`${requestUrl.origin}${next}`)
}