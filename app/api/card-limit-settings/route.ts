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

    const data = await prisma.$queryRaw<any[]>`
      SELECT * FROM card_limit_settings
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
    const { type, key, monthly_limit } = body

    await prisma.$queryRaw`
      INSERT INTO card_limit_settings (id, type, key, monthly_limit, created_at, updated_at)
      VALUES (UUID(), ${type}, ${key}, ${monthly_limit}, NOW(), NOW())
      ON DUPLICATE KEY UPDATE monthly_limit = ${monthly_limit}, updated_at = NOW()
    `

    return NextResponse.json({ data: { id: 'success' }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
