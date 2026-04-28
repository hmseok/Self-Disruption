// ═══════════════════════════════════════════════════════════
// 카드/은행 SMS 파서 v3 — 카드 + 은행 통합 (2026-04-25)
//
// 입력: { from: 발신번호, text: SMS 본문 (전처리 완료) }
// 출력: ParsedSms | null
//
// ※ 실제 수신된 SMS 포맷:
//   KB카드: "KB국민카드 8819(기업) 04/21 11:37 13,500원 지에스25 풍납한가람 잔여559,033원"
//   KB카드: "[KB국민] 홍길동 4/21 14:32 CU편의점 3,500원 일시불 승인"
//   우리카드: "우리 04/24 16:00 *8287 승인 15,000원 주유소 일시불"
//   법인카드: "[MY COMPANY] 승인 7109 석호민님 9,000원 일시불 더벤티문정점 잔여한도3,422,272원"
//   우리은행: "우리 04/24 16:00 *828777 출금 1,400원 잔액 123,456원"
//   우리은행: "우리 04/24 16:00 *828777 입금 50,000원 잔액 173,456원"
//
// ※ 은행 vs 카드 구분:
//   - *XXXX (4자리) + 승인/사용 → 카드
//   - *XXXXXX (5자리+) + 출금/입금 → 은행
//
// ※ 웹훅(route.ts)에서 전처리 완료 후 이 파서가 호출됨:
//   ① "보낸사람 : 번호 이름:" 접두어 제거
//   ② "[Web발신]" 제거
// ═══════════════════════════════════════════════════════════

export type CardIssuer = 'KB' | 'WOORI' | 'HYUNDAI' | 'MYCOMPANY' | 'WOORI_BANK' | 'KB_BANK' | 'UNKNOWN'
export type SmsTxType = 'approved' | 'canceled' | 'deposit' | 'withdrawal'

export type ParsedSms = {
  issuer: CardIssuer
  type: SmsTxType
  holder: string | null
  card_alias: string | null
  amount: number
  merchant: string | null
  installment: string | null
  txAt: Date | null
}

// ── 발신번호로 카드사 식별 ─────────────────────────────────
const SENDER_MAP: Array<{ issuer: CardIssuer; patterns: RegExp[] }> = [
  { issuer: 'KB',       patterns: [/15884000/, /15447000/, /18006699/] },
  { issuer: 'WOORI',    patterns: [/15881688/, /15888000/, /15889955/] },
  { issuer: 'HYUNDAI',  patterns: [/16445000/, /15447100/] },
]

