import { NextResponse } from 'next/server'

// ⚡️ [엔진] 2.0 Flash (표 인식 및 문서 구조화 최적화)
const MODEL_MAIN = "gemini-2.0-flash";

async function callGeminiAI(base64Data: string, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  const systemInstruction = `
    당신은 보험 서류(청약서/증권) 정밀 분석 전문가입니다.
    청약서의 '분납 계획'뿐만 아니라, 가입증명서의 **'납입한 보험료(완납)'** 정보도 정확히 처리해야 합니다.
  `;

  const prompt = `
    ${systemInstruction}

    [🚨 데이터 추출 핵심 규칙]

    1. **문서 종류 (doc_type):**
       - '청약서', '가입설계서' -> "application"
       - '가입증명서', '보험증권' -> "certificate"

    2. **금액 추출 (Premium):**
       - 청약서: '총 분담금', '합계 보험료' -> premium
       - **가입증명서:** **'납입한 보험료'**, '영수액', '총 보험료'라고 적힌 금액을 **premium**으로 추출하세요.

    3. **분납 내역 (Installments) 생성 규칙:**
       - **Case A (청약서):** '분납 분담금' 표가 있으면 그대로 추출하세요.
       - **Case B (가입증명서/완납):** 분납 표가 없고 '납입한 보험료(premium)'만 있다면,
         **자동으로 1회차 완납 배열을 생성하세요.**
         예: [{"seq": 1, "date": "발행일 또는 시작일", "amount": premium}]

    4. **차대번호 (VIN):** - 대괄호 '[ ]'로 묶인 값(예: [W1K...])이 있으면 대괄호 제거 후 VIN으로 추출.
       - 차량번호 란에 VIN이 적혀있으면 VIN으로 추출.

    5. **담보 내용:** 담보별 가입금액 및 세부 내용(무한, 가입안함 등) 추출.

    [JSON 출력 포맷]
    {
      "doc_type": "certificate",
      "vin": "KNAC381...",
      "car_number": "35버6619",
      "brand": "기아",
      "company": "현대해상",
      "product_name": "Hicar업무용",
      "start_date": "2026-01-15",
      "end_date": "2027-01-15",
      "premium": 1085650,
      "initial_premium": 1085650,
      "car_value": 50420000,
      "accessory_value": 0,
      "contractor": "주식회사 에프엠아이",

      "coverage_bi1": "자배법...",
      "coverage_bi2": "무한",
      "coverage_pd": "1사고당 10억원...",
      "coverage_self_injury": "사망/후유 1억...",
      "coverage_uninsured": "2억원",
      "coverage_own_damage": "가입금액 5,042만원...",
      "coverage_emergency": "하이카서비스...",

      "driver_range": "임직원한정",
      "age_limit": "만35세이상",

      "installments": [
        {"seq": 1, "date": "2026-01-15", "amount": 1085650}
      ],
      "payment_account": ""
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

    console.log(`✅ [분석완료] 타입:${result.doc_type} / 금액:${result.premium}`);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}