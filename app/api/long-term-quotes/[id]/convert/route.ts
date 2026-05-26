import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * POST /api/long-term-quotes/[id]/convert
 *   견적 → 장기렌트 계약 전환:
 *     1) long_term_rentals INSERT (status='contracted' or 'pending_delivery')
 *        - 신차구입 + 차량 미지정 → pending_delivery
 *        - 기존차량 또는 차량 지정 → contracted
 *     2) long_term_quotes UPDATE status='converted', converted_to_rental_id, converted_at
 *
 * PR-Q1 (2026-05-26)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
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
      SELECT * FROM long_term_quotes WHERE id = ${id} LIMIT 1`
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
    // 신차구입 + 차량 미지정 → pending_delivery / 그 외 → contracted
    const initStatus = (contractType === '신차구입' && !q.vehicle_id) ? 'pending_delivery' : 'contracted'

    // contract_no: 견적번호 있으면 그 값, 없으면 자동 ('LTR-' + 날짜 6자리 + 4자리)
    const contractNo = (q.quote_no as string) || `LTR-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`

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
        ${contractType}, ${q.vehicle_spec || null},
        NOW(), NOW()
      )`

    await prisma.$executeRaw`
      UPDATE long_term_quotes
         SET status = 'converted',
             converted_to_rental_id = ${rentalId},
             converted_at = NOW(),
             updated_at = NOW()
       WHERE id = ${id}`

    const rentalRows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM long_term_rentals WHERE id = ${rentalId} LIMIT 1`
    const quoteRows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM long_term_quotes WHERE id = ${id} LIMIT 1`

    return NextResponse.json({
      data: {
        rental: serialize(rentalRows[0] || null),
        quote: serialize(quoteRows[0] || null),
      },
      error: null,
    })
  } catch (e: unknown) {
    console.error('[long-term-quotes CONVERT]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}
