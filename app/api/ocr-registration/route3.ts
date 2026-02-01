import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    // 🔑 Tier-1 유료 키 (환경변수 사용 권장)
    const apiKey = process.env.GEMINI_API_KEY;

    // 🎯 2.5 Pro가 가장 똑똑하므로 1순위
    const modelsToTry = ["gemini-2.5-pro", "gemini-1.5-pro", "gemini-2.0-flash"];

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    console.log("🚀 [Tier-1] 등록증 정밀 분석 시작...");

    let finalData = null;

    for (const model of modelsToTry) {
        try {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      // 🇰🇷 [핵심] 프론트엔드 변수명과 1:1 매칭되도록 지시
                      { text: `
                        당신은 한국의 '자동차등록증'을 입력받아 데이터베이스에 넣는 OCR 시스템입니다.
                        이미지를 분석하여 아래의 **정해진 JSON 키(Key)** 로 데이터를 추출하세요.

                        [추출 규칙]
                        1. 날짜는 무조건 'YYYY-MM-DD' 형식 (예: 2025-07-04)
                        2. 금액이나 숫자는 콤마(,) 제거하고 숫자만 추출
                        3. 값이 없으면 빈 문자열 "" 사용 (null 금지)

                        [JSON 데이터 구조]
                        {
                          "number": "차량번호 (①)",
                          "model": "차종 및 차명 (예: EV4, 쏘나타)",
                          "vin": "차대번호 (⑥)",
                          "owner_name": "소유자 성명 (⑨)",
                          "registration_date": "최초등록일 (우측 상단)",
                          "location": "사용본거지 (⑧)",
                          "capacity": "승차정원 (⑰ - 숫자만)",
                          "displacement": "배기량/정격출력 (⑱ - 숫자만)",
                          "fuel_type": "연료의 종류 (㉑)",
                          "inspection_end_date": "검사유효기간 만료일 (㉟ - YYYY-MM-DD)",
                          "purchase_price": "취득가액 (하단 우측 - 숫자만)",
                          "vehicle_age_expiry": "차령만료일 (비고란 또는 하단 참고)",
                          "notes": "비고란의 모든 텍스트"
                        }
                      ` },
                      { inline_data: { mime_type: "image/jpeg", data: base64Data } }
                    ]
                  }],
                  generationConfig: { response_mime_type: "application/json" }
                })
              }
            );

            if (!response.ok) continue;

            const data = await response.json();
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) continue;

            const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanText);

            // 차량번호가 있으면 성공으로 간주
            if (parsed.number && parsed.number.length >= 2) {
                finalData = parsed;
                break;
            }
        } catch (e) {
            continue;
        }
    }

    if (!finalData) {
        return NextResponse.json({ error: "분석 실패" }, { status: 500 });
    }

    console.log(`✅ 분석 완료: ${finalData.number} / ${finalData.model}`);
    return NextResponse.json(finalData);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}