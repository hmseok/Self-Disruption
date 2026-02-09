import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const apiKey = process.env.GEMINI_API_KEY;
    const model = "gemini-2.0-flash";

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const prompt = `
      당신은 자동차 데이터베이스 생성기입니다.
      이미지에서 차종을 식별하고, 당신의 지식을 활용해 해당 차종의 **트림(등급) 리스트**를 반드시 생성하세요.

      [1단계: 식별]
      - 이미지에서 '차명', '연식', '차대번호' 등을 읽으세요.
      - 차명 예시: "더 뉴 카니발", "Model Y", "쏘렌토 하이브리드" 등 통상 명칭 사용.

      [2단계: 데이터 생성 (필수)]
      - 식별된 차종과 연식에 해당하는 **대한민국 출시 트림(Grade)** 정보를 지식 베이스에서 검색하여 리스트로 만드세요.
      - **등록증에 트림이 안 적혀 있어도, 해당 연식에 존재하는 모든 트림을 나열해야 합니다.**
      - 가격은 대략적인 신차 가격(원)을 넣으세요.

      [JSON 출력 포맷]
      {
        "car_number": "차량번호",
        "model_name": "식별된 차명 (예: Model Y RWD)",
        "year": 2025,
        "trims": [
           { "name": "RWD", "price": 52990000 },
           { "name": "Long Range", "price": 60990000 },
           { "name": "Performance", "price": 71990000 }
        ],
        "vin": "차대번호",
        "owner_name": "소유자",
        "location": "주소",
        "registration_date": "YYYY-MM-DD",
        "inspection_end_date": "YYYY-MM-DD",
        "vehicle_age_expiry": "YYYY-MM-DD (없으면 빈칸)",
        "capacity": "승차정원(숫자)",
        "displacement": "배기량(숫자)",
        "fuel_type": "연료",
        "purchase_price": "취득가액(숫자)"
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