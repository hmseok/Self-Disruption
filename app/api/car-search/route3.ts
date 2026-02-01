import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
})

export async function POST(request: Request) {
  try {
    // 💡 모든 파라미터 수신
    const { type, brand, model, year, term, conditions, vehicle_price } = await request.json()

    if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 500 })
    }

    // 🕵️‍♂️ 모드 1: 브랜드 스캔 (인기 차종 리스트)
    if (type === 'scan_brand') {
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are a car market expert in Korea.
                    List 5 to 8 most popular car models for the given brand in Korea.

                    IMPORTANT RULES:
                    1. Output MUST be a valid JSON object.
                    2. **All model names MUST be in Korean (Hangul).**

                    Example: { "models": ["그랜저", "쏘렌토", "아반떼"] }`
                },
                { role: "user", content: `List popular models for: ${brand}` }
            ]
        })
        const result = JSON.parse(completion.choices[0].message.content || '{}')
        return NextResponse.json(result)
    }

    // 💰 모드 2: 정밀 견적 분석 (차량가 반영)
    else if (type === 'estimate_price') {

        // 차량가가 있으면 더 강력한 프롬프트 사용
        const priceInfo = vehicle_price
            ? `Exact Vehicle Price: ${vehicle_price.toLocaleString()} KRW (Use this precise cost for calculation)`
            : `Vehicle Price: Estimate based on market average`

        const conditionText = `
          - Contract Term: ${term} months
          - ${priceInfo}
          - Annual Mileage: ${conditions?.mileage || '20,000km'}
          - Driver Age: ${conditions?.age || 'Over 26'}
          - Deposit: ${conditions?.deposit || '0%'}
          - Maintenance: ${conditions?.maintenance ? 'Included (Full Service)' : 'Self (Excluded)'}
          - Type: ${conditions?.type === 'buyout' ? 'Buyout Option (인수형)' : 'Return Only (반납형)'}
        `

        console.log(`🤖 AI 정밀 금융 계산: ${brand} ${model} / ${priceInfo}`)

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are a top-tier rental car actuary in Korea.
                    Calculate the monthly rental fee strictly based on the provided Vehicle Price (Capital Cost).

                    FORMULA LOGIC:
                    1. Residual Value (RV): Estimate RV after ${term} months for this car type.
                    2. Depreciation = (Vehicle Price - RV) / ${term}
                    3. Interest & Margin = Apply current Korean rental interest rates (approx 5~7%).
                    4. If 'Maintenance' is Included, add approx 40,000~80,000 KRW/month.

                    OUTPUT RULES:
                    - Output JSON in Korean.
                    - "market_comment" should mention that the quote is based on the exact vehicle price.

                    JSON Structure:
                    {
                        "estimated_price": 654320,
                        "contract_details": {
                            "vehicle_price": 52000000,
                            "residual_value": 24500000,
                            "excess_mileage_fee": 150,
                            "maintenance_info": "자가정비",
                            "penalty_rate": "30%"
                        },
                        "market_comment": "입력하신 차량가 5,200만원 기준 견적입니다..."
                    }`
                },
                {
                    role: "user",
                    content: `Calculate quote for: ${brand} ${model}. Conditions: ${conditionText}`
                }
            ]
        })
        const result = JSON.parse(completion.choices[0].message.content || '{}')
        return NextResponse.json(result)
    }

    // 📝 모드 3: 상세 데이터 수집 (여기가 빠져서 에러가 났었습니다! 복구 완료 ✅)
    else {
        const searchYear = year ? `${year}년형` : "latest model year"
        console.log(`🤖 AI 상세 수집: ${brand} ${model} (${searchYear})`)

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are a professional car database in Korea.
                    Provide the trim levels and option prices for the requested car model in South Korea (KRW).

                    CRITICAL RULES:
                    1. Use the **latest model year** available (e.g., 2024, 2025).
                    2. **Translate ALL Trim names and Option names into Korean (Hangul).**
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