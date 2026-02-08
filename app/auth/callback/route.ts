import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    // 서버사이드에서 코드를 세션으로 교환 (이메일 인증 확인 처리)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    try {
      await supabase.auth.exchangeCodeForSession(code)
    } catch (error) {
      console.error('Auth Callback Error:', error)
      return NextResponse.redirect(`${requestUrl.origin}/?error=auth_failed`)
    }
  }

  // 인증 완료 페이지로 리다이렉트
  return NextResponse.redirect(`${requestUrl.origin}/auth/verified`)
}
