import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

function getUserIdFromToken(token: string): string | null {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return p.sub || p.user_id || null
  } catch {
    return null
  }
}

async function verifyUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    const userId = getUserIdFromToken(authHeader.replace('Bearer ', ''))
    if (!userId) return null
    const profiles = await prisma.$queryRaw<any[]>`SELECT id, role, company_id FROM profiles WHERE id = ${userId} LIMIT 1`
    return profiles[0] ? { id: userId, ...profiles[0] } : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const brand = searchParams.get('brand')
    const model = searchParams.get('model')
    const year = searchParams.get('year')

    let query = 'SELECT * FROM new_car_prices WHERE 1=1'
    const params: any[] = []

    if (brand) {
      query += ` AND brand = ?`
      params.push(brand)
    }
    if (model) {
      query += ` AND model = ?`
      params.push(model)
    }
    if (year) {
      query += ` AND year = ?`
      params.push(parseInt(year))
    }

    query += ' ORDER BY created_at DESC LIMIT 500'

    const data = await prisma.$queryRawUnsafe<any[]>(query, ...params)

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

    const fields = ['model_name', 'price', 'brand', 'year', 'notes']
    const cols = ['id', ...fields.filter(f => body[f] !== undefined)]
    const vals = [id, ...fields.filter(f => body[f] !== undefined).map(f => body[f] || null)]

    await prisma.$executeRawUnsafe(
      `INSERT INTO new_car_prices (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, NOW(), NOW())`,
      ...vals
    )

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM new_car_prices WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
