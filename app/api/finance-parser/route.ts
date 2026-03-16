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
            maxOutputTokens: 65536
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
- ⚠️ client_name: "기재내용" 컬럼의 값을 원본 그대로 사용하세요! 은행접두사(기업, 국민, 농협, 카카 등)를 제거하지 마세요! 예: "기업윤민진"→"기업윤민진", "국민안경희"→"국민안경희", "농협임미자"→"농협임미자"
- ⚠️⚠️⚠️ transaction_date 필수 규칙: "거래일시" 컬럼의 값에는 날짜와 시간이 모두 있습니다 (예: "2026.02.16 21:13:42").
  반드시 "YYYY-MM-DD HH:mm:ss" 형식으로 변환하세요! 예: "2026.02.16 21:13:42" → "2026-02-16 21:13:42"
  ❌ 절대 "2026-02-16"만 넣지 마세요! 시간(21:13:42)을 누락하면 안 됩니다!
  ❌ 절대 시간을 description에 넣지 마세요! 시간은 오직 transaction_date에만!
- ⚠️ description: "적요" 컬럼값과 "취급점" 컬럼값을 " / "로 연결하세요. 예: 적요="모바일", 취급점="서수원지점" → description="모바일 / 서수원지점"
  ❌ description에 시간을 넣지 마세요! ❌ description에 거래처명(기재내용)을 넣지 마세요!

⚠️⚠️⚠️ 거래 금액(amount) 추출 규칙 (매우 중요!!!):
✅ 거래 금액으로 사용할 컬럼:
  - "지급(원)", "지급", "출금", "출금액", "출금금액", "찾으신금액" → expense (출금)
  - "입금(원)", "입금", "입금액", "입금금액", "맡기신금액" → income (입금)
❌ 절대로 거래 금액으로 사용하면 안 되는 컬럼:
  - "거래후잔액", "거래후 잔액(원)", "잔액", "거래후잔액(원)" → 이것은 누적 잔액이지 거래 금액이 아닙니다!!!
  - 잔액은 항상 다른 금액 컬럼보다 큰 숫자입니다. 잔액을 amount에 넣으면 절대 안 됩니다.
