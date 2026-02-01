import { NextResponse } from 'next/server'

// ⚡️ [엔진 설정] 2.0 Flash (속도/가성비 최적)
const MODEL_MAIN = "gemini-2.0-flash";

async function callGeminiAI(model: string, base64Data: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  const systemInstruction = `
    당신은 자동차 데이터베이스 구축 전문가입니다.
    등록증을 분석하여 [브랜드, 차명, 연식, 연료, 인승]을 정확히 파악하고,
    해당 차량의 **대한민국 시판 트림(Grade)** 목록을 생성하세요.
  `;

  const prompt = `
    ${systemInstruction}

    [1. 필수 추출 정보]
    - **브랜드 (Brand):** 제조사 (예: 기아, 현대, 테슬라, 벤츠, BMW)
    - **차명 (Model Name):** (예: EV4, 더 뉴 카니발, 아이오닉5)
    - **연료 (Fuel):** (예: 전기, 하이브리드, 휘발유)
    - **연식 (Year):** (YYYY)
    - **인승:** (숫자)

    [2. 트림(Grade) 생성 규칙]
    - 해당 연식/차종의 **모든 판매 등급**을 나열하세요.
    - 깡통(하위)부터 풀옵션(상위)까지 빠짐없이 작성하세요.

    [JSON 출력 포맷]
    {
      "car_number": "차량번호",
      "brand": "브랜드명 (예: 기아)",
      "model_name": "모델명 (예: EV4)",
      "year": 2025,
      "fuel_type": "연료",
      "capacity": 0,
      "displacement": 0,
      "trims": [
          { "name": "트림명", "price": 0 }
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
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: base64Data } }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    }
  );

  if (!response.ok) {
      const errText = await response.text();
      console.error(`AI Error:`, errText);
      throw new Error(`AI Request Failed`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("AI 응답 없음");

  return JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());
}

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    console.log(`🚀 [AI 분석] ${MODEL_MAIN} 가동`);
    const result = await callGeminiAI(MODEL_MAIN, base64Data);

    console.log(`✅ [완료] ${result.brand} ${result.model_name} (${result.year}) / 트림 ${result.trims?.length}개`);
    return NextResponse.json(result);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}