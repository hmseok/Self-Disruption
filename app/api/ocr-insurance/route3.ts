import { NextResponse } from 'next/server'

const MODEL_MAIN = "gemini-2.0-flash";

async function callGeminiAI(base64Data: string, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  const systemInstruction = `
    당신은 보험 청약서 분석 전문가입니다.
    문서(이미지/PDF)에서 계약 상세 내용, 특히 **담보 내역**과 **분납 일정(표)**을 빠짐없이 추출하세요.
  `;

  const prompt = `
    ${systemInstruction}

    [필수 추출 항목]
    1. **기본정보:** 차대번호(VIN), 브랜드, 차량번호, 보험사, 기간, 총보험료, 초회보험료, 계약자.
    2. **담보사항 (Coverages):** 대인1, 대인2, 대물, 자손/자상, 무보험, 자차(자기차량손해), 긴급출동.
       - (금액과 세부 조건까지 그대로 추출. 예: "1사고당 2,000 만원 / 일부부담금 없음")
    3. **특약:** 운전자범위, 연령한정.
    4. **차량가액:** 차량가액, 부속품가액.
    5. **분납 내역 (Installments):** 문서 하단 '분납 분담금' 표의 내용을 배열로 추출.
       - [{"seq": 1, "date": "2025-11-28", "amount": 558000}, ...]
    6. **입금계좌:** '분담금 입금계좌' (은행 + 계좌번호)

    [JSON 출력 포맷]
    {
      "vin": "W1K...",
      "brand": "벤츠",
      "car_number": "임시번호 or 번호",
      "company": "전국렌터카공제조합",
      "product_name": "자동차공제",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "premium": 2128150,
      "initial_premium": 558000,
      "contractor": "주식회사 에프엠아이",
      "car_value": 44420000,
      "accessory_value": 0,
      "coverage_bi1": "자배법 시행령...",
      "coverage_bi2": "무한",
      "coverage_pd": "2억원",
      "coverage_self_injury": "1.5억원",
      "coverage_uninsured": "2억원",
      "coverage_own_damage": "차대차:50만원...",
      "coverage_emergency": "기본(40km)",
      "driver_range": "임직원...",
      "age_limit": "만26세...",
      "installments": [
        {"seq": 1, "date": "2025-11-28", "amount": 558000},
        {"seq": 2, "date": "2025-12-28", "amount": 314030}
      ],
      "payment_account": "우리은행 123-456-789"
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

  if (!response.ok) throw new Error(`AI Error: ${await response.text()}`);
  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());
}

export async function POST(request: Request) {
  try {
    const { imageBase64, mimeType } = await request.json()
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const result = await callGeminiAI(base64Data, mimeType || "image/jpeg");
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}