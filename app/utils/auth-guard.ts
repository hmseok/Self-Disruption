import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

/**
 * API 라우트 인증 가드
 * 1차: 쿠키 기반 세션 (createRouteHandlerClient)
 * 2차: Authorization Bearer 토큰 (sessionStorage 기반 클라이언트용)
 *
 * 사용법:
 *   const auth = await requireAuth(req)
 *   if (auth.error) return auth.error
 *   // auth.userId, auth.email 사용 가능
 */
export async function requireAuth(req: NextRequest) {
  // 1차: 쿠키 기반 인증 시도
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user }, error } = await supabase.auth.getUser()

    if (!error && user) {
      return { error: null, userId: user.id, email: user.email }
    }
  } catch (e: any) {
    console.error('[auth-guard] 쿠키 인증 실패:', e.message)
  }

  // 2차: Authorization Bearer 토큰 인증 시도
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (token) {
      const { createClient } = await import('@supabase/supabase-js')
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      })

      const { data: { user }, error } = await supabase.auth.getUser()
      if (!error && user) {
        return { error: null, userId: user.id, email: user.email }
      }
    }
  } catch (fallbackErr) {
    console.error('[auth-guard] Bearer 토큰 인증 실패:', fallbackErr)
  }

  // 둘 다 실패
  return {
    error: NextResponse.json(
      { error: '인증이 필요합니다. 로그인해주세요.' },
      { status: 401 }
    ),
    userId: null,
    email: null
  }
}
