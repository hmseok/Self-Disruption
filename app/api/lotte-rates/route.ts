import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl

    let data: any[]
    data = await prisma.$queryRaw<any[]>`SELECT * FROM lotte_rentcar_db ORDER BY created_at DESC`

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

    const fields = Object.keys(body).filter(k => body[k] !== undefined)
    const placeholders = fields.map(() => '?').join(', ')

    await prisma.$executeRawUnsafe(
      `INSERT INTO lotte_rentcar_db (${fields.join(', ')}) VALUES (${placeholders})`,
      ...fields.map(f => body[f])
    )

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM lotte_rentcar_db ORDER BY id DESC LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
