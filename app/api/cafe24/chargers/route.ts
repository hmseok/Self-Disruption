/**
 * GET /api/cafe24/chargers
 *
 * 카페24 충전기 (pluglink_charger cr + pluglink_charger_station cs)
 *
 * 컬럼:
 *   cr.id PK, cr.project_id, cr.model, cr.charger_number, cr.pluglink_id
 *   cs.station_name, cs.address (JOIN)
 *
 * PR-6.14.a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

interface ChargerRow extends RowDataPacket {
  id: number | string
  project_id: number | string | null
  model: string | null
  charger_number: string | null
  pluglink_id: string | null
  station_id: number | string | null
  station_name: string | null
  address: string | null
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json(
      { success: false, data: [], error: 'unauthorized' },
      { status: 401 }
    )
  const allowed = await canAccessPage(user, ['/RideMTOps/chargers'])
  if (!allowed)
    return NextResponse.json(
      { success: false, data: [], error: 'forbidden' },
      { status: 403 }
    )

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '1000', 10) || 1000, 1),
    10000
  )

  const FULL_SQL = `
    SELECT cr.id, cr.project_id, cr.model, cr.charger_number, cr.pluglink_id,
           cr.station_id,
           cs.station_name, cs.address
      FROM pluglink_charger cr
      LEFT JOIN pluglink_charger_station cs ON cs.id = cr.station_id
     ${q ? "WHERE cr.charger_number LIKE ? OR cs.station_name LIKE ? OR cs.address LIKE ? OR cr.model LIKE ?" : ''}
     ORDER BY cr.charger_number
     LIMIT ${limit}
  `

  const SIMPLE_SQL = `
    SELECT id, project_id, model, charger_number, pluglink_id,
           station_id,
           NULL AS station_name, NULL AS address
      FROM pluglink_charger
     ORDER BY charger_number
     LIMIT ${limit}
  `

  const args: string[] = []
  if (q) {
    const like = `%${q}%`
    args.push(like, like, like, like)
  }

  let rows: ChargerRow[]
  let mode: 'full' | 'simple' | 'empty' = 'full'
  try {
    rows = await cafe24Db.query<ChargerRow>(FULL_SQL, args)
  } catch (e1) {
    console.warn('[chargers FULL fallback]', (e1 as Error).message)
    try {
      rows = await cafe24Db.query<ChargerRow>(SIMPLE_SQL)
      mode = 'simple'
    } catch (e2) {
      console.warn('[chargers SIMPLE fallback]', (e2 as Error).message)
      rows = []
      mode = 'empty'
    }
  }

  return NextResponse.json({
    success: true,
    data: rows,
    meta: {
      fetched_at: new Date().toISOString(),
      count: rows.length,
      filters: { q },
      mode,
    },
  })
}
