import { NextRequest, NextResponse } from 'next/server'

/**
 * API 라우트 인증 가드 (Firebase Auth)
 */
export async function requireAuth(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return {
        error: NextResponse.json({ error: '인증이 필요합니다. 로그인해주세요.' }, { status: 401 }),
        userId: null,
        email: null
      }
    }

    const { getUserIdFromToken } = await import('@/lib/auth-server')
    const userId = await getUserIdFromToken(token)

    if (!userId) {
      return {
        error: NextResponse.json({ error: '유효하지 않은 인증 토큰입니다.' }, { status: 401 }),
        userId: null,
        email: null
      }
    }

    return { error: null, userId, email: null }
  } catch (e: any) {
    console.error('[auth-guard] 인증 실패:', e.message)
    return {
      error: NextResponse.json({ error: '인증 처리 중 오류가 발생했습니다.' }, { status: 500 }),
      userId: null,
      email: null
    }
  }
}
