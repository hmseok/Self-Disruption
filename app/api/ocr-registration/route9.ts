import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const apiKey = process.env.GEMINI_API_KEY;
    const model = "gemini-2.0-flash"; // 가장 똑똑한 모델

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    // 🔥 [핵심] AI에게 "지식 검색"을 강제하는 프롬프트
    const prompt = `
      당신은 대한민국 최고의 자동차 DB 관리자입니다.
      이미지에서 '차종'과 '연식'을 파악한 뒤, 당신의 지식베이스를 활용해 해당 차량의 **모든 트림 정보**를 생성하세요.

      [1. 이미지 분석 (OCR)]
      - car_number: 차량번호 (없으면 '임시번호')
      - model_name_ocr: 등록증에 적힌 차명 그대로 (예: 카니발 하이브리드, Model Y)
      - registration_date: 최초등록일 (YYYY-MM-DD)
      - year: 연식 (숫자, 예: 2025)
      - vin: 차대번호
      - owner_name: 소유자
      - location: 주소

      [2. AI 지식 기반 트림 생성 (필수 수행)]
      - 위에서 파악한 **'차명'**과 **'연식'**을 기준으로, 한국 시장에 출시된 **모든 세부 트림(Grade)**과 **신차 가격**을 리스트로 만드세요.
      - **주의:** 등록증에 트림이 안 적혀 있어도, 해당 연식에 존재하는 트림들을 모두 나열해야 합니다.
      - 예: "Model Y" -> RWD, Long Range, Performance 트림 나열.
      - 예: "카니발" -> 프레스티지, 노블레스, 시그니처, 그래비티 트림 나열.

      [JSON 출력 형식]
      {
        "car_number": "123가4567",
        "model_name": "카니발 하이브리드",
        "year": 2025,
        "trims": [
           { "name": "프레스티지 (9인승)", "price": 45000000 },
           { "name": "노블레스 (9인승)", "price": 48000000 },
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
        "purchase_price": "54038182"
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