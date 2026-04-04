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
    const carId = searchParams.get('car_id')
    const id = searchParams.get('id')

    let data: any[]
    if (id) {
      data = await prisma.$queryRaw<any[]>`SELECT * FROM pricing_worksheets WHERE id = ${id} LIMIT 1`
    } else if (carId) {
      data = await prisma.$queryRaw<any[]>`SELECT * FROM pricing_worksheets WHERE car_id = ${carId} ORDER BY updated_at DESC LIMIT 1`
    } else {
      data = await prisma.$queryRaw<any[]>`SELECT * FROM pricing_worksheets ORDER BY updated_at DESC LIMIT 500`
    }

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
    const id = crypto.randomUUID()

    const fields = ['car_id', 'worksheet_data', 'pricing_breakdown']
    const cols = ['id', ...fields.filter(f => body[f] !== undefined)]
    const vals = [id, ...fields.filter(f => body[f] !== undefined).map(f => body[f] || null)]

    await prisma.$executeRawUnsafe(
      `INSERT INTO pricing_worksheets (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, NOW(), NOW())`,
      ...vals
    )

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM pricing_worksheets WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
