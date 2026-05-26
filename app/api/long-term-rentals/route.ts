import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * GET  /api/long-term-rentals — 장기렌트 목록
 *   ?status=active|expired|terminated|all
 *   ?q=고객명/차량번호/계약번호 부분일치
 * POST /api/long-term-rentals — 장기렌트 신규 등록 (customer_name 필수)
 *
 * PR-L1 (2026-05-24) — 장기렌트 원장. 대차(fmi_rentals)와 별개.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
}
function toDate(d: unknown): string | null {
  if (!d) return null
  const s = String(d)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ data: [], error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')
    const q = searchParams.get('q')

    const wheres: string[] = []
    const params: unknown[] = []
    if (status && status !== 'all') { wheres.push('l.status = ?'); params.push(status) }
    if (q) {
      wheres.push('(l.customer_name LIKE ? OR l.vehicle_car_number LIKE ? OR l.contract_no LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }
    const whereClause = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT l.id, l.vehicle_id, l.vehicle_car_number, l.customer_name, l.customer_phone,
              l.contract_no, l.start_date, l.end_date, l.monthly_fee, l.deposit,
              l.status, l.notes, l.contract_type, l.vehicle_spec,
              l.created_at, l.updated_at,
              c.brand AS vehicle_brand, c.model AS vehicle_model
         FROM long_term_rentals l
         LEFT JOIN cars c ON c.id = l.vehicle_id
         ${whereClause}
         ORDER BY l.start_date DESC, l.created_at DESC
         LIMIT 1000`,
      ...params
    ).catch((e: unknown) => {
      // Rule 23 graceful fallback — 테이블 미적용 시 빈 배열
      console.warn('[long-term-rentals GET] query failed:', (e as Error)?.message?.slice(0, 200))
      return [] as Record<string, unknown>[]
    })

    const data = rows.map((r) => ({
      ...r,
      monthly_fee: r.monthly_fee != null ? Number(r.monthly_fee) : null,
      deposit: r.deposit != null ? Number(r.deposit) : null,
    }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: unknown) {
    console.error('[long-term-rentals GET]', e)
    return NextResponse.json({ data: [], error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    if (!body.customer_name || !String(body.customer_name).trim()) {
      return NextResponse.json({ error: '고객명(customer_name)은 필수입니다' }, { status: 400 })
    }
    const id: string = crypto.randomUUID()
    const monthlyFee = body.monthly_fee != null && body.monthly_fee !== '' ? Number(body.monthly_fee) : null
    const deposit = body.deposit != null && body.deposit !== '' ? Number(body.deposit) : null

    await prisma.$executeRaw`
      INSERT INTO long_term_rentals (
        id, vehicle_id, vehicle_car_number, customer_name, customer_phone,
        contract_no, start_date, end_date, monthly_fee, deposit, status, notes,
        contract_type, vehicle_spec,
        created_at, updated_at
      ) VALUES (
        ${id}, ${body.vehicle_id || null}, ${body.vehicle_car_number || null},
        ${String(body.customer_name).trim()}, ${body.customer_phone || null},
        ${body.contract_no || null}, ${toDate(body.start_date)}, ${toDate(body.end_date)},
        ${monthlyFee}, ${deposit}, ${body.status || 'active'}, ${body.notes || null},
        ${body.contract_type || '기존차량'}, ${body.vehicle_spec || null},
        NOW(), NOW()
      )`

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM long_term_rentals WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(rows[0] || null), error: null })
  } catch (e: unknown) {
    console.error('[long-term-rentals POST]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}
