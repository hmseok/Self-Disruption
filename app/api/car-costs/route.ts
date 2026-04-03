import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch { return null }
}

async function verifyUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    const token = authHeader.replace('Bearer ', '')
    const userId = getUserIdFromToken(token)
    if (!userId) return null
    const profiles = await prisma.$queryRaw<any[]>`SELECT id, role, company_id FROM profiles WHERE id = ${userId} LIMIT 1`
    const profile = profiles[0]
    return profile ? { id: userId, ...profile } : null
  } catch { return null }
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
