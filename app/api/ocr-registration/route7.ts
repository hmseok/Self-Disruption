import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const apiKey = process.env.GEMINI_API_KEY;
    const model = "gemini-2.0-flash"; // 성능 좋은 모델 유지

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const prompt = `
      당신은 자동차등록증 OCR 전문가입니다. 이미지를 분석하여 JSON으로 반환하세요.

      [필수 추출 항목]
      1. car_number: 차량번호 (예: 12가3456)
      2. model_name: 차명 (예: 더 뉴 카니발, EV6). *모델코드 말고 사람이 부르는 이름.
      3. owner_name: 소유자 (법인명 또는 개인명).
      4. location: 사용본거지 주소.
      5. vin: 차대번호 (영어+숫자 조합 17자리).

      [날짜 정보 추출 (매우 중요)]
      * 등록증 하단 좌측/우측을 꼼꼼히 보세요.
      6. registration_date: '최초등록일' (우측 상단). (YYYY-MM-DD)
      7. inspection_end_date: '검사유효기간'의 **만료일(뒤쪽 날짜)**. (예: 2024-02-01 ~ 2026-01-31 이면 2026-01-31 추출)
      8. vehicle_age_expiry: '차령만료일' (비고란 또는 하단). 없으면 빈칸.

      [제원 정보]
      9. capacity: 승차정원 (숫자).
      10. displacement: 배기량 (숫자).
      11. fuel_type: 연료의 종류.
      12. purchase_price: 취득가액 (우측 하단, 숫자만).

      [AI 지식 검색: 트림 정보]
      - 추출한 '차명'과 '최초등록일(연식)'을 기반으로,
      - 한국 시장에 출시된 해당 연식 차량의 **모든 세부 트림명**과 **신차 가격**을 리스트로 작성하세요.

      [JSON 예시]
      {
        "car_number": "12가3456",
        "model_name": "쏘렌토 4세대",
        "trims": [
           { "name": "프레스티지", "price": 35000000 },
           { "name": "노블레스", "price": 38000000 }
        ],
        "vin": "...",
        "owner_name": "...",
        "location": "...",
        "registration_date": "2024-01-05",
        "inspection_end_date": "2028-01-04",
        "vehicle_age_expiry": "",
        "capacity": "5",
        "displacement": "2497",
        "fuel_type": "휘발유",
        "purchase_price": "35000000"
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