import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

function getUserIdFromToken(token: string): string | null {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return p.sub || p.user_id || null
  } catch {
    return null
  }
}

async function verifyUser(request: NextRequest) {
  try {
    const h = request.headers.get('authorization')
    if (!h?.startsWith('Bearer ')) return null
    const uid = getUserIdFromToken(h.replace('Bearer ', ''))
    if (!uid) return null
    const p = await prisma.$queryRaw<any[]>`SELECT id, role, company_id FROM profiles WHERE id = ${uid} LIMIT 1`
    return p[0] ? { id: uid, ...p[0] } : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = params
    const data = await prisma.$queryRaw<any[]>`SELECT * FROM customer_tax_invoices WHERE customer_id = ${id} ORDER BY created_at DESC`
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = params
    const body = await request.json()
    const invoiceId = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO customer_tax_invoices (
        id, customer_id, contract_id, invoice_number, issue_date, supply_amount, tax_amount, total_amount, description, status, sent_to_email, created_at, updated_at
      ) VALUES (
        ${invoiceId}, ${id}, ${body.contract_id || null}, ${body.invoice_number || null}, ${body.issue_date || null},
        ${body.supply_amount || 0}, ${body.tax_amount || 0}, ${body.total_amount || 0}, ${body.description || null},
        ${body.status || null}, ${body.sent_to_email || null}, NOW(), NOW()
      )
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM customer_tax_invoices WHERE id = ${invoiceId} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
