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
}

export type DedupPair = {
  sms: DedupTransaction
  excel: DedupTransaction
  date_diff_min: number  // 분 차이 (절대값)
  match_score: number    // 0.0~1.0 — 가맹점 부분 일치 등 보강
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
           related_type, related_id, final_category, category
      FROM transactions
     WHERE deleted_at IS NULL
       AND transaction_date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
       AND ?
     ORDER BY transaction_date DESC
     LIMIT 5000
  `
  const smsRows = await prisma.$queryRawUnsafe<DedupTransaction[]>(
    sql.replace('?', "imported_from = 'sms'")
  )
  const excelRows = await prisma.$queryRawUnsafe<DedupTransaction[]>(
    sql.replace('?', "imported_from LIKE 'excel_%'")
  )
  return { smsRows, excelRows }
}

// ─── 두 거래의 매칭 점수 ────────────────────────────────────
function matchPair(sms: DedupTransaction, excel: DedupTransaction): { match: boolean; diff: number; score: number } {
  // 1) type 같아야 함
  if (sms.type !== excel.type) return { match: false, diff: 0, score: 0 }

  // 2) amount 정확히 같아야 함 (Decimal 직렬화 string 가능 → Number 캐스팅)
  if (Number(sms.amount) !== Number(excel.amount)) return { match: false, diff: 0, score: 0 }

  // 3) 시간 차이 ±3분
  const ts1 = new Date(sms.transaction_date as any).getTime()
  const ts2 = new Date(excel.transaction_date as any).getTime()
  if (!isFinite(ts1) || !isFinite(ts2)) return { match: false, diff: 0, score: 0 }
  const diffMin = Math.abs(ts1 - ts2) / 60000
  if (diffMin > TOLERANCE_MIN) return { match: false, diff: diffMin, score: 0 }

  // 4) 부가 score: 가맹점 부분 일치 여부 (보너스, 매칭 결정에는 영향 X)
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
    // 사용자 수동 분류 보호 (final_category 설정된 Excel row 는 skip)
    if (matchedExcel.final_category) {
      result.protected.excel_has_final_category++
      continue
    }

    result.pairs.push({
      sms,
      excel: matchedExcel,
      date_diff_min: excelMatches[0].diff,
      match_score: excelMatches[0].score,
    })
  }

  return result
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
