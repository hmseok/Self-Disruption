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
    const data = await prisma.$queryRaw<any[]>`SELECT * FROM customers WHERE id = ${id} LIMIT 1`
    if (!data[0]) return NextResponse.json({ error: '고객을 찾을 수 없습니다' }, { status: 404 })

    const notes = await prisma.$queryRaw<any[]>`SELECT * FROM customer_notes WHERE customer_id = ${id} ORDER BY created_at DESC`
    const payments = await prisma.$queryRaw<any[]>`SELECT * FROM customer_payments WHERE customer_id = ${id} ORDER BY created_at DESC`
    const taxInvoices = await prisma.$queryRaw<any[]>`SELECT * FROM customer_tax_invoices WHERE customer_id = ${id} ORDER BY created_at DESC`

    return NextResponse.json({
      data: serialize({ ...data[0], notes, payments, tax_invoices: taxInvoices }),
      error: null
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = params
    const body = await request.json()

    const fields = ['name', 'phone', 'email', 'address', 'birth_date', 'id_number', 'driver_license', 'license_type', 'license_expiry', 'resident_number', 'business_name', 'business_number', 'representative_name', 'type', 'memo', 'status']
    const updates: string[] = []
    const values: any[] = []

    for (const f of fields) {
      if (body[f] !== undefined) {
        updates.push(`${f} = ?`)
        values.push(body[f] === '' ? null : body[f])
      }
    }

    if (!updates.length) return NextResponse.json({ error: '없음' }, { status: 400 })

    updates.push('updated_at = NOW()')
    values.push(id)

    await prisma.$executeRawUnsafe(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, ...values)
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    await prisma.$executeRaw`DELETE FROM customers WHERE id = ${params.id}`
    return NextResponse.json({ data: { id: params.id }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
