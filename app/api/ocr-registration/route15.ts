import { NextResponse } from 'next/server'

// ⚡️ 사용할 모델 정의 (최신 버전 반영)
// 1. 속도와 가성비의 2.5 Flash
const MODEL_FAST = "gemini-2.5-flash";
// 2. 고도의 추론 능력을 가진 2.5 Pro (메인 해결사)
const MODEL_SMART = "gemini-2.5-pro";
// 3. 최신 실험적 성능의 3.0 Pro (최후의 보루)
const MODEL_ULTRA = "gemini-3.0-pro-preview"; // 혹은 'gemini-exp-1206' 등 최신 실험 버전

// 🛠️ 공통 AI 호출 함수
async function callGeminiAI(model: string, base64Data: string, mode: 'fast' | 'smart' | 'ultra') {
  const apiKey = process.env.GEMINI_API_KEY;

  // 모드별 프롬프트 강도 조절
  let systemInstruction = "";
  if (mode === 'fast') {
      systemInstruction = "자동차 등록증에서 텍스트를 추출하고, 알려진 트림 정보를 빠르게 나열하세요.";
  } else if (mode === 'smart') {
      systemInstruction = "당신은 대한민국 최고의 자동차 데이터베이스 전문가입니다. 등록증의 [차명, 연료, 인승]을 분석하여, 지식 베이스에 있는 **정확한 판매 등급(Trim)**을 반드시 찾아내세요. 없는 정보는 추론하여 채우세요.";
  } else {
      systemInstruction = "**비상 모드:** 이전 모델들이 트림 식별에 실패했습니다. 당신의 모든 지식과 추론 능력을 동원하여, 이 차량(EV/하이브리드 포함)의 **대한민국 시장 실제 판매 트림**을 강제로 생성해내세요.";
  }

  const prompt = `
    ${systemInstruction}

    [입력 이미지 분석]
    - 차명 (Model): 예) EV4, 더 뉴 카니발 하이브리드
    - 연료 (Fuel): 예) 전기, 하이브리드
    - 인승 (Capacity): 예) 5, 7, 9
    - 연식 (Year): YYYY

    [출력 요구사항]
    - 위 스펙에 맞는 **모든 트림(Grade)**을 리스트로 뽑아주세요.
    - **전기차(EV) 예시:** 에어(Air), 어스(Earth), GT-Line
    - **하이브리드 예시:** 프레스티지, 노블레스, 시그니처, 그래비티
    - **주의:** '가솔린', '디젤' 같은 엔진 타입은 트림명이 아닙니다. 제외하세요.

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

  if (!response.ok) throw new Error(`Model ${model} failed: ${response.statusText}`);

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Empty response from AI");

  const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleanText);
}

// 🚀 메인 로직 (3단계 계단식 호출)
export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    console.log(`🚀 [1단계] ${MODEL_FAST} 가동 (고속 스캔)`);
    let result = await callGeminiAI(MODEL_FAST, base64Data, 'fast');

    // 검증: 트림이 없거나 모델명이 부실하면 2단계 진입
    if (!result.trims || result.trims.length === 0 || result.model_name === "미확인 모델") {
        console.warn(`⚠️ [1단계 실패] 트림 부족. [2단계] ${MODEL_SMART} 가동 (정밀 지식 검색)`);

        try {
            // 2단계: 2.5 Pro (가장 똑똑하고 안정적)
            result = await callGeminiAI(MODEL_SMART, base64Data, 'smart');

            // 2단계도 실패? (아직도 트림이 없다면)
            if (!result.trims || result.trims.length === 0) {
                 console.warn(`⚠️ [2단계 실패] 최후의 수단. [3단계] ${MODEL_ULTRA} 가동`);
                 // 3단계: 3.0 Pro Preview (최신 실험 모델)
                 result = await callGeminiAI(MODEL_ULTRA, base64Data, 'ultra');
            }

            console.log(`✅ [성공] 최종 모델이 트림 ${result.trims?.length}개를 찾아냈습니다.`);

        } catch (retryError) {
            console.error("🔥 [심층 분석 실패] 에러 발생:", retryError);
            // 실패해도 1단계 결과라도 반환 (OCR이라도 건지기 위해)
        }
    } else {
        console.log(`✅ [1단계 성공] ${MODEL_FAST}가 트림 ${result.trims.length}개를 찾았습니다.`);
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error("🔥 Server Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}