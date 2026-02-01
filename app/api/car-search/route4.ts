import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { type, brand, model, year, term, conditions, vehicle_price, rental_type } = body

    if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: 'API 키가 없습니다.' }, { status: 500 })
    }

    // 🕵️‍♂️ 모드 1: 브랜드 스캔 (인기 차종 리스트)
    if (type === 'scan_brand') {
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: `List 5 to 8 most popular car models for ${brand} in Korea. Return JSON.` },
                { role: "user", content: `Brand: ${brand}` }
            ]
        })
        const result = JSON.parse(completion.choices[0].message.content || '{}')
        return NextResponse.json(result)
    }

    // 💰 모드 2: 시장 가격 조사 (견적 산출)
    else if (type === 'estimate_price') {
        console.log(`🤖 AI 견적 실행: ${brand} ${model} (${rental_type})`)

        const priceInfo = vehicle_price ? `Vehicle Price: ${vehicle_price.toLocaleString()} KRW` : `Standard Market Price`
        const termUnit = rental_type === 'daily' ? 'Days' : 'Months'

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are a 'Market Price Scanner' for Rental Cars in Korea.

                    CRITICAL INSTRUCTION:
                    1. **SEARCH & RETRIEVE** realistic market quotes from major Korean competitors (Lotte, SK, KB, AmazonCar).
                    2. If precise data is missing, **ESTIMATE** based on vehicle price and standard depreciation.
                    3. Return 'estimated_price' as a NUMBER (Integer). Do NOT return null.

                    JSON Structure:
                    {
                        "estimated_price": 620000,
                        "contract_details": { "vehicle_price": 50000000, "residual_value": 25000000 },
                        "competitor_comparison": [
                            { "company": "Lotte Rent-a-car", "price": 635000, "note": "IoT 정비 포함" },
                            { "company": "SK Rent-a-car", "price": 610000, "note": "다이렉트 특가" }
                        ],
                        "market_comment": "SK렌터카가 가장 저렴합니다."
                    }`
                },
                {
                    role: "user",
                    content: `Find market quotes for: ${brand} ${model}.
                    Term: ${term} ${termUnit}.
                    Type: ${rental_type}.
                    Condition: ${priceInfo}, Mileage: ${conditions?.mileage}, Deposit: ${conditions?.deposit}.`
                }
            ]
        })
        const result = JSON.parse(completion.choices[0].message.content || '{}')
        return NextResponse.json(result)
    }

    // 📝 모드 3: 상세 데이터 수집 (여기가 문제였음! 명시적 처리 추가)
    else if (type === 'detail') {
        const searchYear = year ? `${year}년형` : "latest model year available"
        console.log(`🤖 AI 상세 수집: ${brand} ${model} (${searchYear})`)

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are the Official Manufacturer Database. Provide EXACT trims and options.
                    If EV, NO Gasoline/LPi. Separate trims by Engine type. Translate to Korean.`
                },
                {
                    role: "user",
                    content: `Get OFFICIAL data for: ${brand} ${model}, Year: ${searchYear}.`
                }
            ]
        })
        const result = JSON.parse(completion.choices[0].message.content || '{}')
        return NextResponse.json(result)
    }

    // ❌ 알 수 없는 타입 처리 (에러 방지)
    else {
        return NextResponse.json({ error: 'Invalid Type' }, { status: 400 })
    }

  } catch (error: any) {
    console.error('AI Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}