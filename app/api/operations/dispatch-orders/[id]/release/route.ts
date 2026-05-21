import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * /api/operations/dispatch-orders/[id]/release — PR-C3 (2026-05-16)
 *
 * 출고 처리 — 배차 확정된 dispatch_order 의 차량을 실제 출고.
 *
 * 사용자 명시 (2026-05-16):
 *   「출고시에는 차량사진들과 특이사항메모가 꼭필요하고」
 *
 * POST { dispatch_mileage?, dispatch_photos?: string[], dispatch_memo? }
 *
 * 동작:
 *   1. dispatch_order 조회 → fmi_rental_id 확인 (없으면 배차 확정 먼저)
 *   2. fmi_rentals UPDATE — dispatch_mileage / dispatch_photos(JSON) / dispatch_memo
 *      + status='dispatched'
 *   3. dispatch_order.status = 'dispatched'
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
    const dispatchMileage =
      body.dispatch_mileage != null && body.dispatch_mileage !== ''
        ? Number(body.dispatch_mileage)
        : null
    const dispatchPhotos: string[] = Array.isArray(body.dispatch_photos)
      ? body.dispatch_photos.filter((u: unknown) => typeof u === 'string' && u)
      : []
    const dispatchMemo: string | null = body.dispatch_memo || null

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

    // 2. fmi_rentals 출고 정보 UPDATE
    //    dispatch_photos 는 JSON 컬럼 — JSON 문자열로 저장
    await prisma.$executeRawUnsafe(
      `UPDATE fmi_rentals
          SET dispatch_mileage = COALESCE(?, dispatch_mileage),
              dispatch_photos  = ?,
              dispatch_memo    = COALESCE(?, dispatch_memo),
              status = 'dispatched',
              updated_at = NOW()
        WHERE id = ?`,
      dispatchMileage,
      JSON.stringify(dispatchPhotos),
      dispatchMemo,
      order.fmi_rental_id,
    )

    // 3. dispatch_order.status = 'dispatched'
    await prisma.$executeRawUnsafe(
      `UPDATE operations_dispatch_orders
          SET status = 'dispatched', updated_by = ?
        WHERE id = ?`,
      user.id || null,
      id,
    )

    return NextResponse.json({
      ok: true,
      dispatch_order_id: id,
      fmi_rental_id: order.fmi_rental_id,
      photo_count: dispatchPhotos.length,
      message: `출고 처리 완료 — 사진 ${dispatchPhotos.length}장`,
    })
  } catch (e: any) {
    console.error('[dispatch-orders release]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
