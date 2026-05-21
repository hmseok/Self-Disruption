/**
 * /api/ride-chargers/[id]
 *
 * PATCH  — 충전기 자산 인라인 편집
 * DELETE — 충전기 자산 삭제
 *
 * PR-6.14.b-1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { prisma } from '@/lib/prisma'

// 편집 허용 컬럼 화이트리스트
const EDITABLE = new Set([
  'charger_code', 'station_name', 'address', 'model', 'charger_type',
  'capacity_kw', 'installed_date', 'status', 'memo',
])
const NUMERIC = new Set(['capacity_kw'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  const allowed = await canAccessPage(user, ['/RideMTOps/chargers'])
  if (!allowed)
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const sets: string[] = []
  const args: (string | number | null)[] = []
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE.has(k)) continue
    if (NUMERIC.has(k)) {
      if (v == null || v === '') {
        sets.push(`${k} = ?`)
        args.push(null)
      } else {
        const n = Number(v)
        if (!Number.isFinite(n)) continue
        sets.push(`${k} = ?`)
        args.push(n)
      }
    } else {
      const s = v == null ? '' : String(v).trim()
      sets.push(`${k} = ?`)
      args.push(s === '' ? null : s)
    }
  }
  if (sets.length === 0) {
    return NextResponse.json({ success: false, error: '변경할 필드 없음' }, { status: 400 })
  }

  try {
    args.push(id)
    const sql = `UPDATE ride_chargers SET ${sets.join(', ')} WHERE id = ?`
    const result = await prisma.$executeRawUnsafe(sql, ...args)
    return NextResponse.json({ success: true, updated: Number(result) })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'ER_DUP_ENTRY' || /Duplicate entry/i.test(String(err.message))) {
      return NextResponse.json(
        { success: false, error: '이미 등록된 충전기 ID' },
        { status: 409 }
      )
    }
    console.error('[/api/ride-chargers/[id] PATCH]', err.code, err.message)
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
  const allowed = await canAccessPage(user, ['/RideMTOps/chargers'])
  if (!allowed)
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params

  try {
    // 유지보수 이력이 있으면 삭제 차단 (참조 무결성)
    const [cnt] = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM ride_charger_maintenance WHERE charger_id = ${id}
    `
    if (Number(cnt?.c || 0) > 0) {
      return NextResponse.json(
        { success: false, error: `유지보수 이력 ${Number(cnt.c)}건 존재 — 먼저 정리 필요` },
        { status: 409 }
      )
    }
    const result = await prisma.$executeRaw`DELETE FROM ride_chargers WHERE id = ${id}`
    return NextResponse.json({ success: true, deleted: Number(result) })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-chargers/[id] DELETE]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
