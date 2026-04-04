import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = params
    const data = await prisma.$queryRaw<any[]>`SELECT * FROM quotes WHERE id = ${id} LIMIT 1`

    if (!data || data.length === 0) {
      return NextResponse.json({ data: null, error: '견적을 찾을 수 없습니다.' }, { status: 404 })
    }

    // Fetch quote_detail if exists
    let quote = serialize(data[0])
    const details = await prisma.$queryRaw<any[]>`SELECT * FROM quote_detail WHERE quote_id = ${id} LIMIT 1`
    if (details && details.length > 0) {
      quote.quote_detail = serialize(details[0])
    }

    return NextResponse.json({ data: quote, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = params
    const body = await request.json()

    const fields = Object.keys(body).filter(k => k !== 'id' && k !== 'company_id')
    if (fields.length === 0) {
      return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 })
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ')
    const vals = fields.map(f => body[f])

    await prisma.$executeRawUnsafe(
      `UPDATE quotes SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      ...vals,
      id
    )

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM quotes WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = params
    await prisma.$executeRaw`DELETE FROM quotes WHERE id = ${id}`

    return NextResponse.json({ data: null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
