import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/cars — 차량 목록 조회
// ?company_id=xxx (admin 용)
// ?status=available|rented|maintenance (필터)
// ?ids=id1,id2,id3 (특정 차량들만 조회)
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const companyId = searchParams.get('company_id') || user.company_id
  const status = searchParams.get('status')
  const idsParam = searchParams.get('ids') || ''
  const vin = searchParams.get('vin')

  try {
    let cars: any[]

    if (idsParam) {
      // Handle comma-separated IDs
      const ids = idsParam.split(',').filter(id => id.trim())
      if (ids.length === 0) {
        cars = []
      } else {
        const placeholders = ids.map(() => '?').join(',')
        cars = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM cars WHERE id IN (${placeholders})`,
          ...ids
        )
      }
    } else if (vin) {
      // Filter by VIN
      cars = await prisma.$queryRaw<any[]>`
        SELECT * FROM cars
        WHERE vin = ${vin}
        LIMIT 1
      `
    } else if (status) {
      cars = await prisma.$queryRaw<any[]>`
        SELECT * FROM cars
        WHERE company_id = ${companyId} AND status = ${status}
        ORDER BY created_at DESC
      `
    } else {
      cars = await prisma.$queryRaw<any[]>`
        SELECT * FROM cars
        WHERE company_id = ${companyId}
        ORDER BY created_at DESC
      `
    }

    return NextResponse.json({ data: serialize(cars), error: null })
  } catch (error: any) {
    console.error('[GET /api/cars]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/cars — 차량 등록
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const {
      number, brand, model, trim, year, fuel, status = 'available',
      purchase_price, is_used, purchase_mileage, mileage,
      is_commercial, ownership_type, company_id,
    } = body

    if (!number || !brand || !model) {
      return NextResponse.json({ error: '차량번호, 제조사, 모델명은 필수입니다.' }, { status: 400 })
    }

    const companyId = company_id || user.company_id
    const id = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO cars (
        id, number, brand, model, trim, year, fuel, status,
        purchase_price, is_used, purchase_mileage, mileage,
        is_commercial, ownership_type, company_id, created_at, updated_at
      ) VALUES (
        ${id}, ${number}, ${brand}, ${model}, ${trim || null}, ${year || null},
        ${fuel || null}, ${status},
        ${purchase_price || null}, ${is_used ? 1 : 0}, ${purchase_mileage || null},
        ${mileage || null}, ${is_commercial ? 1 : 0}, ${ownership_type || 'company'},
        ${companyId}, NOW(), NOW()
      )
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM cars WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (error: any) {
    console.error('[POST /api/cars]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
