import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: NextRequest) {
  try {
    const { base64Image, mimeType } = await req.json();

    if (!base64Image) {
      return NextResponse.json({ error: "이미지 데이터가 없습니다." }, { status: 400 });
    }

    // 🚀 [수정 포인트] 모델명을 'gemini-2.0-flash
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash";
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      너는 회계 데이터 입력 전문가야.
      이미지(영수증, 통장사본)를 분석해서 아래 JSON 배열 포맷으로 추출해줘.

      [규칙]
      1. 날짜는 YYYY-MM-DD 포맷.
      2. 금액은 숫자만 (콤마 제외).
      3. 적요(상호명)를 보고 '식대', '차량유지비', '소모품비', '접대비', '통신비' 중 적절한 카테고리를 선택해. 불확실하면 '기타'.
      4. description에는 내용을 적어줘.

      [출력 예시]
      [
        {
          "transaction_date": "2024-02-05",
          "client_name": "스타벅스",
          "amount": 12500,
          "type": "expense",
          "category": "식대",
          "description": "스타벅스 커피",
          "payment_method": "카드"
        }
      ]
    `;

    const imagePart = {
      inlineData: { data: base64Image, mimeType: mimeType },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json(JSON.parse(text));

  } catch (error: any) {
    console.error("Gemini OCR Error:", error);
    return NextResponse.json({ error: error.message || "AI 분석 중 오류 발생" }, { status: 500 });
  }
}