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
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const customerId = searchParams.get('customer_id')

    let query = `SELECT * FROM customer_tax_invoices`
    if (customerId) {
      query += ` WHERE customer_id = '${customerId}'`
    }
    query += ` ORDER BY invoice_date DESC LIMIT 500`

    const data = await prisma.$queryRaw<any[]>(query as any)
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
    const { customer_id, invoice_no, invoice_date, amount, tax_amount, description, status } = body

    await prisma.$queryRaw`
      INSERT INTO customer_tax_invoices (id, customer_id, invoice_no, invoice_date, amount, tax_amount, description, status, created_at, updated_at)
      VALUES (UUID(), ${customer_id}, ${invoice_no}, ${invoice_date}, ${amount}, ${tax_amount}, ${description}, ${status || 'issued'}, NOW(), NOW())
    `

    return NextResponse.json({ data: { id: 'success' }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
