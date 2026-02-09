import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { brand, model } = await request.json()
    const query = `${brand} ${model} exterior official wallpaper 4k`

    const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY
    const CX_ID = process.env.GOOGLE_SEARCH_CX_ID

    if (!GOOGLE_API_KEY || !CX_ID) {
       return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 500 })
    }

    console.log(`🔍 [AI 검색 시작] 검색어: ${query}`)
    console.log(`🔑 [키 확인] API_KEY: ${GOOGLE_API_KEY.substring(0, 5)}... / CX_ID: ${CX_ID}`)

    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX_ID}&q=${encodeURIComponent(query)}&searchType=image&imgSize=large&num=1`
    )

    const data = await res.json()

    // 🚨 구글 API 에러가 나면 여기서 상세 내용을 보여줍니다.
    if (data.error) {
        console.error("❌ Google API Error Details:", JSON.stringify(data.error, null, 2))
        return NextResponse.json({
            error: `구글 검색 실패: ${data.error.message} (Code: ${data.error.code})`
        }, { status: 400 })
    }

    if (!data.items || data.items.length === 0) {
      console.log("⚠️ 검색 결과가 0건입니다.")
      return NextResponse.json({ error: '검색 결과가 없습니다.' }, { status: 404 })
    }

    const imageUrl = data.items[0].link
    console.log(`✅ [이미지 찾음] ${imageUrl}`)

    return NextResponse.json({ imageUrl })

  } catch (error: any) {
    console.error("Server Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}