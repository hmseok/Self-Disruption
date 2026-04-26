import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { createHash } from 'crypto'
import { resolveClientName } from '@/lib/client-name-aliases'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
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

    // 중복 검사용: 기존 거래의 해시 목록 가져오기
    const existingHashes = new Set<string>()
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT transaction_date, amount, description FROM transactions WHERE deleted_at IS NULL AND imported_from = ?`,
      source
    )
    for (const e of existing) {
      const hash = createHash('sha256')
        .update(`${e.transaction_date}|${Number(e.amount)}|${e.description || ''}`)
        .digest('hex')
      existingHashes.add(hash)
    }

    let inserted = 0
    let skipped = 0
    const errors: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const amount = Number(row.amount || 0)
        if (amount === 0 && !row.deposit && !row.withdrawal) {
          skipped++
          continue
        }

        const finalAmount = row.deposit ? Math.abs(Number(row.deposit)) : row.withdrawal ? Math.abs(Number(row.withdrawal)) : Math.abs(amount)
        const txType = row.type || (row.deposit ? 'income' : 'expense')
        const description = row.description || row.memo || ''
        const txDate = row.date || row.transaction_date || new Date().toISOString().slice(0, 10)

        // 중복 해시 체크
        const hash = createHash('sha256')
          .update(`${txDate}|${finalAmount}|${description}`)
          .digest('hex')
        if (existingHashes.has(hash)) {
          skipped++
          continue
        }
        existingHashes.add(hash)

        const id = crypto.randomUUID()
        await prisma.$executeRawUnsafe(
          `INSERT INTO transactions (id, transaction_date, type, amount, description, client_name, bank_name, card_company, imported_from, batch_id, balance_after, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          id,
          txDate,
          txType,
          finalAmount,
          description,
          await resolveClientName(row.counterpart || row.client_name || '') || null,
          source === 'excel_bank' ? (row.bank_name || '기타은행') : null,
          source === 'excel_card' ? (row.card_company || null) : null,
          source,
          batchId || null,
          row.balance != null ? Number(row.balance) : null,
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
