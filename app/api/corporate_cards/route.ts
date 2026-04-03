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

// GET /api/corporate_cards
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const companyId = searchParams.get('company_id') || user.company_id

    const data = await prisma.$queryRaw<any[]>`
      SELECT c.*, p.employee_name as assigned_employee_name
      FROM corporate_cards c
      LEFT JOIN profiles p ON c.assigned_employee_id = p.id
      WHERE c.company_id = ${companyId}
      ORDER BY c.created_at DESC
    `
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/corporate_cards
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()
    const companyId = body.company_id || user.company_id

    await prisma.$executeRaw`
      INSERT INTO corporate_cards (
        id, company_id, card_company, card_number, card_alias,
        holder_name, assigned_employee_id, monthly_limit,
        is_active, memo, created_at, updated_at
      ) VALUES (
        ${id}, ${companyId}, ${body.card_company}, ${body.card_number || null},
        ${body.card_alias || null}, ${body.holder_name || null},
        ${body.assigned_employee_id || null}, ${body.monthly_limit || null},
        ${body.is_active !== false}, ${body.memo || null}, NOW(), NOW()
      )
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM corporate_cards WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
