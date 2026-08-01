import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()
    const apiKey = process.env.GEMINI_API_KEY;
    const model = "gemini-2.5-flash";

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    // 🔥 [핵심] 없는 트림도 만들어내는 "강제 생성" 프롬프트
    const prompt = `
      당신은 자동차 데이터베이스 생성 전문가입니다.
      등록증 이미지를 분석하여 차량 정보를 추출하고, 해당 차량의 **스펙에 딱 맞는 판매 트림(Grade)** 목록을 지식 베이스에서 검색하여 반드시 생성하세요.

      [1. 차량 스펙 분석]
      - 차명: (예: EV4, 더 뉴 카니발 하이브리드, Model Y, 아이오닉5)
      - 연료: (전기, 하이브리드, 휘발유, 경유)
      - 인승: (5, 7, 9 등)
      - 연식: (YYYY)

      [2. 트림(Grade) 강제 생성 규칙 - 매우 중요!]
      - 등록증에 트림명이 없어도, **해당 연식/차종/연료/인승에 존재하는 모든 트림**을 나열해야 합니다.
      - **반드시 [연료]와 [인승] 조건에 맞는 것만 필터링하세요.**
      - ❌ 오답: "가솔린 9인승" (하이브리드 차량일 경우 제외)
      - ⭕ 정답 (카니발 하이브리드): "프레스티지", "노블레스", "시그니처", "그래비티"
      - ⭕ 정답 (아이오닉5/EV6/EV4): "스탠다드", "롱레인지", "E-Lite", "익스클루시브", "프레스티지" 등 해당 차종의 실제 등급.
      - ⭕ 정답 (테슬라): "RWD", "Long Range", "Performance"

      [JSON 출력 포맷]
      {
        "car_number": "차량번호",
        "model_name": "EV4",
        "year": 2025,
        "fuel_type": "전기",
        "capacity": 5,
        "displacement": 0,
        "trims": [
           { "name": "에어 (Air)", "price": 42000000 },
           { "name": "어스 (Earth)", "price": 46000000 },
           { "name": "GT-Line", "price": 49000000 }
        ],
        "vin": "차대번호",
        "owner_name": "소유자",
        "location": "주소",
        "registration_date": "YYYY-MM-DD",
        "inspection_end_date": "YYYY-MM-DD",
        "vehicle_age_expiry": "YYYY-MM-DD",
        "purchase_price": "숫자만"
      }
    `;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
          }],
          generationConfig: { response_mime_type: "application/json" }
        })
      }
    );

    if (!response.ok) throw new Error('AI 요청 실패');

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanText);

    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error("AI Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}