import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * /api/operations/dispatch-orders/[id]/confirm
 *
 * 배차 확정 — dispatch_order 의 상담/일정 입력값을 바탕으로 fmi_rentals 신규 row 생성.
 * 이미 fmi_rental_id 연결되어 있으면 status 만 'dispatched' 로 update.
 *
 * POST { vehicle_id?, customer_name?, customer_phone?, customer_car_number?,
 *        insurance_company?, insurance_claim_no?, dispatch_date?,
 *        daily_rate?, adjuster_name?, adjuster_phone? }
 *
 * 동작:
 *   1. dispatch_order 조회 + ride_accidents JOIN
 *   2. fmi_rental_id 있으면 → 기존 row update + status 'dispatched'
 *   3. 없으면 → fmi_rentals 신규 INSERT (vehicle_id 선택, NULL 가능)
 *   4. dispatch_order.fmi_rental_id 연결 + status='dispatched'
 *   5. ride_accidents.workflow_stage = 'dispatched' 로 PATCH (다른 세션 영역,
 *      안전을 위해 SQL 직접 X — TODO: 별도 PATCH 호출 검토)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const {
      vehicle_id,                   // cars.id (UUID, optional) — PR-E 차량 통합 후 cars 정본
      customer_name,
      customer_phone,
      customer_car_number,
      insurance_company,
      insurance_claim_no,
      dispatch_date,                // 'YYYY-MM-DD'
      expected_return_date,
      daily_rate,
      adjuster_name,
      adjuster_phone,
    } = body || {}

    // 1. dispatch_order 조회
    const orders = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT o.*,
              a.driver_name AS acc_driver_name,
              a.driver_phone AS acc_driver_phone,
              a.insurance_company AS acc_insurance_company,
              a.insurance_claim_no AS acc_claim_no
         FROM operations_dispatch_orders o
         LEFT JOIN ride_accidents a ON a.id = o.ride_accident_id
        WHERE o.id = ?
        LIMIT 1`,
      id,
    )

    if (orders.length === 0) {
      return NextResponse.json({ error: 'dispatch_order not found' }, { status: 404 })
    }

    const order = orders[0]

    // 기본값 — body 우선, 없으면 ride_accidents 값
    const finalCustomerName  = customer_name  || order.acc_driver_name  || null
    const finalCustomerPhone = customer_phone || order.acc_driver_phone || null
    const finalInsuranceCo   = insurance_company   || order.acc_insurance_company || null
    const finalClaimNo       = insurance_claim_no  || order.acc_claim_no || null
    const finalDispatchDate  = dispatch_date      || order.expected_dispatch_date || new Date().toISOString().slice(0, 10)
    const finalReturnDate    = expected_return_date || order.expected_return_date || null

    let fmiRentalId: string

    if (order.fmi_rental_id) {
      // 2. 기존 fmi_rental 연결 — update 만
      fmiRentalId = order.fmi_rental_id
      await prisma.$executeRawUnsafe(
        `UPDATE fmi_rentals
            SET status = 'dispatched',
                customer_name = COALESCE(?, customer_name),
                customer_phone = COALESCE(?, customer_phone),
                customer_car_number = COALESCE(?, customer_car_number),
                insurance_company = COALESCE(?, insurance_company),
                insurance_claim_no = COALESCE(?, insurance_claim_no),
                dispatch_date = COALESCE(?, dispatch_date),
                expected_return_date = COALESCE(?, expected_return_date),
                daily_rate = COALESCE(?, daily_rate),
                adjuster_name = COALESCE(?, adjuster_name),
                adjuster_phone = COALESCE(?, adjuster_phone),
                vehicle_id = COALESCE(?, vehicle_id),
                updated_at = NOW()
          WHERE id = ?`,
        finalCustomerName, finalCustomerPhone, customer_car_number || null,
        finalInsuranceCo, finalClaimNo,
        finalDispatchDate, finalReturnDate,
        daily_rate || null, adjuster_name || null, adjuster_phone || null,
        vehicle_id || null,
        fmiRentalId,
      )
    } else {
      // 3. 신규 fmi_rentals row 생성
      fmiRentalId = randomUUID()
      await prisma.$executeRawUnsafe(
        `INSERT INTO fmi_rentals
           (id, vehicle_id, customer_name, customer_phone, customer_car_number,
            insurance_company, insurance_claim_no, adjuster_name, adjuster_phone,
            dispatch_date, expected_return_date, daily_rate,
            status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?,
                 ?, ?, ?, ?,
                 ?, ?, ?,
                 'dispatched', NOW(), NOW())`,
        fmiRentalId,
        vehicle_id || null,
        finalCustomerName, finalCustomerPhone, customer_car_number || null,
        finalInsuranceCo, finalClaimNo,
        adjuster_name || null, adjuster_phone || null,
        finalDispatchDate, finalReturnDate, daily_rate || null,
      )
    }

    // 4. dispatch_order 연결 + status='dispatched'
    await prisma.$executeRawUnsafe(
      `UPDATE operations_dispatch_orders
          SET fmi_rental_id = ?,
              status = 'dispatched',
              updated_by = ?
        WHERE id = ?`,
      fmiRentalId,
      user.id || null,
      id,
    )

    // 5. PR-C2b-3 (2026-05-16) — 선택한 대기차량 cars.status = 'rented' (대기→배차중)
    //    차량 테이블 통합 (PR-E) 완료 후 vehicle_id 는 cars.id 정합.
    if (vehicle_id) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE cars SET status = 'rented', updated_at = NOW() WHERE id = ?`,
          vehicle_id,
        )
      } catch (e) {
        console.warn('[dispatch confirm] cars status update skipped:', (e as Error)?.message)
      }
    }

    // 6. (TODO) ride_accidents.workflow_stage = 'dispatched' 동기화
    //    Ride* 세션 책임 영역이라 직접 SQL 자제 — 별도 PATCH 호출이 안전
    //    현재는 dispatch_order.status 만으로 추적 가능 (LEFT JOIN 으로)

    return NextResponse.json({
      ok: true,
      dispatch_order_id: id,
      fmi_rental_id: fmiRentalId,
      ride_accident_id: order.ride_accident_id,
      vehicle_id: vehicle_id || null,
      mode: order.fmi_rental_id ? 'update' : 'create',
      message: `배차 확정 완료 — fmi_rental ${order.fmi_rental_id ? '갱신' : '신설'}`,
    })
  } catch (e: any) {
    console.error('[dispatch-orders confirm]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
