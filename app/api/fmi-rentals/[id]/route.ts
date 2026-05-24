import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET    /api/fmi-rentals/[id]   — 단건 조회
 * PATCH  /api/fmi-rentals/[id]   — 부분 수정 (허용 필드만)
 * DELETE /api/fmi-rentals/[id]   — 삭제 (차량 상태 복구 best-effort)
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

// PATCH로 업데이트 허용된 컬럼 화이트리스트 (SQL Injection 방지)
const ALLOWED_FIELDS = new Set([
  'customer_name', 'customer_phone', 'customer_car_number', 'customer_car_type',
  'vehicle_id', 'vehicle_car_number', 'vehicle_car_type',
  'insurance_company', 'insurance_claim_no', 'adjuster_name', 'adjuster_phone',
  'dispatch_date', 'dispatch_location', 'expected_return_date', 'actual_return_date',
  'rental_days', 'dispatch_mileage', 'return_mileage', 'driven_km',
  'daily_rate', 'total_rental_fee', 'additional_charges', 'deduction_amount', 'final_claim_amount',
  'return_condition', 'return_fuel_level', 'return_damage_yn', 'return_damage_memo',
  'status', 'handler_id', 'handler_name', 'dispatcher_name', 'notes', 'accident_id',
  // PR-O (2026-05-22) — 청구유형 / 부가세 추가청구
  'claim_type', 'vat_extra_billing', 'capital_company', 'fleet_group',
  // PR-N6 (2026-05-24) — 입고공장 / 생년월일 / 지급 추적
  'repair_factory', 'customer_birth', 'paid_amount', 'payment_status', 'payment_memo',
])
const DATE_FIELDS = new Set(['dispatch_date', 'expected_return_date', 'actual_return_date'])
const NUMBER_FIELDS = new Set([
  'rental_days', 'dispatch_mileage', 'return_mileage', 'driven_km',
  'daily_rate', 'total_rental_fee', 'additional_charges', 'deduction_amount', 'final_claim_amount',
  'paid_amount',
])

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    // PR-E3 (2026-05-16) 차량 통합: fmi_vehicles → cars
    // PR-N3b (2026-05-22) fleet_group 실컬럼 우선 (r.* 뒤 별칭이 우선 적용), 폴백 차량 ownership_type
    const rows = await prisma.$queryRaw<any[]>`
      SELECT r.*, COALESCE(r.fleet_group, v.ownership_type) AS fleet_group, v.status AS vehicle_status
      FROM fmi_rentals r
      LEFT JOIN cars v ON v.id = r.vehicle_id
      WHERE r.id = ${id}
      LIMIT 1
    `
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'not found', data: null }, { status: 404 })
    }
    return NextResponse.json({ data: serialize(rows[0]), error: null })
  } catch (e: any) {
    console.error('[fmi-rentals GET] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })
    const body = await request.json()

    // 현재 상태 로드 (차량 상태 동기화 판단용)
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id, vehicle_id, status FROM fmi_rentals WHERE id = ${id} LIMIT 1
    `
    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    const prev = existing[0]

    // 화이트리스트 필드만 UPDATE 구성
    const setFrags: string[] = []
    const values: any[] = []
    for (const [key, raw] of Object.entries(body)) {
      if (!ALLOWED_FIELDS.has(key)) continue
      let v: any = raw
      if (v === undefined) continue
      if (DATE_FIELDS.has(key)) v = toMySqlDt(v as any)
      else if (NUMBER_FIELDS.has(key)) v = v === null || v === '' ? null : Number(v)
      setFrags.push(`${key} = ?`)
      values.push(v)
    }
    if (setFrags.length === 0) {
      return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 })
    }
    setFrags.push('updated_at = NOW()')
    const sql = `UPDATE fmi_rentals SET ${setFrags.join(', ')} WHERE id = ?`
    values.push(id)
    await prisma.$executeRawUnsafe(sql, ...values)

    // 차량 상태 동기화 (best-effort)
    const newStatus = body.status ?? prev.status
    const newVehicleId = body.vehicle_id ?? prev.vehicle_id
    // PR-K (2026-05-16) 차량 통합: cars.status 실제값 = available / rented / returned
    try {
      if (newVehicleId && (newStatus === 'dispatched' || newStatus === 'claiming')) {
        await prisma.$executeRaw`UPDATE cars SET status = 'rented' WHERE id = ${newVehicleId}`
      } else if (newVehicleId && (newStatus === 'returned' || newStatus === 'settled')) {
        await prisma.$executeRaw`UPDATE cars SET status = 'returned' WHERE id = ${newVehicleId}`
      }
    } catch {}

    const updated = await prisma.$queryRaw<any[]>`
      SELECT * FROM fmi_rentals WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: serialize(updated[0] || null), error: null })
  } catch (e: any) {
    console.error('[fmi-rentals PATCH] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    // 차량 상태 복구용으로 vehicle_id 먼저 읽기
    const existing = await prisma.$queryRaw<any[]>`
      SELECT vehicle_id FROM fmi_rentals WHERE id = ${id} LIMIT 1
    `
    const vehicleId = existing[0]?.vehicle_id || null

    await prisma.$executeRaw`DELETE FROM fmi_rentals WHERE id = ${id}`

    if (vehicleId) {
      try {
        // PR-K (2026-05-16) 차량 통합: 대차건 삭제(배차 취소) 시 차량 cars.status='available' (대기 복귀)
        await prisma.$executeRaw`UPDATE cars SET status = 'available' WHERE id = ${vehicleId}`
      } catch {}
    }

    return NextResponse.json({ success: true, error: null })
  } catch (e: any) {
    console.error('[fmi-rentals DELETE] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
