import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
})

export async function POST(request: Request) {
  try {
    const { type, brand, model, year, term, conditions, vehicle_price, rental_type } = await request.json()

    if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: 'API 키가 없습니다.' }, { status: 500 })
    }

    // 🕵️‍♂️ 모드 1: 브랜드 스캔
    if (type === 'scan_brand') {
        // ... (기존 동일)
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

    // 💰 모드 2: 상세 조건(잔가 전략 포함) 반영 견적
    else if (type === 'estimate_price') {

        const priceInfo = vehicle_price ? `Vehicle Price: ${vehicle_price.toLocaleString()} KRW` : `Standard Price`

        // 💡 잔존가치(RV) 전략 분석
        // 사용자가 '최대 잔가(Max RV)'를 선택했다면, 인수형이라도 월 납입금이 낮아야 함.
        const rvStrategy = conditions?.residual_pref === 'max'
            ? "Strategy: **MAXIMUM Residual Value** (To lower monthly fee). Find 'High-RV' products."
            : "Strategy: **STANDARD Residual Value** (To lower final buyout price). Find standard products.";

        const filterPrompt = `
            [USER SEARCH CONDITIONS]
            1. Contract Type: "${conditions?.type === 'buyout' ? 'Buyout Option (인수선택형)' : 'Return Only (반납형)'}"
            2. **Residual Value Strategy**: ${rvStrategy} (Critical!)
            3. Term: ${term} ${rental_type === 'daily' ? 'Days' : 'Months'}
            4. Mileage: "${conditions?.mileage}"
            5. Maintenance: "${conditions?.maintenance ? 'Included' : 'Self'}"
            6. Deposit: "${conditions?.deposit}"
        `

        console.log(`🤖 AI 견적 전략: ${conditions?.type} / 잔가전략: ${conditions?.residual_pref}`)

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are a 'Rental Market Analyst' in Korea.

                    TASK:
                    Search for competitor quotes based on the User's Residual Value (RV) Strategy.

                    **LOGIC ADJUSTMENT:**
                    - If User selects **'Buyout' + 'Max RV'**: The monthly fee should be **LOW** (similar to Return type), but the Final Buyout Price will be **HIGH**.
                    - If User selects **'Buyout' + 'Standard RV'**: The monthly fee will be **HIGHER**, but the Final Buyout Price will be **LOWER**.
                    - If User selects **'Return Only'**: Always assumes Max RV (Lowest Monthly Fee).

                    OUTPUT JSON:
                    {
                        "estimated_price": 595000,
                        "contract_details": {
                            "vehicle_price": 50000000,
                            "residual_value": 29000000,    // 전략에 따른 잔가 (Max 선택 시 높게)
                            "excess_mileage_fee": 160,
                            "penalty_rate": "30%",
                            "maintenance": "자가정비"
                        },
                        "competitor_comparison": [
                            { "company": "Lotte", "price": 600000, "note": "고잔가 프로모션" },
                            { "company": "SK", "price": 590000, "note": "월 납입금 최소화형" }
                        ],
                        "market_comment": "고객님의 요청대로 '최대 잔가'를 적용하여 월 납입금을 최소화한 견적입니다."
                    }`
                },
                {
                    role: "user",
                    content: `Find market quotes for: ${brand} ${model}.
                    Car Price: ${priceInfo}.

                    ${filterPrompt}`
                }
            ]
        })
        const result = JSON.parse(completion.choices[0].message.content || '{}')
        return NextResponse.json(result)
    }

    // 📝 모드 3: 상세 수집 (기존 유지)
    else if (type === 'detail') {
        const searchYear = year ? `${year}년형` : "latest model year available"
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: `You are the Official Manufacturer Database. Provide EXACT trims and options. If EV, NO Gasoline. JSON Only.` },
                { role: "user", content: `Get OFFICIAL data for: ${brand} ${model}, Year: ${searchYear}.` }
            ]
        })
        const result = JSON.parse(completion.choices[0].message.content || '{}')
        return NextResponse.json(result)
    }

    else {
        return NextResponse.json({ error: 'Invalid Type' }, { status: 400 })
    }

  } catch (error: any) {
    console.error('AI Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}