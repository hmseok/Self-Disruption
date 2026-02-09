import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const apiKey = process.env.GEMINI_API_KEY;
    const model = "gemini-2.0-flash";

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const prompt = `
      당신은 자동차 데이터베이스 AI입니다. 이미지에서 차량 정보를 추출하고, **해당 차량의 정확한 판매 트림(Grade)**을 생성하세요.

      [1. 스펙 추출]
      - 차명: 등록증의 차명 (예: EV4, 더 뉴 카니발 하이브리드, Model Y)
      - 연료: (전기, 하이브리드, 휘발유, 경유 등)
      - 인승: 승차정원 (숫자)
      - 연식: 최초등록일의 연도

      [2. 트림(Grade) 생성 규칙 - 핵심!]
      - 추출된 **[차명 + 연료 + 인승]** 조합에 맞는 **대한민국 판매 등급(Trim Name)**만 나열하세요.
      - **주의:** "가솔린", "디젤", "7인승" 같은 스펙은 트림명이 아닙니다. 제외하세요.
      - **전기차 예시 (EV4, EV6):** "에어(Air)", "어스(Earth)", "GT-Line", "라이트(Light)" 등.
      - **하이브리드 예시 (카니발/쏘렌토):** "프레스티지", "노블레스", "시그니처", "그래비티" 등.

      [JSON 출력]
      {
        "car_number": "차량번호",
        "model_name": "EV4",
        "year": 2025,
        "fuel_type": "전기",
        "capacity": 5,
        "displacement": 0,
        "trims": [
           { "name": "에어 (Air)", "price": 42000000 },
           { "name": "어스 (Earth)", "price": 46000000 },
           { "name": "GT-Line", "price": 49000000 }
        ],
        "vin": "차대번호",
        "owner_name": "소유자",
        "location": "주소",
        "registration_date": "YYYY-MM-DD",
        "inspection_end_date": "YYYY-MM-DD",
        "vehicle_age_expiry": "YYYY-MM-DD",
        "purchase_price": "숫자만"
      }
    `;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
          }],
          generationConfig: { response_mime_type: "application/json" }
        })
      }
    );

    if (!response.ok) throw new Error('AI 요청 실패');

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanText);

    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error("AI Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}