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
    const { data, mimeType, fileType } = await req.json();

    console.log('[finance-parser] fileType:', fileType, '| mimeType:', mimeType, '| dataLen:', data?.length);

    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 8192
        }
    });

    // 파일 유형별 강제 힌트
    const fileTypeHints: Record<string, string> = {
      card_transaction: `⚠️ 중요: 이 데이터는 법인카드 승인내역입니다.
- payment_method는 반드시 "Card"로 설정하세요.
- 카드번호(card_number)를 반드시 추출하세요. 마스킹(*) 포함 그대로.
- 승인번호(approval_number)를 반드시 추출하세요.
- 가맹점명을 client_name에 넣으세요.`,
      card_report: `⚠️ 중요: 이 데이터는 카드사 월별 리포트입니다.
- payment_method는 반드시 "Card"로 설정하세요.
- "이용카드" 컬럼의 값(카드 뒷4자리 숫자, 예: 4331, 2756)을 card_number로 사용하세요.
- 승인번호를 approval_number에 넣으세요.
- 가맹점명을 client_name에 넣으세요.`,
      bank_statement: `⚠️ 중요: 이 데이터는 은행 통장 거래내역입니다.
- payment_method는 반드시 "Bank"로 설정하세요.
- card_number는 빈문자열로.
- 적요/기재내용에서 거래처명을 client_name에 추출하세요.
- "지급(원)" 또는 "찾으신금액" 컬럼은 출금(expense), "입금(원)" 또는 "맡기신금액" 컬럼은 입금(income)입니다.`,
    };
    const hint = fileTypeHints[fileType || ''] || '';

    // 현재 날짜 기반으로 연도 힌트 제공
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const prompt = `너는 한국 세무사 수준의 회계 데이터 분석 전문가야.
입력된 CSV 데이터를 분석해서 JSON 배열을 반환해.

${hint}

⚠️ 오늘 날짜: ${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}
날짜에 연도가 없으면(예: 02.26, 01/15) 반드시 ${currentYear}년으로 설정하세요.
데이터가 최근 1~2개월 내의 거래라고 가정하세요.

[결과 필드 — 반드시 모든 필드를 포함]
- transaction_date: YYYY-MM-DD 형식 (예: ${currentYear}-01-15)
- client_name: 거래처명/가맹점명/사람이름 (입금, 출금, 이체 같은 거래유형 단어 제외)
- amount: 양수 숫자 (콤마 제거)
- type: "income" 또는 "expense"
- payment_method: 반드시 "Card" 또는 "Bank" 중 하나만 사용
- description: 적요, 업종, 주소, 할부정보 등을 " / "로 연결
- card_number: 카드번호 문자열 (없으면 "")
- approval_number: 승인번호 (없으면 "")

[payment_method 판단 기준]
- 카드번호, 승인번호, 가맹점 컬럼이 있으면 → "Card"
- 적요, 입금/출금, 잔액, 지급 컬럼이 있으면 → "Bank"
- 확실하지 않아도 반드시 "Card" 또는 "Bank" 중 하나를 선택해

[카드사별 엑셀 포맷]
- 신한카드: 이용일, 이용시간, 카드번호, 승인번호, 이용가맹점, 이용금액, 결제상태
- 삼성카드: 승인일자, 카드번호, 가맹점명, 이용금액, 할부개월, 승인번호
- KB국민카드: 승인일, 카드번호, 가맹점명, 업종명, 승인금액, 승인번호
- 현대카드: 이용일, 카드번호, 가맹점, 이용금액, 승인번호, 업종
- 하나카드: 거래일자, 카드번호, 가맹점, 결제금액, 승인번호
- 롯데카드: 이용일, 카드번호, 가맹점명, 이용금액, 승인번호
- 우리카드: 거래일, 카드번호, 가맹점명, 이용금액, 승인번호, 업종
- BC카드: 이용일, 카드번호, 가맹점, 이용금액, 승인번호
- NH농협카드: 이용일자, 카드번호, 가맹점명, 이용금액, 승인번호

[은행별 통장 포맷]
- KB국민: 거래일시, 적요, 기재내용, 찾으신금액, 맡기신금액, 거래후잔액
- 신한: 거래일, 적요, 입금액, 출금액, 잔액, 거래점
- 우리: 거래일시, 적요, 기재내용, 지급(원), 입금(원), 거래후잔액, 취급점
- 하나: 거래일자, 적요, 출금금액, 입금금액, 거래후잔액, 메모
- 농협: 거래일시, 적요, 찾으신금액, 맡기신금액, 거래후잔액
- 카카오뱅크: 일시, 적요, 출금, 입금, 잔액
- 기업은행: 거래일, 적요, 찾으신금액, 맡기신금액, 거래후잔액
- 토스뱅크: 날짜, 내용, 출금, 입금, 잔액

[중요 규칙]
- 취소 거래도 포함, description에 "취소" 명시
- 잔액은 금액에 포함하지 않음
- 같은 행에 입금/출금 둘 다 있으면 0이 아닌 쪽 사용
- 날짜: 반드시 YYYY-MM-DD (예: 20260115 → ${currentYear}-01-15, 02.26 → ${currentYear}-02-26)
- 연도가 없는 날짜(MM.DD, MM/DD)는 반드시 ${currentYear}년으로 설정
- 헤더가 위 패턴과 다르더라도 맥락으로 판단

[입력 데이터]
${mimeType === 'text/csv' ? data : '(이미지 데이터)'}`;

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

    console.log('[finance-parser] raw response length:', text.length);
    console.log('[finance-parser] first 500 chars:', text.substring(0, 500));

    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(text);

    // 📊 결과 검증 로그
    if (Array.isArray(parsed)) {
      const methods = parsed.map((p: any) => p.payment_method);
      const uniqueMethods = [...new Set(methods)];
      console.log(`[finance-parser] ✅ ${parsed.length}건 파싱 완료 | payment_methods: ${uniqueMethods.join(', ')} | fileType: ${fileType}`);

      // payment_method 강제 정규화 (Gemini가 비표준 값 반환 시 대응)
      for (const item of parsed) {
        const pm = String(item.payment_method || '').toLowerCase().trim();
        if (pm.includes('card') || pm.includes('카드') || pm === 'credit' || pm === 'debit') {
          item.payment_method = 'Card';
        } else if (pm.includes('bank') || pm.includes('통장') || pm.includes('계좌') || pm === 'transfer') {
          item.payment_method = 'Bank';
        } else if (fileType === 'card_transaction' || fileType === 'card_report') {
          item.payment_method = 'Card'; // 파일 유형으로 강제 보정
        } else if (fileType === 'bank_statement') {
          item.payment_method = 'Bank'; // 파일 유형으로 강제 보정
        }
        // amount 문자열이면 숫자로 변환
        if (typeof item.amount === 'string') {
          item.amount = Math.abs(Number(item.amount.replace(/[,\s]/g, '')) || 0);
        }

        // 날짜 연도 보정: 미래 3개월 이상이거나 2년 이상 과거면 현재 연도로 보정
        if (item.transaction_date) {
          const dateMatch = item.transaction_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (dateMatch) {
            const year = parseInt(dateMatch[1]);
            const month = parseInt(dateMatch[2]);
            const day = parseInt(dateMatch[3]);
            // 연도가 현재 연도와 2년 이상 차이나면 보정
            if (Math.abs(year - currentYear) >= 2) {
              item.transaction_date = `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
          }
        }
      }
    }

    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error("[finance-parser] ❌ AI Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}