import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/fmi-rentals/[id]/return
 *
 * 배반차 반납 처리 전용 엔드포인트
 * body (optional):
 *   return_mileage?: number          (차량 주행거리)
 *   return_fuel_level?: string       (연료 수준)
 *   return_condition?: string        (반납 상태)
 *   return_damage_yn?: 'Y' | 'N'     (파손 여부)
 *   return_damage_memo?: string      (파손 메모)
 *   actual_return_date?: string      (미지정 시 NOW())
 *   additional_charges?: number
 *   deduction_amount?: number
 *   final_claim_amount?: number
 *   notes?: string
 *
 * Side effects:
 *   - status = 'returned'
 *   - driven_km 자동 계산 (return_mileage - dispatch_mileage)
 *   - fmi_vehicles.status = 'available' (vehicle_id 있을 때)
 */
function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

function toMySqlDt(d: string | null | undefined): string | null {
  if (d === null || d === undefined || d === '') return null
  const s = String(d)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + ' 00:00:00'
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 19).replace('T', ' ')
  return s
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    let body: any = {}
    try { body = await request.json() } catch {}

    // 현재 rental 로드
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id, vehicle_id, dispatch_mileage, status FROM fmi_rentals WHERE id = ${id} LIMIT 1
    `
    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    const rental = existing[0]

    const actualReturnDate = toMySqlDt(body.actual_return_date) || new Date().toISOString().slice(0, 19).replace('T', ' ')
    const returnMileage = body.return_mileage != null ? Number(body.return_mileage) : null
    const dispatchMileage = rental.dispatch_mileage != null ? Number(rental.dispatch_mileage) : null
    const drivenKm = (returnMileage != null && dispatchMileage != null && returnMileage >= dispatchMileage)
      ? returnMileage - dispatchMileage
      : null

    await prisma.$executeRaw`
      UPDATE fmi_rentals SET
        actual_return_date = ${actualReturnDate},
        return_mileage = ${returnMileage},
        driven_km = ${drivenKm},
        return_fuel_level = ${body.return_fuel_level || null},
        return_condition = ${body.return_condition || null},
        return_damage_yn = ${body.return_damage_yn || null},
        return_damage_memo = ${body.return_damage_memo || null},
        additional_charges = ${body.additional_charges != null ? Number(body.additional_charges) : null},
        deduction_amount = ${body.deduction_amount != null ? Number(body.deduction_amount) : null},
        final_claim_amount = ${body.final_claim_amount != null ? Number(body.final_claim_amount) : null},
        notes = COALESCE(${body.notes || null}, notes),
        status = 'returned',
        updated_at = NOW()
      WHERE id = ${id}
    `

    // PR-E3 (2026-05-16) 차량 통합: 반납 시 차량 상태 cars.status = 'active' (대기)
    if (rental.vehicle_id) {
      try {
        await prisma.$executeRaw`UPDATE cars SET status = 'active' WHERE id = ${rental.vehicle_id}`
      } catch {}
    }

    const updated = await prisma.$queryRaw<any[]>`
      SELECT * FROM fmi_rentals WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ success: true, data: serialize(updated[0] || null), error: null })
  } catch (e: any) {
    console.error('[fmi-rentals return POST] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
