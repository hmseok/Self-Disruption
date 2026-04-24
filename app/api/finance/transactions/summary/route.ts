import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

/**
 * GET /api/finance/transactions/summary
 * 통장/카드 통합 페이지 상단 통계
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    // 전체 거래 통계
    const txStats = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN imported_from = 'excel_bank' OR bank_name IS NOT NULL THEN 1 ELSE 0 END) AS bank_count,
        SUM(CASE WHEN imported_from IN ('excel_card','sms') OR card_company IS NOT NULL THEN 1 ELSE 0 END) AS card_count,
        SUM(CASE WHEN related_type IS NOT NULL AND related_id IS NOT NULL THEN 1 ELSE 0 END) AS matched_count,
        SUM(CASE WHEN related_type IS NULL OR related_id IS NULL THEN 1 ELSE 0 END) AS unmatched_count,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
      FROM transactions
      WHERE deleted_at IS NULL
    `)

    // 정산 통계
    const settlementStats = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'matched' OR status = 'confirmed' OR status = 'paid' THEN 1 ELSE 0 END) AS linked_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS unlinked_count,
        COALESCE(SUM(due_amount), 0) AS total_amount
      FROM settlement_ledger
    `)

    // SMS 미연결 카드 거래 수
    const smsStats = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN card_id IS NOT NULL THEN 1 ELSE 0 END) AS linked,
        SUM(CASE WHEN card_id IS NULL THEN 1 ELSE 0 END) AS unlinked
      FROM card_sms_transactions
    `)

    const tx = txStats[0] || {}
    const st = settlementStats[0] || {}
    const sms = smsStats[0] || {}

    return NextResponse.json({
      data: serialize({
        transactions: {
          total: Number(tx.total || 0),
          bank: Number(tx.bank_count || 0),
          card: Number(tx.card_count || 0),
          matched: Number(tx.matched_count || 0),
          unmatched: Number(tx.unmatched_count || 0),
          totalIncome: Number(tx.total_income || 0),
          totalExpense: Number(tx.total_expense || 0),
        },
        settlement: {
          total: Number(st.total || 0),
          linked: Number(st.linked_count || 0),
          unlinked: Number(st.unlinked_count || 0),
          totalAmount: Number(st.total_amount || 0),
        },
        sms: {
          total: Number(sms.total || 0),
          linked: Number(sms.linked || 0),
          unlinked: Number(sms.unlinked || 0),
        },
      }),
      error: null,
    })
  } catch (e: any) {
    console.error('[GET /api/finance/transactions/summary]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
