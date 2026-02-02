import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: NextRequest) {
  try {
    const { csvData } = await req.json();

    // 데이터가 너무 많으면 AI 토큰 비용이 발생하므로,
    // 앞부분 300줄 정도만 보내서 패턴을 파악하게 하거나,
    // Gemini 1.5 Flash 모델(입력창 큼)을 사용해서 전체를 다 보냅니다.
    // 여기서는 확실한 처리를 위해 전체를 보냅니다. (Flash 모델 추천)

    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      너는 전문 회계 데이터 분석가야.
      아래 제공된 CSV 데이터는 신용카드 이용대금 명세서 또는 통장 거래내역이야.

      [목표]
      데이터 상단에 있는 '요약표'나 '합계표', '조회조건' 등은 무시하고,
      실제 **개별 거래 내역(Transaction Detail)**만 추출해서 JSON 배열로 반환해.

      [추출 규칙]
      1. '이용일시' 또는 '거래일자'를 찾아 "transaction_date" (YYYY-MM-DD 형식)로 변환.
      2. '이용가맹점' 또는 '적요', '내용'을 찾아 "client_name"으로 저장.
      3. '이용금액', '승인금액', '출금액' 등 실질적 거래 금액을 찾아 "amount" (숫자)로 저장.
      4. '할부개월'이나 '승인번호', '가맹점주소', '업종' 등 추가 정보가 있다면 전부 합쳐서 "description"에 텍스트로 저장.
      5. 통장의 경우 '입금'이 있으면 amount는 양수, '출금'이면 amount는 그대로 두고 type을 구분할 것.
      6. 카드 내역이라면 type은 무조건 "expense". 통장 입금이면 "income".

      [반환 형식 예시]
      [
        { "transaction_date": "2024-01-01", "type": "expense", "client_name": "스타벅스", "amount": 5000, "description": "일시불 / 승인:12345" },
        ...
      ]

      [CSV 데이터]
      ${csvData}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // 마크다운 제거
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    return NextResponse.json(JSON.parse(text));

  } catch (error: any) {
    console.error("Excel AI Parsing Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}