import { NextResponse } from 'next/server'

// ⚡️ [최적화] 대표님 계정에서 사용 가능한 최신 모델로 설정
// 1차 시도: 속도와 성능 밸런스가 좋은 2.0 Flash
const MODEL_MAIN = "gemini-2.0-flash";

// 2차 시도: 만약 실패 시 더 강력한 추론이 필요할 때 (안정적인 1.5 Pro 사용)
// (혹은 'gemini-2.0-pro-exp' 등 실험 버전을 넣을 수도 있습니다)
const MODEL_BACKUP = "gemini-1.5-pro-latest";

async function callGeminiAI(model: string, base64Data: string, mode: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  // 시스템 프롬프트: AI에게 역할을 부여
  const systemInstruction = `
    당신은 자동차 DB 구축 전문가입니다.
    등록증 이미지를 분석하여 [차명, 연식, 연료, 인승]을 파악하고,
    당신의 지식베이스에서 **해당 스펙에 맞는 대한민국 시판 트림(Grade)**을 정확히 찾아내세요.
    (예: EV4 -> 에어, 어스, GT-Line / 카니발 -> 프레스티지, 노블레스 등)
  `;

  const prompt = `
    ${systemInstruction}

    [분석 대상]
    - 차명 (Model Name)
    - 연료 (Fuel Type): 전기, 하이브리드, 휘발유, 경유
    - 승차정원 (Capacity)
    - 연식 (Year)

    [트림 생성 규칙 - 필수]
    1. 등록증에 트림명이 없어도 **스펙(연료/인승)에 맞는 트림을 반드시 추론하여 생성**하세요.
    2. 엉뚱한 연료의 트림은 제외하세요. (예: 전기차에 가솔린 트림 금지)

    [JSON 출력 포맷]
    {
      "car_number": "차량번호",
      "model_name": "차명",
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
      throw new Error(`Model [${model}] API Error: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("AI 응답 없음");

  // JSON 파싱 (마크다운 코드블럭 제거)
  return JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());
}

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    console.log(`🚀 [1단계] ${MODEL_MAIN} 엔진 가동`);
    let result;

    try {
        result = await callGeminiAI(MODEL_MAIN, base64Data, 'fast');
    } catch (e: any) {
        console.error(`⚠️ 1단계 실패 (${e.message}), 2단계 백업 엔진 가동`);
        result = await callGeminiAI(MODEL_BACKUP, base64Data, 'smart');
    }

    // 트림 정보를 못 찾았을 경우, 백업 엔진으로 한 번 더 시도
    if (!result.trims || result.trims.length === 0 || result.model_name === "미확인 모델") {
        console.warn(`⚠️ 트림 정보 누락. [2단계] ${MODEL_BACKUP} 엔진으로 재분석`);
        try {
            result = await callGeminiAI(MODEL_BACKUP, base64Data, 'smart');
        } catch (e) { console.error("2단계 재분석 실패", e); }
    }

    console.log(`✅ [분석 완료] ${result.model_name} / 트림 ${result.trims?.length || 0}개 발견`);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("🔥 서버 에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}