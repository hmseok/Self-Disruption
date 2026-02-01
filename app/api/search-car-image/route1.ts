import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { brand, model } = await request.json()

    if (!brand || !model) {
      return NextResponse.json({ error: '브랜드와 모델명이 필요합니다.' }, { status: 400 })
    }

    // 💡 검색어 자동 최적화: "제조사 + 모델명 + 외관 공식 월페이퍼 4k"
    const query = `${brand} ${model} exterior official wallpaper 4k`

    // 환경변수에서 키 가져오기
    const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY
    const CX_ID = process.env.GOOGLE_SEARCH_CX_ID

    // 키가 설정되지 않았을 때 (방어 코드)
    if (!GOOGLE_API_KEY || !CX_ID) {
       console.error("❌ 구글 검색 API 키가 없습니다.")
       return NextResponse.json({ error: '서버에 검색 API 키가 설정되지 않았습니다. .env.local을 확인해주세요.' }, { status: 500 })
    }

    // 구글 이미지 검색 요청 (정확도순 1위 이미지)
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX_ID}&q=${encodeURIComponent(query)}&searchType=image&imgSize=large&num=1`
    )

    const data = await res.json()

    if (!data.items || data.items.length === 0) {
      return NextResponse.json({ error: '적절한 이미지를 찾지 못했습니다.' }, { status: 404 })
    }

    const imageUrl = data.items[0].link
    console.log(`✅ [AI 검색 성공] ${query} -> ${imageUrl}`)

    return NextResponse.json({ imageUrl })

  } catch (error: any) {
    console.error("Search Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}