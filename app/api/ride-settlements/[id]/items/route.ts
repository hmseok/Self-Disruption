/**
 * /api/ride-settlements/[id]/items
 *
 * GET — 정산서 row 목록 (filter: q / match_status / category / car_number)
 *
 * PR-6.11.a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface ItemRow {
  id: string
  settlement_id: string
  layout_type: string | null
  category: string | null
  exec_no: string | null
  car_number: string | null
  car_model: string | null
  vin: string | null
  cust_name: string | null
  sub_customer: string | null
  product_name: string | null
  base_fee: string | null
  additional_fee: string | null
  supply_amount: string | null
  vat_amount: string | null
  total_amount: string | null
  payment_amount: string | null
  exec_date: string | null
  loan_end_date: string | null
  closing_date: string | null
  termination_date: string | null
  exec_status: string | null
  exec_reason: string | null
  closing_reason: string | null
  installment_no: number | null
  installment_total: number | null
  installments_remaining: number | null
  matched_cafe24_idno: string | null
  matched_contract_id: string | null
  matched_report_id: string | null
  match_status: string | null
  match_score: string | null
  raw_extra: unknown
  created_at: Date | string
  updated_at: Date | string
}

const SELECT_COLS = `
  id, settlement_id, layout_type, category,
  exec_no, car_number, car_model, vin,
  cust_name, sub_customer, product_name,
  base_fee, additional_fee, supply_amount, vat_amount, total_amount, payment_amount,
  exec_date, loan_end_date, closing_date, termination_date,
  exec_status, exec_reason, closing_reason,
  installment_no, installment_total, installments_remaining,
  matched_cafe24_idno, matched_contract_id, matched_report_id,
  match_status, match_score,
  created_at, updated_at
`

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, data: [], error: 'forbidden' }, { status: 403 })
  const { id } = await params

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const matchStatus = url.searchParams.get('match_status')
  const category = url.searchParams.get('category')
  const carNumber = (url.searchParams.get('car_number') || '').trim()
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 1),
    5000
  )

  try {
    const conds: string[] = ['settlement_id = ?']
    const args: (string | number)[] = [id]
    if (matchStatus) {
      conds.push('match_status = ?')
      args.push(matchStatus)
    }
    if (category) {
      conds.push('category = ?')
      args.push(category)
    }
    if (carNumber) {
      conds.push('car_number LIKE ?')
      args.push(`%${carNumber}%`)
    }
    if (q) {
      conds.push('(car_number LIKE ? OR exec_no LIKE ? OR cust_name LIKE ? OR car_model LIKE ?)')
      const like = `%${q}%`
      args.push(like, like, like, like)
    }
    const sql = `SELECT ${SELECT_COLS} FROM ride_settlement_items
                 WHERE ${conds.join(' AND ')}
                 ORDER BY car_number ASC LIMIT ${limit}`
    const rows = await prisma.$queryRawUnsafe<ItemRow[]>(sql, ...args)
    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        count: rows.length,
        filters: { q, matchStatus, category, carNumber },
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
    console.error('[/api/ride-settlements/[id]/items GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
