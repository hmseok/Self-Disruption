import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/loans?car_id=xxx&company_id=xxx
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const carId = searchParams.get('car_id')
    const companyId = searchParams.get('company_id') || user.company_id

    let data: any[]
    if (carId) {
      data = await prisma.$queryRaw<any[]>`
        SELECT l.*, c.number as car_number FROM loans l
        LEFT JOIN cars c ON l.car_id = c.id
        WHERE l.car_id = ${carId}
        ORDER BY l.created_at DESC
      `
    } else {
      data = await prisma.$queryRaw<any[]>`
        SELECT l.*, c.number as car_number FROM loans l
        LEFT JOIN cars c ON l.car_id = c.id
        WHERE l.company_id = ${companyId}
        ORDER BY l.created_at DESC
      `
    }

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    console.error('[GET /api/loans]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/loans
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const {
      car_id, finance_name, type = '할부', total_amount = 0,
      monthly_payment = 0, payment_date = 25, start_date = null, end_date = null,
      company_id,
    } = body

    if (!finance_name || !total_amount) {
      return NextResponse.json({ error: '금융사명과 원금은 필수입니다.' }, { status: 400 })
    }

    const companyId = company_id || user.company_id
    const id = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO loans (
        id, car_id, company_id, finance_name, type, total_amount,
        monthly_payment, payment_date, start_date, end_date, created_at, updated_at
      ) VALUES (
        ${id}, ${car_id || null}, ${companyId}, ${finance_name}, ${type},
        ${Number(total_amount)}, ${Number(monthly_payment)}, ${Number(payment_date)},
        ${start_date || null}, ${end_date || null}, NOW(), NOW()
      )
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM loans WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    console.error('[POST /api/loans]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
