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
    const status = searchParams.get('status') || 'pending'

    const data = await prisma.$queryRaw<any[]>`
      SELECT * FROM classification_queue
      WHERE status = ${status}
      ORDER BY created_at DESC
      LIMIT 500
    `
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
    const { transaction_id, amount, memo, status } = body

    await prisma.$queryRaw`
      INSERT INTO classification_queue (id, transaction_id, amount, memo, status, created_at, updated_at)
      VALUES (UUID(), ${transaction_id}, ${amount}, ${memo}, ${status || 'pending'}, NOW(), NOW())
    `

    return NextResponse.json({ data: { id: 'success' }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
