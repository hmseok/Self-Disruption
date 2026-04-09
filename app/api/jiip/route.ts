import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/jiip?car_id=xxx&company_id=xxx&status=active
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const carId = searchParams.get('car_id')
    const status = searchParams.get('status')
    const single = searchParams.get('single') === 'true'

    // 단독 회사 ERP — company_id 필터 제거 (해당 컬럼 미존재)
    let data: any[]
    if (carId && single) {
      data = await prisma.$queryRaw<any[]>`SELECT * FROM jiip_contracts WHERE car_id = ${carId} LIMIT 1`
    } else if (carId) {
      data = await prisma.$queryRaw<any[]>`SELECT * FROM jiip_contracts WHERE car_id = ${carId} ORDER BY created_at DESC`
    } else if (status) {
      data = await prisma.$queryRaw<any[]>`SELECT * FROM jiip_contracts WHERE status = ${status} ORDER BY created_at DESC`
    } else {
      data = await prisma.$queryRaw<any[]>`SELECT * FROM jiip_contracts ORDER BY created_at DESC LIMIT 500`
    }

    // 차량 정보 보강 — cars.number(차량번호), cars.model 조회
    const carIds = Array.from(new Set(data.map((r: any) => r.car_id).filter(Boolean))) as string[]
    const carMap: Record<string, any> = {}
    if (carIds.length > 0) {
      try {
        const placeholders = carIds.map(() => '?').join(',')
        const cars = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, \`number\`, model FROM cars WHERE id IN (${placeholders})`,
          ...carIds
        )
        for (const c of cars) {
          carMap[c.id] = c
        }
      } catch (err) {
        console.warn('[jiip] cars 조회 실패 (차량 정보 없이 진행):', err)
      }
    }

    const withCar = data.map((r: any) => {
      const c = carMap[r.car_id]
      return { ...r, car: c ? { number: c.number, model: c.model } : null }
    })

    if (single) {
      return NextResponse.json({ data: serialize(withCar[0] || null), error: null })
    }
    return NextResponse.json({ data: serialize(withCar), error: null })
  } catch (e: any) {
    console.error('[GET /api/jiip]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/jiip
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const {
      car_id, investor_name, payout_day, share_ratio, admin_fee,
      contract_start_date, contract_end_date, status = 'active',
      // JiipTab legacy fields
      owner_name, owner_phone, monthly_management_fee, profit_share_ratio, bank_name, account_number,
    } = body

    const id = crypto.randomUUID()
    const name = investor_name || owner_name || ''

    await prisma.$executeRaw`
      INSERT INTO jiip_contracts (
        id, car_id, investor_name, payout_day, share_ratio, admin_fee,
        contract_start_date, contract_end_date, status,
        owner_name, owner_phone, monthly_management_fee, profit_share_ratio, bank_name, account_number,
        created_at, updated_at
      ) VALUES (
        ${id}, ${car_id || null}, ${name}, ${payout_day || null}, ${share_ratio || null},
        ${admin_fee || null}, ${contract_start_date || null}, ${contract_end_date || null}, ${status},
        ${owner_name || null}, ${owner_phone || null}, ${monthly_management_fee || null},
        ${profit_share_ratio || null}, ${bank_name || null}, ${account_number || null},
        NOW(), NOW()
      )
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM jiip_contracts WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    console.error('[POST /api/jiip]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
