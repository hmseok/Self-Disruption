import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/finance/transactions/unlink
 * 매칭 해제
 * Body: { transactionId: string, settlementId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { transactionId, settlementId } = body

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId 필요' }, { status: 400 })
    }

    // 거래 매칭 해제
    await prisma.$executeRawUnsafe(
      `UPDATE transactions SET related_type = NULL, related_id = NULL, updated_at = NOW() WHERE id = ?`,
      transactionId
    )

    // settlement_ledger에서도 tx_id 제거
    if (settlementId) {
      const ledger = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, matched_tx_ids FROM settlement_ledger WHERE id = ?`, settlementId
      )
      if (ledger.length > 0) {
        let ids: string[] = []
        try { ids = JSON.parse(ledger[0].matched_tx_ids || '[]') } catch { ids = [] }
        ids = ids.filter((id: string) => id !== transactionId)

        if (ids.length === 0) {
          await prisma.$executeRawUnsafe(
            `UPDATE settlement_ledger SET status = 'pending', matched_at = NULL, matched_tx_ids = NULL, paid_amount = NULL, updated_at = NOW() WHERE id = ?`,
            settlementId
          )
        } else {
          await prisma.$executeRawUnsafe(
            `UPDATE settlement_ledger SET matched_tx_ids = ?, updated_at = NOW() WHERE id = ?`,
            JSON.stringify(ids), settlementId
          )
        }
      }
    }

    return NextResponse.json({ data: { unlinked: true }, error: null })
  } catch (e: any) {
    console.error('[POST /api/finance/transactions/unlink]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
