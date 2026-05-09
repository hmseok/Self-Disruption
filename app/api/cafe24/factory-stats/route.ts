/**
 * GET /api/cafe24/factory-stats
 *
 * 카페24 ajaoderh GROUP BY oderfact — 공장별 배정 통계
 *
 * 응답: { data: [{ factcode, assign_count, last_assigned_date, distinct_cars, distinct_customers }] }
 *
 * 흐름:
 *   try   FULL  (ajaoderh + pmccarsm + pmccustm)
 *   catch SIMPLE (ajaoderh 만)
 *   catch EMPTY ([] 응답)
 *
 * PR-6.12.d
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

interface StatsRow extends RowDataPacket {
  factcode: string | null
  assign_count: number
  last_assigned_date: string | null
  distinct_cars: number | null
  distinct_customers: number | null
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json(
      { success: false, data: [], error: 'unauthorized' },
      { status: 401 }
    )
  const allowed = await canAccessPage(user, [
    '/factory-search',
    '/factory-search/mgmt',
  ])
  if (!allowed)
    return NextResponse.json(
      { success: false, data: [], error: 'forbidden' },
      { status: 403 }
    )

  const url = new URL(request.url)
  const factcodes = (url.searchParams.get('factcodes') || '').trim()
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '5000', 10) || 5000, 1),
    20000
  )

  // factcodes 필터 (선택)
  let factcodeFilter = ''
  const args: (string | number)[] = []
  if (factcodes) {
    const list = factcodes.split(',').map(s => s.trim()).filter(Boolean)
    if (list.length > 0 && list.length <= 1000) {
      factcodeFilter = `AND o.oderfact IN (${list.map(() => '?').join(',')})`
      args.push(...list)
    }
  }

  // FULL — pmccarsm + pmccustm join 으로 distinct 차량/고객
  const FULL_SQL = `
    SELECT o.oderfact AS factcode,
           COUNT(*) AS assign_count,
           MAX(o.odermddt) AS last_assigned_date,
           COUNT(DISTINCT c.carsnums) AS distinct_cars,
           COUNT(DISTINCT c.carscust) AS distinct_customers
      FROM ajaoderh o
      LEFT JOIN pmccarsm c
        ON c.carsidno = o.oderidno
       AND o.odermddt BETWEEN c.carsfrdt AND c.carstodt
     WHERE o.oderstat <> 'X'
       AND o.oderfact IS NOT NULL
       ${factcodeFilter}
     GROUP BY o.oderfact
     ORDER BY assign_count DESC
     LIMIT ${limit}
  `

  // SIMPLE — pmccarsm 없이 (join 권한/존재 issue 회피)
  const SIMPLE_SQL = `
    SELECT oderfact AS factcode,
           COUNT(*) AS assign_count,
           MAX(odermddt) AS last_assigned_date,
           NULL AS distinct_cars,
           NULL AS distinct_customers
      FROM ajaoderh
     WHERE oderstat <> 'X'
       AND oderfact IS NOT NULL
       ${factcodeFilter.replace(/o\.oderfact/g, 'oderfact')}
     GROUP BY oderfact
     ORDER BY assign_count DESC
     LIMIT ${limit}
  `

  let rows: StatsRow[]
  let mode: 'full' | 'simple' | 'empty' = 'full'
  try {
    rows = await cafe24Db.query<StatsRow>(FULL_SQL, args)
  } catch (e1) {
    console.warn('[factory-stats FULL fallback]', (e1 as Error).message)
    try {
      rows = await cafe24Db.query<StatsRow>(SIMPLE_SQL, args)
      mode = 'simple'
    } catch (e2) {
      console.warn('[factory-stats SIMPLE fallback]', (e2 as Error).message)
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
      mode,  // full / simple / empty
    },
  })
}
