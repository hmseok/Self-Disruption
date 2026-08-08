import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════════
// GET /api/cars/[id]/overview — 차량 상세 4탭 데이터 (2026-08-03 재정리)
//   car(전체 컬럼) + 보험 계약 이력 + 대출 + 배차 이력(최근) + 장기계약
//   한 번에 — 상세 페이지 왕복 최소화.
// ═══════════════════════════════════════════════════════════════════
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const cars = await prisma.$queryRaw<any[]>`SELECT * FROM cars WHERE id = ${id} LIMIT 1`
    const car = cars[0]
    if (!car) return NextResponse.json({ error: '차량을 찾을 수 없습니다' }, { status: 404 })

    const carDigits = String(car.number || '').replace(/[^0-9]/g, '')

    const [insurance, loans, rentals, longterm] = await Promise.all([
      // 보험 계약 이력 (car_id 직접 + 차량 분담 매칭 모두)
      prisma.$queryRaw<any[]>`
        SELECT id, insurance_company, policy_number, start_date, end_date,
               coverage_own_damage, total_premium, premium, status,
               certificate_url, insurance_image_url
          FROM insurance_contracts
         WHERE car_id = ${id}
            OR id IN (SELECT contract_id FROM insurance_vehicle_allocations WHERE car_id = ${id})
         ORDER BY end_date DESC LIMIT 10`.catch(() => []),
      prisma.$queryRaw<any[]>`
        SELECT id, finance_name, type, total_amount, interest_rate, months,
               monthly_payment, start_date, end_date, status
          FROM loans WHERE car_id = ${id} ORDER BY start_date DESC LIMIT 5`.catch(() => []),
      carDigits
        // sql-fn-lint-allow: REGEXP_REPLACE — 운영 DB MySQL 8 (Cloud SQL)
        ? prisma.$queryRawUnsafe<any[]>(`
            SELECT id, customer_name, customer_car_number, insurance_company,
                   dispatch_date, actual_return_date, status
              FROM fmi_rentals
             WHERE REGEXP_REPLACE(COALESCE(vehicle_car_number,''),'[^0-9]','') = ?
             ORDER BY dispatch_date DESC LIMIT 20`, carDigits).catch(() => [])
        : Promise.resolve([]),
      carDigits
        // sql-fn-lint-allow: REGEXP_REPLACE — 운영 DB MySQL 8 (Cloud SQL)
        ? prisma.$queryRawUnsafe<any[]>(`
            SELECT id, customer_name, start_date, end_date, monthly_fee, status
              FROM long_term_rentals
             WHERE REGEXP_REPLACE(COALESCE(vehicle_car_number,''),'[^0-9]','') = ?
             ORDER BY start_date DESC LIMIT 5`, carDigits).catch(() => [])
        : Promise.resolve([]),
    ])

    // 지입료 누적 (빌려타 정산서 월렌트료 합, 2026-08-05)
    let consignmentCum: any = null
    if (carDigits) {
      try {
        // sql-fn-lint-allow: REGEXP_REPLACE — 운영 DB MySQL 8 (Cloud SQL)
        const fc = await prisma.$queryRawUnsafe<any[]>(`
          SELECT SUM(monthly_fee) total, COUNT(*) months, MIN(settle_month) mn, MAX(settle_month) mx
            FROM ride_settlement_fees
           WHERE REGEXP_REPLACE(vehicle_number,'[^0-9]','') = ?`, carDigits)
        if (fc[0] && Number(fc[0].total) > 0) {
          consignmentCum = { total: Number(fc[0].total), months: Number(fc[0].months), from: fc[0].mn, to: fc[0].mx }
        }
      } catch { /* 테이블 미생성 */ }
    }

    // 배차 통계 (전 기간)
    let rentalStats: any = null
    if (carDigits) {
      try {
        // sql-fn-lint-allow: REGEXP_REPLACE — 운영 DB MySQL 8 (Cloud SQL)
        const rs = await prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*) c, MIN(dispatch_date) first_d, MAX(dispatch_date) last_d
            FROM fmi_rentals
           WHERE REGEXP_REPLACE(COALESCE(vehicle_car_number,''),'[^0-9]','') = ?`, carDigits)
        rentalStats = { total: Number(rs[0]?.c || 0), first: rs[0]?.first_d, last: rs[0]?.last_d }
      } catch { /* 통계 없이 진행 */ }
    }

    return NextResponse.json({
      data: serialize({ car, insurance, loans, rentals, longterm, rentalStats, consignmentCum }),
      error: null,
    })
  } catch (e: any) {
    console.error('[GET /api/cars/[id]/overview]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
