import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const apiKey = process.env.GEMINI_API_KEY;
    const model = "gemini-2.0-flash";

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    // 🔥 [핵심 수정] 스펙 기반 트림 필터링 지시
    const prompt = `
      당신은 자동차 등록증 분석 및 트림 매칭 전문가입니다.
      이미지에 있는 **[연료], [배기량], [승차정원], [연식]** 정보를 기준으로, 해당 차량이 선택할 수 있는 **세부 트림(Grade)** 목록만 정확히 추출하세요.

      [1. 필수 스펙 추출 (정확도 100% 요구)]
      - model_name: 차명 (예: 카니발 하이브리드, 쏘렌토, Model Y)
      - year: 연식 (최초등록일의 연도)
      - fuel_type: 연료 (예: 휘발유, 경유, 하이브리드, 전기)
      - capacity: 승차정원 (숫자, 예: 5, 7, 9)
      - displacement: 배기량 (숫자, 예: 1598, 2199, 3470)

      [2. 트림(Grade) 리스트 생성 규칙 (매우 중요!)]
      - 위에서 추출한 **스펙(연료+배기량+인승)**에 해당하는 트림만 나열하세요.
      - ❌ 오답 예시: "9인승 가솔린", "7인승 디젤" (이건 트림이 아니라 엔진 사양임)
      - ⭕ 정답 예시: "프레스티지", "노블레스", "시그니처", "그래비티", "어스", "GT-Line" (실제 판매 등급명)

      [시뮬레이션 예시]
      - 상황: 등록증에 [카니발 하이브리드], [9인승], [1598cc] 라고 적혀있음.
      - 행동: 7인승이나 가솔린/디젤 모델은 제외하고, "9인승 하이브리드"의 트림만 나열함.
      - 결과 Trims: ["프레스티지", "노블레스", "시그니처", "그래비티"]

      [JSON 출력 형식]
      {
        "car_number": "차량번호",
        "model_name": "더 뉴 카니발 하이브리드",
        "year": 2025,
        "fuel_type": "하이브리드(휘발유+전기)",
        "capacity": "9",
        "displacement": "1598",
        "trims": [
           { "name": "프레스티지", "price": 39250000 },
           { "name": "노블레스", "price": 43650000 },
           { "name": "시그니처", "price": 47500000 },
           { "name": "그래비티", "price": 48500000 }
        ],
        "vin": "차대번호",
        "owner_name": "소유자",
        "location": "주소",
        "registration_date": "YYYY-MM-DD",
        "inspection_end_date": "YYYY-MM-DD",
        "vehicle_age_expiry": "YYYY-MM-DD",
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