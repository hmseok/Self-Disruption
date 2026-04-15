import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T | null {
  if (data === undefined || data === null) return null as any
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

const ALLOWED_COLS = [
  'car_id','factory_price','purchase_price','current_market_value','total_depreciation_rate',
  'monthly_depreciation','loan_amount','loan_interest_rate','monthly_loan_interest','equity_amount',
  'investment_rate','monthly_opportunity_cost','monthly_insurance','driver_age_group','ins_auto_mode',
  'monthly_maintenance','maint_package','oil_change_freq','car_age_mode','custom_car_age',
  'dep_curve_preset','dep_custom_curve','dep_class_override','contract_type','residual_rate',
  'buyout_premium','monthly_tax','deductible','monthly_risk_reserve','deposit_amount',
  'prepayment_amount','deposit_discount_rate','prepayment_discount_rate','registration_region',
  'monthly_deposit_discount','monthly_prepayment_discount','total_monthly_cost','target_margin',
  'suggested_rent','market_avg_rent','market_position','term_months','annual_mileage',
  'baseline_km','excess_mileage_rate','excess_rate_margin_pct','status',
  'newcar_info','worksheet_data','pricing_breakdown',
] as const
const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const data = await prisma.$queryRaw<any[]>`SELECT * FROM pricing_worksheets WHERE id = ${id} LIMIT 1`

    return NextResponse.json({ data: data[0] || null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    // 대상 row 먼저 존재 확인 (404 처리 + undefined id 방지)
    if (!id || id === 'undefined' || id === 'null') {
      return NextResponse.json({ error: '유효하지 않은 id' }, { status: 400 })
    }
    const existing = await prisma.$queryRaw<any[]>`SELECT id FROM pricing_worksheets WHERE id = ${id} LIMIT 1`
    if (existing.length === 0) {
      return NextResponse.json({ error: '워크시트를 찾을 수 없습니다' }, { status: 404 })
    }

    const body = await request.json()

    const entries = Object.entries(body).filter(
      ([k, v]) => SAFE_COL.test(k) && (ALLOWED_COLS as readonly string[]).includes(k) && v !== undefined
    )

    if (entries.length === 0) {
      const rows = await prisma.$queryRaw<any[]>`SELECT * FROM pricing_worksheets WHERE id = ${id} LIMIT 1`
      return NextResponse.json({ data: serialize(rows[0]) ?? null, error: null })
    }

    const setClause = entries.map(([k]) => `\`${k}\` = ?`).join(', ')
    const values = entries.map(([, v]) => {
      if (v === null) return null
      if (typeof v === 'object') return JSON.stringify(v)
      return v
    })
    values.push(id)

    await prisma.$executeRawUnsafe(
      `UPDATE pricing_worksheets SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      ...values
    )

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM pricing_worksheets WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]) ?? null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    await prisma.$executeRaw`DELETE FROM pricing_worksheets WHERE id = ${id}`

    return NextResponse.json({ data: null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
