/**
 * GET /api/cafe24/factory-vehicles?factcode=
 *
 * 카페24 ajaoderh — 특정 공장에 배정된 차량 list
 * 응답: [{ car_number, car_model, customer, assigned_date, ... }]
 *
 * PR-6.12.d
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

interface VehicleRow extends RowDataPacket {
  car_number: string | null
  car_model: string | null
  customer: string | null
  assigned_date: string | null
  oderstat: string | null
  oderidno: string | null
  odermddt: string | null
  odersrno: number | null
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
  const factcode = (url.searchParams.get('factcode') || '').trim()
  if (!factcode) {
    return NextResponse.json(
      { success: false, data: [], error: 'factcode 필요' },
      { status: 400 }
    )
  }
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 1),
    5000
  )

  // FULL — pmccarsm + pmccustm join (차량번호 + 차종 + 고객사)
  const FULL_SQL = `
    SELECT c.carsnums  AS car_number,
           c.carsodnm  AS car_model,
           cu.custname AS customer,
           o.odermddt  AS assigned_date,
           o.oderstat,
           o.oderidno, o.odermddt, o.odersrno
      FROM ajaoderh o
      LEFT JOIN pmccarsm c
        ON c.carsidno = o.oderidno
       AND o.odermddt BETWEEN c.carsfrdt AND c.carstodt
      LEFT JOIN pmccustm cu
        ON cu.custcode = c.carscust
     WHERE o.oderfact = ?
       AND o.oderstat <> 'X'
     ORDER BY o.odermddt DESC
     LIMIT ${limit}
  `

  // SIMPLE — ajaoderh 만 (join 회피)
  const SIMPLE_SQL = `
    SELECT NULL AS car_number, NULL AS car_model, NULL AS customer,
           odermddt AS assigned_date, oderstat,
           oderidno, odermddt, odersrno
      FROM ajaoderh
     WHERE oderfact = ?
       AND oderstat <> 'X'
     ORDER BY odermddt DESC
     LIMIT ${limit}
  `

  let rows: VehicleRow[]
  let mode: 'full' | 'simple' | 'empty' = 'full'
  try {
    rows = await cafe24Db.query<VehicleRow>(FULL_SQL, [factcode])
  } catch (e1) {
    console.warn('[factory-vehicles FULL fallback]', (e1 as Error).message)
    try {
      rows = await cafe24Db.query<VehicleRow>(SIMPLE_SQL, [factcode])
      mode = 'simple'
    } catch (e2) {
      console.warn('[factory-vehicles SIMPLE fallback]', (e2 as Error).message)
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
      factcode,
      mode,
    },
  })
}
