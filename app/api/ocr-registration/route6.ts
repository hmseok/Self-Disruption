import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const apiKey = process.env.GEMINI_API_KEY;

    // 🚀 최신 모델 사용
    const model = "gemini-2.5-flash";

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    // 프롬프트: OCR + 트림 지식 검색
    const prompt = `
      이미지를 분석하여 다음 정보를 JSON으로 추출하세요.

      [1. OCR 추출]
      - car_number: 차량번호 (없으면 '임시번호')
      - model_name: 차명 (예: 쏘렌토, EV6). 모델코드 말고 통용되는 이름.
      - registration_date: 최초등록일 (YYYY-MM-DD).
      - vin: 차대번호.
      - owner_name: 소유자.
      - location: 주소.

      [2. AI 지식 검색 (중요)]
      - 위에서 파악한 '차명'과 '최초등록일의 연도(Year)'를 기준으로,
      - 해당 연식 차량의 **모든 출시 트림명**과 **신차 가격**을 리스트로 작성하세요.

      [JSON 예시]
      {
        "car_number": "12가3456",
        "model_name": "EV6",
        "year": 2024,
        "trims": [
           { "name": "라이트", "price": 48000000 },
           { "name": "에어", "price": 51000000 },
           { "name": "어스", "price": 55000000 }
        ],
        "vin": "...",
        "owner_name": "...",
        "location": "...",
        "registration_date": "2024-03-01",
        "capacity": "5",
        "displacement": "0",
        "fuel_type": "전기",
        "purchase_price": "등록증에 적힌 취득가액(숫자만)"
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