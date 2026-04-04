import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/cars/[id]
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = params
    const cars = await prisma.$queryRaw<any[]>`SELECT * FROM cars WHERE id = ${id} LIMIT 1`
    if (!cars[0]) return NextResponse.json({ error: '차량을 찾을 수 없습니다' }, { status: 404 })
    return NextResponse.json({ data: serialize(cars[0]), error: null })
  } catch (e: any) {
    console.error('[GET /api/cars/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/cars/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = params
    const body = await request.json()

    const fields = [
      'number', 'brand', 'model', 'trim', 'year', 'fuel', 'status', 'location',
      'mileage', 'purchase_price', 'acq_date', 'is_used', 'purchase_mileage',
      'registration_tax', 'bond_amount', 'delivery_fee', 'plate_fee', 'agency_fee',
      'other_initial_cost', 'initial_cost_memo', 'ownership_type', 'owner_name',
      'owner_phone', 'owner_bank', 'owner_account', 'owner_account_holder',
      'consignment_fee', 'consignment_start', 'consignment_end', 'insurance_by',
      'consignment_contract_url', 'owner_memo', 'is_commercial',
    ]

    const updates: string[] = []
    const values: any[] = []
    for (const field of fields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`)
        values.push(body[field] === '' ? null : body[field])
      }
    }

    if (updates.length === 0) return NextResponse.json({ error: '업데이트할 필드 없음' }, { status: 400 })

    updates.push('updated_at = NOW()')
    values.push(id)
    await prisma.$executeRawUnsafe(
      `UPDATE cars SET ${updates.join(', ')} WHERE id = ?`,
      ...values
    )

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM cars WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]), error: null })
  } catch (e: any) {
    console.error('[PATCH /api/cars/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/cars/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = params
    await prisma.$executeRaw`DELETE FROM cars WHERE id = ${id}`
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[DELETE /api/cars/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
