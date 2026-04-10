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
    const search = searchParams.get('search') || ''

    let data: any[]
    if (search) {
      data = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM contracts WHERE (customer_name LIKE ?) ORDER BY id DESC`,
        `%${search}%`
      )
    } else {
      data = await prisma.$queryRaw<any[]>`SELECT * FROM contracts ORDER BY id DESC LIMIT 1000`
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

    const fields = ['customer_id', 'customer_name', 'car_id', 'quote_id', 'start_date', 'end_date', 'term_months', 'deposit', 'monthly_rent', 'status', 'special_terms', 'terms_version_id', 'signature_id']
    const cols = ['id', ...fields.filter(f => body[f] !== undefined)]
    const vals = [id, ...fields.filter(f => body[f] !== undefined).map(f => body[f] || null)]

    await prisma.$executeRawUnsafe(
      `INSERT INTO contracts (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, NOW(), NOW())`,
      ...vals
    )

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM contracts WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
