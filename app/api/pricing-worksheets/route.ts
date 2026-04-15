import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T | null {
  if (data === undefined || data === null) return null as any
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

// 허용 컬럼 화이트리스트 (SQL Injection 방지 + 스키마 불일치 방지)
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

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const carId = searchParams.get('car_id')
    const id = searchParams.get('id')

    // cars LEFT JOIN 으로 브랜드/모델/번호판 정보 포함 (UI에서 "미지정" 방지)
    const SELECT_WITH_CAR = `
      SELECT pw.*,
             c.id AS _car_id, c.brand AS _car_brand, c.model AS _car_model,
             c.number AS _car_number, c.year AS _car_year, c.trim AS _car_trim,
             c.is_used AS _car_is_used
      FROM pricing_worksheets pw
      LEFT JOIN cars c ON c.id = pw.car_id
    `
    const mapRow = (r: any) => {
      if (!r) return r
      const cars = r._car_id ? {
        id: r._car_id, brand: r._car_brand, model: r._car_model,
        number: r._car_number, year: r._car_year, trim: r._car_trim, is_used: r._car_is_used,
      } : null
      const clean: any = { ...r, cars }
      delete clean._car_id; delete clean._car_brand; delete clean._car_model
      delete clean._car_number; delete clean._car_year; delete clean._car_trim; delete clean._car_is_used
      return clean
    }

    if (id) {
      const rows = await prisma.$queryRawUnsafe<any[]>(`${SELECT_WITH_CAR} WHERE pw.id = ? LIMIT 1`, id)
      return NextResponse.json({ data: serialize(mapRow(rows[0])) ?? null, error: null })
    } else if (carId) {
      const rows = await prisma.$queryRawUnsafe<any[]>(`${SELECT_WITH_CAR} WHERE pw.car_id = ? ORDER BY pw.updated_at DESC LIMIT 1`, carId)
      return NextResponse.json({ data: serialize(mapRow(rows[0])) ?? null, error: null })
    } else {
      const rows = await prisma.$queryRawUnsafe<any[]>(`${SELECT_WITH_CAR} ORDER BY pw.updated_at DESC LIMIT 500`)
      return NextResponse.json({ data: serialize(rows.map(mapRow)) ?? [], error: null })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()

    // 화이트리스트 + 컬럼명 정규식 검증
    const entries = Object.entries(body).filter(
      ([k, v]) => SAFE_COL.test(k) && (ALLOWED_COLS as readonly string[]).includes(k) && v !== undefined
    )

    const cols = ['id', ...entries.map(([k]) => k)]
    const vals = [id, ...entries.map(([, v]) => {
      if (v === null) return null
      if (typeof v === 'object') return JSON.stringify(v) // JSON 컬럼 대응
      return v
    })]

    const placeholders = cols.map(() => '?').join(', ')
    const colSql = cols.map(c => `\`${c}\``).join(', ')
    await prisma.$executeRawUnsafe(
      `INSERT INTO pricing_worksheets (${colSql}, created_at, updated_at) VALUES (${placeholders}, NOW(), NOW())`,
      ...vals
    )

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM pricing_worksheets WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]) ?? { id }, error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
