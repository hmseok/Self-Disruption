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
    if (!user) return NextResponse.json({ data: [], error: null }, { status: 200 })

    const { searchParams } = new URL(request.url)
    const carId = searchParams.get('car_id')

    let query = `SELECT * FROM car_costs WHERE company_id = ${user.company_id}`
    if (carId) query += ` AND car_id = ${carId}`
    query += ` ORDER BY created_at DESC LIMIT 500`

    const data = await prisma.$queryRawUnsafe<any[]>(query)
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
    await prisma.$queryRaw`
      INSERT INTO car_costs (id, company_id, car_id, cost_type, amount, notes, created_by)
      VALUES (${id}, ${user.company_id}, ${body.car_id}, ${body.cost_type}, ${body.amount}, ${body.notes}, ${user.id})
    `
    return NextResponse.json({ data: { id }, error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
