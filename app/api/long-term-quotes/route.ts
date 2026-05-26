import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * GET  /api/long-term-quotes — 장기렌트 견적 목록
 *   ?status=draft|sent|accepted|rejected|expired|converted|all
 *   ?q=고객명/차량번호/견적번호 부분일치
 * POST /api/long-term-quotes — 신규 견적 (customer_name 필수, status='draft')
 *
 * PR-Q1 (2026-05-26)
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
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
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
    if (status && status !== 'all') { wheres.push('q.status = ?'); params.push(status) }
    if (q) {
      wheres.push('(q.customer_name LIKE ? OR q.vehicle_car_number LIKE ? OR q.quote_no LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }
    const whereClause = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT q.id, q.quote_no, q.status, q.contract_type,
              q.customer_name, q.customer_phone, q.customer_email, q.customer_company,
              q.vehicle_id, q.vehicle_car_number, q.vehicle_spec,
              q.start_date, q.months, q.end_date,
              q.monthly_fee, q.deposit, q.upfront_months, q.annual_km,
              q.insurance_option, q.delivery_fee, q.options_json,
              q.sent_at, q.valid_until, q.owner_id, q.owner_name,
              q.share_token, q.share_views, q.share_last_viewed_at,
              q.converted_to_rental_id, q.converted_at,
              q.memo, q.created_at, q.updated_at,
              c.brand AS vehicle_brand, c.model AS vehicle_model
         FROM long_term_quotes q
         LEFT JOIN cars c ON c.id = q.vehicle_id
         ${whereClause}
         ORDER BY q.updated_at DESC, q.created_at DESC
         LIMIT 1000`,
      ...params
    ).catch((e: unknown) => {
      // Rule 23 graceful fallback — 테이블 미적용 시 빈 배열
      console.warn('[long-term-quotes GET] query failed:', (e as Error)?.message?.slice(0, 200))
      return [] as Record<string, unknown>[]
    })

    const data = rows.map((r) => ({
      ...r,
      monthly_fee: r.monthly_fee != null ? Number(r.monthly_fee) : null,
      deposit: r.deposit != null ? Number(r.deposit) : null,
      delivery_fee: r.delivery_fee != null ? Number(r.delivery_fee) : null,
      upfront_months: r.upfront_months != null ? Number(r.upfront_months) : null,
      annual_km: r.annual_km != null ? Number(r.annual_km) : null,
      months: r.months != null ? Number(r.months) : null,
      share_views: r.share_views != null ? Number(r.share_views) : 0,
    }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: unknown) {
    console.error('[long-term-quotes GET]', e)
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
    const optionsJson = body.options_json ? JSON.stringify(body.options_json) : null

    await prisma.$executeRaw`
      INSERT INTO long_term_quotes (
        id, quote_no, status, contract_type,
        customer_name, customer_phone, customer_email, customer_company,
        vehicle_id, vehicle_car_number, vehicle_spec,
        start_date, months, end_date,
        monthly_fee, deposit, upfront_months, annual_km,
        insurance_option, delivery_fee, options_json,
        sent_at, valid_until, owner_id, owner_name,
        memo, created_at, updated_at
      ) VALUES (
        ${id}, ${body.quote_no || null}, ${body.status || 'draft'}, ${body.contract_type || '기존차량'},
        ${String(body.customer_name).trim()}, ${body.customer_phone || null},
        ${body.customer_email || null}, ${body.customer_company || null},
        ${body.vehicle_id || null}, ${body.vehicle_car_number || null}, ${body.vehicle_spec || null},
        ${toDate(body.start_date)}, ${toNum(body.months)}, ${toDate(body.end_date)},
        ${toNum(body.monthly_fee)}, ${toNum(body.deposit)},
        ${toNum(body.upfront_months)}, ${toNum(body.annual_km)},
        ${body.insurance_option || null}, ${toNum(body.delivery_fee)}, ${optionsJson},
        ${null}, ${toDate(body.valid_until)},
        ${body.owner_id || (user as { id?: string }).id || null},
        ${body.owner_name || (user as { name?: string }).name || null},
        ${body.memo || null}, NOW(), NOW()
      )`

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM long_term_quotes WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(rows[0] || null), error: null })
  } catch (e: unknown) {
    console.error('[long-term-quotes POST]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}
