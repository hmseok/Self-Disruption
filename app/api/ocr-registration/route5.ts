import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const apiKey = process.env.GEMINI_API_KEY;

    // 🎯 성능 좋은 모델 순서 (2.0 Flash가 한글 인식률이 좋습니다)
    const modelsToTry = ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"];

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    console.log("🚀 [OCR] 키워드 기반 정밀 분석 시작...");

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
                      // 🇰🇷 [강력 수정] 번호(④) 대신 '글자'를 찾게 유도
                      { text: `
                        자동차등록증 이미지를 분석하여 JSON 데이터를 추출하세요.
                        번호(①, ④)가 잘 안 보일 수 있으니, **한글 단어**를 기준으로 값을 찾으세요.

                        [필수 추출 항목]
                        1. car_number: '등록번호' 또는 '자동차등록번호' 라고 적힌 곳의 값 (예: 12가3456)
                        2. model_name: '차명' 이라고 적힌 곳의 값 (예: EV4, 쏘나타). *주의: '차종' 말고 '차명'을 가져올 것.
                        3. location: '사용본거지' 라고 적힌 곳의 주소 전체.
                        4. owner_name: '성명' 또는 '소유자' 옆의 이름.
                        5. vin: '차대번호' 값.
                        6. registration_date: '최초등록일' (YYYY-MM-DD).

                        [제원 정보]
                        - capacity: '승차정원' 숫자만.
                        - displacement: '배기량', '정격출력', '기통수' 근처의 숫자.
                        - fuel_type: '연료', '연료의 종류'.
                        - purchase_price: 우측 하단 '취득가액' 숫자.

                        [날짜 정보]
                        - inspection_end_date: '검사유효기간'의 끝나는 날짜.
                        - vehicle_age_expiry: '차령만료일' (비고란 확인).

                        * 값이 없으면 빈 문자열("")로 반환.
                        * JSON 형식만 출력.
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

            // 차량번호가 있으면 일단 성공으로 간주
            if (parsed.car_number) {
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

    console.log(`✅ 분석 결과: 차명=[${finalData.model_name}], 주소=[${finalData.location}]`);
    return NextResponse.json(finalData);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}