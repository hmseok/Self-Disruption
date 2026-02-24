import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireAuth } from '../../utils/auth-guard'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

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
      너는 한국 세무사 수준의 회계 데이터 분석 전문가야.
      입력된 데이터(CSV 조각 또는 이미지)를 분석해서 아래 규칙대로 JSON 배열을 반환해.

      [핵심 목표]
      1. **구분(payment_method)**: 'Card' 또는 'Bank' 판단.
      2. **상세 정보(description)**: 적요 외에 가맹점 주소, 업종, 할부, 승인번호, 지점명, 의뢰인/보내는분 등을 " / "로 연결.
      3. **거래 유형(type)**: 카드는 'expense', 통장은 입금 'income' / 출금 'expense'.
      4. **금액**: 콤마 제거 후 숫자만.
      5. **거래처(client_name)**: 실제 사람이름이나 회사명만 추출. '입금', '출금', '이체' 같은 거래유형은 제외.

      [은행별 포맷 주의]
      - KB국민: 거래일시, 적요, 기재내용, 찾으신금액, 맡기신금액, 거래후잔액
      - 신한: 거래일, 적요, 입금액, 출금액, 잔액, 거래점
      - 우리: 거래일시, 적요, 출금, 입금, 잔액, 취급점/메모
      - 하나: 거래일자, 적요, 출금금액, 입금금액, 거래후잔액, 메모
      - 농협: 거래일시, 적요, 찾으신금액, 맡기신금액, 거래후잔액
      - 카카오뱅크: 일시, 적요, 출금, 입금, 잔액
      헤더가 위 패턴과 다르더라도 맥락으로 판단해서 정확히 매핑해줘.

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