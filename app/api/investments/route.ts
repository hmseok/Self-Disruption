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

// GET /api/investments?car_id=xxx&status=active&company_id=xxx
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const carId = searchParams.get('car_id')
    const status = searchParams.get('status')
    const companyId = searchParams.get('company_id') || user.company_id

    let data: any[]
    if (carId && status) {
      data = await prisma.$queryRaw<any[]>`
        SELECT * FROM general_investments
        WHERE car_id = ${carId} AND status = ${status}
        ORDER BY created_at DESC
      `
    } else if (carId) {
      data = await prisma.$queryRaw<any[]>`
        SELECT * FROM general_investments
        WHERE car_id = ${carId}
        ORDER BY created_at DESC
      `
    } else if (status) {
      data = await prisma.$queryRaw<any[]>`
        SELECT * FROM general_investments
        WHERE company_id = ${companyId} AND status = ${status}
        ORDER BY created_at DESC
      `
    } else {
      data = await prisma.$queryRaw<any[]>`
        SELECT * FROM general_investments
        WHERE company_id = ${companyId}
        ORDER BY created_at DESC
        LIMIT 500
      `
    }

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    console.error('[GET /api/investments]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/investments
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const {
      car_id, investor_name, invest_amount = 0, interest_rate = 0,
      payment_day, contract_start_date, contract_end_date, status = 'active',
      company_id,
      // JiipTab legacy fields
      monthly_payout, invest_date,
    } = body

    const companyId = company_id || user.company_id
    const id = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO general_investments (
        id, car_id, company_id, investor_name, invest_amount, interest_rate,
        payment_day, contract_start_date, contract_end_date, status,
        created_at, updated_at
      ) VALUES (
        ${id}, ${car_id || null}, ${companyId}, ${investor_name || null},
        ${Number(invest_amount)}, ${Number(interest_rate)},
        ${payment_day || null}, ${contract_start_date || invest_date || null},
        ${contract_end_date || null}, ${status},
        NOW(), NOW()
      )
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM general_investments WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    console.error('[POST /api/investments]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
