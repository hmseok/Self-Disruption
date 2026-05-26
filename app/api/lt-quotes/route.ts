import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * GET  /api/lt-quotes — 장기렌트 견적 V3 목록
 *   ?status=draft|sent|accepted|rejected|expired|converted|all
 *   ?q=고객명/차량번호/견적번호 부분일치
 * POST /api/lt-quotes — 신규 견적 (customer_name 필수, status='draft')
 *
 * PR-Q2-4 (2026-05-26)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? Number(v) : v)))
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
      `SELECT q.id, q.quote_no, q.status, q.contract_type, q.rent_type,
              q.customer_name, q.customer_phone, q.customer_email, q.customer_company,
              q.vehicle_id, q.vehicle_car_number,
              q.vehicle_brand, q.vehicle_model, q.vehicle_trim, q.vehicle_year,
              q.vehicle_fuel, q.vehicle_engine_cc, q.vehicle_color_ext, q.vehicle_color_int,
              q.vehicle_options_text, q.new_car_price_id,
              q.purchase_price, q.market_price,
              q.start_date, q.months, q.end_date, q.annual_km, q.residual_rate,
              q.monthly_fee, q.deposit, q.upfront_months, q.delivery_fee, q.insurance_option,
              q.cost_breakdown_json, q.suggested_rent, q.suggested_rent_with_vat,
              q.margin_rate, q.irr_annual, q.breakeven_months, q.competitive_index,
              q.acquisition_total,
              q.sent_at, q.valid_until, q.owner_id, q.owner_name,
              q.share_token, q.share_views, q.share_last_viewed_at,
              q.converted_to_rental_id, q.converted_at,
              q.memo, q.created_at, q.updated_at
         FROM lt_quotes q
         ${whereClause}
         ORDER BY q.updated_at DESC, q.created_at DESC
         LIMIT 1000`,
      ...params
    ).catch((e: unknown) => {
      console.warn('[lt-quotes GET] query failed:', (e as Error)?.message?.slice(0, 200))
      return [] as Record<string, unknown>[]
    })

    // 숫자 컬럼 안전 변환
    const data = rows.map((r) => ({
      ...r,
      purchase_price: r.purchase_price != null ? Number(r.purchase_price) : null,
      market_price: r.market_price != null ? Number(r.market_price) : null,
      monthly_fee: r.monthly_fee != null ? Number(r.monthly_fee) : null,
      deposit: r.deposit != null ? Number(r.deposit) : null,
      delivery_fee: r.delivery_fee != null ? Number(r.delivery_fee) : null,
      suggested_rent: r.suggested_rent != null ? Number(r.suggested_rent) : null,
      suggested_rent_with_vat: r.suggested_rent_with_vat != null ? Number(r.suggested_rent_with_vat) : null,
      margin_rate: r.margin_rate != null ? Number(r.margin_rate) : null,
      irr_annual: r.irr_annual != null ? Number(r.irr_annual) : null,
      competitive_index: r.competitive_index != null ? Number(r.competitive_index) : null,
      acquisition_total: r.acquisition_total != null ? Number(r.acquisition_total) : null,
      residual_rate: r.residual_rate != null ? Number(r.residual_rate) : null,
      upfront_months: r.upfront_months != null ? Number(r.upfront_months) : null,
      annual_km: r.annual_km != null ? Number(r.annual_km) : null,
      months: r.months != null ? Number(r.months) : null,
      share_views: r.share_views != null ? Number(r.share_views) : 0,
    }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: unknown) {
    console.error('[lt-quotes GET]', e)
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
    const costBreakdownJson = body.cost_breakdown_json ? JSON.stringify(body.cost_breakdown_json) : null

    await prisma.$executeRaw`
      INSERT INTO lt_quotes (
        id, quote_no, status, contract_type, rent_type,
        customer_name, customer_phone, customer_email, customer_company,
        vehicle_id, vehicle_car_number,
        vehicle_brand, vehicle_model, vehicle_trim, vehicle_year,
        vehicle_fuel, vehicle_engine_cc, vehicle_color_ext, vehicle_color_int,
        vehicle_options_text, new_car_price_id,
        purchase_price, market_price,
        start_date, months, end_date, annual_km, residual_rate,
        monthly_fee, deposit, upfront_months, delivery_fee, insurance_option,
        cost_breakdown_json, suggested_rent, suggested_rent_with_vat,
        margin_rate, irr_annual, breakeven_months, competitive_index, acquisition_total,
        valid_until, owner_id, owner_name,
        memo, created_at, updated_at
      ) VALUES (
        ${id}, ${body.quote_no || null}, ${body.status || 'draft'},
        ${body.contract_type || '기존차량'}, ${body.rent_type || 'return'},
        ${String(body.customer_name).trim()}, ${body.customer_phone || null},
        ${body.customer_email || null}, ${body.customer_company || null},
        ${body.vehicle_id || null}, ${body.vehicle_car_number || null},
        ${body.vehicle_brand || null}, ${body.vehicle_model || null},
        ${body.vehicle_trim || null}, ${toNum(body.vehicle_year)},
        ${body.vehicle_fuel || null}, ${toNum(body.vehicle_engine_cc)},
        ${body.vehicle_color_ext || null}, ${body.vehicle_color_int || null},
        ${body.vehicle_options_text || null}, ${body.new_car_price_id || null},
        ${toNum(body.purchase_price)}, ${toNum(body.market_price)},
        ${toDate(body.start_date)}, ${toNum(body.months)}, ${toDate(body.end_date)},
        ${toNum(body.annual_km)}, ${toNum(body.residual_rate)},
        ${toNum(body.monthly_fee)}, ${toNum(body.deposit)},
        ${toNum(body.upfront_months)}, ${toNum(body.delivery_fee)},
        ${body.insurance_option || null},
        ${costBreakdownJson}, ${toNum(body.suggested_rent)},
        ${toNum(body.suggested_rent_with_vat)}, ${toNum(body.margin_rate)},
        ${toNum(body.irr_annual)}, ${toNum(body.breakeven_months)},
        ${toNum(body.competitive_index)}, ${toNum(body.acquisition_total)},
        ${toDate(body.valid_until)},
        ${body.owner_id || (user as { id?: string }).id || null},
        ${body.owner_name || (user as { name?: string }).name || null},
        ${body.memo || null}, NOW(), NOW()
      )`

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM lt_quotes WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(rows[0] || null), error: null })
  } catch (e: unknown) {
    console.error('[lt-quotes POST]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}
