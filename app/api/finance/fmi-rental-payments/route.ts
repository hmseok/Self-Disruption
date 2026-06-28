import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/finance/fmi-rental-payments
 *
 * 사고대차(fmi_rentals) 건별 대차료 입금현황.
 *   - 입금 = transactions(related_type='fmi_rental', type='income') 매칭분 합계
 *   - 청구액(final_claim_amount)은 import 미포함이라 대부분 NULL → 「입금확인/미입금」 중심
 *
 * status: paid(청구액 있고 입금≥청구) / received(입금만 있음) / unpaid(매칭 입금 없음)
 *
 * query: ?status=all|paid|unpaid  ?q=검색  ?limit=2000
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const url = new URL(request.url)
    const statusFilter = url.searchParams.get('status') || 'all'
    const q = (url.searchParams.get('q') || '').trim()
    const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get('limit')) || 2000))

    // 대차건 + 매칭 입금 집계 (LEFT JOIN — 미입금도 포함)
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT r.id, r.dispatch_date, r.vehicle_car_number, r.customer_car_number,
              r.customer_name, r.insurance_company, r.final_claim_amount AS claim_amount,
              r.status AS rental_status,
              COALESCE(p.paid_amount, 0) AS paid_amount, p.paid_date, COALESCE(p.paid_count, 0) AS paid_count
         FROM fmi_rentals r
         LEFT JOIN (
           SELECT t.related_id, SUM(t.amount) AS paid_amount, MAX(t.transaction_date) AS paid_date, COUNT(*) AS paid_count
             FROM transactions t
            WHERE t.related_type = 'fmi_rental' AND t.type = 'income' AND t.deleted_at IS NULL
            GROUP BY t.related_id
         ) p ON p.related_id = r.id
        WHERE r.fleet_group = '빌려타'
          ${q ? `AND (r.customer_name LIKE ? OR r.customer_car_number LIKE ? OR r.vehicle_car_number LIKE ? OR r.insurance_company LIKE ?)` : ''}
        ORDER BY (COALESCE(p.paid_amount,0) > 0) ASC, r.dispatch_date DESC
        LIMIT ${limit}`,
      ...(q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : []),
    )

    const list = rows.map((r) => {
      const paid = Number(r.paid_amount || 0)
      const claim = r.claim_amount != null ? Number(r.claim_amount) : null
      let status: 'paid' | 'received' | 'unpaid' = 'unpaid'
      if (paid > 0) status = (claim && paid >= claim) ? 'paid' : 'received'
      return {
        id: r.id,
        dispatch_date: r.dispatch_date,
        vehicle_car_number: r.vehicle_car_number,
        customer_car_number: r.customer_car_number,
        customer_name: r.customer_name,
        insurance_company: r.insurance_company,
        claim_amount: claim,
        paid_amount: paid,
        paid_date: r.paid_date,
        paid_count: Number(r.paid_count || 0),
        status,
      }
    })

    const filtered = statusFilter === 'paid' ? list.filter((x) => x.status !== 'unpaid')
      : statusFilter === 'unpaid' ? list.filter((x) => x.status === 'unpaid')
      : list

    const summary = {
      total: list.length,
      paid_count: list.filter((x) => x.status !== 'unpaid').length,
      unpaid_count: list.filter((x) => x.status === 'unpaid').length,
      paid_sum: list.reduce((s, x) => s + (x.status !== 'unpaid' ? x.paid_amount : 0), 0),
    }

    return NextResponse.json({ data: filtered, summary, error: null })
  } catch (e: any) {
    console.error('[fmi-rental-payments GET]', e)
    return NextResponse.json({ error: e.message, data: [], summary: null }, { status: 500 })
  }
}
