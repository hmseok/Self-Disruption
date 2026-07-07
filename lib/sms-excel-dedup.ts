// ═══════════════════════════════════════════════════════════════════
// SMS ↔ Excel 중복 거래 탐지 공통 모듈
//
// 매칭 기준:
//   1) imported_from 분류:
//        SMS   = imported_from = 'sms'
//        Excel = imported_from LIKE 'excel_card%' OR LIKE 'excel_bank%'
//   2) type 동일 (expense vs expense, income vs income)
//   3) amount 정확히 동일
//   4) transaction_date 차이 ≤ ±3분
//
// 1:1 unique 매칭만 dedup 대상으로 인정 (모호한 1:N / N:1 / N:M 은 skip)
//
// 우선순위: SMS row 유지, Excel row soft-delete (사용자 결정)
// ═══════════════════════════════════════════════════════════════════

import { prisma } from '@/lib/prisma'

export type DedupTransaction = {
  id: string
  transaction_date: Date | string
  amount: any
  type: string
  description: string | null
  client_name: string | null
  card_company: string | null
  bank_name: string | null
  imported_from: string | null
  related_type: string | null
  related_id: string | null
  final_category: string | null
  category: string | null
  balance_after?: any  // v3 — 쌍둥이 판별자 (거래 후 잔액)
}

export type DedupPair = {
  sms: DedupTransaction
  excel: DedupTransaction
  date_diff_min: number  // 분 차이 (절대값)
  match_score: number    // 0.0~1.0 — 가맹점 부분 일치 등 보강
  /** PR-BANK-DEDUP — 삭제할 쪽. 기본 'excel'(카드 기존 동작). 은행 쌍은 매칭·정보량 기준 결정 */
  delete_side: 'excel' | 'sms'
}

export type DedupResult = {
  total_sms: number
  total_excel: number
  pairs: DedupPair[]
  ambiguous: {
    sms_with_multiple_excel: number  // SMS 1건에 Excel 매칭 후보 N개
    excel_with_multiple_sms: number  // Excel 1건에 SMS 매칭 후보 N개
  }
  protected: {
    excel_has_final_category: number  // 사용자 분류 확정 — skip
  }
}

const TOLERANCE_MIN = 3

// ─── 후보 조회 ─────────────────────────────────────────────
//   기간 필터: 최근 90일 (성능 + 메모리 보호)
export async function loadDedupCandidates(): Promise<{
  smsRows: DedupTransaction[]
  excelRows: DedupTransaction[]
}> {
  const sql = `
    SELECT id, transaction_date, amount, type, description,
           client_name, card_company, bank_name, imported_from,
           related_type, related_id, final_category, category, balance_after
      FROM transactions
     WHERE deleted_at IS NULL
       AND transaction_date >= DATE_SUB(NOW(), INTERVAL 400 DAY)
       AND ?
     ORDER BY transaction_date DESC
     LIMIT 5000
  `
  // PR-BANK-DEDUP (2026-07-07) — 은행 SMS(sms_bank) 포함 (통장 엑셀 ↔ SMS 이중 수집 정리)
  const smsRows = await prisma.$queryRawUnsafe<DedupTransaction[]>(
    sql.replace('?', "imported_from IN ('sms', 'sms_bank')")
  )
  // codef_bank(오픈뱅킹) 포함 — 같은 계좌 이중 수집·쌍둥이 정리 대상
  const excelRows = await prisma.$queryRawUnsafe<DedupTransaction[]>(
    sql.replace('?', "(imported_from LIKE 'excel_%' OR imported_from = 'codef_bank')")
  )
  return { smsRows, excelRows }
}

