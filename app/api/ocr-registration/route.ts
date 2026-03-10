import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { requireAuth } from '../../utils/auth-guard'

// ⚡️ [엔진] 2.0 Flash (PDF 분석도 빠르고 정확함)
const MODEL_MAIN = "gemini-2.0-flash";

async function callGeminiAI(base64Data: string, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');

  const systemInstruction = `
    당신은 대한민국 차량 등록증 분석 전문가입니다.
    이미지 또는 PDF 문서를 분석하여 **제조사(브랜드), 차명, 연식, 세부모델(트림)**을 정확히 추출하세요.

    [브랜드 추론 규칙]
    1. '현대자동차' -> '현대', '기아주식회사' -> '기아'
    2. 제조사가 없으면 차명으로 유추 (예: 그랜저->현대, 쏘렌토->기아, Model Y->테슬라)
  `;

  const prompt = `
    ${systemInstruction}

    [필수 추출 항목]
    1. **브랜드 (Brand):** 제조사 (예: 현대, 기아, BMW, 벤츠, 테슬라)
    2. **차명 (Model Name):** (예: 더 뉴 카니발, EV6)
    3. **연식 (Year):** YYYY
    4. **연료 (Fuel):** (예: 휘발유, 경유, 전기)
    5. **배기량/인승:** (숫자)
    6. **차대번호 (VIN):** 17자리
    7. **비고 (Notes):** 저당권, 구조변경 등 특이사항

    [트림(Grade) 리스트 생성]
    - 해당 연식/차종의 **국내 시판 모든 트림**을 나열하세요. (가격순 정렬)

    [JSON 출력 포맷]
    {
      "car_number": "12가3456",
      "brand": "기아",
      "model_name": "EV6",
      "year": 2025,
      "fuel_type": "전기",
      "displacement": 0,
      "capacity": 5,
      "vin": "KNA...",
      "notes": "특이사항 내용",
      "trims": [
          { "name": "라이트", "price": 50000000 },
          { "name": "에어", "price": 55000000 }
      ],
      "owner_name": "홍길동",
      "location": "서울시...",
      "registration_date": "2025-01-01",
      "inspection_end_date": "2029-01-01",
      "vehicle_age_expiry": "2030-01-01",
      "purchase_price": "55000000"
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
                // 🔥 [핵심] 파일 타입(MIME)을 동적으로 전달
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

export async function POST(request: NextRequest) {
  console.log('[ocr-registration] 요청 수신, Authorization:', request.headers.get('authorization') ? '있음' : '없음')

  const auth = await requireAuth(request)
  if (auth.error) {
    console.error('[ocr-registration] ❌ 인증 실패')
    return auth.error
  }
  console.log('[ocr-registration] ✅ 인증 성공:', auth.email)

  try {
    const { imageBase64, mimeType } = await request.json()
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    // 기본값은 jpeg
    const finalMimeType = mimeType || "image/jpeg";

    console.log(`🚀 [등록증분석] ${MODEL_MAIN} 가동 (${finalMimeType}, data size: ${Math.round(base64Data.length / 1024)}KB)`);
    const result = await callGeminiAI(base64Data, finalMimeType);

    console.log(`✅ [완료] ${result.brand} ${result.model_name}`);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[ocr-registration] ❌ 처리 에러:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}