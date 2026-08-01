import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()

    // 🔑 .env.local에 저장한 Tier-1 키를 불러옵니다.
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: '서버에 API 키가 설정되지 않았습니다.' }, { status: 500 })
    }

    // 🎯 [최적화 전략] 표에 있는 모델 중 가장 적합한 순서대로 배치
    const modelsToTry = [
        "gemini-2.5-pro",           // 🥇 1순위: 최신 2.5 Pro (150 RPM, 지능 최상)
        "gemini-2.5-flash",           // 🥈 2순위: 검증된 문서 전문가 (안정적)
        "gemini-2.5-flash",         // 🥉 3순위: 속도 빠름 (백업용)
        "gemini-3-pro"              // 4순위: 지능은 좋으나 RPM(25)이 낮아 마지막 보루로 사용
    ];

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    console.log("🚀 [AI 엔진 가동] Gemini 2.5 Pro 우선 분석 시도...");

    let finalData = null;
    let usedModel = "";

    for (const model of modelsToTry) {
        try {
            // console.log(`📡 연결 시도: ${model}...`); // 로그 너무 많으면 주석 처리

            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      // 🇰🇷 [프롬프트] 차명(모델명) 추출에 목숨 건 프롬프트
                      { text: `
                        당신은 대한민국 차량등록사업소의 문서 판독 AI입니다.
                        '자동차등록증' 이미지를 정밀 분석하여 JSON 데이터를 추출하세요.

                        [🚨 핵심 목표: 정확한 차명 찾기]
                        1. '차명' 또는 '차종' 란에 있는 텍스트를 정확히 읽으세요. (예: 쏘나타, G80, 520d, 아반떼CN7)
                        2. 만약 차명이 흐릿하면 '비고'란이나 하단의 '모델연도' 근처 텍스트를 참고하세요.
                        3. 차대번호(VIN)는 17자리 영어+숫자 조합입니다.

                        [출력 포맷 (JSON)]
                        {
                          "car_number": "차량번호 (필수)",
                          "model_name": "차명 (한글/영어 모델명)",
                          "vin": "차대번호",
                          "owner_name": "소유자 성명",
                          "registration_date": "최초등록일 (YYYY-MM-DD)",
                          "location": "사용본거지 (주소)",
                          "inspection_end_date": "검사유효기간 만료일 (YYYY-MM-DD)",
                          "purchase_price": 0,
                          "notes": "비고"
                        }

                        * 값이 없으면 빈 문자열 ""을 쓰세요. (null 금지)
                        * 오직 JSON 텍스트만 출력하세요. (마크다운 없이)
                      ` },
                      { inline_data: { mime_type: "image/jpeg", data: base64Data } }
                    ]
                  }],
                  generationConfig: { response_mime_type: "application/json" }
                })
              }
            );

            // 404나 429(속도제한)가 뜨면 다음 모델로 넘김
            if (!response.ok) {
                // const errText = await response.text();
                // console.warn(`⚠️ [${model}] 패스: ${response.status}`);
                continue;
            }

            const data = await response.json();
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!rawText) continue;

            const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanText);

            // 🏆 성공 기준: 차량번호가 4글자 이상이면 성공!
            if (parsed.car_number && parsed.car_number.length >= 4) {
                finalData = parsed;
                usedModel = model;
                break; // 성공했으니 여기서 끝!
            }

        } catch (e) {
            // 조용히 다음 모델 시도
        }
    }

    if (!finalData) {
        console.error("🔥 모든 모델 분석 실패");
        return NextResponse.json({
            car_number: "인식실패",
            model_name: "수동입력필요"
        });
    }

    console.log(`✅ 분석 성공! (엔진: ${usedModel}) -> [${finalData.car_number}] ${finalData.model_name}`);
    return NextResponse.json(finalData);

  } catch (error: any) {
    console.error("🔥 서버 에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}