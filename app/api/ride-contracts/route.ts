/**
 * /api/ride-contracts
 *
 * GET  — 계약 마스터 list (filter: customer_id / q / car_number / contractor)
 * POST — 신규 등록
 *
 * PR-6.10
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

interface ContractRow {
  id: string
  customer_id: string | null
  source_file: string | null
  exec_no: string | null
  contractor: string | null
  contract_product: string | null
  user_name: string | null
  car_number: string | null
  car_model: string | null
  car_reg_date: string | null
  contract_start: string | null
  contract_period: string | null
  contract_end: string | null
  is_new: string | null
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
  office_phone: string | null
  cust_mobile: string | null
  cust_address: string | null
  status: string
  note: string | null
  created_at: Date | string
  updated_at: Date | string
}

const SELECT_COLS = `
  id, customer_id, source_file,
  exec_no, contractor, contract_product, user_name,
  car_number, car_model, car_reg_date,
  contract_start, contract_period, contract_end, is_new, car_options,
  vin, insurance_co, age_band, ins_start_date, ins_period,
  ins_di, ins_dm, ins_js, ins_uninsured, ins_deductible,
  emergency, monthly_fee, maint_product, snow_tire, snow_chain,
  cust_manager, office_phone, cust_mobile, cust_address,
  status, note, created_at, updated_at
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
  const status = url.searchParams.get('status')
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 1),
    2000
  )

  const like = q ? `%${q}%` : null

  try {
    let rows: ContractRow[]
    if (customer_id && status && like) {
      rows = await prisma.$queryRawUnsafe<ContractRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_contracts
         WHERE customer_id = ? AND status = ?
           AND (car_number LIKE ? OR car_model LIKE ? OR contractor LIKE ? OR user_name LIKE ? OR exec_no LIKE ?)
         ORDER BY created_at DESC LIMIT ${limit}`,
        customer_id, status, like, like, like, like, like
      )
    } else if (customer_id && status) {
      rows = await prisma.$queryRawUnsafe<ContractRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_contracts
         WHERE customer_id = ? AND status = ?
         ORDER BY created_at DESC LIMIT ${limit}`,
        customer_id, status
      )
    } else if (customer_id && like) {
      rows = await prisma.$queryRawUnsafe<ContractRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_contracts
         WHERE customer_id = ?
           AND (car_number LIKE ? OR car_model LIKE ? OR contractor LIKE ? OR user_name LIKE ? OR exec_no LIKE ?)
         ORDER BY created_at DESC LIMIT ${limit}`,
        customer_id, like, like, like, like, like
      )
    } else if (customer_id) {
      rows = await prisma.$queryRawUnsafe<ContractRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_contracts
         WHERE customer_id = ?
         ORDER BY created_at DESC LIMIT ${limit}`,
        customer_id
      )
    } else if (status && like) {
      rows = await prisma.$queryRawUnsafe<ContractRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_contracts
         WHERE status = ?
           AND (car_number LIKE ? OR car_model LIKE ? OR contractor LIKE ? OR user_name LIKE ? OR exec_no LIKE ?)
         ORDER BY created_at DESC LIMIT ${limit}`,
        status, like, like, like, like, like
      )
    } else if (status) {
      rows = await prisma.$queryRawUnsafe<ContractRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_contracts
         WHERE status = ?
         ORDER BY created_at DESC LIMIT ${limit}`,
        status
      )
    } else if (like) {
      rows = await prisma.$queryRawUnsafe<ContractRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_contracts
         WHERE (car_number LIKE ? OR car_model LIKE ? OR contractor LIKE ? OR user_name LIKE ? OR exec_no LIKE ?)
         ORDER BY created_at DESC LIMIT ${limit}`,
        like, like, like, like, like
      )
    } else {
      rows = await prisma.$queryRawUnsafe<ContractRow[]>(
        `SELECT ${SELECT_COLS} FROM ride_contracts ORDER BY created_at DESC LIMIT ${limit}`
      )
    }
    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        count: rows.length,
        filters: { customer_id, q, status },
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
    console.error('[/api/ride-contracts GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

const INSERTABLE = [
  'customer_id', 'source_file',
  'exec_no', 'contractor', 'contract_product', 'user_name',
  'car_number', 'car_model', 'car_reg_date',
  'contract_start', 'contract_period', 'contract_end', 'is_new', 'car_options',
  'vin', 'insurance_co', 'age_band', 'ins_start_date', 'ins_period',
  'ins_di', 'ins_dm', 'ins_js', 'ins_uninsured', 'ins_deductible',
  'emergency', 'monthly_fee', 'maint_product', 'snow_tire', 'snow_chain',
  'cust_manager', 'office_phone', 'cust_mobile', 'cust_address',
  'status', 'note',
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
  const sql = `INSERT INTO ride_contracts (${cols.join(',')}) VALUES (${placeholders.join(',')})`

  try {
    await prisma.$executeRawUnsafe(sql, ...vals)
    const [row] = await prisma.$queryRawUnsafe<ContractRow[]>(
      `SELECT ${SELECT_COLS} FROM ride_contracts WHERE id = ? LIMIT 1`,
      id
    )
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json(
        { success: false, error: '이미 등록된 실행번호 (계약)' },
        { status: 409 }
      )
    }
    console.error('[/api/ride-contracts POST]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
