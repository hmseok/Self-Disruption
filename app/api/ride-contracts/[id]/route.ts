/**
 * /api/ride-contracts/[id]
 *
 * GET    — 단일 계약 상세
 * PATCH  — 화이트리스트 컬럼 수정
 * DELETE — soft delete (status='terminated')
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface ContractRow {
  id: string
  [key: string]: unknown
}

const UPDATABLE = [
  'customer_id', 'exec_no', 'contractor', 'contract_product', 'user_name',
  'car_number', 'car_model', 'car_reg_date',
  'contract_start', 'contract_period', 'contract_end', 'is_new', 'car_options',
  'vin', 'insurance_co', 'age_band', 'ins_start_date', 'ins_period',
  'ins_di', 'ins_dm', 'ins_js', 'ins_uninsured', 'ins_deductible',
  'emergency', 'monthly_fee', 'maint_product', 'snow_tire', 'snow_chain',
  'cust_manager', 'office_phone', 'cust_mobile', 'cust_address',
  'status', 'note',
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
    const [row] = await prisma.$queryRaw<ContractRow[]>`
      SELECT * FROM ride_contracts WHERE id = ${id} LIMIT 1
    `
    if (!row)
      return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-contracts/[id] GET]', err.code, err.message)
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
      `UPDATE ride_contracts SET ${setSql.join(', ')} WHERE id = ?`,
      ...vals
    )
    const [row] = await prisma.$queryRaw<ContractRow[]>`
      SELECT * FROM ride_contracts WHERE id = ${id} LIMIT 1
    `
    if (!row)
      return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json(
        { success: false, error: '이미 등록된 실행번호' },
        { status: 409 }
      )
    }
    console.error('[/api/ride-contracts/[id] PATCH]', err.code, err.message)
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
    await prisma.$executeRaw`UPDATE ride_contracts SET status = 'terminated' WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-contracts/[id] DELETE]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
