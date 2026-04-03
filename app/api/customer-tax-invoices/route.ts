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
