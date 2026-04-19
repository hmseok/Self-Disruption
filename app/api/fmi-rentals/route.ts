import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/fmi-rentals
 *   ?status=dispatched|returned|claiming|settled
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD     (dispatch_date range)
 *   ?fleet_group=마춤카|빌려타|부가세(캐피탈)|따봉   (vehicle.rental_company)
 *   ?q=차량번호/고객명 부분일치
 *   ?include_stats=1                   (status별 통계 동시 반환)
 *
 * 배반차 운영 대시보드용 조회 API
 * - fmi_rentals를 fmi_vehicles/fmi_accidents와 조인해서 표 한방에
 * - 지급/미지급/현장복귀 등 현재 스케줄 상태 1뎁스에서 조회
 */

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const fleetGroup = searchParams.get('fleet_group')
    const q = searchParams.get('q')
    const includeStats = searchParams.get('include_stats') === '1'
    const limit = Math.min(parseInt(searchParams.get('limit') || '500'), 2000)

    const wheres: string[] = []
    const params: any[] = []
    if (status) { wheres.push('r.status = ?'); params.push(status) }
    if (from) { wheres.push('r.dispatch_date >= ?'); params.push(from + ' 00:00:00') }
    if (to) { wheres.push('r.dispatch_date <= ?'); params.push(to + ' 23:59:59') }
    if (fleetGroup) { wheres.push('v.rental_company = ?'); params.push(fleetGroup) }
    if (q) {
      wheres.push('(r.customer_name LIKE ? OR r.customer_car_number LIKE ? OR r.vehicle_car_number LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }
    const whereClause = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         r.id, r.rental_no, r.customer_name, r.customer_phone,
         r.customer_car_number, r.customer_car_type,
         r.vehicle_car_number, r.vehicle_car_type,
         r.insurance_company, r.insurance_claim_no,
         r.adjuster_name, r.adjuster_phone,
         r.dispatch_date, r.expected_return_date, r.actual_return_date,
         r.rental_days, r.daily_rate, r.total_rental_fee, r.final_claim_amount,
         r.status, r.handler_name, r.dispatcher_name, r.notes,
         r.created_at, r.updated_at,
         v.rental_company AS fleet_group,
         v.status AS vehicle_status
       FROM fmi_rentals r
       LEFT JOIN fmi_vehicles v ON v.id = r.vehicle_id
       ${whereClause}
       ORDER BY r.dispatch_date DESC
       LIMIT ${limit}`,
      ...params
    )

    const data = rows.map((r: any) => ({
      ...r,
      daily_rate: r.daily_rate !== null ? Number(r.daily_rate) : null,
      total_rental_fee: r.total_rental_fee !== null ? Number(r.total_rental_fee) : null,
      final_claim_amount: r.final_claim_amount !== null ? Number(r.final_claim_amount) : null,
    }))

    let stats: any = null
    if (includeStats) {
      const statusCounts = await prisma.$queryRawUnsafe<any[]>(
        'SELECT status, COUNT(*) as cnt FROM fmi_rentals GROUP BY status'
      )
      const fleetCounts = await prisma.$queryRawUnsafe<any[]>(
        `SELECT v.rental_company, COUNT(*) as cnt
         FROM fmi_rentals r
         LEFT JOIN fmi_vehicles v ON v.id = r.vehicle_id
         GROUP BY v.rental_company`
      )
      const today = new Date().toISOString().slice(0, 10)
      const activeRentals = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as cnt FROM fmi_rentals
         WHERE actual_return_date IS NULL
           AND status IN ('dispatched', 'claiming')`
      )
      const overdueRentals = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as cnt FROM fmi_rentals
         WHERE actual_return_date IS NULL
           AND expected_return_date IS NOT NULL
           AND expected_return_date < ?
           AND status IN ('dispatched', 'claiming')`,
        today + ' 00:00:00'
      )

      stats = {
        total: data.length,
        by_status: statusCounts.map((s: any) => ({ status: s.status, count: Number(s.cnt) })),
        by_fleet: fleetCounts.map((f: any) => ({ fleet_group: f.rental_company || '(미지정)', count: Number(f.cnt) })),
        active: Number(activeRentals[0]?.cnt || 0),
        overdue: Number(overdueRentals[0]?.cnt || 0),
      }
    }

    return NextResponse.json({ data: serialize(data), stats, error: null })
  } catch (e: any) {
    console.error('[fmi-rentals GET] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
