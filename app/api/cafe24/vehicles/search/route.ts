/**
 * GET /api/cafe24/vehicles/search?q=
 *
 * 카페24 ERP `pmccarsm` 차량 마스터 read-only 검색.
 * 차량번호 / 차종 / 차주명 부분 일치.
 *
 * Query:
 *   q      검색어 (차량번호 LIKE / 차종 LIKE / 차주명 LIKE — OR)
 *   limit  기본 50, 최대 200
 *
 * cafe24-db: MariaDB 10.1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

export interface VehicleRow extends RowDataPacket {
  carsidno: string
  carsfrdt: string
  carstodt: string
  carsnums: string | null
  carsodnm: string | null
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json(
      { success: false, data: [], error: 'unauthorized' },
      { status: 401 }
    )
  }
  // 차량 검색 — 차량등록 / 정산서 / 사고/긴출 어디서든 권한 있으면 통과
  const allowed = await canAccessPage(user, [
    '/RideVehicleRegistry',
    '/RideAccidents',
    '/RideAccidentReports',
    '/RideSettlements',
    '/RideCustomerData',
  ])
  if (!allowed) {
    return NextResponse.json(
      { success: false, data: [], error: 'forbidden' },
      { status: 403 }
    )
  }

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1),
    200
  )

  if (q.length < 1) {
    return NextResponse.json({
      success: true,
      data: [],
      meta: { fetched_at: new Date().toISOString(), hint: 'q 검색어 필요' },
    })
  }

  try {
    // 효력기간 BETWEEN 으로 현재 활성 차량 마스터만
    // (한 차량이 carsfrdt~carstodt 여러 row 가능 — SCD-Type2)
    const today = new Date()
    const todayStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0')

    const sql = `
      SELECT carsidno, carsfrdt, carstodt, carsnums, carsodnm
        FROM pmccarsm
       WHERE ? BETWEEN carsfrdt AND carstodt
         AND (carsnums LIKE ? OR carsodnm LIKE ?)
       ORDER BY carsnums
       LIMIT ?
    `
    const like = `%${q}%`
    const rows = await cafe24Db.query<VehicleRow>(sql, [todayStr, like, like, limit])

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        cache: 60,
        q,
        limit,
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/cafe24/vehicles/search] error:', err.code, err.message)
    return NextResponse.json(
      {
        success: false,
        data: [],
        error: 'cafe24-unavailable',
        meta: { db_error: err.code || 'no-code' },
      },
      { status: 200 }
    )
  }
}