- 같은 행에 입금과 출금이 모두 있으면 0이 아닌 쪽만 amount로 사용하세요.
- amount는 반드시 해당 거래의 입금액 또는 지급액이어야 합니다.`,
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
⚠️ 날짜 연도 결정 규칙 (우선순위):
1. 파일 헤더/상단에 기간 정보가 있으면(예: "2025.10.01 ~ 2025.10.31") 그 연도를 사용하세요!
2. 날짜에 연도가 포함되어 있으면(예: 2025-01-15, 20250115) 그대로 사용
3. 연도가 없는 경우(예: 02.26, 01/15, 10.31)만 ${currentYear}년으로 설정
데이터의 실제 기간을 반드시 확인하세요. 미래 날짜가 되면 안 됩니다.

[결과 필드 — 반드시 모든 필드를 포함]
- transaction_date: ⚠️⚠️⚠️ 가장 중요한 규칙! 원본 "거래일시" 컬럼에 시간이 있으면 반드시 "YYYY-MM-DD HH:mm:ss" 형식으로 시간까지 포함하세요!
  예시: 원본 "2026.02.16 21:13:42" → transaction_date: "${currentYear}-02-16 21:13:42" (시간 포함!)
  예시: 원본 "2026.01.09 17:23:45" → transaction_date: "${currentYear}-01-09 17:23:45" (시간 포함!)
  ❌ 잘못된 예: "2026-02-16" (시간 누락됨! 이렇게 하면 안 됩니다!)
  시간이 없는 경우에만 YYYY-MM-DD 형식 사용. 같은 날짜에 동일 금액 거래가 여러 건일 수 있으므로 시간 보존은 필수!
- client_name: "기재내용" 또는 "가맹점명" 컬럼 값을 원본 그대로 사용. ⚠️ 은행접두사(기업, 국민, 농협, 하나, 카카, 수협 등)를 제거하지 마세요! "기업윤민진"은 "기업윤민진" 그대로 유지. (입금, 출금, 이체 같은 거래유형 단어만 제외)
- amount: 양수 숫자 (콤마 제거). 외화인 경우 원래 외화 금액 그대로 사용
- currency: 통화코드 (기본값 "KRW"). 달러이면 "USD", 엔화이면 "JPY", 유로이면 "EUR" 등. $, ¥, €, US$ 등의 기호가 있거나 "달러", "USD", "미화" 등 표기가 있으면 해당 통화코드 사용
- original_amount: 외화 원금액 (currency가 KRW가 아닌 경우에만 설정, 원화 결제금액이 별도로 있으면 amount에는 원화금액, original_amount에는 외화금액 설정)
- type: "income" 또는 "expense"
- payment_method: 반드시 "Card" 또는 "Bank" 중 하나만 사용
- description: "적요" 컬럼과 "취급점" 컬럼을 " / "로 연결. ❌ 시간(HH:mm:ss)을 넣지 마세요! ❌ 거래처명(기재내용)을 넣지 마세요!
  올바른 예: 적요="모바일", 취급점="서수원지점" → "모바일 / 서수원지점"
  올바른 예: 적요="인터넷", 취급점="0199898" → "인터넷 / 0199898"
  ❌ 잘못된 예: "21:13:42 / 인터넷 / 서수원지점" (시간이 들어감!)
  ❌ 잘못된 예: "기업윤민진 / 인터넷" (거래처명이 들어감!)
  외화 거래인 경우 통화정보 포함 (예: "USD 결제 / 환율 1,350")
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
- ⚠️ "잔액", "거래후잔액", "거래후 잔액(원)" 컬럼 값을 절대 amount에 넣지 마세요! 잔액은 누적 잔고입니다!
- amount는 반드시 "입금(원)/지급(원)/출금/입금/찾으신금액/맡기신금액" 컬럼에서만 추출하세요
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

    // 잘린 JSON 복구 시도
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (jsonErr) {
      console.warn('[finance-parser] JSON 파싱 실패, 복구 시도:', (jsonErr as Error).message);
      // 배열이 중간에 잘린 경우: 마지막 완전한 객체까지만 파싱
      const lastCloseBrace = text.lastIndexOf('}');
      if (lastCloseBrace > 0) {
        const truncated = text.substring(0, lastCloseBrace + 1) + ']';
        try {
          parsed = JSON.parse(truncated);
          console.log(`[finance-parser] 잘린 JSON 복구 성공: ${parsed.length}건`);
        } catch {
          // 그래도 실패하면 원본 에러 throw
          throw jsonErr;
        }
      } else {
        throw jsonErr;
      }
    }

    // 📊 결과 검증 로그
    if (Array.isArray(parsed)) {
      const methods = parsed.map((p: any) => p.payment_method);
      const uniqueMethods = [...new Set(methods)];
      console.log(`[finance-parser] ✅ ${parsed.length}건 파싱 완료 | payment_methods: ${uniqueMethods.join(', ')} | fileType: ${fileType}`);

      // ⚠️ 통장 거래: 잔액이 금액으로 잘못 파싱되었는지 검증
      if (fileType === 'bank_statement' && mimeType === 'text/csv' && typeof data === 'string') {
        try {
          const csvLines = data.split('\n').map((line: string) => line.split(',').map((c: string) => c.trim().replace(/^"|"$/g, '')));
          if (csvLines.length > 0) {
            const headerLine = csvLines[0];
            // 잔액 컬럼 인덱스 찾기
            const balanceIdx = headerLine.findIndex((h: string) =>
              /잔액|거래후\s*잔액|거래후잔액/.test(h) && !/입금|출금|지급/.test(h)
            );
            // 지급/출금 컬럼 인덱스 찾기
            const withdrawIdx = headerLine.findIndex((h: string) => /지급|출금|찾으신/.test(h));
            // 입금 컬럼 인덱스 찾기
            const depositIdx = headerLine.findIndex((h: string) => /입금|맡기신/.test(h) && !/출금|지급/.test(h));

            if (balanceIdx >= 0 && (withdrawIdx >= 0 || depositIdx >= 0)) {
              // CSV의 잔액 값 목록 수집
              const balanceValues = new Set<number>();
              for (let li = 1; li < csvLines.length; li++) {
                const row = csvLines[li];
                if (row.length > balanceIdx) {
                  const bv = Math.abs(Number(String(row[balanceIdx]).replace(/[,\s]/g, '')) || 0);
                  if (bv > 0) balanceValues.add(bv);
                }
              }

              // 파싱된 amount가 잔액 값과 일치하는지 확인
              let balanceMatchCount = 0;
              for (const item of parsed) {
                const amt = Math.abs(Number(item.amount) || 0);
                if (amt > 0 && balanceValues.has(amt)) {
                  balanceMatchCount++;
                }
              }

              // 50% 이상이 잔액 값과 일치하면 → 잔액을 금액으로 잘못 파싱한 것
              if (balanceMatchCount > 0 && balanceMatchCount >= parsed.length * 0.5) {
                console.error(`[finance-parser] ❌ 잔액 오파싱 감지! ${balanceMatchCount}/${parsed.length}건이 잔액값과 일치`);
                console.error(`[finance-parser] → CSV에서 직접 지급/입금 컬럼으로 보정 시도`);

                // CSV에서 직접 올바른 금액 추출하여 보정
                for (const item of parsed) {
                  // 날짜와 거래처명으로 원본 CSV 행 매칭
                  const txDate = item.transaction_date || '';
                  const clientName = item.client_name || '';

                  for (let li = 1; li < csvLines.length; li++) {
                    const row = csvLines[li];
                    const rowStr = row.join(' ');

                    // 날짜와 거래처명이 모두 포함된 행 찾기
                    const dateMatches = rowStr.includes(txDate.replace(/-/g, '.')) ||
                                       rowStr.includes(txDate.replace(/-/g, '')) ||
                                       rowStr.includes(txDate);
                    const nameMatches = clientName && rowStr.includes(clientName);

                    if (dateMatches && nameMatches) {
                      const withdrawAmt = withdrawIdx >= 0 ? Math.abs(Number(String(row[withdrawIdx]).replace(/[,\s]/g, '')) || 0) : 0;
                      const depositAmt = depositIdx >= 0 ? Math.abs(Number(String(row[depositIdx]).replace(/[,\s]/g, '')) || 0) : 0;

                      if (withdrawAmt > 0 || depositAmt > 0) {
                        const correctAmt = withdrawAmt > 0 ? withdrawAmt : depositAmt;
                        const correctType = withdrawAmt > 0 ? 'expense' : 'income';

                        if (Math.abs(Number(item.amount)) !== correctAmt) {
                          console.log(`[finance-parser] 보정: ${item.client_name} ${item.amount} → ${correctAmt} (${correctType})`);
                          item.amount = correctAmt;
                          item.type = correctType;
                        }
                        break;
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (balanceCheckErr) {
          console.warn('[finance-parser] 잔액 검증 중 오류 (무시):', balanceCheckErr);
        }
      }

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

        // 날짜 연도 보정 (시간 부분 보존)
        if (item.transaction_date) {
          const dateMatch = item.transaction_date.match(/^(\d{4})-(\d{2})-(\d{2})(.*)/);
          if (dateMatch) {
            const year = parseInt(dateMatch[1]);
            const month = parseInt(dateMatch[2]);
            const day = parseInt(dateMatch[3]);
            const timePart = dateMatch[4] || ''; // " HH:mm:ss" 부분 보존
            const txDate = new Date(year, month - 1, day);
            const today = new Date();
            const monthsDiff = (txDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30);

            // 미래 3개월 이상이면 → 1년 전으로 보정 (2026-10-31 → 2025-10-31)
            if (monthsDiff > 3) {
              const correctedYear = year - 1;
              item.transaction_date = `${correctedYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}${timePart}`;
              console.log(`[finance-parser] 날짜 보정: ${year}-${month}-${day} → ${correctedYear}-${month}-${day} (미래 날짜)`);
            }
            // 연도가 현재 연도와 3년 이상 차이나면 보정
            else if (Math.abs(year - currentYear) >= 3) {
              item.transaction_date = `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}${timePart}`;
            }
          }
        }

        // ⚠️ Gemini가 시간을 description에 넣고 transaction_date에 안 넣는 경우 보정
        if (item.transaction_date && item.description) {
          const hasTime = /\d{2}:\d{2}:\d{2}/.test(item.transaction_date);
          if (!hasTime) {
            // description에서 시간 패턴 찾기 (HH:mm:ss 형식)
            const timeInDesc = item.description.match(/(\d{2}:\d{2}:\d{2})/);
            if (timeInDesc) {
              // transaction_date에 시간 추가
              item.transaction_date = `${item.transaction_date} ${timeInDesc[1]}`;
              // description에서 시간 제거 (앞뒤 구분자도 정리)
              item.description = item.description
                .replace(/\d{2}:\d{2}:\d{2}\s*[\/\|,]*\s*/g, '')
                .replace(/\s*[\/\|,]*\s*\d{2}:\d{2}:\d{2}/g, '')
                .replace(/^\s*[\/\|,]\s*/, '')
                .replace(/\s*[\/\|,]\s*$/, '')
                .trim();
              console.log(`[finance-parser] 시간 보정: description → transaction_date (${timeInDesc[1]})`);
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