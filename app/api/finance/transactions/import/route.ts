import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { createHash } from 'crypto'
import { resolveClientName } from '@/lib/client-name-aliases'

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

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        // 합계행/메타행 필터 ("총 N건", 날짜가 아닌 값)
        const rawDateField = row.date || row.transaction_date || ''
        if (typeof rawDateField === 'string' && (rawDateField.includes('총 ') || rawDateField.includes('건'))) {
          continue // 합계행 스킵 (카운트 안 함)
        }

        const deposit = Math.abs(Number(String(row.deposit || '0').replace(/[,\s원]/g, '')) || 0)
        const withdrawal = Math.abs(Number(String(row.withdrawal || '0').replace(/[,\s원]/g, '')) || 0)
        const amount = Number(row.amount || 0)
        if (deposit === 0 && withdrawal === 0 && amount === 0) {
          skipped++
          continue
        }

        const finalAmount = deposit || withdrawal || Math.abs(amount)
        const txType = row.type || (deposit > 0 ? 'income' : 'expense')
        const description = row.description || row.memo || ''
        const rawDate = rawDateField
        const txDate = normalizeDate(rawDate) || new Date().toISOString().slice(0, 10)

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
          skipped++
          continue
        }

        const id = crypto.randomUUID()
        await prisma.$executeRawUnsafe(
          `INSERT INTO transactions (id, transaction_date, type, amount, description, client_name, bank_name, card_company, imported_from, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          id,
          txDate,
          txType,
          finalAmount,
          description,
          await resolveClientName(row.counterpart || row.client_name || '') || null,
          source === 'excel_bank' ? (row.bank_name || '기타은행') : null,
          source === 'excel_card' ? (row.card_company || null) : null,
          source,
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
      data: { inserted, skipped, errors: errors.slice(0, 5) },
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
