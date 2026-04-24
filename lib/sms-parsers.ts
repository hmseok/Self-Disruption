// ═══════════════════════════════════════════════════════════
// 카드사 SMS 파서 — KB국민 / 우리 / 현대
//
// 입력: { from: 발신번호, text: SMS 본문 }
// 출력: { issuer, type, holder, card_alias, amount, merchant, installment, txAt }
//
// 포맷 예시:
//   [KB국민] 홍길동 4/21 14:32 CU편의점 3,500원 일시불 승인
//   [우리카드] 홍*동 04/21 14:32 스타벅스 5,200원 일시불승인 카드번호****1234
//   [현대카드M] 홍길동 04/21 14:32 / 3,500원 / CU편의점 / 일시불
//
// ※ 카드사가 포맷 바꾸면 여기만 고치면 됨.
//    파싱 실패 시 null 반환 → webhook 에서 parse_status='failed' 로 저장.
// ═══════════════════════════════════════════════════════════

export type CardIssuer = 'KB' | 'WOORI' | 'HYUNDAI' | 'UNKNOWN'
export type SmsTxType = 'approved' | 'canceled'

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
// (카드사가 번호 바꾸면 여기만 수정)
const SENDER_MAP: Array<{ issuer: CardIssuer; patterns: RegExp[] }> = [
  { issuer: 'KB',       patterns: [/15884000/, /15447000/, /18006699/] },
  { issuer: 'WOORI',    patterns: [/15881688/, /15888000/, /15889955/] },
  { issuer: 'HYUNDAI',  patterns: [/16445000/, /15447100/, /15881688/] },
]

