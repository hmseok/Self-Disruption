import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/freelancers
// 단독 회사 ERP — company_id 컬럼 제거됨
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const isActive = searchParams.get('is_active')

    let query = 'SELECT * FROM freelancers'
    const conditions: string[] = []

    if (isActive === 'true') {
      conditions.push('is_active = true')
    } else if (isActive === 'false') {
      conditions.push('is_active = false')
    }

    if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`
    query += ' ORDER BY name'

    const data = await prisma.$queryRawUnsafe<any[]>(query)
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/freelancers
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO freelancers (
        id, name, phone, email, bank_name, account_number,
        account_holder, reg_number, tax_type, service_type, is_active, memo,
        created_at, updated_at
      ) VALUES (
        ${id}, ${body.name}, ${body.phone || null}, ${body.email || null},
        ${body.bank_name || null}, ${body.account_number || null},
        ${body.account_holder || null}, ${body.reg_number || null}, ${body.tax_type || null},
        ${body.service_type || null}, ${body.is_active !== false}, ${body.memo || null},
        NOW(), NOW()
      )
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM freelancers WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
