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
    const companyId = searchParams.get('company_id') || user.company_id
    const search = searchParams.get('search') || ''
    const idsParam = searchParams.get('ids') || ''

    let data: any[]
    if (idsParam) {
      // Handle comma-separated IDs
      const ids = idsParam.split(',').filter(id => id.trim())
      if (ids.length === 0) {
        data = []
      } else {
        const placeholders = ids.map(() => '?').join(',')
        data = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM customers WHERE id IN (${placeholders})`,
          ...ids
        )
      }
    } else if (search) {
      data = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM customers WHERE company_id = ? AND (name LIKE ? OR phone LIKE ? OR email LIKE ?) ORDER BY created_at DESC`,
        companyId,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      )
    } else {
      data = await prisma.$queryRaw<any[]>`SELECT * FROM customers WHERE company_id = ${companyId} ORDER BY created_at DESC LIMIT 500`
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
    const companyId = body.company_id || user.company_id

    const fields = ['name', 'phone', 'email', 'address', 'birth_date', 'id_number', 'driver_license', 'license_type', 'license_expiry', 'resident_number', 'business_name', 'business_number', 'representative_name', 'type', 'memo', 'status']
    const cols = ['id', 'company_id', ...fields.filter(f => body[f] !== undefined)]
    const vals = [id, companyId, ...fields.filter(f => body[f] !== undefined).map(f => body[f] || null)]

    await prisma.$executeRawUnsafe(
      `INSERT INTO customers (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, NOW(), NOW())`,
      ...vals
    )

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM customers WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
