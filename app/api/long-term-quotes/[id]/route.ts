import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET    /api/long-term-quotes/[id] — 견적 상세
 * PATCH  /api/long-term-quotes/[id] — 부분 수정 (허용 필드만)
 * DELETE /api/long-term-quotes/[id] — 삭제
 *
 * PR-Q1 (2026-05-26)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

const ALLOWED_FIELDS = new Set([
  'quote_no', 'status', 'contract_type',
  'customer_name', 'customer_phone', 'customer_email', 'customer_company',
  'vehicle_id', 'vehicle_car_number', 'vehicle_spec',
  'start_date', 'months', 'end_date',
  'monthly_fee', 'deposit', 'upfront_months', 'annual_km',
  'insurance_option', 'delivery_fee',
  'valid_until', 'owner_id', 'owner_name',
  'memo',
])
const DATE_FIELDS = new Set(['start_date', 'end_date', 'valid_until'])
const NUMBER_FIELDS = new Set(['months', 'monthly_fee', 'deposit', 'upfront_months', 'annual_km', 'delivery_fee'])

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
      SELECT * FROM long_term_quotes WHERE id = ${id} LIMIT 1`
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ data: serialize(rows[0]), error: null })
  } catch (e: unknown) {
    console.error('[long-term-quotes GET id]', e)
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
      setFrags.push(`${key} = ?`)
      values.push(v)
    }
    if (setFrags.length === 0) {
      return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 })
    }
    setFrags.push('updated_at = NOW()')
    values.push(id)
    await prisma.$executeRawUnsafe(
      `UPDATE long_term_quotes SET ${setFrags.join(', ')} WHERE id = ?`,
      ...values
    )

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM long_term_quotes WHERE id = ${id} LIMIT 1`
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ data: serialize(rows[0]), error: null })
  } catch (e: unknown) {
    console.error('[long-term-quotes PATCH]', e)
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

    await prisma.$executeRaw`DELETE FROM long_term_quotes WHERE id = ${id}`
    return NextResponse.json({ success: true, error: null })
  } catch (e: unknown) {
    console.error('[long-term-quotes DELETE]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}
