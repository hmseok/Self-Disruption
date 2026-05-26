import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * POST /api/lt-quotes/[id]/convert
 *   견적 → 장기렌트 계약 전환:
 *     1) long_term_rentals INSERT
 *        - 신차구입 + 차량 미지정 → pending_delivery
 *        - 그 외 → contracted
 *     2) lt_quotes UPDATE status='converted', converted_to_rental_id, converted_at
 *
 * PR-Q2-4 (2026-05-26)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? Number(v) : v)))
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

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM lt_quotes WHERE id = ${id} LIMIT 1`
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    const q = rows[0]
    if (q.status === 'converted' && q.converted_to_rental_id) {
      return NextResponse.json({
        error: '이미 계약 전환된 견적입니다',
        converted_to_rental_id: q.converted_to_rental_id,
      }, { status: 409 })
    }

    const rentalId: string = crypto.randomUUID()
    const contractType = (q.contract_type as string) || '기존차량'
    const initStatus = (contractType === '신차구입' && !q.vehicle_id) ? 'pending_delivery' : 'contracted'
    const contractNo = (q.quote_no as string) ||
      `LTR-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`

    // 차량 스펙은 vehicle_brand + vehicle_model + vehicle_trim 합성
    const vehicleSpec = q.vehicle_id
      ? null  // 기존차량은 vehicle_id 있으므로 spec 불필요
      : [q.vehicle_brand, q.vehicle_model, q.vehicle_trim].filter(Boolean).join(' ') || null

    await prisma.$executeRaw`
      INSERT INTO long_term_rentals (
        id, vehicle_id, vehicle_car_number, customer_name, customer_phone,
        contract_no, start_date, end_date, monthly_fee, deposit, status, notes,
        contract_type, vehicle_spec,
        created_at, updated_at
      ) VALUES (
        ${rentalId}, ${q.vehicle_id || null}, ${q.vehicle_car_number || null},
        ${q.customer_name}, ${q.customer_phone || null},
        ${contractNo}, ${q.start_date || null}, ${q.end_date || null},
        ${q.monthly_fee || null}, ${q.deposit || null}, ${initStatus}, ${q.memo || null},
        ${contractType}, ${vehicleSpec},
        NOW(), NOW()
      )`

    await prisma.$executeRaw`
      UPDATE lt_quotes
         SET status = 'converted',
             converted_to_rental_id = ${rentalId},
             converted_at = NOW(),
             updated_at = NOW()
       WHERE id = ${id}`

    const rentalRows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM long_term_rentals WHERE id = ${rentalId} LIMIT 1`
    const quoteRows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM lt_quotes WHERE id = ${id} LIMIT 1`

    return NextResponse.json({
      data: {
        rental: serialize(rentalRows[0] || null),
        quote: serialize(quoteRows[0] || null),
      },
      error: null,
    })
  } catch (e: unknown) {
    console.error('[lt-quotes CONVERT]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}
