/**
 * GET /api/cafe24/factories
 *
 * 카페24 ERP `pmcfactm` 전체 read (SELECT * — 모든 컬럼).
 * 효력기간 활성 + 정렬: factcode ASC.
 *
 * Query:
 *   q          factname / factaddr / factbsno LIKE (선택)
 *   limit      기본 5000, 최대 20000
 *   include_terminated  '1' 이면 종료 (facttype='Z') 포함
 *
 * cafe24-db: MariaDB 10.1
 *
 * PR-6.12.a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

interface FactoryRow extends RowDataPacket {
  factcode: string
  factname: string | null
  factaddr: string | null
  facthpno: string | null
  facttype: string | null
  factfrdt: string | null
  facttodt: string | null
  [key: string]: unknown  // 가변 컬럼 (SELECT *)
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
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '5000', 10) || 5000, 1),
    20000
  )
  const includeTerminated = url.searchParams.get('include_terminated') === '1'

  try {
    // pmcfactm 은 효력기간 컬럼 미존재 — facttype 만 필터
    const conds: string[] = []
    const args: (string | number)[] = []
    if (!includeTerminated) {
      conds.push("(facttype IS NULL OR facttype <> 'Z')")
    }
    if (q) {
      conds.push('(factname LIKE ? OR factaddr LIKE ? OR factbsno LIKE ?)')
      const like = `%${q}%`
      args.push(like, like, like)
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''

    const sql = `
      SELECT *
        FROM pmcfactm
       ${where}
       ORDER BY factcode ASC
       LIMIT ${limit}
    `
    const rows = await cafe24Db.query<FactoryRow>(sql, args)

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        count: rows.length,
        filters: { q, includeTerminated, limit },
        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/cafe24/factories GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
