/**
 * /api/ride-capital-reports/[id]
 *
 * GET    — 단일 보고 상세
 * PATCH  — 화이트리스트 컬럼 수정
 * DELETE — 하드 delete (raw 누적 보고이므로 잘못 입력된 보고만 삭제)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface ReportRow {
  id: string
  [key: string]: unknown
}

const UPDATABLE = [
  'customer_id', 'customer_name_snap', 'report_date',
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    const [row] = await prisma.$queryRaw<ReportRow[]>`
      SELECT * FROM ride_capital_reports WHERE id = ${id} LIMIT 1
    `
    if (!row)
      return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-capital-reports/[id] GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const setSql: string[] = []
  const vals: (string | null)[] = []
  for (const col of UPDATABLE) {
    if (col in body) {
      setSql.push(`${col} = ?`)
      const v = body[col]
      vals.push(v === null || v === '' ? null : String(v))
    }
  }
  if (setSql.length === 0)
    return NextResponse.json({ success: false, error: 'no fields to update' }, { status: 400 })
  vals.push(id)

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE ride_capital_reports SET ${setSql.join(', ')} WHERE id = ?`,
      ...vals
    )
    const [row] = await prisma.$queryRaw<ReportRow[]>`
      SELECT * FROM ride_capital_reports WHERE id = ${id} LIMIT 1
    `
    if (!row)
      return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-capital-reports/[id] PATCH]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    await prisma.$executeRaw`DELETE FROM ride_capital_reports WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-capital-reports/[id] DELETE]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
