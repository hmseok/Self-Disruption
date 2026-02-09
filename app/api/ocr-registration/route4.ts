import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const apiKey = process.env.GEMINI_API_KEY;

    // 🎯 가장 성능 좋은 모델 순서
    const modelsToTry = ["gemini-1.5-pro", "gemini-2.0-flash", "gemini-1.5-flash"];

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    console.log("🚀 [OCR] 등록증 정밀 분석 시작 (번호 기반 추출)...");

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
                      // 🇰🇷 [핵심 수정] 번호(①, ④, ⑧...)를 기준으로 데이터를 뽑도록 지시
                      { text: `
                        당신은 한국의 '자동차등록증' 전문 판독기입니다.
                        이미지에서 아래 번호에 해당하는 필드를 정확히 찾아 JSON으로 반환하세요.

                        [추출 규칙 - 번호 필수 확인]
                        - car_number: ① 번 항목 (차량번호)
                        - model_name: ④ 번 항목 (차명) -> 🚨 중요: ②번(차종) 말고 무조건 ④번(차명)을 읽을 것!
                        - vin: ⑥ 번 항목 (차대번호)
                        - owner_name: ⑨ 번 항목 (소유자 성명/명칭)
                        - location: ⑧ 번 항목 (사용본거지 주소 전체)
                        - registration_date: 우측 상단 '최초등록일' (YYYY-MM-DD)

                        - capacity: ⑰ 번 승차정원 (숫자만)
                        - displacement: ⑱ 번 배기량 또는 정격출력 (숫자만)
                        - fuel_type: ㉑ 번 연료의 종류

                        - inspection_end_date: 하단 '검사유효기간'의 마지막 날짜 (YYYY-MM-DD)
                        - vehicle_age_expiry: 비고란의 '차령만료일' (없으면 빈칸)
                        - purchase_price: 우측 하단 취득가액 (숫자만)
                        - notes: 비고란 내용 전체

                        [JSON 출력 예시]
                        {
                          "car_number": "12가3456",
                          "model_name": "EV4",
                          "vin": "KNA...",
                          "owner_name": "홍길동",
                          "location": "경기도 성남시 분당구...",
                          "registration_date": "2025-01-01",
                          "capacity": "5",
                          "displacement": "1998",
                          "fuel_type": "휘발유",
                          "inspection_end_date": "2027-01-01",
                          "vehicle_age_expiry": "",
                          "purchase_price": "35000000",
                          "notes": ""
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
            if (parsed.car_number) {
                finalData = parsed;
                break;
            }
        } catch (e) {
            continue;
        }
    }

    if (!finalData) {
        return NextResponse.json({ error: "분석 실패: 차량번호를 찾지 못했습니다." }, { status: 500 });
    }

    console.log(`✅ 분석 성공: ${finalData.car_number} / ${finalData.model_name}`);
    return NextResponse.json(finalData);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}