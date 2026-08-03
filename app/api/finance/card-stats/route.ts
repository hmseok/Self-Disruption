import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════════
// GET /api/finance/card-stats — 카드관리 페이지 (2026-08-03 장부에서 분리)
//   카드 끝4자리 기준 지출 집계: 이번달/지난달/최근6개월 합계·건수,
//   차량 귀속 건수, 마지막 사용일. (excel_card 명세서 + sms 승인)
// ═══════════════════════════════════════════════════════════════════
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const rows = await prisma.$queryRaw<any[]>`
      SELECT c4,
             SUM(CASE WHEN DATE_FORMAT(transaction_date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m') THEN amount ELSE 0 END) AS this_month,
             SUM(CASE WHEN DATE_FORMAT(transaction_date,'%Y-%m') = DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH),'%Y-%m') THEN amount ELSE 0 END) AS last_month,
             SUM(amount) AS six_month,
             COUNT(*) AS cnt,
             SUM(car_assigned) AS car_assigned,
             MAX(transaction_date) AS last_used
        FROM (
          SELECT t.id, t.transaction_date, t.amount,
                 COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.raw_data,'$.card_last4')), t.account_last4) AS c4,
                 EXISTS(SELECT 1 FROM transaction_assignments ta
                         WHERE ta.transaction_id = t.id AND ta.assignment_type='car') AS car_assigned
            FROM transactions t
           WHERE t.deleted_at IS NULL AND t.type='expense'
             AND t.imported_from IN ('excel_card','sms')
             AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        ) x
       WHERE c4 IS NOT NULL
       GROUP BY c4`

    const stats: Record<string, any> = {}
    for (const r of rows) {
      stats[r.c4] = {
        this_month: Number(r.this_month || 0),
        last_month: Number(r.last_month || 0),
        six_month: Number(r.six_month || 0),
        count: Number(r.cnt || 0),
        car_assigned: Number(r.car_assigned || 0),
        last_used: r.last_used,
      }
    }
    return NextResponse.json({ data: stats, error: null })
  } catch (e: any) {
    console.error('[GET /api/finance/card-stats]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
