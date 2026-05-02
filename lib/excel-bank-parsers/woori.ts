/**
 * woori.ts — 우리은행 엑셀 거래내역 직접 파서.
 *
 * Gemini 의존 X — 정확한 컬럼 매핑.
 *
 * 엑셀 구조 (실측):
 *   Row 0: "우리은행 거래내역조회" (제목)
 *   Row 1: "계좌번호 : 1005504828777        예금주 : 주식회사 에프엠아이"
 *   Row 2: "조회기간 : 2025.09.29~2026.04.26 ..."
 *   Row 3: ["No.", "거래일시", "적요", "기재내용", "지급(원)", "입금(원)", "거래후 잔액(원)", "취급점", "메모", "수표..."]
 *   Row 4+: 데이터
 *
 * 출력:
 *   {
 *     meta: { account_number, account_holder, period },
 *     rows: [{ transaction_date, time, description (적요), counterpart (기재내용), withdrawal, deposit, balance, branch, memo }]
 *   }
 *
 * (CLAUDE.md 규칙 8 — End-to-End 검증 강제)
 */
import * as XLSX from 'xlsx'

export interface WooriRow {
  transaction_date: string  // 'YYYY-MM-DD'
  transaction_time: string  // 'HH:mm:ss'
  description: string       // 적요 (예: "모바일", "타행대량", "F/B 출금")
  counterpart: string       // 기재내용 (예: "산업미납통행료", "삼성3543")
  withdrawal: number        // 지급(원) — 출금
  deposit: number           // 입금(원)
  balance: number           // 거래후 잔액
  branch: string            // 취급점
  memo: string
}

export interface WooriParseResult {
  meta: {
    account_number: string | null      // "1005504828777" (하이픈 없음)
    account_number_formatted: string | null  // "1005-50-482-8777" (하이픈 포함)
    account_holder: string | null
    last4: string | null
    period: string | null
  }
  rows: WooriRow[]
  raw_row_count: number
}

function parseAmount(s: any): number {
  if (s == null) return 0
  const num = Number(String(s).replace(/[,\s원]/g, ''))
  return isNaN(num) ? 0 : Math.abs(num)
}

function parseDateTime(s: any): { date: string; time: string } {
  if (!s) return { date: '', time: '' }
  const str = String(s).trim()
  // "2026.04.24 16:00:57" 또는 "2026-04-24 16:00:57"
  const m = str.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}):?(\d{1,2})?)?/)
  if (!m) return { date: '', time: '' }
  const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  const time = m[4] ? `${m[4].padStart(2, '0')}:${m[5].padStart(2, '0')}:${(m[6] || '00').padStart(2, '0')}` : ''
  return { date, time }
}

function formatAccountNumber(raw: string): string {
  // "1005504828777" (13자리) → "1005-504-828777" (우리은행 통상 표기)
  // 또는 "1005-504-828777" → "1005-50-482-8777" 같은 다른 포맷
  // 안전한 처리: 그대로 두고, last4 만 추출
  return raw
}

function extractMeta(data: any[][]): WooriParseResult['meta'] {
  let account_number: string | null = null
  let account_holder: string | null = null
  let period: string | null = null

  // 첫 5줄에서 메타 추출
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const cell = String((data[i] || [])[0] || '')
    // "계좌번호 : 1005504828777        예금주 : 주식회사 에프엠아이"
    const m1 = cell.match(/계좌번호\s*:\s*([0-9\-]+)/)
    if (m1 && !account_number) account_number = m1[1].trim()
    const m2 = cell.match(/예금주\s*:\s*([^\s].*?)(?:\s{2,}|$)/)
    if (m2 && !account_holder) account_holder = m2[1].trim()
    const m3 = cell.match(/조회기간\s*:\s*([^\s].*?)(?:\s{2,}|$)/)
    if (m3 && !period) period = m3[1].trim()
  }

  // last4 추출 — 숫자만 남긴 후 마지막 4자리
  let last4: string | null = null
  if (account_number) {
    const digits = account_number.replace(/\D/g, '')
    if (digits.length >= 4) last4 = digits.slice(-4)
  }

  return {
    account_number,
    account_number_formatted: account_number ? formatAccountNumber(account_number) : null,
    account_holder,
    last4,
    period,
  }
}

/**
 * 우리은행 엑셀 파일 파싱.
 *
 * @param input File Buffer 또는 ArrayBuffer
 * @returns 파싱 결과 (meta + rows)
 */
export function parseWooriBankExcel(input: ArrayBuffer | Buffer): WooriParseResult {
  const wb = XLSX.read(input, { type: 'buffer' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })

  const meta = extractMeta(data)

  // 헤더 행 찾기 — "No." + "거래일시" + "기재내용" 포함
  let headerIdx = -1
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i] || []
    const rowStr = row.map((c: any) => String(c)).join('|')
    if (rowStr.includes('거래일시') && rowStr.includes('기재내용')) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) {
    return { meta, rows: [], raw_row_count: data.length }
  }

  const header = data[headerIdx].map((c: any) => String(c).trim())

  // 컬럼 인덱스 매핑
  const idx = {
    no: header.findIndex(h => h === 'No.' || h === 'No'),
    datetime: header.findIndex(h => /거래일시|거래일자|일시|일자/.test(h)),
    description: header.findIndex(h => h === '적요'),
    counterpart: header.findIndex(h => h === '기재내용'),
    withdrawal: header.findIndex(h => /지급/.test(h) && /원/.test(h)),
    deposit: header.findIndex(h => /입금/.test(h) && /원/.test(h)),
    balance: header.findIndex(h => /잔액/.test(h)),
    branch: header.findIndex(h => /취급점|영업점/.test(h)),
    memo: header.findIndex(h => h === '메모'),
  }

  const rows: WooriRow[] = []
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i]
    if (!row || row.length === 0) continue

    const dt = idx.datetime >= 0 ? parseDateTime(row[idx.datetime]) : { date: '', time: '' }
    if (!dt.date) continue  // 날짜 없는 행 skip (총합/메타)

    const wd = idx.withdrawal >= 0 ? parseAmount(row[idx.withdrawal]) : 0
    const dp = idx.deposit >= 0 ? parseAmount(row[idx.deposit]) : 0
    if (wd === 0 && dp === 0) continue  // 금액 없는 행 skip

    rows.push({
      transaction_date: dt.date,
      transaction_time: dt.time,
      description: idx.description >= 0 ? String(row[idx.description] || '').trim() : '',
      counterpart: idx.counterpart >= 0 ? String(row[idx.counterpart] || '').trim() : '',
      withdrawal: wd,
      deposit: dp,
      balance: idx.balance >= 0 ? parseAmount(row[idx.balance]) : 0,
      branch: idx.branch >= 0 ? String(row[idx.branch] || '').trim() : '',
      memo: idx.memo >= 0 ? String(row[idx.memo] || '').trim() : '',
    })
  }

  return { meta, rows, raw_row_count: data.length }
}

/**
 * 파일명/내용 기반 우리은행 엑셀 자동 감지.
 */
export function isWooriBankExcel(filename: string, firstRows?: any[][]): boolean {
  if (/우리은행|woori/i.test(filename)) return true
  if (firstRows && firstRows.length > 0) {
    const first = String((firstRows[0] || [])[0] || '')
    if (first.includes('우리은행')) return true
  }
  return false
}
