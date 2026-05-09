/**
 * /api/ride-settlements
 *
 * GET  — 정산서 list (filter: customer_id / period / status / category)
 * POST — 신규 정산서 (보통 upload API 사용 — POST 는 보조)
 *
 * PR-6.11.a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

interface SettlementRow {
  id: string
  customer_id: string | null
  customer_name_snap: string | null
  parent_settlement_id: string | null
  layout_type: string
  layout_signature: string | null
  category: string | null
  source_file: string | null
  sheet_name: string | null
  period_label: string | null
  period_start: string | null
  period_end: string | null
  item_count: number
  total_supply: string | null
  total_vat: string | null
  total_amount: string | null
  status: string
  reviewed_by: string | null
  reviewed_by_name: string | null
  reviewed_at: Date | string | null
  dispute_reason: string | null
  note: string | null
  created_at: Date | string
  updated_at: Date | string
}

const SELECT_COLS = `
  id, customer_id, customer_name_snap, parent_settlement_id,
  layout_type, layout_signature, category,
  source_file, sheet_name, period_label, period_start, period_end,
  item_count, total_supply, total_vat, total_amount,
  status, reviewed_by, reviewed_by_name, reviewed_at, dispute_reason,
  note, created_at, updated_at
`

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, data: [], error: 'forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const customerId = url.searchParams.get('customer_id')
  const status = url.searchParams.get('status')
  const period = url.searchParams.get('period')
  const category = url.searchParams.get('category')
  const parentOnly = url.searchParams.get('parent_only') === '1'
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1),
    1000
  )

  try {
    const conds: string[] = []
    const args: (string | number)[] = []
    if (customerId) {
      conds.push('customer_id = ?')
      args.push(customerId)
    }
    if (status) {
      conds.push('status = ?')
      args.push(status)
    }
    if (period) {
      conds.push('period_label = ?')
      args.push(period)
    }
    if (category) {
      conds.push('category = ?')
      args.push(category)
    }
    if (parentOnly) {
      conds.push('parent_settlement_id IS NULL')
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''
    const sql = `SELECT ${SELECT_COLS} FROM ride_settlements ${where}
                 ORDER BY period_label DESC, created_at DESC LIMIT ${limit}`
    const rows = await prisma.$queryRawUnsafe<SettlementRow[]>(sql, ...args)
    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        count: rows.length,
        filters: { customerId, status, period, category, parentOnly },
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
    console.error('[/api/ride-settlements GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

const INSERTABLE = [
  'customer_id', 'customer_name_snap', 'parent_settlement_id',
  'layout_type', 'layout_signature', 'category',
  'source_file', 'sheet_name', 'period_label', 'period_start', 'period_end',
  'item_count', 'total_supply', 'total_vat', 'total_amount',
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
  const vals: (string | null | number)[] = [id, user.id]
  for (const col of INSERTABLE) {
    if (col in body) {
      const v = body[col]
      cols.push(col)
      placeholders.push('?')
      if (col === 'item_count') {
        vals.push(Number(v) || 0)
      } else {
        vals.push(v === null || v === '' ? null : String(v))
      }
    }
  }
  const sql = `INSERT INTO ride_settlements (${cols.join(',')}) VALUES (${placeholders.join(',')})`

  try {
    await prisma.$executeRawUnsafe(sql, ...vals)
    const [row] = await prisma.$queryRawUnsafe<SettlementRow[]>(
      `SELECT ${SELECT_COLS} FROM ride_settlements WHERE id = ? LIMIT 1`,
      id
    )
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-settlements POST]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
