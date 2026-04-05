import { NextRequest, NextResponse } from 'next/server'

/**
 * [DEPRECATED] 레거시 서명 API
 *
 * 기존 /api/sign 엔드포인트는 /api/public/quote/[token] 및
 * /api/public/quote/[token]/sign 으로 통합되었습니다.
 *
 * 이 파일은 하위 호환을 위해 redirect 응답만 제공합니다.
 */

// GET: 토큰으로 견적 조회 → 공개 API로 리다이렉트
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: '토큰이 필요합니다' }, { status: 400 })
  }

  // 클라이언트가 fetch로 호출하는 경우 JSON redirect 정보 반환
  return NextResponse.json({
    redirect: true,
    url: `/api/public/quote/${token}`,
    message: '이 API는 /api/public/quote/[token]으로 통합되었습니다.',
  }, { status: 301 })
}

// POST: 서명 제출 → 공개 서명 API로 안내
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ error: '토큰이 필요합니다' }, { status: 400 })
    }

    return NextResponse.json({
      redirect: true,
      url: `/api/public/quote/${token}/sign`,
      message: '이 API는 /api/public/quote/[token]/sign으로 통합되었습니다.',
    }, { status: 301 })
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
}
