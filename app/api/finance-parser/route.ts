import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API 키 설정 필요" }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const { data, mimeType } = await req.json();

    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 8192 // 👈 토큰 제한을 최대로 늘려 잘림 방지
        }
    });

    const prompt = `
      너는 회계 데이터 입력 전문가야.
      입력된 데이터(CSV 조각 또는 이미지)를 분석해서 아래 규칙대로 JSON 배열을 반환해.

      [핵심 목표]
      1. **구분(payment_method)**: 'Card' 또는 'Bank' 판단.
      2. **상세 정보(description)**: 적요 외에 가맹점 주소, 업종, 할부, 승인번호, 지점명, 의뢰인 등을 " / "로 연결해서 저장.
      3. **거래 유형(type)**: 카드는 'expense', 통장은 입금 'income' / 출금 'expense'.
      4. **금액**: 콤마 제거 후 숫자만.

      [필드 매핑]
      transaction_date (YYYY-MM-DD), client_name, amount, type, payment_method, description

      [입력 데이터]
      ${mimeType === 'text/csv' ? data : '(이미지 데이터)'}
    `;

    const parts = [];
    if (mimeType === 'text/csv') {
        parts.push({ text: prompt });
    } else {
        parts.push({ text: prompt });
        parts.push({ inlineData: { data, mimeType } });
    }

    const result = await model.generateContent(parts);
    const response = await result.response;
    let text = response.text();

    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    return NextResponse.json(JSON.parse(text));

  } catch (error: any) {
    console.error("AI Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}