import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    // 🔑 결제된 프로젝트 키
    const apiKey = "AIzaSyDIWzebrOfO_lGy3E783UeZT23OOmncKMU";

    // 🎯 [전략 변경] 문서 인식은 1.5 Flash가 가장 가성비/성능 균형이 좋습니다.
    // 2.0은 창의적인 작업엔 좋지만, 딱딱한 OCR은 1.5가 더 낫습니다.
    const modelsToTry = ["gemini-2.5-flash", "gemini-2.5-flash"];

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    console.log("🚀 [고속+정밀] AI 분석 요청 시작...");

    let finalData = null;
    let usedModel = "";

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
                      // 🇰🇷 [핵심 수정] 프롬프트를 한국어로 변경하여 인식률 급상승 유도
                      { text: `
                        당신은 한국의 '자동차등록증' 문서를 완벽하게 읽어내는 AI OCR 엔진입니다.
                        이미지를 분석하여 아래 정보를 JSON 형식으로 정확하게 추출하세요.
                        값이 없거나 불확실하면 빈 문자열("")로 두세요. (null 금지)

                        [추출 항목]
                        - car_number (차량번호)
                        - model_name (차종 및 모델명 - 예: 쏘나타, 아반떼)
                        - vin (차대번호)
                        - owner_name (소유자 성명)
                        - registration_date (최초등록일 - YYYY-MM-DD)
                        - location (사용본거지 주소)
                        - capacity (승차정원 - 숫자만)
                        - displacement (배기량 - 숫자만)
                        - fuel_type (연료 - 예: 휘발유, 경유)
                        - inspection_end_date (검사유효기간 만료일 - YYYY-MM-DD)
                        - vehicle_age_expiry (차령만료일)
                        - purchase_price (취득가액/차량가액 - 숫자만 추출, 없으면 0)
                        - notes (비고란 내용)

                        오직 순수한 JSON 텍스트만 출력하세요. 마크다운(\`\`\`) 없이.
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
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

            // JSON 정제
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanText);

            // 🚨 최소한 차량번호는 있어야 성공으로 간주
            if (parsed.car_number && parsed.car_number.length > 2) {
                finalData = parsed;
                usedModel = model;
                break;
            }

        } catch (e) {
            console.warn(`⚠️ ${model} 인식 실패, 다음 모델 시도...`);
        }
    }

    if (!finalData) {
        // 실패 시 빈 껍데기라도 반환해서 프론트엔드 에러 방지
        return NextResponse.json({
            car_number: "인식실패",
            model_name: "수동입력필요"
        });
    }

    console.log(`✅ 분석 성공! (${usedModel}) - ${finalData.car_number}`);
    return NextResponse.json(finalData);

  } catch (error: any) {
    console.error("🔥 에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}