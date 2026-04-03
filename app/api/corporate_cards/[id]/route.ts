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

// PATCH /api/corporate_cards/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { id } = params

    await prisma.$executeRaw`
      UPDATE corporate_cards
      SET
        card_company = COALESCE(${body.card_company || null}, card_company),
        card_number = COALESCE(${body.card_number || null}, card_number),
        card_alias = COALESCE(${body.card_alias || null}, card_alias),
        holder_name = COALESCE(${body.holder_name || null}, holder_name),
        assigned_employee_id = COALESCE(${body.assigned_employee_id || null}, assigned_employee_id),
        monthly_limit = COALESCE(${body.monthly_limit || null}, monthly_limit),
        is_active = COALESCE(${body.is_active !== undefined ? body.is_active : null}, is_active),
        memo = COALESCE(${body.memo || null}, memo),
        updated_at = NOW()
      WHERE id = ${id}
    `

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM corporate_cards WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/corporate_cards/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = params

    await prisma.$executeRaw`DELETE FROM corporate_cards WHERE id = ${id}`
    return NextResponse.json({ data: null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
