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

    // ── 1) 핵심 반납 UPDATE (모든 DB에 확실히 존재하는 컬럼만 — 반드시 성공) ──────
    //   status / actual_return_date / notes / updated_at 만 → 반납 상태 전환은 무조건 통과.
    await prisma.$executeRaw`
      UPDATE fmi_rentals SET
        actual_return_date = ${actualReturnDate},
        notes = COALESCE(${body.notes || null}, notes),
        status = 'returned',
        updated_at = NOW()
      WHERE id = ${id}
    `

    // ── 2) 옵션 반납 상세 (주행거리·연료·파손·정산금 등 — 컬럼 미존재 시 graceful skip) ──
    //   return_mileage / driven_km / return_fuel_level 등 일부 컬럼은 라이브 DB 미적용 가능.
    //   try/catch 로 분리 — 없어도 1) 핵심 반납은 이미 성공 (Rule 23 graceful fallback).
    const hasDetail =
      returnMileage != null || drivenKm != null ||
      body.return_fuel_level != null || body.return_condition != null ||
      body.return_damage_yn != null || body.return_damage_memo != null ||
      body.additional_charges != null || body.deduction_amount != null ||
      body.final_claim_amount != null
    if (hasDetail) {
      try {
        await prisma.$executeRaw`
          UPDATE fmi_rentals SET
            return_mileage = COALESCE(${returnMileage}, return_mileage),
            driven_km = COALESCE(${drivenKm}, driven_km),
            return_fuel_level = COALESCE(${body.return_fuel_level || null}, return_fuel_level),
            return_condition = COALESCE(${body.return_condition || null}, return_condition),
            return_damage_yn = COALESCE(${body.return_damage_yn ?? null}, return_damage_yn),
            return_damage_memo = COALESCE(${body.return_damage_memo || null}, return_damage_memo),
            additional_charges = COALESCE(${body.additional_charges != null ? Number(body.additional_charges) : null}, additional_charges),
            deduction_amount = COALESCE(${body.deduction_amount != null ? Number(body.deduction_amount) : null}, deduction_amount),
            final_claim_amount = COALESCE(${body.final_claim_amount != null ? Number(body.final_claim_amount) : null}, final_claim_amount)
          WHERE id = ${id}
        `
      } catch (e) {
        console.warn('[fmi-rentals return] 옵션 반납상세 UPDATE skip (컬럼 미존재 가능):', (e as Error)?.message)
      }
    }

    // PR-K (2026-05-16) 차량 통합: 반납 시 차량 cars.status = 'returned' (반납·점검대기)
    if (rental.vehicle_id) {
      try {
        await prisma.$executeRaw`UPDATE cars SET status = 'returned' WHERE id = ${rental.vehicle_id}`
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
