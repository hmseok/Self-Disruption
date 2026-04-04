import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/insurance/[id]
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = params
    const data = await prisma.$queryRaw<any[]>`SELECT * FROM insurance_contracts WHERE id = ${id} LIMIT 1`
    if (!data[0]) return NextResponse.json({ error: '계약을 찾을 수 없습니다' }, { status: 404 })
    return NextResponse.json({ data: serialize(data[0]), error: null })
  } catch (e: any) {
    console.error('[GET /api/insurance/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/insurance/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = params
    const body = await request.json()

    const fields = ['car_id', 'company', 'start_date', 'end_date', 'total_premium', 'age_limit', 'driver_range']
    const updates: string[] = []
    const values: any[] = []

    for (const f of fields) {
      if (body[f] !== undefined) {
        updates.push(`${f} = ?`)
        values.push(body[f] || null)
      }
    }

    if (!updates.length) return NextResponse.json({ error: '없음' }, { status: 400 })

    updates.push('updated_at = NOW()')
    values.push(id)

    await prisma.$executeRawUnsafe(`UPDATE insurance_contracts SET ${updates.join(', ')} WHERE id = ?`, ...values)
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[PATCH /api/insurance/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/insurance/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = params
    await prisma.$executeRaw`DELETE FROM insurance_contracts WHERE id = ${id}`
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[DELETE /api/insurance/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
