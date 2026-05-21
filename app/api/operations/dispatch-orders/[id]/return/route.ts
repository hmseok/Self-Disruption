import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * /api/operations/dispatch-orders/[id]/return — PR-C5 (2026-05-16)
 *
 * 회차/반납 처리 — 출고된 차량을 회수 + 청구 단계로 이동.
 * 출고 처리(release)와 대칭 구조.
 *
 * POST { return_mileage?, return_photos?: string[], return_memo?,
 *        return_damage_yn?, actual_return_date? }
 *
 * 동작:
 *   1. dispatch_order 조회 → fmi_rental_id 확인
 *   2. fmi_rentals UPDATE — return_mileage / return_photos(JSON) / return_damage_memo
 *      / return_damage_yn / actual_return_date / driven_km(자동계산) + status='returned'
 *   3. dispatch_order.status = 'done' (회차 완료 → 청구관리 탭 영역)
 *   4. cars.status = 'active' (배차중 → 대기 복귀)
 *
 * 사진은 클라이언트가 /api/upload (GCS) 로 먼저 올린 뒤 URL 배열로 전달.
 *
 * 모듈 책임 (CLAUDE.md Rule 21): operations 자기 모듈.
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
    const returnMileage =
      body.return_mileage != null && body.return_mileage !== ''
        ? Number(body.return_mileage)
        : null
    const returnPhotos: string[] = Array.isArray(body.return_photos)
      ? body.return_photos.filter((u: unknown) => typeof u === 'string' && u)
      : []
    const returnMemo: string | null = body.return_memo || null
    const returnDamageYn: boolean = body.return_damage_yn === true
    const actualReturnDate: string =
      body.actual_return_date || new Date().toISOString().slice(0, 10)

    // 1. dispatch_order 조회
    const orders = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT id, fmi_rental_id, status FROM operations_dispatch_orders WHERE id = ? LIMIT 1`,
      id,
    )
    if (orders.length === 0) {
      return NextResponse.json({ error: 'dispatch_order not found' }, { status: 404 })
    }
    const order = orders[0]
    if (!order.fmi_rental_id) {
      return NextResponse.json(
        { error: '배차 확정(fmi_rental 연결)이 먼저 필요합니다' },
        { status: 409 },
      )
    }

    // 출고 주행거리 조회 — driven_km 자동 계산용
    const rentals = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT id, vehicle_id, dispatch_mileage FROM fmi_rentals WHERE id = ? LIMIT 1`,
      order.fmi_rental_id,
    )
    const rental = rentals[0] || {}
    const dispatchMileage =
      rental.dispatch_mileage != null ? Number(rental.dispatch_mileage) : null
    const drivenKm =
      returnMileage != null && dispatchMileage != null && returnMileage >= dispatchMileage
        ? returnMileage - dispatchMileage
        : null

    // 2. fmi_rentals 반납 정보 UPDATE
    await prisma.$executeRawUnsafe(
      `UPDATE fmi_rentals
          SET return_mileage   = COALESCE(?, return_mileage),
              return_photos    = ?,
              return_damage_memo = COALESCE(?, return_damage_memo),
              return_damage_yn = ?,
              actual_return_date = ?,
              driven_km        = COALESCE(?, driven_km),
              status = 'returned',
              updated_at = NOW()
        WHERE id = ?`,
      returnMileage,
      JSON.stringify(returnPhotos),
      returnMemo,
      returnDamageYn ? 1 : 0,
      actualReturnDate,
      drivenKm,
      order.fmi_rental_id,
    )

    // 3. dispatch_order.status = 'done' (회차 완료 → 청구관리 영역)
    await prisma.$executeRawUnsafe(
      `UPDATE operations_dispatch_orders
          SET status = 'done', updated_by = ?
        WHERE id = ?`,
      user.id || null,
      id,
    )

    // 4. cars.status = 'active' (배차중 → 대기 복귀)
    if (rental.vehicle_id) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE cars SET status = 'active', updated_at = NOW() WHERE id = ?`,
          rental.vehicle_id,
        )
      } catch (e) {
        console.warn('[dispatch return] cars status update skipped:', (e as Error)?.message)
      }
    }

    return NextResponse.json({
      ok: true,
      dispatch_order_id: id,
      fmi_rental_id: order.fmi_rental_id,
      driven_km: drivenKm,
      photo_count: returnPhotos.length,
      message: `회차 처리 완료 — 주행 ${drivenKm ?? '-'}km / 사진 ${returnPhotos.length}장`,
    })
  } catch (e: any) {
    console.error('[dispatch-orders return]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
