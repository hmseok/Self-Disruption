import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/investments/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params
    const data = await prisma.$queryRaw<any[]>`SELECT * FROM general_investments WHERE id = ${id} LIMIT 1`
    if (!data[0]) return NextResponse.json({ error: '투자를 찾을 수 없습니다' }, { status: 404 })
    return NextResponse.json({ data: serialize(data[0]), error: null })
  } catch (e: any) {
    console.error('[GET /api/investments/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/investments/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params
    const body = await request.json()

    const fields = [
      'car_id', 'car_number',
      'investor_name', 'investor_phone', 'investor_email', 'investor_address', 'investor_reg_number',
      'bank_name', 'account_number', 'account_holder',
      'invest_amount', 'interest_rate', 'payment_day',
      'contract_start_date', 'contract_end_date',
      'tax_type', 'status', 'memo', 'grace_period_months',
    ]
    const updates: string[] = []
    const values: any[] = []

    for (const f of fields) {
      if (body[f] !== undefined) {
        // 화이트리스트 통과 필드만 컬럼명에 포함 — 백틱으로 이스케이프
        updates.push(`\`${f}\` = ?`)
        values.push(body[f] === '' ? null : body[f])
      }
    }

    if (!updates.length) return NextResponse.json({ error: '없음' }, { status: 400 })

    updates.push('`updated_at` = NOW()')
    values.push(id)

    await prisma.$executeRawUnsafe(`UPDATE general_investments SET ${updates.join(', ')} WHERE id = ?`, ...values)
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[PATCH /api/investments/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/investments/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params
    await prisma.$executeRaw`DELETE FROM general_investments WHERE id = ${id}`
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[DELETE /api/investments/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
