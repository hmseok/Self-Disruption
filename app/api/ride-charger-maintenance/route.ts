/**
 * /api/ride-charger-maintenance
 *
 * GET — 충전기 유지보수 이력 list (filter: charger_id / status / maint_type)
 *
 * PR-6.14.b-1 — 골격 (GET 만). POST/일정배정은 b-3 에서 본격 구현.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { prisma } from '@/lib/prisma'

interface MaintRow {
  id: string
  charger_id: string
  charger_code: string | null
  station_name: string | null
  maint_type: string
  scheduled_date: string | null
  maint_date: string | null
  title: string | null
  detail: string | null
  assignee: string | null
  cost: string | null
  status: string
  settled: number
  created_at: Date | string
  updated_at: Date | string
  created_by_name: string | null
}

function isMissingTable(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e)
  return /doesn't exist|Unknown table|no such table/i.test(msg)
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  const allowed = await canAccessPage(user, ['/RideMTOps/chargers'])
  if (!allowed)
    return NextResponse.json({ success: false, data: [], error: 'forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const chargerId = (url.searchParams.get('charger_id') || '').trim()
  const status = (url.searchParams.get('status') || '').trim()
  const maintType = (url.searchParams.get('maint_type') || '').trim()
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '2000', 10) || 2000, 1),
    10000
  )

  try {
    const conds: string[] = []
    const args: (string | number)[] = []
    if (chargerId) {
      conds.push('m.charger_id = ?')
      args.push(chargerId)
    }
    if (status) {
      conds.push('m.status = ?')
      args.push(status)
    }
    if (maintType) {
      conds.push('m.maint_type = ?')
      args.push(maintType)
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''
    const sql = `
      SELECT m.id, m.charger_id, c.charger_code, c.station_name,
             m.maint_type, m.scheduled_date, m.maint_date,
             m.title, m.detail, m.assignee, m.cost, m.status, m.settled,
             m.created_at, m.updated_at, m.created_by_name
        FROM ride_charger_maintenance m
        LEFT JOIN ride_chargers c ON c.id = m.charger_id
        ${where}
       ORDER BY COALESCE(m.scheduled_date, m.maint_date) DESC, m.created_at DESC
       LIMIT ${limit}
    `
    const rows = await prisma.$queryRawUnsafe<MaintRow[]>(sql, ...args)
    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        count: rows.length,
        filters: { charger_id: chargerId, status, maint_type: maintType },
      },
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
    console.error('[/api/ride-charger-maintenance GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
