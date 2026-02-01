import { NextResponse } from 'next/server'

// ⚡️ [엔진] 2.0 Flash (표 인식 및 문서 구조화 능력이 가장 우수)
const MODEL_MAIN = "gemini-2.0-flash";

async function callGeminiAI(base64Data: string, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  const systemInstruction = `
    당신은 보험 서류(청약서/증권) 정밀 분석 전문가입니다.
    특히 **'전국렌터카공제조합(KRMA)'** 및 일반 보험사의 서류 양식을 완벽히 이해하고 있습니다.
    이미지에서 텍스트를 추출하여 구조화된 JSON으로 반환하세요.
  `;

  const prompt = `
    ${systemInstruction}

    [🚨 데이터 추출 핵심 규칙]
    1. **차대번호 (VIN) [최우선순위]:** - '차량번호' 란에 '12가3456' 같은 번호판 대신, **대괄호 '[ ]'로 묶인 17자리 영문+숫자** (예: [W1K...])가 있다면,
       - 대괄호를 제거하고 그 안의 값을 **반드시 'vin' 필드에 추출**하세요. (이때 car_number는 null로 설정)

    2. **문서 종류 (doc_type):**
       - 제목에 '청약서'가 있으면 "application"
       - '가입증명서', '보험증권'이 있으면 "certificate"

    3. **담보 내용 (Coverages):** - 문서 우측 또는 중앙의 '담보사항' 표를 읽으세요.
       - 금액뿐만 아니라 '무한', '가입안함' 등의 텍스트도 그대로 가져오세요.

    4. **분납 내역 (Installments):**
       - 문서 하단 '분납 분담금' 또는 '납입 일정' 표를 찾으세요.
       - 회차(1, 2...), 납입일자(YYYY-MM-DD), 납입금액(숫자)을 배열로 추출하세요.

    [JSON 출력 포맷]
    {
      "doc_type": "application",
      "vin": "W1K3F4EB8TJ531092",
      "brand": "벤츠",
      "car_number": null,
      "company": "전국렌터카공제조합",
      "product_name": "자동차공제(영업용)",
      "start_date": "2025-11-28",
      "end_date": "2026-11-28",
      "premium": 2128150,
      "initial_premium": 558000,
      "car_value": 44420000,
      "accessory_value": 0,
      "contractor": "주식회사 에프엠아이",

      "coverage_bi1": "자배법 시행령...",
      "coverage_bi2": "무한",
      "coverage_pd": "1사고당 2억원...",
      "coverage_self_injury": "1.5억원...",
      "coverage_uninsured": "2억원",
      "coverage_own_damage": "차대차: 50만원...",
      "coverage_emergency": "기본(40km)...",

      "driver_range": "임직원 및 지정 1인",
      "age_limit": "만 26세 이상",

      "installments": [
        {"seq": 1, "date": "2025-11-28", "amount": 558000},
        {"seq": 2, "date": "2025-12-28", "amount": 314030}
      ],
      "payment_account": "우리은행 123-456-7890"
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
    // PDF 등 타입 명시, 없으면 jpeg
    const finalMimeType = mimeType || "image/jpeg";

    console.log(`🚀 [보험분석] ${MODEL_MAIN} 가동 (타입: ${finalMimeType})`);

    const result = await callGeminiAI(base64Data, finalMimeType);

    console.log(`✅ [분석완료] 타입:${result.doc_type} / VIN:${result.vin} / 분납:${result.installments?.length}건`);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}