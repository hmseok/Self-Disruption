import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ───────────────────────────────────────────────────────────────
// 카카오 모빌리티 Directions API 프록시 (격리본)
// /RideEmployees/factory-map/api/directions?origin=lng,lat&destination=lng,lat
// KAKAO_REST_API_KEY 환경변수 필요
// ───────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const origin = searchParams.get('origin')
  const destination = searchParams.get('destination')

  if (!origin || !destination) {
    return NextResponse.json({ success: false, error: 'origin/destination required' }, { status: 400 })
  }

  const key = process.env.KAKAO_REST_API_KEY
  if (!key) {
    return NextResponse.json({
      success: false,
      error: 'KAKAO_REST_API_KEY 미설정 — .env.local에 REST API 키 추가 후 dev 서버 재시작',
    }, { status: 500 })
  }

  const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin}&destination=${destination}&priority=RECOMMEND`

  try {
    const r = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      cache: 'no-store',
    })
    const j = await r.json()
    if (!r.ok) {
      return NextResponse.json({ success: false, error: j?.msg || `kakao ${r.status}`, raw: j }, { status: r.status })
    }
    const route = j.routes?.[0]
    if (!route || route.result_code !== 0) {
      return NextResponse.json({ success: false, error: route?.result_msg || 'no route' }, { status: 404 })
    }
    return NextResponse.json({
      success: true,
      data: {
        distanceMeters: route.summary?.distance ?? 0,
        durationSeconds: route.summary?.duration ?? 0,
        tollFare: route.summary?.fare?.toll ?? 0,
        taxiFare: route.summary?.fare?.taxi ?? 0,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : 'directions failed',
    }, { status: 500 })
  }
}
