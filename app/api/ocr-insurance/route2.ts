import { NextResponse } from 'next/server'

// ⚡️ [엔진] 2.0 Flash (PDF/이미지 분석 최적화)
const MODEL_MAIN = "gemini-2.0-flash";

async function callGeminiAI(base64Data: string, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  const systemInstruction = `
    당신은 보험 서류 분석 전문가입니다.
    문서에서 **차대번호(VIN)**와 계약 정보를 정확히 추출하세요.
  `;

  const prompt = `
    ${systemInstruction}

    [필수 추출 항목]
    1. **차대번호 (VIN):** 17자리 영문+숫자 조합 (가장 중요! 정확히 추출할 것)
    2. **차량번호 (Car Number):** 12가 3456 형식 (없으면 null)
    3. **보험사 (Company):** (예: 삼성화재, 현대해상)
    4. **보험기간 (Start/End):** YYYY-MM-DD
    5. **총 보험료 (Premium):** 숫자만
    6. **계약자/피보험자:** 법인명 또는 성함
    7. **증권번호 (Policy Number):** 식별 가능 시

    [JSON 출력 포맷]
    {
      "vin": "KNA... (17자리)",
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
    const { imageBase64, mimeType } = await request.json()
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const finalMimeType = mimeType || "image/jpeg";

    console.log(`🚀 [보험분석] ${MODEL_MAIN} 가동 (VIN 우선 추출)`);
    const result = await callGeminiAI(base64Data, finalMimeType);

    console.log(`✅ [완료] VIN:${result.vin} / ${result.company}`);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}