export function detectIssuer(sender: string | null, text: string): CardIssuer {
  const s = (sender || '').replace(/[^0-9]/g, '')
  for (const { issuer, patterns } of SENDER_MAP) {
    if (patterns.some(p => p.test(s))) return issuer
  }
  // 본문 prefix fallback
  if (/\[KB국민/.test(text) || /KB국민카드/.test(text)) return 'KB'
  if (/\[우리카드/.test(text) || /우리카드/.test(text)) return 'WOORI'
  if (/\[현대카드/.test(text) || /현대카드/.test(text)) return 'HYUNDAI'
  return 'UNKNOWN'
}

// ── 취소 SMS 식별 ─────────────────────────────────────────
function isCancelSms(text: string): boolean {
  return /취소|승인취소|거래취소/.test(text) && !/승인\s*$/.test(text.trim())
}

// ── 공통: 금액 파싱 ───────────────────────────────────────
function parseAmount(text: string): number | null {
  const m = text.match(/([\d,]+)\s*원/)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

// ── 공통: 날짜/시간 파싱 (MM/DD HH:MM 또는 MM-DD HH:MM) ────
function parseDateTime(text: string, year = new Date().getFullYear()): Date | null {
  const m = text.match(/(\d{1,2})[./-](\d{1,2})\s+(\d{1,2}):(\d{2})/)
  if (!m) return null
  const [, mm, dd, hh, mi] = m
  const d = new Date(year, Number(mm) - 1, Number(dd), Number(hh), Number(mi))
  return Number.isFinite(d.getTime()) ? d : null
}

// ── KB국민카드 파서 ────────────────────────────────────────
// 포맷 A: [KB국민] 홍길동 4/21 14:32 CU편의점 3,500원 일시불 승인
// 포맷 B: KB국민카드 8819(기업) 홍길동 04/21 14:32 CU편의점 3,500원 일시불 승인
//         (웹훅에서 [Web발신] 제거 후 도착하는 포맷)
function parseKB(text: string): ParsedSms | null {
  // 포맷 A: [KB국민] 또는 [KB국민카드]
  let m = text.match(
    /\[KB국민(?:카드)?\]\s*([^\s]+)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(.+?)\s+([\d,]+)\s*원\s*([^\n]*)/
  )

  // 포맷 B: KB국민카드 XXXX(기업) 홍길동 ... or KB국민카드 홍길동 ...
  if (!m) {
    m = text.match(
      /KB국민카드\s*(?:\d{4}(?:\([^)]*\))?\s+)?([^\s]+)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(.+?)\s+([\d,]+)\s*원\s*([^\n]*)/
    )
  }

  if (!m) return null
  const [, holder, dt, merchant, amtStr, tail] = m

  const canceled = /취소/.test(tail)
  const installMatch = tail.match(/(일시불|\d+개월)/)

  // 카드 별칭: [Web발신] 포맷의 "KB국민카드 8819" 또는 기존 "카드번호****1234"
  let aliasMatch = text.match(/KB국민카드\s*(\d{4})/)
  if (!aliasMatch) aliasMatch = text.match(/(?:카드번호|카드)\s*\**(\d{4})/)

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

// ── 우리카드 파서 ────────────────────────────────────────
// 포맷 A: [우리카드] 홍*동 04/21 14:32 스타벅스 5,200원 일시불승인 카드****1234
// 포맷 B: 우리카드 XXXX 홍*동 04/21 14:32 스타벅스 5,200원 일시불승인
function parseWoori(text: string): ParsedSms | null {
  // 포맷 A: [우리카드]
  let m = text.match(
    /\[우리카드\]\s*([^\s]+)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(.+?)\s+([\d,]+)\s*원\s*([^\n]*)/
  )

  // 포맷 B: 우리카드 XXXX 또는 우리카드 홍*동
  if (!m) {
    m = text.match(
      /우리카드\s*(?:\d{4}(?:\([^)]*\))?\s+)?([^\s]+)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(.+?)\s+([\d,]+)\s*원\s*([^\n]*)/
    )
  }

  if (!m) return null
  const [, holder, dt, merchant, amtStr, tail] = m

  const canceled = /취소/.test(tail)
  const installMatch = tail.match(/(일시불|\d+개월)/)
  let aliasMatch = text.match(/우리카드\s*(\d{4})/)
  if (!aliasMatch) aliasMatch = text.match(/(?:카드|카드번호)\s*\**(\d{4})/)

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

// ── 현대카드 파서 ────────────────────────────────────────
// 포맷 A1: [현대카드M] 홍길동 04/21 14:32 / 3,500원 / CU편의점 / 일시불 (슬래시 구분)
// 포맷 A2: [현대카드] 홍길동 04/21 14:32 CU편의점 3,500원 일시불 승인 (공백 구분)
// 포맷 B:  현대카드M XXXX 홍길동 04/21 14:32 CU편의점 3,500원 일시불 승인
function parseHyundai(text: string): ParsedSms | null {
  // ── 슬래시 구분 포맷 (포맷 A1) ──
  let m = text.match(
    /(?:\[현대카드[^\]]*\]|현대카드[A-Za-z0-9]*(?:\s+\d{4}(?:\([^)]*\))?)?)\s*([^\s]+)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s*\/\s*([\d,]+)\s*원\s*\/\s*(.+?)\s*\/\s*([^\n\/]+)/
  )
  if (m) {
    const [, holder, dt, amtStr, merchant, instOrStatus] = m
    const canceled = /취소/.test(instOrStatus) || /취소/.test(text)
    const installMatch = instOrStatus.match(/(일시불|\d+개월)/)
    let alias = '현대'
    const bracketAlias = text.match(/\[현대카드([A-Za-z0-9]*)\]/)
    const plainAlias = text.match(/현대카드([A-Za-z0-9]+)/)
    if (bracketAlias && bracketAlias[1]) alias = `현대${bracketAlias[1]}`
    else if (plainAlias && plainAlias[1]) alias = `현대${plainAlias[1]}`

    return {
      issuer: 'HYUNDAI',
      type: canceled ? 'canceled' : 'approved',
      holder: holder.trim() || null,
      card_alias: alias,
      amount: Number(amtStr.replace(/,/g, '')),
      merchant: merchant.trim() || null,
      installment: installMatch ? installMatch[1] : null,
      txAt: parseDateTime(dt),
    }
  }

  // ── 공백 구분 포맷 (포맷 A2 + B) ──
  // A2: [현대카드M] 홍길동 ...
  m = text.match(
    /\[현대카드[^\]]*\]\s*([^\s]+)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(.+?)\s+([\d,]+)\s*원\s*([^\n]*)/
  )
  // B: 현대카드M XXXX(기업) 홍길동 ... or 현대카드 홍길동 ...
  if (!m) {
    m = text.match(
      /현대카드[A-Za-z0-9]*\s*(?:\d{4}(?:\([^)]*\))?\s+)?([^\s]+)\s+(\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+(.+?)\s+([\d,]+)\s*원\s*([^\n]*)/
    )
  }
  if (!m) return null
  const [, holder, dt, merchant, amtStr, tail] = m
  const canceled = /취소/.test(tail)
  const installMatch = tail.match(/(일시불|\d+개월)/)
  let alias = '현대'
  const bracketAlias = text.match(/\[현대카드([A-Za-z0-9]*)\]/)
  const plainAlias = text.match(/현대카드([A-Za-z0-9]+)/)
  if (bracketAlias && bracketAlias[1]) alias = `현대${bracketAlias[1]}`
  else if (plainAlias && plainAlias[1]) alias = `현대${plainAlias[1]}`

  return {
    issuer: 'HYUNDAI',
    type: canceled ? 'canceled' : 'approved',
    holder: holder.trim() || null,
    card_alias: alias,
    amount: Number(amtStr.replace(/,/g, '')),
    merchant: merchant.trim() || null,
    installment: installMatch ? installMatch[1] : null,
    txAt: parseDateTime(dt),
  }
}

// ── 라우터 ────────────────────────────────────────────────
export function parseSms(sender: string | null, text: string): ParsedSms | null {
  const issuer = detectIssuer(sender, text)
  if (issuer === 'UNKNOWN') return null

  // 취소 전용 패턴 감지 (금액/가맹점 없는 단순 취소 알림)
  // 예: [KB국민] 홍길동 4/21 14:32 3,500원 승인취소
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
    case 'KB':      return parseKB(text)
    case 'WOORI':   return parseWoori(text)
    case 'HYUNDAI': return parseHyundai(text)
    default:        return null
  }
}
