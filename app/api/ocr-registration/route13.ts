import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const apiKey = process.env.GEMINI_API_KEY;
    const model = "gemini-2.5-flash";

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    // 🔥 [핵심] 등록 시점에 정확한 트림을 가져오도록 강력 지시
    const prompt = `
      당신은 자동차 등록 자동화 AI입니다.
      이미지를 분석하여 차량의 스펙(연료, 배기량, 인승)을 파악하고, 그에 맞는 **정확한 판매 트림(Grade)** 목록을 생성하세요.

      [1. 필수 스펙 추출]
      - 차명: (예: 더 뉴 카니발 하이브리드, EV4, 쏘렌토)
      - 연료: (전기, 하이브리드, 휘발유 등)
      - 인승: (5, 7, 9 등)
      - 배기량: (cc 단위 숫자)
      - 연식: (YYYY)

      [2. 트림(Grade) 생성 규칙 - 필터링 필수]
      - 위에서 파악한 **[차명 + 연료 + 인승]** 조합에 해당하는 트림만 남기세요.
      - 엉뚱한 연료나 인승의 트림은 절대 포함하지 마세요.
      - 예: "카니발 9인승 하이브리드" -> 프레스티지, 노블레스, 시그니처, 그래비티 (O)
      - 예: "7인승"이나 "가솔린" 트림은 제외 (X)

      [JSON 출력]
      {
        "car_number": "12가3456",
        "model_name": "더 뉴 카니발 하이브리드",
        "year": 2025,
        "fuel_type": "하이브리드(휘발유+전기)",
        "capacity": 9,
        "displacement": 1598,
        "trims": [
           { "name": "프레스티지", "price": 39250000 },
           { "name": "노블레스", "price": 43650000 },
           { "name": "시그니처", "price": 47500000 }
        ],
        "vin": "...",
        "owner_name": "...",
        "location": "...",
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}