import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// 단독 회사 ERP — company_id 컬럼 제거됨
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ data: [], error: null }, { status: 200 })

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')

    const wheres: string[] = []
    const params: any[] = []
    if (startDate) { wheres.push('end_date >= ?'); params.push(startDate) }
    if (endDate) { wheres.push('start_date <= ?'); params.push(endDate) }
    const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : ''
    const sql = `SELECT * FROM vehicle_schedules ${whereClause} ORDER BY start_date DESC LIMIT 500`

    const data = await prisma.$queryRawUnsafe<any[]>(sql, ...params)
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
      INSERT INTO vehicle_schedules (id, car_id, schedule_type, start_date, end_date, title, color, contract_id, created_by, notes)
      VALUES (${id}, ${body.car_id}, ${body.schedule_type}, ${body.start_date}, ${body.end_date}, ${body.title}, ${body.color}, ${body.contract_id || null}, ${user.id}, ${body.notes || null})
    `
    return NextResponse.json({ data: { id }, error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
