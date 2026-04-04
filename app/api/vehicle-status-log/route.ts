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
    const data = await prisma.$queryRaw<any[]>`SELECT * FROM vehicle_status_log WHERE company_id = ${user.company_id} ORDER BY created_at DESC LIMIT 500`
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
      INSERT INTO vehicle_status_log (id, company_id, car_id, old_status, new_status, related_type, related_id, changed_by)
      VALUES (${id}, ${user.company_id}, ${body.car_id}, ${body.old_status}, ${body.new_status}, ${body.related_type}, ${body.related_id}, ${body.changed_by})
    `
    return NextResponse.json({ data: { id }, error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
