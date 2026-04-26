import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════
// 거래 분리 API
//
// POST /api/finance/transactions/split
// 하나의 거래를 여러 건으로 분리
// 예: 15,000,000원 입금 → 10,000,000(투자금) + 5,000,000(보증금)
//
// Body: {
//   transactionId: string,
//   splits: [
//     { amount: number, description: string, client_name: string, category?: string },
//     { amount: number, description: string, client_name: string, category?: string },
//   ]
// }
// ═══════════════════════════════════════════════════════════

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { transactionId, splits } = await request.json()

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId 필수' }, { status: 400 })
    }
    if (!Array.isArray(splits) || splits.length < 2) {
      return NextResponse.json({ error: '최소 2건으로 분리해야 합니다' }, { status: 400 })
    }

    // 원본 거래 조회
    const origRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      transactionId
    )
    if (origRows.length === 0) {
      return NextResponse.json({ error: '원본 거래를 찾을 수 없습니다' }, { status: 404 })
    }
    const orig = origRows[0]

    // 분리 금액 합계 검증
    const totalSplit = splits.reduce((s: number, sp: any) => s + Math.abs(Number(sp.amount) || 0), 0)
    const origAmount = Math.abs(Number(orig.amount) || 0)
    if (Math.abs(totalSplit - origAmount) > 1) {
      return NextResponse.json({
        error: `분리 합계(${totalSplit.toLocaleString()})가 원본(${origAmount.toLocaleString()})과 일치하지 않습니다`,
      }, { status: 400 })
    }

    // 분리 거래 생성
    const newIds: string[] = []
    for (const sp of splits) {
      const newId = crypto.randomUUID()
      newIds.push(newId)

      await prisma.$executeRawUnsafe(
        `INSERT INTO transactions
         (id, transaction_date, type, amount, description, client_name,
          bank_name, card_company, imported_from, batch_id,
          related_type, related_id, category, status,
          split_from, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, NOW(), NOW())`,
        newId,
        orig.transaction_date,
        orig.type,
        Math.abs(Number(sp.amount)),
        sp.description || orig.description,
        sp.client_name || orig.client_name,
        orig.bank_name,
        orig.card_company,
        orig.imported_from,
        orig.batch_id,
        orig.related_type,
        orig.related_id,
        sp.category || orig.category,
        transactionId, // split_from
      )
    }

    // 원본 거래: soft delete + split_into 기록
    await prisma.$executeRawUnsafe(
      `UPDATE transactions SET deleted_at = NOW(), split_into = ? WHERE id = ?`,
      JSON.stringify(newIds),
      transactionId
    )

    return NextResponse.json(serialize({
      ok: true,
      originalId: transactionId,
      splits: newIds.map((id, i) => ({
        id,
        amount: splits[i].amount,
        description: splits[i].description,
        client_name: splits[i].client_name,
      })),
    }))
  } catch (e: any) {
    console.error('[POST /api/finance/transactions/split]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
