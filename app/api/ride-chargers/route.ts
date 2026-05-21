/**
 * /api/ride-chargers
 *
 * GET  — 충전기 자산 list (filter: q 검색 / status)
 * POST — 신규 충전기 자산 등록
 *
 * PR-6.14.b-1 (MT팀 충전기 자산)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

interface ChargerRow {
  id: string
  charger_code: string
  station_name: string | null
  address: string | null
  model: string | null
  charger_type: string | null
  capacity_kw: string | null
  installed_date: string | null
  status: string
  memo: string | null
  created_at: Date | string
  updated_at: Date | string
  created_by_name: string | null
}

// migration 미적용 감지
function isMissingTable(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e)
  return /doesn't exist|Unknown table|no such table/i.test(msg)
}

// ─── GET ──────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  const allowed = await canAccessPage(user, ['/RideMTOps/chargers'])
  if (!allowed)
    return NextResponse.json({ success: false, data: [], error: 'forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const status = (url.searchParams.get('status') || '').trim()
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '1000', 10) || 1000, 1),
    5000
  )

  try {
    const conds: string[] = []
    const args: (string | number)[] = []
    if (q) {
      conds.push('(charger_code LIKE ? OR station_name LIKE ? OR address LIKE ? OR model LIKE ?)')
      const like = `%${q}%`
      args.push(like, like, like, like)
    }
    if (status) {
      conds.push('status = ?')
      args.push(status)
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''
    const sql = `
      SELECT id, charger_code, station_name, address, model, charger_type,
             capacity_kw, installed_date, status, memo,
             created_at, updated_at, created_by_name
        FROM ride_chargers
        ${where}
       ORDER BY charger_code ASC
       LIMIT ${limit}
    `
    const rows = await prisma.$queryRawUnsafe<ChargerRow[]>(sql, ...args)
    return NextResponse.json({
      success: true,
      data: rows,
      meta: { fetched_at: new Date().toISOString(), count: rows.length, filters: { q, status } },
    })
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json({
        success: true,
        data: [],
        error: null,
        meta: { _migration_pending: true, migration: 'migrations/2026-05-21_ride_chargers.sql' },
      })
    }
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-chargers GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

// ─── POST ─────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  const allowed = await canAccessPage(user, ['/RideMTOps/chargers'])
  if (!allowed)
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const chargerCode = String(body.charger_code || '').trim()
  if (!chargerCode) {
    return NextResponse.json({ success: false, error: '충전기 ID(charger_code) 필수' }, { status: 400 })
  }

  const str = (v: unknown): string | null => {
    const s = v == null ? '' : String(v).trim()
    return s === '' ? null : s
  }
  const num = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const userTyped = user as { id: string; name?: string }
  const id = randomUUID()
  const status = str(body.status) || '정상'

  try {
    await prisma.$executeRaw`
      INSERT INTO ride_chargers
        (id, charger_code, station_name, address, model, charger_type,
         capacity_kw, installed_date, status, memo, created_by, created_by_name)
      VALUES
        (${id}, ${chargerCode}, ${str(body.station_name)}, ${str(body.address)},
         ${str(body.model)}, ${str(body.charger_type)},
         ${num(body.capacity_kw)}, ${str(body.installed_date)},
         ${status}, ${str(body.memo)},
         ${userTyped.id}, ${userTyped.name || null})
    `
    return NextResponse.json({ success: true, id })
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json(
        { success: false, error: 'migration 미적용 — migrations/2026-05-21_ride_chargers.sql 실행 필요' },
        { status: 503 }
      )
    }
    const err = e as { code?: string; message?: string }
    // UNIQUE 중복
    if (err.code === 'ER_DUP_ENTRY' || /Duplicate entry/i.test(String(err.message))) {
      return NextResponse.json(
        { success: false, error: `이미 등록된 충전기 ID: ${chargerCode}` },
        { status: 409 }
      )
    }
    console.error('[/api/ride-chargers POST]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
