/**
 * GET /api/cafe24/maintenance-tours
 *
 * 카페24 순회정비 (pieclbsm — 정비 청구 마스터)
 * ⚠ 순회정비 정확한 source 미확인 — pieclbsm WHERE clbsmetp = '순회' 추정
 *   사용자 검수 후 정정 예정 (clbsmetp 코드값 확정 시)
 *
 * 컬럼 (추정):
 *   clbsidno / clbsmddt / clbssrno / clbsseqn   PK
 *   clbsmetp (정비 종류 — CLBSMETP 코드)
 *   clbsfact (정비 공장)
 *   clbsdvdt (출고일)
 *   clbsacdt + clbsactm (사고일시)
 *   clbskilo (마일리지)
 *   clbsbogn / clbsbomn / clbsbomx (보험)
 *   clbspers / clbsetcn (etc)
 *
 * PR-6.14.a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

interface TourRow extends RowDataPacket {
  clbsidno: string
  clbsmddt: string
  clbssrno: number
  clbsseqn: number
  clbsmetp: string | null
  clbsfact: string | null
  clbsdvdt: string | null
  clbsacdt: string | null
  clbsactm: string | null
  clbskilo: number | null
  cars_no: string | null
  cars_model: string | null
  cars_user: string | null
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json(
      { success: false, data: [], error: 'unauthorized' },
      { status: 401 }
    )
  const allowed = await canAccessPage(user, ['/RideMTOps/maintenance-tours'])
  if (!allowed)
    return NextResponse.json(
      { success: false, data: [], error: 'forbidden' },
      { status: 403 }
    )

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 1),
    5000
  )

  // FULL — 순회 추정 (clbsmetp = '순회' 또는 코드값 가설)
  // 사용자 검수 후 WHERE 절 정정 필요
  const FULL_SQL = `
    SELECT cb.clbsidno, cb.clbsmddt, cb.clbssrno, cb.clbsseqn,
           get_cbsddesc('CLBSMETP', cb.clbsmetp) AS clbsmetp,
           get_factname(cb.clbsfact) AS clbsfact,
           cb.clbsdvdt, cb.clbsacdt, cb.clbsactm, cb.clbskilo,
           c.carsnums  AS cars_no,
           c.carsodnm  AS cars_model,
           c.carsusnm  AS cars_user
      FROM pieclbsm cb
      LEFT JOIN pmccarsm c
        ON c.carsidno = cb.clbsidno
       AND cb.clbsmddt BETWEEN c.carsfrdt AND c.carstodt
     WHERE cb.clbsmetp LIKE '%순회%' OR cb.clbsmetp = 'C'
       ${q ? 'AND (c.carsnums LIKE ? OR c.carsodnm LIKE ?)' : ''}
     ORDER BY cb.clbsmddt DESC
     LIMIT ${limit}
  `

  const SIMPLE_SQL = `
    SELECT clbsidno, clbsmddt, clbssrno, clbsseqn,
           clbsmetp, clbsfact, clbsdvdt, clbsacdt, clbsactm, clbskilo,
           NULL AS cars_no, NULL AS cars_model, NULL AS cars_user
      FROM pieclbsm
     ORDER BY clbsmddt DESC
     LIMIT ${limit}
  `

  const args: string[] = []
  if (q) {
    const like = `%${q}%`
    args.push(like, like)
  }

  let rows: TourRow[]
  let mode: 'full' | 'simple' | 'empty' = 'full'
  try {
    rows = await cafe24Db.query<TourRow>(FULL_SQL, args)
  } catch (e1) {
    console.warn('[maintenance-tours FULL fallback]', (e1 as Error).message)
    try {
      rows = await cafe24Db.query<TourRow>(SIMPLE_SQL)
      mode = 'simple'
    } catch (e2) {
      console.warn('[maintenance-tours SIMPLE fallback]', (e2 as Error).message)
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
      note: '순회정비 source 추정 — pieclbsm WHERE clbsmetp LIKE 순회. 사용자 검수 필요',
    },
  })
}
