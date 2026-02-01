import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const apiKey = process.env.GEMINI_API_KEY;
    const model = "gemini-2.0-flash"; // 가장 똑똑하고 빠른 모델

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const prompt = `
      당신은 대한민국 최고의 자동차 전문가이자 데이터베이스입니다.
      제공된 자동차등록증 이미지를 분석하고, 당신의 지식을 결합하여 완벽한 데이터를 JSON으로 반환하세요.

      [1단계: OCR 텍스트 추출 (이미지 기반)]
      - car_number: 차량번호.
      - detected_model_name: 등록증에 적힌 차명 그대로 (예: 더 뉴 카니발, 쏘렌토 하이브리드).
      - registration_date: 최초등록일 (YYYY-MM-DD).
      - year: 최초등록일의 연도 (숫자).
      - vin: 차대번호.
      - owner_name: 소유자.
      - location: 주소.

      [2단계: AI 지식 기반 트림 데이터 생성 (가장 중요!!)]
      - 위에서 파악한 **'차명'**과 **'연식(Year)'**을 기준으로,
      - 한국 시장에 출시된 **해당 연식의 모든 세부 트림(등급)**과 **신차 가격(원)**을 당신의 지식베이스에서 검색하여 리스트로 만드세요.
      - **주의:** 등록증에 트림이 안 적혀 있어도, 해당 연식에 존재하는 트림들을 모두 나열해야 합니다.
      - 예: 2025 카니발 하이브리드라면 -> 프레스티지, 노블레스, 시그니처, 그래비티 등 모든 트림 나열.

      [JSON 출력 형식]
      {
        "car_number": "123가4567",
        "model_name": "더 뉴 카니발 하이브리드",
        "year": 2025,
        "trims": [
           { "name": "프레스티지 (5인승)", "price": 45000000 },
           { "name": "노블레스 (7인승)", "price": 48000000 },
           { "name": "시그니처 (9인승)", "price": 52000000 }
        ],
        "vin": "...",
        "owner_name": "...",
        "location": "...",
        "registration_date": "2025-02-27",
        "inspection_end_date": "...",
        "vehicle_age_expiry": "...",
        "capacity": "9",
        "displacement": "1598",
        "fuel_type": "휘발유+전기",
        "purchase_price": "등록증 취득가액 숫자"
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