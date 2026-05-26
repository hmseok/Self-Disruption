import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * PATCH  /api/long-term-rentals/[id] — 부분 수정 (허용 필드만)
 * DELETE /api/long-term-rentals/[id] — 삭제
 *
 * PR-L1 (2026-05-24)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

const ALLOWED_FIELDS = new Set([
  'vehicle_id', 'vehicle_car_number', 'customer_name', 'customer_phone',
  'contract_no', 'start_date', 'end_date', 'monthly_fee', 'deposit', 'status', 'notes',
  // PR-L2 — 계약 유형 / 신차 예정 스펙
  'contract_type', 'vehicle_spec',
])
const DATE_FIELDS = new Set(['start_date', 'end_date'])
const NUMBER_FIELDS = new Set(['monthly_fee', 'deposit'])

function toDate(d: unknown): string | null {
  if (!d) return null
  const s = String(d)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
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
      `UPDATE long_term_rentals SET ${setFrags.join(', ')} WHERE id = ?`,
      ...values
    )

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM long_term_rentals WHERE id = ${id} LIMIT 1`
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ data: serialize(rows[0]), error: null })
  } catch (e: unknown) {
    console.error('[long-term-rentals PATCH]', e)
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

    await prisma.$executeRaw`DELETE FROM long_term_rentals WHERE id = ${id}`
    return NextResponse.json({ success: true, error: null })
  } catch (e: unknown) {
    console.error('[long-term-rentals DELETE]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}
