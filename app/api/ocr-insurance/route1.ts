import { NextResponse } from 'next/server'

// ⚡️ [엔진] 2.0 Flash (PDF 분석도 아주 잘합니다)
const MODEL_MAIN = "gemini-2.0-flash";

async function callGeminiAI(base64Data: string, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  const systemInstruction = `
    당신은 보험 서류 분석 전문가입니다.
    제공된 문서(이미지 또는 PDF)를 정밀 분석하여 핵심 계약 정보를 JSON으로 추출하세요.
  `;

  const prompt = `
    ${systemInstruction}

    [필수 추출 항목]
    1. **차량번호 (Car Number):** 12가 3456 형식
    2. **보험사 (Company):** 삼성화재, 현대해상 등
    3. **보험기간 (Period):** 시작일/종료일 (YYYY-MM-DD)
    4. **총 보험료 (Premium):** 숫자만
    5. **피보험자 (Insured):** 이름 또는 법인명
    6. **증권번호 (Policy Number):** 식별 가능 시
    7. **운전자 범위 (Driver Range):** 연령 및 범위

    [JSON 출력 포맷]
    {
      "car_number": "12가3456",
      "company": "현대해상",
      "start_date": "2025-02-28",
      "end_date": "2026-02-28",
      "premium": 1250000,
      "contractor": "주식회사 예시",
      "policy_number": "12345-67890",
      "driver_range": "만 26세 이상"
    }
  `;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_MAIN}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
            parts: [
                { text: prompt },
                // 🔥 [핵심 수정] 파일 타입을 동적으로 받아서 전달 (image/jpeg 또는 application/pdf)
                { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
        }],
        generationConfig: { response_mime_type: "application/json" }
      })
    }
  );

  if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI Error: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("AI 응답 없음");

  return JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());
}

export async function POST(request: Request) {
  try {
    // 프론트에서 mimeType도 같이 받음
    const { imageBase64, mimeType } = await request.json()
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    // 기본값은 jpeg (하위 호환성)
    const finalMimeType = mimeType || "image/jpeg";

    console.log(`🚀 [보험분석] ${MODEL_MAIN} 가동 (Type: ${finalMimeType})`);

    const result = await callGeminiAI(base64Data, finalMimeType);

    console.log(`✅ [완료] ${result.car_number} / ${result.company}`);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}