import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { createHash } from 'crypto'
import { resolveClientName } from '@/lib/client-name-aliases'
import { classifyByRules } from '@/lib/transaction-classifier'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

/** 날짜 정규화: 다양한 형식 → MySQL DATETIME 호환 */
function normalizeDate(raw: string): string {
  if (!raw) return ''
  const s = String(raw).trim()
  // YYYY.MM.DD HH:mm:ss → YYYY-MM-DD HH:mm:ss
  const full = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s+(\d{2}:\d{2}(:\d{2})?)$/)
  if (full) return `${full[1]}-${full[2].padStart(2,'0')}-${full[3].padStart(2,'0')} ${full[4]}${full[5] ? '' : ':00'}`
  // YYYY.MM.DD → YYYY-MM-DD
  const dateOnly = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/)
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2].padStart(2,'0')}-${dateOnly[3].padStart(2,'0')}`
  // MM.DD HH:mm (연도 없음) → 현재 연도 사용
  const short = s.match(/^(\d{1,2})[.\-/](\d{1,2})\s+(\d{2}:\d{2})$/)
  if (short) {
    const month = parseInt(short[1])
    const now = new Date()
    let year = now.getFullYear()
    if (month > now.getMonth() + 1 + 3) year-- // 현재 월보다 3개월 이상 뒤면 전년
    return `${year}-${short[1].padStart(2,'0')}-${short[2].padStart(2,'0')} ${short[3]}:00`
  }
  return s
}

/**
 * POST /api/finance/transactions/import
 * 엑셀 파싱 데이터 일괄 저장 (통장/카드 공통)
 * Body: { rows: ImportRow[], source: 'excel_bank' | 'excel_card', batchId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { rows, source, batchId } = body

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '가져올 데이터가 없습니다' }, { status: 400 })
    }
    if (rows.length > 5000) {
      return NextResponse.json({ error: '한 번에 최대 5000건까지 업로드 가능합니다' }, { status: 400 })
    }
    if (!source || !['excel_bank', 'excel_card'].includes(source)) {
      return NextResponse.json({ error: '올바른 소스를 지정하세요 (excel_bank / excel_card)' }, { status: 400 })
    }

    // 중복 검사용: 기존 거래의 해시 → 건수 맵
    const existingHashCounts = new Map<string, number>()
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT transaction_date, amount, description, client_name FROM transactions WHERE deleted_at IS NULL AND imported_from = ?`,
      source
    )
    for (const e of existing) {
      // transaction_date가 Date 객체일 수 있으므로 문자열로 변환
      const dateStr = e.transaction_date instanceof Date
        ? e.transaction_date.toISOString()
        : String(e.transaction_date || '')
      const hash = createHash('sha256')
        .update(`${dateStr}|${Number(e.amount)}|${e.description || ''}|${e.client_name || ''}`)
        .digest('hex')
      existingHashCounts.set(hash, (existingHashCounts.get(hash) || 0) + 1)
    }
    const uploadHashCounts = new Map<string, number>()

    let inserted = 0
    let skipped = 0
    const errors: string[] = []
    // ★ skip 사유별 카운트 — 사용자가 어떤 행이 왜 빠졌는지 확인 가능
    const skipBreakdown = {
      no_date: 0,        // 날짜 컬럼 비어있음 (총합/메타 행)
      invalid_date: 0,   // 날짜 형식 인식 안됨
      no_amount: 0,      // 금액 0 또는 없음
      meta_row: 0,       // '총합/합계/소계' 키워드
      duplicate: 0,      // 중복 해시 (엑셀끼리)
      sms_already_exists: 0,  // 같은 거래의 SMS row 가 이미 있음 — Excel skip
    }
    let smsMatched = 0  // SMS 와 매칭되어 skip 한 건수 (사용자에게 알림)
    // 메타 행 키워드 — 정확 매칭만 (부분 포함 X)
    // 새 카드사가 새 패턴 만들면 여기 추가
    const META_KEYWORDS = /^(총합|합계|소계|총합계|총계|청구합계|청구금액|결제예정금액|결제예정|이월잔액|차월이월|전월이월|당월합계|월합계|연합계|기간합계|누계|잔액)$/
    const PARTIAL_META = /^총\s*\d+\s*건/  // "총 N건" 패턴
    // 유효한 날짜 형식 (Excel에서 들어올 가능성 있는 모든 포맷)
    const VALID_DATE = /^\d{4}[\-./]\d{1,2}[\-./]\d{1,2}([\sT]\d{1,2}:\d{2}(:\d{2})?)?$|^\d{1,2}[\-./]\d{1,2}\s+\d{2}:\d{2}/

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        // ── 검증 1: 날짜 ──────────────────────────────
        const rawDateField = row.date || row.transaction_date || ''
        const dateStr = String(rawDateField).trim()

        // 1-A) 날짜 비어있는 행 skip — 총합/메타 행
        if (!dateStr) {
          skipBreakdown.no_date++
          skipped++
          continue
        }
        // 1-B) "총 N건" 패턴 (날짜 컬럼에 메타 텍스트)
        if (dateStr.includes('총 ') || PARTIAL_META.test(dateStr)) {
          skipBreakdown.meta_row++
          skipped++
          continue
        }
        // 1-C) 날짜 형식 검증 — 정규식으로 사전 차단
        if (!VALID_DATE.test(dateStr)) {
          skipBreakdown.invalid_date++
          skipped++
          continue
        }

        // ── 검증 2: 메타 키워드 (모든 셀 전수검사, 정확 매칭) ──
        const rowValuesStr = Object.values(row).map((v: any) => String(v || '').trim())
        if (rowValuesStr.some(v => META_KEYWORDS.test(v) || PARTIAL_META.test(v))) {
          skipBreakdown.meta_row++
          skipped++
          continue
        }

        // ── 검증 3: 금액 ──────────────────────────────
        const deposit = Math.abs(Number(String(row.deposit || '0').replace(/[,\s원]/g, '')) || 0)
        const withdrawal = Math.abs(Number(String(row.withdrawal || '0').replace(/[,\s원]/g, '')) || 0)
        const amount = Number(row.amount || 0)
        if (deposit === 0 && withdrawal === 0 && amount === 0) {
          skipBreakdown.no_amount++
          skipped++
          continue
        }

        const finalAmount = deposit || withdrawal || Math.abs(amount)
        const txType = row.type || (deposit > 0 ? 'income' : 'expense')
        const description = row.description || row.memo || ''
        const rawDate = rawDateField
        // ★ 날짜 fallback NOW() 제거 — 정규화 실패 시 무조건 skip
        //   (이전엔 오늘 날짜로 fallback해서 메타 행이 오늘자 거래로 오염되던 버그)
        const txDate = normalizeDate(rawDate)
        if (!txDate || !/^\d{4}-\d{2}-\d{2}/.test(txDate)) {
          skipBreakdown.invalid_date++
          skipped++
          continue
        }

        // 중복 해시: 날짜+시분초 전체 + 금액 + 적요 + 거래처 (시분초 포함으로 정확도 향상)
        const clientName = row.counterpart || row.client_name || ''
        const hash = createHash('sha256')
          .update(`${rawDate}|${finalAmount}|${description}|${clientName}`)
          .digest('hex')
        const existingCount = existingHashCounts.get(hash) || 0
        const uploadCount = uploadHashCounts.get(hash) || 0
        uploadHashCounts.set(hash, uploadCount + 1)
        if (uploadCount < existingCount) {
          // DB에 이미 이 해시가 existingCount건 있고, 아직 그 수만큼 스킵 안 했으면 스킵
          skipBreakdown.duplicate++
          skipped++
          continue
        }

        // ── SMS ↔ Excel 중복 체크 ──
        //   같은 거래의 SMS transactions row 가 이미 있으면 Excel skip (SMS 우선)
        //   매칭 기준: imported_from='sms' + type 동일 + amount 동일 + ±3분
        try {
          const tsTarget = new Date(txDate).getTime()
          if (isFinite(tsTarget)) {
            const fromDt = new Date(tsTarget - 3 * 60000)
            const toDt = new Date(tsTarget + 3 * 60000)
            const smsMatch = await prisma.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM transactions
               WHERE deleted_at IS NULL
                 AND imported_from = 'sms'
                 AND type = ${txType}
                 AND amount = ${finalAmount}
                 AND transaction_date BETWEEN ${fromDt} AND ${toDt}
               LIMIT 2
            `
            // 정확히 1건이어야 dedup 인정 (모호하면 Excel insert 진행)
            if (smsMatch.length === 1) {
              skipBreakdown.sms_already_exists++
              smsMatched++
              skipped++
              continue
            }
          }
        } catch (e: any) {
          // dedup 실패해도 안전하게 INSERT 진행 (Cloud Run 일시 장애 보호)
          console.warn('[import] SMS dedup check fail:', e?.message)
        }

        const id = crypto.randomUUID()
        const resolvedClient = await resolveClientName(row.counterpart || row.client_name || '') || null

        // 업로드 시 자동 분류 시도 (client_name → description → 결합)
        let autoCategory: string | null = null
        const txTypeForClassify = txType as 'income' | 'expense'
        if (resolvedClient) {
          const r = classifyByRules(resolvedClient, txTypeForClassify)
          if (r && r.confidence >= 60) autoCategory = r.category
        }
        if (!autoCategory && description) {
          const r = classifyByRules(description, txTypeForClassify)
          if (r && r.confidence >= 60) autoCategory = r.category
        }
        if (!autoCategory && (resolvedClient || description)) {
          const combined = `${resolvedClient || ''} ${description}`.trim()
          const r = classifyByRules(combined, txTypeForClassify)
          if (r && r.confidence >= 60) autoCategory = r.category
        }

        const balanceAfter = row.balance != null ? Number(row.balance) || null : null

        // ★ Excel 카드 거래의 카드번호 끝 4자리 → raw_data.card_last4 저장
        //   추후 /api/finance/transactions/auto-match-card 에서 corporate_cards.card_number 와 매칭하여
        //   transactions.related_type='car', related_id=car_id 자동 할당
        let rawDataJson: string | null = null
        if (source === 'excel_card' && row.card_last4) {
          const last4 = String(row.card_last4).replace(/\D/g, '').slice(-4)
          if (last4.length === 4) {
            rawDataJson = JSON.stringify({ card_last4: last4 })
          }
        }

        await prisma.$executeRawUnsafe(
          `INSERT INTO transactions (id, transaction_date, type, amount, description, client_name, bank_name, card_company, imported_from, category, final_category, balance_after, raw_data, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          id,
          txDate,
          txType,
          finalAmount,
          description,
          resolvedClient,
          source === 'excel_bank' ? (row.bank_name || '기타은행') : null,
          source === 'excel_card' ? (row.card_company || null) : null,
          source,
          autoCategory,
          autoCategory,
          balanceAfter,
          rawDataJson,
        )
        inserted++
      } catch (err: any) {
        errors.push(`행 ${i + 1}: ${err.message}`)
        if (errors.length > 10) break
      }
    }

    // upload_batches에 기록
    if (batchId) {
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO upload_batches (id, file_name, uploaded_by, row_count, status, created_at)
           VALUES (?, ?, ?, ?, 'completed', NOW())
           ON DUPLICATE KEY UPDATE row_count = ?, status = 'completed'`,
          batchId,
          `${source}_import`,
          user.id,
          inserted,
          inserted,
        )
      } catch { /* 테이블 없을 수 있음 */ }
    }

    return NextResponse.json({
      data: {
        inserted,
        skipped,
        sms_matched: smsMatched,  // SMS 와 매칭되어 skip 한 건수 (정상 동작)
        skipBreakdown,  // { no_date, invalid_date, no_amount, meta_row, duplicate, sms_already_exists }
        errors: errors.slice(0, 5),
      },
      error: errors.length > 0 ? `${errors.length}건 오류 발생` : null,
    })
  } catch (e: any) {
    console.error('[POST /api/finance/transactions/import]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * DELETE /api/finance/transactions/import?source=excel_bank
 * 특정 소스의 거래 전체 삭제 (soft delete)
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const source = searchParams.get('source')
    if (!source || !['excel_bank', 'excel_card', 'sms'].includes(source)) {
      return NextResponse.json({ error: '올바른 source 필요 (excel_bank / excel_card / sms)' }, { status: 400 })
    }

    const result = await prisma.$executeRawUnsafe(
      `UPDATE transactions SET deleted_at = NOW() WHERE imported_from = ? AND deleted_at IS NULL`,
      source
    )

    return NextResponse.json({ ok: true, deleted: Number(result) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
