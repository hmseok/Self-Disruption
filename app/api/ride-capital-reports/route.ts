/**
 * /api/ride-capital-reports
 *
 * GET  — 캐피탈 보고 list (filter: customer_id / q / car_number / from / to)
 * POST — 수기 등록 (보통 엑셀 업로드 사용 — POST 는 보조)
 *
 * PR-6.10
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

interface ReportRow {
  id: string
  customer_id: string | null
  customer_name_snap: string | null
  report_date: string | null
  source_file: string | null
  exec_no: string | null
  cust_name: string | null
  car_number: string | null
  car_model: string | null
  car_reg_date: string | null
  loan_start_date: string | null
  loan_period: string | null
  loan_end_date: string | null
  exec_reason: string | null
  car_options: string | null
  vin: string | null
  insurance_co: string | null
  age_band: string | null
  ins_start_date: string | null
  ins_period: string | null
  ins_di: string | null
  ins_dm: string | null
  ins_js: string | null
  ins_uninsured: string | null
  ins_deductible: string | null
  emergency: string | null
  monthly_fee: string | null
  maint_product: string | null
  snow_tire: string | null
  snow_chain: string | null
  cust_manager: string | null
  cust_phone: string | null
  cust_mobile: string | null
  cust_address: string | null
  bill_address: string | null
  maint_company: string | null
  closing_date: string | null
  termination_date: string | null
  sales_dept: string | null
  sales_manager: string | null
  registered_by: string | null
  rent_substitute: string | null
  additional_driver: string | null
  special_clause: string | null
  note: string | null
  created_at: Date | string
  updated_at: Date | string
}

const SELECT_COLS = `
  id, customer_id, customer_name_snap, report_date, source_file,
  exec_no, cust_name, car_number, car_model, car_reg_date,
  loan_start_date, loan_period, loan_end_date, exec_reason, car_options,
  vin, insurance_co, age_band, ins_start_date, ins_period,
  ins_di, ins_dm, ins_js, ins_uninsured, ins_deductible,
  emergency, monthly_fee, maint_product, snow_tire, snow_chain,
  cust_manager, cust_phone, cust_mobile, cust_address,
  bill_address, maint_company, closing_date, termination_date,
  sales_dept, sales_manager, registered_by,
  rent_substitute, additional_driver, special_clause, note,
  created_at, updated_at
`

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json(
      { success: false, data: [], error: 'unauthorized' },
      { status: 401 }
    )
  if (user.role !== 'admin')
    return NextResponse.json(
      { success: false, data: [], error: 'forbidden' },
      { status: 403 }
    )

  const url = new URL(request.url)
  const customer_id = url.searchParams.get('customer_id')
  const q = (url.searchParams.get('q') || '').trim()
  const car_number = (url.searchParams.get('car_number') || '').trim()
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 1),
    2000
  )

  // 동적 WHERE — 안전하게 분기 (tagged template)
  const like = q ? `%${q}%` : null
  const carLike = car_number ? `%${car_number}%` : null

  try {
    let rows: ReportRow[]
    if (customer_id && from && to && like) {
      rows = await prisma.$queryRawUnsafe<ReportRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_capital_reports
         WHERE customer_id = ? AND report_date BETWEEN ? AND ?
           AND (car_number LIKE ? OR car_model LIKE ? OR cust_name LIKE ? OR exec_no LIKE ?)
         ORDER BY report_date DESC, created_at DESC LIMIT ${limit}`,
        customer_id, from, to, like, like, like, like
      )
    } else if (customer_id && from && to) {
      rows = await prisma.$queryRawUnsafe<ReportRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_capital_reports
         WHERE customer_id = ? AND report_date BETWEEN ? AND ?
         ORDER BY report_date DESC, created_at DESC LIMIT ${limit}`,
        customer_id, from, to
      )
    } else if (customer_id && like) {
      rows = await prisma.$queryRawUnsafe<ReportRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_capital_reports
         WHERE customer_id = ?
           AND (car_number LIKE ? OR car_model LIKE ? OR cust_name LIKE ? OR exec_no LIKE ?)
         ORDER BY report_date DESC, created_at DESC LIMIT ${limit}`,
        customer_id, like, like, like, like
      )
    } else if (customer_id) {
      rows = await prisma.$queryRawUnsafe<ReportRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_capital_reports
         WHERE customer_id = ?
         ORDER BY report_date DESC, created_at DESC LIMIT ${limit}`,
        customer_id
      )
    } else if (carLike) {
      rows = await prisma.$queryRawUnsafe<ReportRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_capital_reports
         WHERE car_number LIKE ?
         ORDER BY report_date DESC, created_at DESC LIMIT ${limit}`,
        carLike
      )
    } else if (like) {
      rows = await prisma.$queryRawUnsafe<ReportRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_capital_reports
         WHERE (car_number LIKE ? OR car_model LIKE ? OR cust_name LIKE ? OR exec_no LIKE ?)
         ORDER BY report_date DESC, created_at DESC LIMIT ${limit}`,
        like, like, like, like
      )
    } else {
      rows = await prisma.$queryRawUnsafe<ReportRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_capital_reports
         ORDER BY report_date DESC, created_at DESC LIMIT ${limit}`
      )
    }
    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        count: rows.length,
        filters: { customer_id, q, car_number, from, to },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { _migration_pending: true },
      })
    }
    console.error('[/api/ride-capital-reports GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

// POST 수기 등록 — body 의 화이트리스트 컬럼만 INSERT
const INSERTABLE = [
  'customer_id', 'customer_name_snap', 'report_date', 'source_file',
  'exec_no', 'cust_name', 'car_number', 'car_model', 'car_reg_date',
  'loan_start_date', 'loan_period', 'loan_end_date', 'exec_reason', 'car_options',
  'vin', 'insurance_co', 'age_band', 'ins_start_date', 'ins_period',
  'ins_di', 'ins_dm', 'ins_js', 'ins_uninsured', 'ins_deductible',
  'emergency', 'monthly_fee', 'maint_product', 'snow_tire', 'snow_chain',
  'cust_manager', 'cust_phone', 'cust_mobile', 'cust_address',
  'bill_address', 'maint_company', 'closing_date', 'termination_date',
  'sales_dept', 'sales_manager', 'registered_by',
  'rent_substitute', 'additional_driver', 'special_clause', 'note',
] as const

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const id = randomUUID()
  const cols: string[] = ['id', 'created_by']
  const placeholders: string[] = ['?', '?']
  const vals: (string | null)[] = [id, user.id]
  for (const col of INSERTABLE) {
    if (col in body) {
      const v = body[col]
      cols.push(col)
      placeholders.push('?')
      vals.push(v === null || v === '' ? null : String(v))
    }
  }
  const sql = `INSERT INTO ride_capital_reports (${cols.join(',')}) VALUES (${placeholders.join(',')})`

  try {
    await prisma.$executeRawUnsafe(sql, ...vals)
    const [row] = await prisma.$queryRawUnsafe<ReportRow[]>(
      `SELECT ${SELECT_COLS} FROM ride_capital_reports WHERE id = ? LIMIT 1`,
      id
    )
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-capital-reports POST]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
