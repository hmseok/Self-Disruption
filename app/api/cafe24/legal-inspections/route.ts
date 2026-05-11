/**
 * GET /api/cafe24/legal-inspections
 *
 * 카페24 ajcinsph (검사 history) + pmccarsm 차량 마스터
 *
 * 컬럼:
 *   inspidno / inspmddt / inspsrno / inspseqn   PK
 *   inspmetp (검사 종류 — CLBSMETP 코드)
 *   inspstat (검사 상태 — INSPSTAT 코드)
 *   inspfact (검사소 공장 코드 — get_factname)
 *   inspcffg (확정 여부 Y/N)
 *   inspwkdt (작업일자)
 *   inspkilo (마일리지)
 *   inspcaus (미검사 사유)
 *   inspcamo (메모)
 *
 * 흐름: full SQL → fallback (시도)
 *
 * PR-6.14.a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

interface InspectionRow extends RowDataPacket {
  inspidno: string
  inspmddt: string
  inspsrno: number
  inspseqn: number
  inspmetp: string | null     // get_cbsddesc 결과 (한국어)
  inspstat: string | null     // get_cbsddesc 결과
  inspfact: string | null     // get_factname 결과
  inspcffg: string | null
  inspwkdt: string | null
  inspkilo: number | null
  inspcaus: string | null
  inspcamo: string | null
  cars_no: string | null      // pmccarsm.carsnums
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
  const allowed = await canAccessPage(user, ['/RideMTOps/legal-inspections'])
  if (!allowed)
    return NextResponse.json(
      { success: false, data: [], error: 'forbidden' },
      { status: 403 }
    )

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const status = url.searchParams.get('status')   // 검사 상태 코드
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 1),
    5000
  )

  // FULL — 코드 마스터 풀이 + 차량 join + 검사소 풀이
  const FULL_SQL = `
    SELECT i.inspidno, i.inspmddt, i.inspsrno, i.inspseqn,
           get_cbsddesc('CLBSMETP', i.inspmetp) AS inspmetp,
           get_cbsddesc('INSPSTAT', i.inspstat) AS inspstat,
           get_factname(i.inspfact) AS inspfact,
           i.inspcffg, i.inspwkdt, i.inspkilo, i.inspcaus, i.inspcamo,
           c.carsnums  AS cars_no,
           c.carsodnm  AS cars_model,
           c.carsusnm  AS cars_user
      FROM ajcinsph i
      LEFT JOIN pmccarsm c
        ON c.carsidno = i.inspidno
       AND i.inspmddt BETWEEN c.carsfrdt AND c.carstodt
     WHERE i.insprgst = 'R'
       ${q ? 'AND (c.carsnums LIKE ? OR c.carsodnm LIKE ? OR c.carsusnm LIKE ?)' : ''}
       ${status ? 'AND i.inspstat = ?' : ''}
     ORDER BY i.inspmddt DESC, i.inspcffg
     LIMIT ${limit}
  `

  // SIMPLE — code/factname/join 없이 raw
  const SIMPLE_SQL = `
    SELECT i.inspidno, i.inspmddt, i.inspsrno, i.inspseqn,
           i.inspmetp, i.inspstat, i.inspfact,
           i.inspcffg, i.inspwkdt, i.inspkilo, i.inspcaus, i.inspcamo,
           NULL AS cars_no, NULL AS cars_model, NULL AS cars_user
      FROM ajcinsph i
     WHERE i.insprgst = 'R'
       ${status ? 'AND i.inspstat = ?' : ''}
     ORDER BY i.inspmddt DESC
     LIMIT ${limit}
  `

  const args: (string | number)[] = []
  if (q) {
    const like = `%${q}%`
    args.push(like, like, like)
  }
  if (status) args.push(status)
  const simpleArgs: (string | number)[] = status ? [status] : []

  let rows: InspectionRow[]
  let mode: 'full' | 'simple' | 'empty' = 'full'
  try {
    rows = await cafe24Db.query<InspectionRow>(FULL_SQL, args)
  } catch (e1) {
    console.warn('[legal-inspections FULL fallback]', (e1 as Error).message)
    try {
      rows = await cafe24Db.query<InspectionRow>(SIMPLE_SQL, simpleArgs)
      mode = 'simple'
    } catch (e2) {
      console.warn('[legal-inspections SIMPLE fallback]', (e2 as Error).message)
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
      filters: { q, status },
      mode,
    },
  })
}
