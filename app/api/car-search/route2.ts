import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
})

export async function POST(request: Request) {
  try {
    const { type, brand, model, year, term } = await request.json()

    if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 500 })
    }

    // 🕵️‍♂️ 모드 1: 브랜드 스캔 (인기 차종 리스트업)
    if (type === 'scan_brand') {
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    // 💡 [수정] 한글 출력 강제
                    content: `You are a car market expert in Korea.
                    List 5 to 8 most popular car models for the given brand in Korea.

                    IMPORTANT RULES:
                    1. Output MUST be a valid JSON object.
                    2. **All model names MUST be in Korean (Hangul).** (e.g., "그랜저", "쏘렌토")

                    Example: { "models": ["그랜저 GN7", "아반떼 CN7"] }`
                },
                { role: "user", content: `List popular models for: ${brand}` }
            ]
        })
        const result = JSON.parse(completion.choices[0].message.content || '{}')
        return NextResponse.json(result)
    }

    // 💰 모드 2: 렌트료 시세 분석
    else if (type === 'estimate_price') {
        console.log(`🤖 AI 시세 분석: ${brand} ${model} (${term}개월)`)
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    // 💡 [수정] 코멘트도 한글로
                    content: `You are a rental car market analyst in Korea.
                    Estimate the realistic monthly rental price (Janggi-Rent) for the requested car.

                    Factors:
                    - Market: South Korea (KRW currency)
                    - Contract Term: ${term} months
                    - Deposit: 0% (Zero deposit condition)

                    IMPORTANT RULES:
                    1. **All comments MUST be in Korean.**
                    2. Output JSON format.

                    JSON Structure:
                    {
                        "estimated_price": 650000,
                        "price_range": "63만 ~ 68만",
                        "market_comment": "현재 인기 차종이라 대기가 깁니다..."
                    }`
                },
                {
                    role: "user",
                    content: `Estimate monthly rental price for: ${brand} ${model} (${year || 'latest'}), Term: ${term} months`
                }
            ]
        })
        const result = JSON.parse(completion.choices[0].message.content || '{}')
        return NextResponse.json(result)
    }

    // 📝 모드 3: 상세 데이터 수집 (트림/옵션)
    else {
        // 연식 처리
        const searchYear = year ? `${year}년형` : "latest model year (2024 or 2025)"
        console.log(`🤖 AI 상세 수집: ${brand} ${model} (${searchYear}) - 한글 요청`)

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    // 💡 [핵심 수정] 한글 번역 강제 명령 추가
                    content: `You are a professional car database in Korea.
                    Provide the trim levels and option prices for the requested car model in South Korea (KRW).

                    CRITICAL RULES:
                    1. Use the **latest model year** available (e.g., 2024, 2025).
                    2. **Translate ALL Trim names and Option names into Korean (Hangul).**
                       - e.g., "Prestige" -> "프레스티지"
                       - e.g., "Sunroof" -> "선루프"
                       - e.g., "M Sport Package" -> "M 스포츠 패키지"
                    3. Return the "found_year" field to indicate which year was actually found.
                    4. Output MUST be valid JSON format.

                    JSON Structure:
                    {
                        "found_year": 2025,
                        "trims": [{ "name": "프레스티지", "price": 12340000, "fuel": "가솔린/디젤" }],
                        "options": [{ "name": "헤드업 디스플레이", "price": 1230000 }]
                    }`
                },
                {
                    role: "user",
                    content: `Get data for: ${brand} ${model}, Year: ${searchYear}`
                }
            ]
        })

        const result = JSON.parse(completion.choices[0].message.content || '{}')
        return NextResponse.json(result)
    }

  } catch (error: any) {
    console.error('AI Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}