// ─── 두 거래의 매칭 점수 ────────────────────────────────────
function matchPair(sms: DedupTransaction, excel: DedupTransaction): { match: boolean; diff: number; score: number } {
  // 1) type 같아야 함
  if (sms.type !== excel.type) return { match: false, diff: 0, score: 0 }

  // 2) amount 정확히 같아야 함 (Decimal 직렬화 string 가능 → Number 캐스팅)
  if (Number(sms.amount) !== Number(excel.amount)) return { match: false, diff: 0, score: 0 }

  const ts1 = new Date(sms.transaction_date as any).getTime()
  const ts2 = new Date(excel.transaction_date as any).getTime()
  if (!isFinite(ts1) || !isFinite(ts2)) return { match: false, diff: 0, score: 0 }
  const diffMin = Math.abs(ts1 - ts2) / 60000

  // PR-BANK-DEDUP — 은행 쌍 (sms_bank ↔ excel_bank): 엑셀은 날짜만 있어 ±3분 불가
  //   → 같은 날 + 같은 금액 + 입금자명/적요 토큰 겹침 필수 (오탐 방지)
  const smsIsBank = sms.imported_from === 'sms_bank'
  const excelIsBank = String(excel.imported_from || '').startsWith('excel_bank') || excel.imported_from === 'codef_bank'
  if (smsIsBank !== excelIsBank) return { match: false, diff: diffMin, score: 0 }  // 카드↔통장 교차 금지

  if (smsIsBank && excelIsBank) {
    const d1 = new Date(ts1); const d2 = new Date(ts2)
    const sameDay = d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
    if (!sameDay) return { match: false, diff: diffMin, score: 0 }
    // 토큰 겹침: 한쪽의 이름/적요 문자열이 다른 쪽에 포함 (예: '삼성2102')
    const bag = (t: DedupTransaction) => `${t.client_name || ''} ${t.description || ''}`.replace(/\s+/g, '')
    const b1 = bag(sms); const b2 = bag(excel)
    const tokens = [sms.client_name, sms.description, excel.client_name, excel.description]
      .map((x) => String(x || '').replace(/\s+/g, '').trim()).filter((x) => x.length >= 3)
    const overlap = tokens.some((tk) => (b1.includes(tk) && b2.includes(tk)))
    if (!overlap) return { match: false, diff: diffMin, score: 0 }
    return { match: true, diff: diffMin, score: 0.8 }
  }

  // 카드 쌍 — 기존 동작: ±3분
  if (diffMin > TOLERANCE_MIN) return { match: false, diff: diffMin, score: 0 }

  // 부가 score: 가맹점 부분 일치 여부 (보너스, 매칭 결정에는 영향 X)
  let score = 0.5
  if (sms.description && excel.description) {
    const s = String(sms.description).replace(/\[취소\]\s*/g, '').trim()
    const e = String(excel.description).trim()
    if (s && e && (s.includes(e) || e.includes(s))) score = 0.9
    else if (s && e && s.length > 2 && e.length > 2) {
      // 한글 부분 일치 (앞 3자)
      if (s.slice(0, 3) === e.slice(0, 3)) score = 0.7
    }
  }

  return { match: true, diff: diffMin, score }
}

// ─── 1:1 매칭 페어 추출 ─────────────────────────────────────
//   SMS 1건에 매칭되는 Excel 1건만 — 모호한 케이스 (1:N / N:1) 는 skip
export function findUniquePairs(
  smsRows: DedupTransaction[],
  excelRows: DedupTransaction[]
): DedupResult {
  const result: DedupResult = {
    total_sms: smsRows.length,
    total_excel: excelRows.length,
    pairs: [],
    ambiguous: { sms_with_multiple_excel: 0, excel_with_multiple_sms: 0 },
    protected: { excel_has_final_category: 0 },
  }

  // SMS → 매칭되는 Excel 후보들
  const smsToExcel = new Map<string, Array<{ excel: DedupTransaction; diff: number; score: number }>>()
  // Excel → 매칭되는 SMS 후보들
  const excelToSms = new Map<string, Array<{ sms: DedupTransaction; diff: number; score: number }>>()

  for (const sms of smsRows) {
    for (const excel of excelRows) {
      const m = matchPair(sms, excel)
      if (!m.match) continue
      if (!smsToExcel.has(sms.id)) smsToExcel.set(sms.id, [])
      if (!excelToSms.has(excel.id)) excelToSms.set(excel.id, [])
      smsToExcel.get(sms.id)!.push({ excel, diff: m.diff, score: m.score })
      excelToSms.get(excel.id)!.push({ sms, diff: m.diff, score: m.score })
    }
  }

  // 1:1 unique 만 dedup 대상
  for (const sms of smsRows) {
    const excelMatches = smsToExcel.get(sms.id) || []
    if (excelMatches.length === 0) continue
    if (excelMatches.length > 1) {
      result.ambiguous.sms_with_multiple_excel++
      continue
    }
    const matchedExcel = excelMatches[0].excel
    const reverseMatches = excelToSms.get(matchedExcel.id) || []
    if (reverseMatches.length > 1) {
      result.ambiguous.excel_with_multiple_sms++
      continue
    }
    // PR-BANK-DEDUP — 삭제 방향 결정
    //   은행 쌍: 매칭(related) 붙은 쪽 보존. 둘 다/둘 다 아님 → 정보 많은 엑셀 보존, SMS 삭제
    //   카드 쌍: 기존 동작 (엑셀 삭제, SMS 보존)
    const isBankPair = sms.imported_from === 'sms_bank'
    let deleteSide: 'excel' | 'sms' = 'excel'
    if (isBankPair) {
      if (sms.related_id && !matchedExcel.related_id) deleteSide = 'excel'
      else deleteSide = 'sms'
    }

    // 사용자 수동 분류 보호 — 삭제될 쪽에 final_category 있으면 skip
    const toDelete = deleteSide === 'excel' ? matchedExcel : sms
    if (toDelete.final_category) {
      result.protected.excel_has_final_category++
      continue
    }

    result.pairs.push({
      sms,
      excel: matchedExcel,
      date_diff_min: excelMatches[0].diff,
      match_score: excelMatches[0].score,
      delete_side: deleteSide,
    })
  }

  return result
}

