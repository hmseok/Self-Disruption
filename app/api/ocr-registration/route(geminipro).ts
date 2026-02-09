import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    // 🔑 결제된 프로젝트의 API 키 (그대로 사용)
    const apiKey = "AIzaSyDIWzebrOfO_lGy3E783UeZT23OOmncKMU";

    // ⚡️ 유료 계정의 핵심 모델 (가장 빠름 + 한도 넉넉함)
    // 만약 1.5가 안 되면 자동으로 2.0으로 넘어가게 설정했습니다.
    const modelsToTry = ["gemini-1.5-flash", "gemini-2.0-flash"];

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    console.log("🚀 [고속 모드] AI 분석 요청 시작...");

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
                      { text: "Extract South Korean vehicle registration data into JSON. Fields: car_number, model_name, vin, owner_name, registration_date(YYYY-MM-DD), location, capacity, displacement, fuel_type, inspection_end_date(YYYY-MM-DD), vehicle_age_expiry, purchase_price, notes. Return JSON only." },
                      { inline_data: { mime_type: "image/jpeg", data: base64Data } }
                    ]
                  }],
                  generationConfig: { response_mime_type: "application/json" }
                })
              }
            );

            // 404(모델 없음)면 다음 모델 시도
            if (response.status === 404) continue;

            if (!response.ok) {
                const err = await response.text();
                throw new Error(err);
            }

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

            finalData = JSON.parse(cleanText);
            usedModel = model;
            break; // 성공하면 즉시 탈출!

        } catch (e) {
            console.warn(`⚠️ ${model} 시도 실패, 다음 모델로...`);
        }
    }

    if (!finalData) throw new Error("분석 실패 (모든 모델 응답 없음)");

    console.log(`✅ 분석 완료! (${usedModel}) - ${finalData.car_number}`);
    return NextResponse.json(finalData);

  } catch (error: any) {
    console.error("🔥 에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}