export function detectIssuer(sender: string | null, text: string): CardIssuer {
  const s = (sender || '').replace(/[^0-9]/g, '')

  // ── 은행 SMS 먼저 감지 (출금/입금 키워드 + 계좌번호 5자리 이상) ──
  if (/(?:출금|입금)/.test(text)) {
    // "우리 MM/DD HH:MM *XXXXXX 출금/입금" 패턴 (계좌번호 5자리+)
    if (/^우리\s+\d/.test(text) && /\*\d{5,}/.test(text)) return 'WOORI_BANK'
    if (/\[우리은행\]|우리은행/.test(text)) return 'WOORI_BANK'
    // KB은행: [KB] 또는 국민은행 + 입출금
    if (/\[KB\]|\[국민은행\]|국민은행/.test(text)) return 'KB_BANK'
  }

  // ── 카드 발신번호 매칭 ──
  for (const { issuer, patterns } of SENDER_MAP) {
    if (patterns.some(p => p.test(s))) return issuer
  }
  // 본문 키워드 fallback
  if (/\[MY COMPANY\]/.test(text)) return 'MYCOMPANY'
  if (/\[KB국민/.test(text) || /KB국민카드/.test(text)) return 'KB'
  if (/\[우리카드/.test(text) || /우리카드/.test(text) || /^우리\s+\d/.test(text)) return 'WOORI'
  if (/\[현대카드/.test(text) || /현대카드/.test(text)) return 'HYUNDAI'

  // ── 은행 키워드 fallback (출금/입금 없이 은행명만 있는 경우) ──
  if (/\[우리은행\]|우리은행/.test(text)) return 'WOORI_BANK'
  if (/\[국민은행\]|국민은행/.test(text)) return 'KB_BANK'

  return 'UNKNOWN'
}

// ── 공통: 금액 파싱 ───────────────────────────────────────
function parseAmount(text: string): number | null {
  const m = text.match(/([\d,]+)\s*원/)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

// ── 공통: 날짜/시간 파싱 ─────────────────────────────────
function parseDateTime(text: string, year = new Date().getFullYear()): Date | null {
  const m = text.match(/(\d{1,2})[./-](\d{1,2})\s+(\d{1,2}):(\d{2})/)
  if (!m) return null
  const [, mm, dd, hh, mi] = m
  const d = new Date(year, Number(mm) - 1, Number(dd), Number(hh), Number(mi))
  return Number.isFinite(d.getTime()) ? d : null
}

// ── 취소 감지 ────────────────────────────────────────────
function isCancelSms(text: string): boolean {
  return /취소|승인취소|거래취소/.test(text) && !/승인\s*$/.test(text.trim())
}

// ═══════════════════════════════════════════════════════════
// KB국민카드 파서
// ═══════════════════════════════════════════════════════════
// 포맷 1: [KB국민] 홍길동 4/21 14:32 CU편의점 3,500원 일시불 승인
//         → [카드사] 이름 날짜 가맹점 금액 할부 승인
// 포맷 2: KB국민카드 8819(기업) 04/21 11:37 13,500원 지에스25 풍납한가람 잔여559,033원
//         → 카드사 카드번호(타입) 날짜 금액 가맹점 잔여한도
//         ※ 이름 없음, 금액이 가맹점 앞에 옴
function parseKB(text: string): ParsedSms | null {
  const canceled = isCancelSms(text)

  // 포맷 1: [KB국민] 이름 날짜 가맹점 금액
  let m = text.match(
    /\[KB국민(?:카드)?\]\s*([^\s]+)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(.+?)\s+([\d,]+)\s*원\s*([^\n]*)/
  )
  if (m) {
    const [, holder, dt, merchant, amtStr, tail] = m
    const installMatch = (tail || text).match(/(일시불|\d+개월)/)
    let aliasMatch = text.match(/(?:카드번호|카드)\s*\**(\d{4})/)
    return {
      issuer: 'KB',
      type: canceled ? 'canceled' : 'approved',
      holder: holder.trim() || null,
      card_alias: aliasMatch ? `KB****${aliasMatch[1]}` : null,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: merchant.trim() || null,
      installment: installMatch ? installMatch[1] : null,
      txAt: parseDateTime(dt),
    }
  }

  // 포맷 2: KB국민카드 8819(기업) 04/21 11:37 13,500원 가맹점 잔여...
  // ※ 이름 없이 카드번호 바로 뒤에 날짜, 금액이 가맹점 앞
  m = text.match(
    /KB국민카드\s*(\d{4})(?:\([^)]*\))?\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+([\d,]+)\s*원\s+(.+?)(?:\s+잔여|$)/
  )
  if (m) {
    const [, cardNum, dt, amtStr, merchantRaw] = m
    const installMatch = text.match(/(일시불|\d+개월)/)
    return {
      issuer: 'KB',
      type: canceled ? 'canceled' : 'approved',
      holder: null,
      card_alias: `KB****${cardNum}`,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: merchantRaw.replace(/\s*(일시불|\d+개월)\s*/g, '').trim() || null,
      installment: installMatch ? installMatch[1] : null,
      txAt: parseDateTime(dt),
    }
  }

  // 포맷 3: KB국민카드 8819(기업) 홍길동 04/21 14:32 가맹점 금액 (이름 있는 변형)
  m = text.match(
    /KB국민카드\s*(?:\d{4}(?:\([^)]*\))?\s+)?([^\d\s][^\s]*)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(.+?)\s+([\d,]+)\s*원\s*([^\n]*)/
  )
  if (m) {
    const [, holder, dt, merchant, amtStr, tail] = m
    const installMatch = (tail || text).match(/(일시불|\d+개월)/)
    const aliasMatch = text.match(/KB국민카드\s*(\d{4})/)
    return {
      issuer: 'KB',
      type: canceled ? 'canceled' : 'approved',
      holder: holder.trim() || null,
      card_alias: aliasMatch ? `KB****${aliasMatch[1]}` : null,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: merchant.trim() || null,
      installment: installMatch ? installMatch[1] : null,
      txAt: parseDateTime(dt),
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════
// 우리카드 파서
// ═══════════════════════════════════════════════════════════
// 포맷 1: [우리카드] 홍*동 04/21 14:32 스타벅스 5,200원 일시불승인 카드****1234
// 포맷 2: 우리 04/24 16:00 *8287 승인 15,000원 주유소 일시불
//         → "우리" + 날짜 + *카드끝자리 + 승인 + 금액 + 가맹점
function parseWoori(text: string): ParsedSms | null {
  const canceled = isCancelSms(text)

  // 포맷 0 (실제 수신): ● 우리카드 이용안내 우리(4331)승인 법인 김*수님 4,795원 일시불 04/27 17:02 에스케이 일렉링크 누적329,111원
  let m = text.match(
    /우리\((\d{4})\)(?:승인|취소|사용)\s+(?:법인\s+)?([^\d\s][^\s]*?)님\s+([\d,]+)\s*원\s*(일시불|\d+개월)?\s*(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(.+?)(?:\s+(?:잔여|누적)|$)/
  )
  if (m) {
    const [, cardNum, holder, amtStr, install, dt, merchantRaw] = m
    const isCancel = canceled || /\(\d{4}\)취소/.test(text)
    return {
      issuer: 'WOORI',
      type: isCancel ? 'canceled' : 'approved',
      holder: holder.trim() || null,
      card_alias: `우리****${cardNum}`,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: merchantRaw.trim() || null,
      installment: install || null,
      txAt: parseDateTime(dt),
    }
  }

  // 포맷 1: [우리카드] 이름 날짜 가맹점 금액
  m = text.match(
    /\[우리카드\]\s*([^\s]+)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(.+?)\s+([\d,]+)\s*원\s*([^\n]*)/
  )
  if (m) {
    const [, holder, dt, merchant, amtStr, tail] = m
    const installMatch = (tail || text).match(/(일시불|\d+개월)/)
    let aliasMatch = text.match(/(?:카드|카드번호)\s*\**(\d{4})/)
    return {
      issuer: 'WOORI',
      type: canceled ? 'canceled' : 'approved',
      holder: holder.trim() || null,
      card_alias: aliasMatch ? `우리****${aliasMatch[1]}` : null,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: merchant.trim() || null,
      installment: installMatch ? installMatch[1] : null,
      txAt: parseDateTime(dt),
    }
  }

  // 포맷 2: 우리 04/24 16:00 *8287 승인 15,000원 가맹점...
  m = text.match(
    /우리\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+\*(\d{4})\s+(?:승인|사용)\s+([\d,]+)\s*원\s+(.+?)(?:\s+잔여|(?:\s+일시불|\s+\d+개월)|$)/
  )
  if (m) {
    const [, dt, cardNum, amtStr, merchantRaw] = m
    const installMatch = text.match(/(일시불|\d+개월)/)
    return {
      issuer: 'WOORI',
      type: canceled ? 'canceled' : 'approved',
      holder: null,
      card_alias: `우리****${cardNum}`,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: merchantRaw.trim() || null,
      installment: installMatch ? installMatch[1] : null,
      txAt: parseDateTime(dt),
    }
  }

  // 포맷 2 변형: 금액이 가맹점 앞에 오는 경우
  m = text.match(
    /우리\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+\*(\d{4})\s+([\d,]+)\s*원\s+(?:승인|사용)\s+(.+?)(?:\s+잔여|(?:\s+일시불|\s+\d+개월)|$)/
  )
  if (m) {
    const [, dt, cardNum, amtStr, merchantRaw] = m
    const installMatch = text.match(/(일시불|\d+개월)/)
    return {
      issuer: 'WOORI',
      type: canceled ? 'canceled' : 'approved',
      holder: null,
      card_alias: `우리****${cardNum}`,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: merchantRaw.trim() || null,
      installment: installMatch ? installMatch[1] : null,
      txAt: parseDateTime(dt),
    }
  }

  // 포맷 3: 우리카드 XXXX 이름 날짜 가맹점 금액
  m = text.match(
    /우리카드\s*(?:\d{4}(?:\([^)]*\))?\s+)?([^\d\s][^\s]*)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(.+?)\s+([\d,]+)\s*원\s*([^\n]*)/
  )
  if (m) {
    const [, holder, dt, merchant, amtStr, tail] = m
    const installMatch = (tail || text).match(/(일시불|\d+개월)/)
    const aliasMatch = text.match(/우리카드\s*(\d{4})/)
    return {
      issuer: 'WOORI',
      type: canceled ? 'canceled' : 'approved',
      holder: holder.trim() || null,
      card_alias: aliasMatch ? `우리****${aliasMatch[1]}` : null,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: merchant.trim() || null,
      installment: installMatch ? installMatch[1] : null,
      txAt: parseDateTime(dt),
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════
// 현대카드 파서
// ═══════════════════════════════════════════════════════════
function parseHyundai(text: string): ParsedSms | null {
  const canceled = isCancelSms(text)

  // 슬래시 구분: [현대카드M] 이름 날짜 / 금액 / 가맹점 / 할부
  let m = text.match(
    /(?:\[현대카드[^\]]*\]|현대카드[A-Za-z0-9]*(?:\s+\d{4}(?:\([^)]*\))?)?)\s*([^\s]+)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s*\/\s*([\d,]+)\s*원\s*\/\s*(.+?)\s*\/\s*([^\n\/]+)/
  )
  if (m) {
    const [, holder, dt, amtStr, merchant, instOrStatus] = m
    const installMatch = instOrStatus.match(/(일시불|\d+개월)/)
    const aliasMatch = text.match(/현대카드([A-Za-z0-9]+)/) || text.match(/\[현대카드([A-Za-z0-9]*)\]/)
    return {
      issuer: 'HYUNDAI',
      type: (canceled || /취소/.test(instOrStatus)) ? 'canceled' : 'approved',
      holder: holder.trim() || null,
      card_alias: aliasMatch && aliasMatch[1] ? `현대${aliasMatch[1]}` : '현대',
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: merchant.trim() || null,
      installment: installMatch ? installMatch[1] : null,
      txAt: parseDateTime(dt),
    }
  }

  // 공백 구분: [현대카드] 이름 날짜 가맹점 금액 or 현대카드 XXXX 이름 ...
  m = text.match(
    /(?:\[현대카드[^\]]*\]|현대카드[A-Za-z0-9]*(?:\s+\d{4}(?:\([^)]*\))?)?)\s*([^\d\s][^\s]*)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(.+?)\s+([\d,]+)\s*원\s*([^\n]*)/
  )
  if (m) {
    const [, holder, dt, merchant, amtStr, tail] = m
    const installMatch = (tail || text).match(/(일시불|\d+개월)/)
    const aliasMatch = text.match(/현대카드([A-Za-z0-9]+)/) || text.match(/\[현대카드([A-Za-z0-9]*)\]/)
    return {
      issuer: 'HYUNDAI',
      type: canceled ? 'canceled' : 'approved',
      holder: holder.trim() || null,
      card_alias: aliasMatch && aliasMatch[1] ? `현대${aliasMatch[1]}` : '현대',
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: merchant.trim() || null,
      installment: installMatch ? installMatch[1] : null,
      txAt: parseDateTime(dt),
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════
// [MY COMPANY] 법인카드 파서
// ═══════════════════════════════════════════════════════════
// 포맷: [MY COMPANY] 승인 7109 석호민님 9,000원 일시불 더벤티문정점 잔여한도3,422,272원
function parseMyCompany(text: string): ParsedSms | null {
  const canceled = isCancelSms(text)

  const m = text.match(
    /\[MY COMPANY\]\s*(?:승인|사용|결제)\s+(\d{4})\s+([^\s]+?)님?\s+([\d,]+)\s*원\s+(일시불|\d+개월)\s+(.+?)(?:\s+잔여한도|$)/
  )
  if (!m) {
    // 포맷 변형: 금액 뒤에 할부 없이 바로 가맹점
    const m2 = text.match(
      /\[MY COMPANY\]\s*(?:승인|사용|결제)\s+(\d{4})\s+([^\s]+?)님?\s+([\d,]+)\s*원\s+(.+?)(?:\s+잔여한도|$)/
    )
    if (!m2) return null
    const [, cardNum, holder, amtStr, merchantRaw] = m2
    const installMatch = text.match(/(일시불|\d+개월)/)
    return {
      issuer: 'MYCOMPANY',
      type: canceled ? 'canceled' : 'approved',
      holder: holder.replace(/님$/, '').trim() || null,
      card_alias: `법인****${cardNum}`,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: merchantRaw.replace(/\s*(일시불|\d+개월)\s*/g, '').trim() || null,
      installment: installMatch ? installMatch[1] : null,
      txAt: null, // 이 포맷에는 날짜가 없음 — received_at 사용
    }
  }

  const [, cardNum, holder, amtStr, installment, merchant] = m
  return {
    issuer: 'MYCOMPANY',
    type: canceled ? 'canceled' : 'approved',
    holder: holder.replace(/님$/, '').trim() || null,
    card_alias: `법인****${cardNum}`,
    amount: Number(amtStr.replace(/,/g, '')),
    merchant: merchant.trim() || null,
    installment,
    txAt: null,
  }
}

// ═══════════════════════════════════════════════════════════
// 우리은행 파서
// ═══════════════════════════════════════════════════════════
// 실제 수신 포맷: 우리 04/24 16:00 *828777 출금 1,400원 잔액 123,456원
//   → "우리" + 날짜 + *계좌끝번호(5~6자리) + 출금|입금 + 금액 + 잔액
function parseWooriBank(text: string): ParsedSms | null {
  // 패턴: 우리 MM/DD HH:MM *XXXXXX 출금|입금 금액원 [거래처] [잔액 ...원]
  // 예: 우리 04/28 16:38 *883582 출금 294,400원 (주)딜러타이어 잔액 12,699,362원
  let m = text.match(
    /우리\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+\*(\d{5,})\s+(출금|입금)\s+([\d,]+)\s*원\s*(.*?)(?:\s*잔액\s*[\d,]+\s*원)?\s*$/
  )
  if (m) {
    const [, dt, acctNum, txType, amtStr, counterpartyRaw] = m
    return {
      issuer: 'WOORI_BANK',
      type: txType === '입금' ? 'deposit' : 'withdrawal',
      holder: null,
      card_alias: `우리은행****${acctNum.slice(-4)}`,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: counterpartyRaw?.trim() || null,  // 거래처 (적요)
      installment: null,
      txAt: parseDateTime(dt),
    }
  }

  // [우리은행] 형식 fallback
  m = text.match(
    /(?:\[우리은행\]|우리은행)\s*(.+?)?\s*(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(출금|입금)\s+([\d,]+)\s*원/
  )
  if (m) {
    const [, holderRaw, dt, txType, amtStr] = m
    const balanceMatch = text.match(/잔액\s*([\d,]+)\s*원/)
    return {
      issuer: 'WOORI_BANK',
      type: txType === '입금' ? 'deposit' : 'withdrawal',
      holder: holderRaw?.trim() || null,
      card_alias: null,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: balanceMatch ? `잔액 ${balanceMatch[1]}원` : null,
      installment: null,
      txAt: parseDateTime(dt),
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════
// KB은행(국민은행) 파서
// ═══════════════════════════════════════════════════════════
// 예상 포맷: [KB] 출금 50,000원 04/25 14:30 *1234567 잔액 500,000원
// ※ 실제 데이터 도착 시 포맷 확인 후 수정 필요
function parseKBBank(text: string): ParsedSms | null {
  // 패턴 1: [KB] 또는 국민은행 + 출금/입금
  const m = text.match(
    /(?:\[KB\]|\[국민은행\]|국민은행)\s*(출금|입금)\s+([\d,]+)\s*원\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})/
  )
  if (m) {
    const [, txType, amtStr, dt] = m
    const acctMatch = text.match(/\*(\d{4,})/)
    const balanceMatch = text.match(/잔액\s*([\d,]+)\s*원/)
    return {
      issuer: 'KB_BANK',
      type: txType === '입금' ? 'deposit' : 'withdrawal',
      holder: null,
      card_alias: acctMatch ? `국민은행****${acctMatch[1].slice(-4)}` : null,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: balanceMatch ? `잔액 ${balanceMatch[1]}원` : null,
      installment: null,
      txAt: parseDateTime(dt),
    }
  }

  // 패턴 2: 날짜 먼저 오는 포맷
  const m2 = text.match(
    /(?:\[KB\]|\[국민은행\]|국민은행)\s*(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+\*(\d{4,})\s+(출금|입금)\s+([\d,]+)\s*원/
  )
  if (m2) {
    const [, dt, acctNum, txType, amtStr] = m2
    const balanceMatch = text.match(/잔액\s*([\d,]+)\s*원/)
    return {
      issuer: 'KB_BANK',
      type: txType === '입금' ? 'deposit' : 'withdrawal',
      holder: null,
      card_alias: `국민은행****${acctNum.slice(-4)}`,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: balanceMatch ? `잔액 ${balanceMatch[1]}원` : null,
      installment: null,
      txAt: parseDateTime(dt),
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════
// 라우터
// ═══════════════════════════════════════════════════════════
export function parseSms(sender: string | null, rawText: string): ParsedSms | null {
  // ── 텍스트 정규화: 줄바꿈/탭/다중공백 → 단일공백 ──
  // (실제 SMS는 줄바꿈으로 들어오는데 기존 파서는 한 줄 가정)
  const text = rawText
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const issuer = detectIssuer(sender, text)
  if (issuer === 'UNKNOWN') return null

  // 취소 전용 패턴 (금액만 있는 단순 취소)
  if (isCancelSms(text)) {
    const amt = parseAmount(text)
    const dt = parseDateTime(text)
    if (amt != null) {
      return {
        issuer,
        type: 'canceled',
        holder: null,
        card_alias: null,
        amount: amt,
        merchant: null,
        installment: null,
        txAt: dt,
      }
    }
  }

  switch (issuer) {
    case 'KB':          return parseKB(text)
    case 'WOORI':       return parseWoori(text)
    case 'HYUNDAI':     return parseHyundai(text)
    case 'MYCOMPANY':   return parseMyCompany(text)
    case 'WOORI_BANK':  return parseWooriBank(text)
    case 'KB_BANK':     return parseKBBank(text)
    default:            return null
  }
}
