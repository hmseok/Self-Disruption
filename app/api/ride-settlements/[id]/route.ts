/**
 * /api/ride-settlements/[id]
 *
 * GET    — 상세 (children 포함)
 * PATCH  — 검수 상태 / 메타 수정 + audit log
 * DELETE — children 까지 hard delete (정산서 + items + vehicle_status)
 *
 * PR-6.11.a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { logAuditChanges, logAuditAction } from '@/lib/audit-log'

interface SettlementRow {
  id: string
  [key: string]: unknown
}

const UPDATABLE = [
  'customer_id', 'customer_name_snap',
  'period_label', 'period_start', 'period_end',
  'category', 'status', 'reviewed_by', 'reviewed_by_name', 'reviewed_at',
  'dispute_reason', 'note',
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
    const [row] = await prisma.$queryRaw<SettlementRow[]>`
      SELECT * FROM ride_settlements WHERE id = ${id} LIMIT 1
    `
    if (!row)
      return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })
    // 자녀 정산서 (parent 인 경우)
    const children = await prisma.$queryRaw<SettlementRow[]>`
      SELECT * FROM ride_settlements WHERE parent_settlement_id = ${id}
      ORDER BY sheet_name ASC
    `
    return NextResponse.json({ success: true, data: row, children })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-settlements/[id] GET]', err.code, err.message)
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

  const [before] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM ride_settlements WHERE id = ${id} LIMIT 1
  `
  if (!before)
    return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })

  // 검수 자동 채움 — status: pending → reviewing/confirmed/disputed 시 reviewed_by/_at
  const updates = { ...body }
  const userTyped = user as { id: string; name?: string }
  if (
    typeof updates.status === 'string' &&
    ['reviewing', 'confirmed', 'disputed'].includes(updates.status) &&
    !updates.reviewed_at
  ) {
    updates.reviewed_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
    updates.reviewed_by = userTyped.id
    updates.reviewed_by_name = userTyped.name || null
  }

  const setSql: string[] = []
  const vals: (string | null)[] = []
  const changes: Record<string, { old: unknown; new: unknown }> = {}
  for (const col of UPDATABLE) {
    if (col in updates) {
      setSql.push(`${col} = ?`)
      const v = updates[col]
      const newVal = v === null || v === '' ? null : String(v)
      vals.push(newVal)
      changes[col] = { old: before[col], new: newVal }
    }
  }
  if (setSql.length === 0)
    return NextResponse.json({ success: false, error: 'no fields to update' }, { status: 400 })
  vals.push(id)

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE ride_settlements SET ${setSql.join(', ')} WHERE id = ?`,
      ...vals
    )
    await logAuditChanges('ride_settlements', id, changes, {
      id: userTyped.id,
      name: userTyped.name,
    })
    const [row] = await prisma.$queryRaw<SettlementRow[]>`
      SELECT * FROM ride_settlements WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-settlements/[id] PATCH]', err.code, err.message)
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
    // children 정산서들의 items / vehicle_status 도 삭제
    const childIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM ride_settlements WHERE parent_settlement_id = ${id}
    `
    const allIds = [id, ...childIds.map(c => c.id)]
    for (const sid of allIds) {
      await prisma.$executeRaw`DELETE FROM ride_settlement_items WHERE settlement_id = ${sid}`
      await prisma.$executeRaw`DELETE FROM ride_settlement_vehicle_status WHERE settlement_id = ${sid}`
    }
    // children 먼저 삭제
    await prisma.$executeRaw`DELETE FROM ride_settlements WHERE parent_settlement_id = ${id}`
    await prisma.$executeRaw`DELETE FROM ride_settlements WHERE id = ${id}`
    const userTyped = user as { id: string; name?: string }
    await logAuditAction('ride_settlements', id, 'delete', {
      id: userTyped.id,
      name: userTyped.name,
    }, `cascade: ${allIds.length} settlements`)
    return NextResponse.json({ success: true, deleted_count: allIds.length })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-settlements/[id] DELETE]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
