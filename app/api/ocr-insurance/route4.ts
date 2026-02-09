import { NextResponse } from 'next/server'

const MODEL_MAIN = "gemini-2.0-flash";

async function callGeminiAI(base64Data: string, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  const systemInstruction = `
    당신은 보험 서류 분석 전문가입니다.
    문서에서 **차대번호(VIN)**를 최우선으로 찾으세요.

    [🚨 매우 중요: 차대번호 추출 규칙]
    1. **"차량번호"** 란에 '12가3456' 같은 번호 대신, 'LRW...' 같은 **17자리 영문+숫자**가 적혀 있다면, 그것을 **차대번호(VIN)**로 추출하세요.
    2. 값 주변의 **대괄호([ ])나 특수문자는 모두 제거**하고 순수 문자열만 추출하세요.
    3. **브랜드(제조사)** 정보도 반드시 찾으세요. (예: Tesla, 현대, 기아)
  `;

  const prompt = `
    ${systemInstruction}

    [필수 추출 항목]
    1. **차대번호 (VIN):** 17자리 고유번호 (예: LRWYGCFS4SC933181)
    2. **브랜드 (Brand):** 제조사 (예: Tesla, 현대, 기아, BMW)
    3. **차량번호 (Car Number):** 한국 번호판 형식 (없으면 null, VIN이 적혀있으면 null 처리)
    4. **보험사 (Company):** (예: 전국렌터카공제조합, 삼성화재)
    5. **보험기간 (Start/End):** YYYY-MM-DD
    6. **총 보험료 (Premium):** 숫자만 (쉼표 제거)
    7. **계약자:** 성명 또는 법인명
    8. **증권번호:** 식별 가능 시
    9. **운전자 범위:**

    [JSON 출력 포맷]
    {
      "vin": "LRWYGCFS4SC933181",
      "brand": "Tesla",
      "car_number": null,
      "company": "전국렌터카공제조합",
      "start_date": "2026-01-06",
      "end_date": "2027-01-06",
      "premium": 1764090,
      "contractor": "주식회사 에프엠아이",
      "policy_number": "A1112601199980",
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

    console.log(`🚀 [보험분석] ${MODEL_MAIN} 가동 (타입: ${finalMimeType})`);
    const result = await callGeminiAI(base64Data, finalMimeType);

    console.log(`✅ [AI결과] VIN:${result.vin} / Brand:${result.brand}`);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}