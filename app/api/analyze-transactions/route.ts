// app/api/analyze-transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: NextRequest) {
  try {
    const { transactions } = await req.json();

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ error: "분석할 데이터가 없습니다." }, { status: 400 });
    }

    // Gemini 2.0 Flash 모델 사용
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    // AI에게 줄 프롬프트 (한 번에 여러 건을 처리하도록 요청)
    const prompt = `
      너는 회계 장부 정리 전문가야.
      아래 제공되는 거래내역 리스트를 보고, 가장 적절한 '계정과목(category)'과 '비고(description)'를 추론해서 JSON으로 돌려줘.

      [분류 기준]
      - 식대: 식당, 카페, 편의점, 마트
      - 차량유지비: 주유소, 정비소, 세차장, 부품
      - 보험료: 화재보험, 자동차보험
      - 세금/공과금: 구청, 시청, 세무서, 과태료, 자동차세
      - 이자비용: 대출이자, 캐피탈이자
      - 기타운영비: 그 외

      [입력 데이터]
      ${JSON.stringify(transactions.map((t:any) => ({ id: t.id, client: t.client_name, amount: t.amount })))}

      [출력 예시]
      [
        { "id": 123, "category": "식대", "description": "점심 식대" },
        { "id": 124, "category": "세금/공과금", "description": "자동차세 납부" }
      ]
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json(JSON.parse(text));

  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}