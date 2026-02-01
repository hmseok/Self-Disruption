import { NextResponse } from 'next/server'

// ⚡️ [엔진 최종 확정]
// 대표님 계정에서 100% 작동하는 모델로 고정합니다. (에러 방지)
// Flash 모델이지만 프롬프트로 지능을 끌어올려 Pro급 결과를 냅니다.
const MODEL_MAIN = "gemini-2.0-flash";

async function callGeminiAI(model: string, base64Data: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  // 🧠 [프롬프트 초강화] AI가 게으름 피우지 못하게 구체적으로 지시
  const systemInstruction = `
    당신은 대한민국 자동차 데이터베이스 구축을 위한 **최고 권위의 분석가**입니다.
    제공된 등록증의 **[차명, 연식, 연료, 인승]**을 분석하고,
    당신의 방대한 지식베이스를 샅샅이 뒤져 **해당 차량의 판매 트림(Grade) 리스트**를 완벽하게 작성하세요.
  `;

  const prompt = `
    ${systemInstruction}

    [1. 차량 식별]
    - 차명: (예: EV4, 더 뉴 카니발, 아이오닉5, 쏘렌토)
    - 연료: (예: 전기, 하이브리드, 가솔린, 디젤)
    - 연식: (YYYY)

    [2. 트림(Grade) 데이터 생성 규칙 - 🚨매우 중요]
    - **절대 대표 트림 1~2개로 끝내지 마세요.** 판매되었던 **모든 등급**을 찾아내세요.
    - **하위(깡통) 등급부터 최상위(풀옵션) 등급까지 순서대로 나열하세요.**
    - **없는 정보라도 문맥을 통해 추론하여 채워 넣으세요.** (당신은 할 수 있습니다)

    [차종별 필수 포함 트림 예시]
    - **기아(EV/RV):** 라이트, 에어, 어스, GT-Line, 프레스티지, 노블레스, 시그니처, 그래비티
    - **현대(아이오닉/SUV):** 스탠다드, 롱레인지, 익스클루시브, 프레스티지, 캘리그래피, E-Lite
    - **테슬라:** RWD, Long Range, Performance

    [JSON 출력 포맷 (엄수)]
    {
      "car_number": "차량번호",
      "model_name": "정확한 차명",
      "year": 2025,
      "fuel_type": "연료",
      "capacity": 0,
      "displacement": 0,
      "trims": [
          { "name": "트림명 (예: 프레스티지)", "price": 0 },
          { "name": "트림명 (예: 노블레스)", "price": 0 },
          { "name": "트림명 (예: 시그니처)", "price": 0 },
          { "name": "트림명 (예: 그래비티)", "price": 0 }
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

  // 에러 발생 시 상세 내용 출력
  if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ AI 호출 실패 [${model}]:`, errorText);
      throw new Error(`AI Model Error: ${response.statusText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) throw new Error("AI 응답 내용이 비어있습니다.");

  return JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());
}

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    console.log(`🚀 [AI 분석 시작] 엔진: ${MODEL_MAIN}`);

    // 단일 강력 모델 호출 (재시도 로직 제거하여 에러 혼선 방지)
    const result = await callGeminiAI(MODEL_MAIN, base64Data);

    console.log(`✅ [분석 성공] ${result.model_name} / 트림 ${result.trims?.length || 0}개 확보`);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error("🔥 서버 내부 에러:", error);
    // 클라이언트에게 에러 내용을 명확히 전달
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}