import { NextResponse } from 'next/server'

// ⚡️ 모델 정의 (성능순)
const MODEL_FAST = "gemini-2.5-flash";
const MODEL_SMART = "gemini-2.5-flash"; // 가장 안정적인 트림 박사
const MODEL_ULTRA = "gemini-2.0-pro-exp-02-05";

async function callGeminiAI(model: string, base64Data: string, mode: 'fast' | 'smart' | 'ultra') {
  const apiKey = process.env.GEMINI_API_KEY;

  let systemInstruction = "";
  if (mode === 'fast') {
      systemInstruction = "자동차 등록증에서 텍스트를 추출하세요.";
  } else {
      systemInstruction = "당신은 자동차 DB 전문가입니다. 등록증의 [차명, 연료, 인승]을 분석하고, 지식베이스를 검색하여 **해당 차종의 대한민국 판매 트림(Grade)**을 반드시 찾아내세요. 없는 정보는 추론하여 채우세요.";
  }

  const prompt = `
    ${systemInstruction}

    [필수 추출 항목]
    - 차명 (Model): 예) EV4, 더 뉴 카니발 하이브리드
    - 연료 (Fuel): 예) 전기, 하이브리드
    - 인승 (Capacity): 예) 5, 7, 9
    - 연식 (Year): YYYY

    [트림(Grade) 생성 규칙 - 필수!]
    - 위 스펙에 맞는 **실제 판매 등급**만 리스트로 만드세요.
    - 예(EV4): 에어, 어스, GT-Line
    - 예(카니발): 프레스티지, 노블레스, 시그니처, 그래비티
    - **가솔린/디젤 등 엔진명은 트림명이 아닙니다.**

    [JSON 포맷]
    {
      "car_number": "차량번호",
      "model_name": "정확한 차명",
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

  if (!response.ok) throw new Error(`Model ${model} failed`);
  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());
}

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    // 1단계: 빠른 모델
    console.log(`🚀 [1단계] ${MODEL_FAST} 가동`);
    let result = await callGeminiAI(MODEL_FAST, base64Data, 'fast');

    // 2단계: 트림 없으면 똑똑한 모델 투입
    if (!result.trims || result.trims.length === 0 || result.model_name === "미확인 모델") {
        console.warn(`⚠️ [트림 누락] ${MODEL_SMART} 전환 (정밀 분석)`);
        try {
            result = await callGeminiAI(MODEL_SMART, base64Data, 'smart');

            // 3단계: 그래도 없으면 최신 모델
            if (!result.trims || result.trims.length === 0) {
                 console.warn(`⚠️ [3단계] ${MODEL_ULTRA} 최후 수단`);
                 result = await callGeminiAI(MODEL_ULTRA, base64Data, 'ultra');
            }
        } catch (e) { console.error("심층 분석 실패", e); }
    }

    console.log(`✅ [완료] ${result.model_name} / 트림 ${result.trims?.length}개`);
    return NextResponse.json(result);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}