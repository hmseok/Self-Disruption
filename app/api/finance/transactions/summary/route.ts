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
        SUM(CASE WHEN imported_from LIKE 'excel_bank%' OR imported_from = 'sms_bank' THEN 1 ELSE 0 END) AS bank_count,
        SUM(CASE WHEN imported_from LIKE 'excel_card%' OR imported_from = 'sms' THEN 1 ELSE 0 END) AS card_count,
        SUM(CASE WHEN related_type IS NOT NULL AND related_id IS NOT NULL THEN 1 ELSE 0 END) AS matched_count,
        SUM(CASE WHEN related_type IS NULL OR related_id IS NULL THEN 1 ELSE 0 END) AS unmatched_count,
        SUM(CASE WHEN category IS NOT NULL AND category != '' AND category != '미분류' THEN 1 ELSE 0 END) AS classified_count,
        SUM(CASE WHEN category IS NULL OR category = '' OR category = '미분류' THEN 1 ELSE 0 END) AS unclassified_count,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
      FROM transactions
      WHERE deleted_at IS NULL
    `)

    // 카테고리별 통계 (분류 검수용)
    // 카테고리별 통계 — 사용자 원칙 (5차원 분리):
    //   카드 거래: 승인 / 취소 (취소는 지출 차감 — 수입 X)
    //   통장 거래: 수입 / 지출
    //   카드 취소는 sms_transaction_type='canceled' 로 식별 → effective type 강제 expense
    const categoryStats = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COALESCE(NULLIF(t.category, ''), '미분류') AS cat,
        CASE
          WHEN s.transaction_type = 'canceled' THEN 'expense'
          ELSE t.type
        END AS type,
        CASE
          WHEN t.imported_from = 'sms' OR t.imported_from LIKE 'excel_card%' OR t.imported_from LIKE 'pdf_card%' THEN 'card'
          ELSE 'bank'
        END AS source,
        COUNT(*) AS cnt,
        COALESCE(SUM(ABS(t.amount)), 0) AS total_amt,
        SUM(CASE WHEN s.transaction_type = 'canceled' THEN 1 ELSE 0 END) AS canceled_count,
        COALESCE(SUM(CASE WHEN s.transaction_type = 'canceled' THEN ABS(t.amount) ELSE 0 END), 0) AS canceled_amt,
        COALESCE(SUM(
          CASE WHEN s.transaction_type = 'canceled' THEN -ABS(t.amount) ELSE ABS(t.amount) END
        ), 0) AS net_amt
      FROM transactions t
      LEFT JOIN card_sms_transactions s
        ON s.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
      WHERE t.deleted_at IS NULL
      GROUP BY cat, type, source
      ORDER BY cnt DESC
    `)

    // 정산 통계 (테이블 없을 수 있음)
    let settlementStats: any[] = [{}]
    try {
      settlementStats = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'matched' OR status = 'confirmed' OR status = 'paid' THEN 1 ELSE 0 END) AS linked_count,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS unlinked_count,
          COALESCE(SUM(due_amount), 0) AS total_amount
        FROM settlement_ledger
      `)
    } catch { /* 테이블 미존재 시 무시 */ }

    // SMS 미연결 카드 거래 수 (테이블 없을 수 있음)
    let smsStats: any[] = [{}]
    try {
      smsStats = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN card_id IS NOT NULL THEN 1 ELSE 0 END) AS linked,
          SUM(CASE WHEN card_id IS NULL THEN 1 ELSE 0 END) AS unlinked
        FROM card_sms_transactions
      `)
    } catch { /* 테이블 미존재 시 무시 */ }

    const tx = txStats[0] || {}
    const st = settlementStats[0] || {}
    const sms = smsStats[0] || {}

    // 카테고리별 집계 변환 — source (card/bank) + canceled 정보 포함
    const categoryBreakdown = (categoryStats || []).map((row: any) => ({
      category: row.cat,
      type: row.type,
      source: row.source,        // 'card' | 'bank'
      count: Number(row.cnt || 0),
      totalAmount: Number(row.total_amt || 0),
      canceledCount: Number(row.canceled_count || 0),
      canceledAmount: Number(row.canceled_amt || 0),
      netAmount: Number(row.net_amt || 0),  // canceled 차감 순합산
    }))

    return NextResponse.json({
      data: serialize({
        transactions: {
          total: Number(tx.total || 0),
          bank: Number(tx.bank_count || 0),
          card: Number(tx.card_count || 0),
          matched: Number(tx.matched_count || 0),
          unmatched: Number(tx.unmatched_count || 0),
          classified: Number(tx.classified_count || 0),
          unclassified: Number(tx.unclassified_count || 0),
          totalIncome: Number(tx.total_income || 0),
          totalExpense: Number(tx.total_expense || 0),
        },
        categoryBreakdown,
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
