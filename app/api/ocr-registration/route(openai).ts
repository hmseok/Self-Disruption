import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const apiKey = "AIzaSyDIWzebrOfO_lGy3E783UeZT23OOmncKMU"; // 🔑 대표님 키
    const modelName = "gemini-2.5-flash";

    // Base64 헤더 제거
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    console.log(`🤖 AI 분석 시작 (${modelName}) - 안전 모드...`);

    let finalData = null;

    // 🔄 최대 3번 재시도
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1) console.log(`⏳ [${attempt}/3] 재시도 중...`);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
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

        // 🚨 429 (속도제한) 처리
        if (response.status === 429) {
          console.warn(`⚠️ 구글 API 과부하(429). 10초간 충분히 쉽니다.`);

          if (attempt === 3) {
             throw new Error("요청 과부하로 인해 3회 재시도했으나 실패했습니다.");
          }

          // 🛑 [수정] 4초 -> 10초로 대폭 증가 (확실한 해결책)
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const cleanText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();

        finalData = JSON.parse(cleanText);
        break; // 성공하면 탈출

      } catch (e: any) {
        console.error(`❌ 시도 ${attempt} 실패:`, e.message);
        if (attempt === 3) throw e;
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!finalData) {
        throw new Error("AI 분석 데이터가 없습니다.");
    }

    console.log("✅ 분석 성공!", finalData.car_number);
    return NextResponse.json(finalData);

  } catch (error: any) {
    console.error("🔥 최종 서버 에러:", error);
    return NextResponse.json({
        error: `처리 실패: ${error.message}`,
        details: error.toString()
    }, { status: 500 })
  }
}