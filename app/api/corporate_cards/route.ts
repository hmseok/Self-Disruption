import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/corporate_cards
// 단독 회사 ERP — company_id 컬럼 없음
// 직원/차량 정보 LEFT JOIN
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const data = await prisma.$queryRaw<any[]>`
      SELECT
        c.*,
        p.name AS assigned_employee_name,
        car.number AS assigned_car_number,
        CONCAT_WS(' ', car.brand, car.model) AS assigned_car_model
      FROM corporate_cards c
      LEFT JOIN profiles p ON c.assigned_employee_id = p.id
      LEFT JOIN cars car   ON c.assigned_car_id = car.id
      ORDER BY c.created_at DESC
    `
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/corporate_cards
// 실제 DB 컬럼만: card_number, card_alias, holder_name, assigned_employee_id, assigned_car_id, status
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO corporate_cards (
        id, card_number, card_alias, holder_name,
        assigned_employee_id, assigned_car_id, status,
        created_at, updated_at
      ) VALUES (
        ${id},
        ${body.card_number || null},
        ${body.card_alias || null},
        ${body.holder_name || null},
        ${body.assigned_employee_id || null},
        ${body.assigned_car_id || null},
        ${body.status || 'active'},
        NOW(3), NOW(3)
      )
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM corporate_cards WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    console.error('[POST /api/corporate_cards]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
