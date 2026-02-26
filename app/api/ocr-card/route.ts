import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { requireAuth } from '../../utils/auth-guard'

const MODEL = "gemini-2.0-flash";

async function callGeminiAI(base64Data: string, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  const prompt = `
    당신은 법인카드 이미지 분석 전문가입니다.
    카드 사진, 카드 명세서, 카드 리스트 이미지 등에서 카드 정보를 추출합니다.

    [추출 규칙]
    1. 이미지에서 법인카드 정보를 최대한 추출하세요.
    2. 카드사명은 다음 중 매칭: 신한카드, 삼성카드, 현대카드, KB국민카드, 하나카드, 롯데카드, BC카드, NH농협카드, 우리카드, IBK기업은행
    3. 카드번호는 하이픈(-) 구분자로 포맷 (예: 1234-5678-9012-3456)
    4. 여러 장의 카드가 있으면 배열로 모두 추출하세요.
    5. 확인할 수 없는 필드는 빈 문자열로 둡니다.

    [JSON 출력 포맷]
    {
      "cards": [
        {
          "card_company": "신한카드",
          "card_number": "1234-5678-9012-3456",
          "holder_name": "홍길동",
          "card_alias": "법인 업무용"
        }
      ]
    }

    반드시 위 JSON 포맷으로만 응답하세요.
  `;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
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

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { imageBase64, mimeType } = await request.json()
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const finalMimeType = mimeType || "image/jpeg";

    console.log(`🚀 [카드분석] ${MODEL} 가동 (타입: ${finalMimeType})`);

    const result = await callGeminiAI(base64Data, finalMimeType);

    console.log(`✅ [카드분석완료] 카드 ${result.cards?.length || 0}장 인식`);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
