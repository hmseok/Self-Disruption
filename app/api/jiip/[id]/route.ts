import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/jiip/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params
    const data = await prisma.$queryRaw<any[]>`SELECT * FROM jiip_contracts WHERE id = ${id} LIMIT 1`
    if (!data[0]) return NextResponse.json({ error: 'JIIP 계약을 찾을 수 없습니다' }, { status: 404 })
    return NextResponse.json({ data: serialize(data[0]), error: null })
  } catch (e: any) {
    console.error('[GET /api/jiip/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/jiip/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params
    const body = await request.json()

    const fields = [
      'investor_name', 'investor_phone', 'investor_email', 'investor_address', 'investor_reg_number',
      'bank_name', 'account_number', 'account_holder',
      'invest_amount', 'share_ratio', 'admin_fee', 'payout_day',
      'contract_start_date', 'contract_end_date',
      'tax_type', 'status', 'memo', 'mortgage_setup',
      'car_id', 'signed_file_url',
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
    await prisma.$executeRawUnsafe(`UPDATE jiip_contracts SET ${updates.join(', ')} WHERE id = ?`, ...values)
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[PATCH /api/jiip/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/jiip/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params
    await prisma.$executeRaw`DELETE FROM jiip_contracts WHERE id = ${id}`
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[DELETE /api/jiip/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
