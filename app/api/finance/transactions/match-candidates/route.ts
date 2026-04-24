import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

/**
 * GET /api/finance/transactions/match-candidates?txId=xxx
 *   또는 ?settlementId=xxx
 * 특정 거래(또는 정산)의 매칭 후보 조회
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const txId = searchParams.get('txId')
    const settlementId = searchParams.get('settlementId')

    if (!txId && !settlementId) {
      return NextResponse.json({ error: 'txId 또는 settlementId 필요' }, { status: 400 })
    }

    // 거래 기준 → 정산/계약 후보 찾기
    if (txId) {
      const txRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL`, txId
      )
      if (txRows.length === 0) {
        return NextResponse.json({ error: '거래를 찾을 수 없습니다' }, { status: 404 })
      }
      const tx = txRows[0]
      const amount = Math.abs(Number(tx.amount || 0))
      const tolerance = Math.max(1000, Math.floor(amount * 0.10))

      // 정산 후보
      const settlements = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM settlement_ledger WHERE status = 'pending' AND ABS(due_amount - ?) <= ? ORDER BY settlement_month DESC LIMIT 20`,
        amount, tolerance
      )

      return NextResponse.json({
        data: serialize({
          transaction: tx,
          candidates: settlements.map((s: any) => ({
            ...s,
            matchType: 'settlement',
            score: calcSimpleScore(amount, Number(s.due_amount), tx.client_name, s.recipient_name),
          })),
        }),
        error: null,
      })
    }

    // 정산 기준 → 거래 후보 찾기
    if (settlementId) {
      const sRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM settlement_ledger WHERE id = ?`, settlementId
      )
      if (sRows.length === 0) {
        return NextResponse.json({ error: '정산 항목을 찾을 수 없습니다' }, { status: 404 })
      }
      const s = sRows[0]
      const due = Math.abs(Number(s.due_amount || 0))
      const tolerance = Math.max(1000, Math.floor(due * 0.10))

      const candidates = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM transactions
         WHERE deleted_at IS NULL AND (related_type IS NULL OR related_id IS NULL)
           AND ABS(amount - ?) <= ?
         ORDER BY transaction_date DESC LIMIT 30`,
        due, tolerance
      )

      return NextResponse.json({
        data: serialize({
          settlement: s,
          candidates: candidates.map((tx: any) => ({
            ...tx,
            matchType: 'transaction',
            score: calcSimpleScore(Number(tx.amount), due, tx.client_name, s.recipient_name),
          })),
        }),
        error: null,
      })
    }

    return NextResponse.json({ data: null, error: null })
  } catch (e: any) {
    console.error('[GET /api/finance/transactions/match-candidates]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function calcSimpleScore(amount1: number, amount2: number, name1?: string, name2?: string): number {
  const amtDiff = Math.abs(amount1 - amount2) / Math.max(amount1, amount2, 1)
  const amtScore = amtDiff === 0 ? 1 : amtDiff <= 0.01 ? 0.9 : amtDiff <= 0.05 ? 0.7 : amtDiff <= 0.10 ? 0.3 : 0

  let nameScore = 0
  if (name1 && name2) {
    const a = (name1 || '').replace(/\s/g, '').toLowerCase()
    const b = (name2 || '').replace(/\s/g, '').toLowerCase()
    if (a === b) nameScore = 1
    else if (a.includes(b) || b.includes(a)) nameScore = 0.7
  }

  return Math.round((amtScore * 0.6 + nameScore * 0.4) * 100)
}
