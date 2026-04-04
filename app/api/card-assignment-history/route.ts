import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const cardId = searchParams.get('card_id')

    let query = `SELECT * FROM card_assignment_history`
    if (cardId) {
      query += ` WHERE card_id = '${cardId}'`
    }
    query += ` ORDER BY created_at DESC LIMIT 500`

    const data = await prisma.$queryRaw<any[]>(query as any)
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { card_id, employee_id, assigned_from, assigned_to, reason } = body

    await prisma.$queryRaw`
      INSERT INTO card_assignment_history (id, card_id, employee_id, assigned_from, assigned_to, reason, assigned_by, created_at, updated_at)
      VALUES (UUID(), ${card_id}, ${employee_id}, ${assigned_from}, ${assigned_to}, ${reason}, ${user.id}, NOW(), NOW())
    `

    return NextResponse.json({ data: { id: 'success' }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
