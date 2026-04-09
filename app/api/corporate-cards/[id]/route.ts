import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const data = await prisma.$queryRaw<any[]>`
      SELECT * FROM corporate_cards WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: serialize(data[0] || null), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const body = await request.json()
    const { card_number, holder_name, card_alias, assigned_employee_id, status } = body

    await prisma.$queryRaw`
      UPDATE corporate_cards SET
        card_number = COALESCE(${card_number}, card_number),
        holder_name = COALESCE(${holder_name}, holder_name),
        card_alias = COALESCE(${card_alias}, card_alias),
        assigned_employee_id = COALESCE(${assigned_employee_id}, assigned_employee_id),
        status = COALESCE(${status}, status),
        updated_at = NOW()
      WHERE id = ${id}
    `

    return NextResponse.json({ data: { id: id }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    await prisma.$queryRaw`DELETE FROM corporate_cards WHERE id = ${id}`
    return NextResponse.json({ data: { id: id }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
