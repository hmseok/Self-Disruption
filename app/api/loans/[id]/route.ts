import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch { return null }
}

async function verifyUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    const token = authHeader.replace('Bearer ', '')
    const userId = getUserIdFromToken(token)
    if (!userId) return null
    const profiles = await prisma.$queryRaw<any[]>`SELECT id, role, company_id FROM profiles WHERE id = ${userId} LIMIT 1`
    const profile = profiles[0]
    return profile ? { id: userId, ...profile } : null
  } catch { return null }
}

// GET /api/loans/[id]
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = params
    const loans = await prisma.$queryRaw<any[]>`
      SELECT l.*, c.number as car_number, c.brand as car_brand, c.model as car_model
      FROM loans l LEFT JOIN cars c ON l.car_id = c.id
      WHERE l.id = ${id} LIMIT 1
    `
    if (!loans[0]) return NextResponse.json({ error: '대출 정보를 찾을 수 없습니다' }, { status: 404 })
    return NextResponse.json({ data: serialize(loans[0]), error: null })
  } catch (e: any) {
    console.error('[GET /api/loans/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/loans/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = params
    await prisma.$executeRaw`DELETE FROM loans WHERE id = ${id}`
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[DELETE /api/loans/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/loans/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = params
    const body = await request.json()

    const fields = [
      'finance_name', 'type', 'total_amount', 'monthly_payment', 'payment_date', 'start_date', 'end_date',
      'car_id', 'interest_rate', 'months', 'vehicle_price', 'acquisition_tax', 'deposit',
      'first_payment', 'first_payment_date', 'guarantor_name', 'guarantor_limit',
      'quote_number', 'quote_date', 'valid_date', 'dealer_name', 'dealer_location',
      'discount_amount', 'sale_price', 'option_amount', 'advance_rate', 'grace_rate',
      'grace_amount', 'bond_cost', 'misc_fees', 'stamp_duty', 'customer_initial_payment',
      'displacement', 'fuel_type', 'attachments',
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
    await prisma.$executeRawUnsafe(`UPDATE loans SET ${updates.join(', ')} WHERE id = ?`, ...values)
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[PATCH /api/loans/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
