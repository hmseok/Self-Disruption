import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/financial-products?car_id=xxx
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const carId = searchParams.get('car_id')
    const companyId = searchParams.get('company_id') || user.company_id

    let data: any[]
    if (carId) {
      data = await prisma.$queryRaw<any[]>`SELECT * FROM financial_products WHERE car_id = ${carId} ORDER BY id DESC`
    } else {
      data = await prisma.$queryRaw<any[]>`SELECT * FROM financial_products WHERE company_id = ${companyId} ORDER BY id DESC LIMIT 500`
    }

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    console.error('[GET /api/financial-products]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/financial-products
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const {
      car_id, finance_name, type, total_amount = 0, interest_rate = 0,
      term_months, monthly_payment = 0, payment_date, start_date, end_date, company_id,
    } = body

    const companyId = company_id || user.company_id
    const id = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO financial_products (
        id, car_id, company_id, finance_name, type, total_amount, interest_rate,
        term_months, monthly_payment, payment_date, start_date, end_date, created_at, updated_at
      ) VALUES (
        ${id}, ${car_id || null}, ${companyId}, ${finance_name || null}, ${type || null},
        ${Number(total_amount)}, ${Number(interest_rate)}, ${term_months || null},
        ${Number(monthly_payment)}, ${payment_date || null},
        ${start_date || null}, ${end_date || null}, NOW(), NOW()
      )
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM financial_products WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    console.error('[POST /api/financial-products]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