// ─── 같은 출처 쌍둥이 정리 (PR-BANK-DEDUP v2, 2026-07-07) ─────
//   통장 계열(excel_bank% / codef_bank) 안에서 같은 날 + 같은 금액 +
//   같은 이름 + 같은 적요가 2행 이상 → 1행만 보존.
//   보존 우선순위: 매칭(related_id) 있는 행 > codef(은행 원본) > 첫 행.
//   final_category 있는 행은 삭제 대상에서 제외 (수동 분류 보호).
export function findBankSelfDuplicates(rows: DedupTransaction[]): {
  delete_ids: string[]
  group_count: number
} {
  const bankRows = rows.filter((r) =>
    String(r.imported_from || '').startsWith('excel_bank') || r.imported_from === 'codef_bank')
  const nm = (s: any) => String(s || '').replace(/\s+/g, '').trim()
  const groups = new Map<string, DedupTransaction[]>()
  for (const r of bankRows) {
    const d = new Date(r.transaction_date as any)
    if (!isFinite(d.getTime())) continue
    // v3 (2026-07-08) — 오탐 방지: 같은 날 정당한 반복 거래(같은 고객·같은 금액 2회)를
    //   중복으로 오인하지 않도록 판별자 강화.
    //   · 시각(초)까지 같아야 하고
    //   · 거래 후 잔액까지 같아야 진짜 쌍둥이 (별개 거래면 잔액이 다를 수밖에 없음)
    //   · 시각도 잔액도 없는 행(날짜만·잔액 없음)은 확신 불가 → 검사 제외
    const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0)
    const bal = r as any
    const hasBalance = bal.balance_after != null && Number(bal.balance_after) > 0
    if (!hasTime && !hasBalance) continue
    const ts = d.toISOString()
    const key = `${ts}|${Number(r.amount)}|${r.type}|${nm(r.client_name)}|${nm(r.description)}|${hasBalance ? Number(bal.balance_after) : 'x'}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }
  const deleteIds: string[] = []
  let groupCount = 0
  for (const list of groups.values()) {
    if (list.length < 2) continue
    groupCount++
    const keep =
      list.find((r) => r.related_id) ||
      list.find((r) => r.imported_from === 'codef_bank') ||
      list[0]
    for (const r of list) {
      if (r.id === keep.id) continue
      if (r.final_category) continue  // 수동 분류 보호
      deleteIds.push(r.id)
    }
  }
  return { delete_ids: deleteIds, group_count: groupCount }
}

// ─── 단건 SMS 매칭 — 엑셀 업로드 시 사용 ─────────────────────
//   엑셀 row 한 줄을 받아 같은 거래를 가진 SMS transactions row 가 있으면 반환
export async function findSmsMatchForExcelRow(opts: {
  transaction_date: string | Date
  amount: number
  type: string
}): Promise<DedupTransaction | null> {
  const tsTarget = new Date(opts.transaction_date).getTime()
  if (!isFinite(tsTarget)) return null

  const fromDt = new Date(tsTarget - TOLERANCE_MIN * 60000)
  const toDt = new Date(tsTarget + TOLERANCE_MIN * 60000)

  const rows = await prisma.$queryRaw<DedupTransaction[]>`
    SELECT id, transaction_date, amount, type, description,
           client_name, card_company, bank_name, imported_from,
           related_type, related_id, final_category, category
      FROM transactions
     WHERE deleted_at IS NULL
       AND imported_from = 'sms'
       AND type = ${opts.type}
       AND amount = ${opts.amount}
       AND transaction_date BETWEEN ${fromDt} AND ${toDt}
     LIMIT 2
  `
  // 정확히 1건이어야 dedup 인정 (모호하면 null)
  if (rows.length === 1) return rows[0]
  return null
}
