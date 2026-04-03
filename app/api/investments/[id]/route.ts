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

// GET /api/investments/[id]
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = params
    const data = await prisma.$queryRaw<any[]>`SELECT * FROM general_investments WHERE id = ${id} LIMIT 1`
    if (!data[0]) return NextResponse.json({ error: '투자를 찾을 수 없습니다' }, { status: 404 })
    return NextResponse.json({ data: serialize(data[0]), error: null })
  } catch (e: any) {
    console.error('[GET /api/investments/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/investments/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = params
    const body = await request.json()

    const fields = ['car_id', 'investor_name', 'invest_amount', 'interest_rate', 'payment_day', 'contract_start_date', 'contract_end_date', 'status']
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

    await prisma.$executeRawUnsafe(`UPDATE general_investments SET ${updates.join(', ')} WHERE id = ?`, ...values)
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[PATCH /api/investments/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/investments/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = params
    await prisma.$executeRaw`DELETE FROM general_investments WHERE id = ${id}`
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[DELETE /api/investments/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
