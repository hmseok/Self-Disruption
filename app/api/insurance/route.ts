import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/insurance?car_id=xxx&company_id=xxx&order=end_date
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const carId = searchParams.get('car_id')
    const companyId = searchParams.get('company_id') || user.company_id

    let data: any[]
    try {
      if (carId) {
        data = await prisma.$queryRaw<any[]>`
          SELECT * FROM insurance_contracts
          WHERE car_id = ${carId}
          ORDER BY end_date DESC
        `
      } else {
        // company_id 컬럼이 없을 수 있음 (단독 회사 ERP)
        try {
          data = await prisma.$queryRaw<any[]>`
            SELECT * FROM insurance_contracts
            WHERE company_id = ${companyId}
            ORDER BY end_date DESC
            LIMIT 500
          `
        } catch (colErr: any) {
          if (colErr.message?.includes('company_id')) {
            data = await prisma.$queryRaw<any[]>`
              SELECT * FROM insurance_contracts
              ORDER BY end_date DESC
              LIMIT 500
            `
          } else throw colErr
        }
      }
    } catch (tableErr: any) {
      // insurance_contracts 테이블이 없으면 빈 배열 반환
      if (tableErr.message?.includes("doesn't exist") || tableErr.message?.includes('1146')) {
        console.warn('[insurance] 테이블 미존재, 빈 배열 반환')
        data = []
      } else throw tableErr
    }

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    console.error('[GET /api/insurance]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/insurance
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { car_id, company, start_date, end_date, total_premium = 0, age_limit, driver_range, company_id } = body

    const companyId = company_id || user.company_id
    const id = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO insurance_contracts (
        id, car_id, company_id, company, start_date, end_date, total_premium, age_limit, driver_range, created_at, updated_at
      ) VALUES (
        ${id}, ${car_id || null}, ${companyId}, ${company || null},
        ${start_date || null}, ${end_date || null}, ${Number(total_premium)},
        ${age_limit || null}, ${driver_range || null}, NOW(), NOW()
      )
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM insurance_contracts WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    console.error('[POST /api/insurance]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
