import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET    /api/lt-quotes/[id] — 견적 상세
 * PATCH  /api/lt-quotes/[id] — 부분 수정 (허용 필드만)
 * DELETE /api/lt-quotes/[id] — 삭제
 *
 * PR-Q2-4 (2026-05-26)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? Number(v) : v)))
}

const ALLOWED_FIELDS = new Set([
  'quote_no', 'status', 'contract_type', 'rent_type',
  'customer_name', 'customer_phone', 'customer_email', 'customer_company',
  'vehicle_id', 'vehicle_car_number',
  'vehicle_brand', 'vehicle_model', 'vehicle_trim', 'vehicle_year',
  'vehicle_fuel', 'vehicle_engine_cc', 'vehicle_color_ext', 'vehicle_color_int',
  'vehicle_options_text', 'new_car_price_id',
  'purchase_price', 'market_price',
  'start_date', 'months', 'end_date', 'annual_km', 'residual_rate',
  'monthly_fee', 'deposit', 'upfront_months', 'delivery_fee', 'insurance_option',
  // 자동 산출 결과 (모달에서 저장 시 함께 갱신)
  'cost_breakdown_json',
  'suggested_rent', 'suggested_rent_with_vat',
  'margin_rate', 'irr_annual', 'breakeven_months', 'competitive_index',
  'acquisition_total',
  'valid_until', 'owner_id', 'owner_name',
  'memo',
])
const DATE_FIELDS = new Set(['start_date', 'end_date', 'valid_until'])
const NUMBER_FIELDS = new Set([
  'vehicle_year', 'vehicle_engine_cc',
  'purchase_price', 'market_price',
  'months', 'annual_km', 'residual_rate',
  'monthly_fee', 'deposit', 'upfront_months', 'delivery_fee',
  'suggested_rent', 'suggested_rent_with_vat', 'margin_rate', 'irr_annual',
  'breakeven_months', 'competitive_index', 'acquisition_total',
])
const JSON_FIELDS = new Set(['cost_breakdown_json'])

function toDate(d: unknown): string | null {
  if (!d) return null
  const s = String(d)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM lt_quotes WHERE id = ${id} LIMIT 1`
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ data: serialize(rows[0]), error: null })
  } catch (e: unknown) {
    console.error('[lt-quotes GET id]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })
    const body = await request.json()

    const setFrags: string[] = []
    const values: unknown[] = []
    for (const [key, raw] of Object.entries(body)) {
      if (!ALLOWED_FIELDS.has(key)) continue
      if (raw === undefined) continue
      let v: unknown = raw
      if (DATE_FIELDS.has(key)) v = toDate(v)
      else if (NUMBER_FIELDS.has(key)) v = v === null || v === '' ? null : Number(v)
      else if (JSON_FIELDS.has(key)) v = v == null ? null : JSON.stringify(v)
      setFrags.push(`${key} = ?`)
      values.push(v)
    }
    if (setFrags.length === 0) {
      return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 })
    }
    setFrags.push('updated_at = NOW()')
    values.push(id)
    await prisma.$executeRawUnsafe(
      `UPDATE lt_quotes SET ${setFrags.join(', ')} WHERE id = ?`,
      ...values
    )

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM lt_quotes WHERE id = ${id} LIMIT 1`
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ data: serialize(rows[0]), error: null })
  } catch (e: unknown) {
    console.error('[lt-quotes PATCH]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    await prisma.$executeRaw`DELETE FROM lt_quotes WHERE id = ${id}`
    return NextResponse.json({ success: true, error: null })
  } catch (e: unknown) {
    console.error('[lt-quotes DELETE]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}
