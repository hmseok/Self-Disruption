/**
 * GET /api/cafe24/accidents
 *
 * 카페24 ERP (skyautosvc.co.kr / MariaDB 10.1) 의 사고 접수 헤더 (aceesosh) 를
 * read-only 로 반환. PR-6.5 — pmccarsm LEFT JOIN 으로 차량번호 / 차종 추가.
 *
 * 본 API 는 다음 두 곳에서 호출:
 *   1. app/(employees)/RideAccidents/page.tsx (목록)
 *   2. app/operations/intake/page.tsx (broken call 해소)
 *
 * Query:
 *   limit:    기본 50, 최대 200
 *   offset:   pagination
 *   from:     YYYYMMDD (esosmddt 시작)
 *   to:       YYYYMMDD (esosmddt 끝)
 *   rgst:     등록 상태 (R / C)
 *   q:        통합 검색 (esosrstx LIKE)
 *
 * Response:
 *   {
 *     success: true,
 *     data: AccidentRow[],
 *     meta: { fetched_at, cache, limit, offset, filters }
 *   }
 *
 * cafe24-db: MariaDB 10.1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

export interface AccidentRow extends RowDataPacket {
  esosidno: string
  esosmddt: string
  esossrno: number
  esosacdt: string | null
  esosactm: string | null
  esosrgst: string | null
  esosrslt: string | null
  esosrstx: string | null
  esostypp: string | null
  esosgnus: string | null
  cars_no: string | null
  cars_model: string | null
}

export async function GET(request: Request) {
  // ── admin 권한 체크 (Q8=D) ──
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json(
      { success: false, data: [], error: 'unauthorized' },
      { status: 401 }
    )
  }
  if (user.role !== 'admin') {
    return NextResponse.json(
      { success: false, data: [], error: 'forbidden' },
      { status: 403 }
    )
  }

  // ── Query 파싱 ──
  const url = new URL(request.url)
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1),
    200
  )
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const rgst = url.searchParams.get('rgst')
  const q = url.searchParams.get('q')

  const where: string[] = []
  const params: unknown[] = []

  // PR-6.7.c — 비정상 mddt 필터 (긴급출동도 같은 패턴)
  where.push('CHAR_LENGTH(a.esosmddt) = 8')
  where.push("a.esosmddt BETWEEN '20100101' AND '20991231'")
  if (from && /^\d{8}$/.test(from)) {
    where.push('a.esosmddt >= ?')
    params.push(from)
  }
  if (to && /^\d{8}$/.test(to)) {
    where.push('a.esosmddt <= ?')
    params.push(to)
  }
  if (rgst && /^[A-Z]$/.test(rgst)) {
    where.push('a.esosrgst = ?')
    params.push(rgst)
  }
  if (q && q.trim().length > 0) {
    where.push('a.esosrstx LIKE ?')
    params.push(`%${q.trim()}%`)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  try {
    // PR-6.5 — pmccarsm LEFT JOIN 으로 차량번호/차종 추가
    // 카페24 PHP 측 datalistC 패턴: esosidno = carsidno + 효력기간 BETWEEN
    const sql = `
      SELECT a.esosidno, a.esosmddt, a.esossrno,
             a.esosacdt, a.esosactm, a.esosrgst,
             a.esosrslt, a.esosrstx, a.esostypp, a.esosgnus,
             c.carsnums AS cars_no,
             c.carsodnm AS cars_model
        FROM aceesosh a
        LEFT JOIN pmccarsm c
          ON c.carsidno = a.esosidno
         AND a.esosmddt BETWEEN c.carsfrdt AND c.carstodt
        ${whereSql}
       ORDER BY a.esosmddt DESC, a.esossrno DESC
       LIMIT ? OFFSET ?
    `
    const rows = await cafe24Db.query<AccidentRow>(sql, [...params, limit, offset])

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        cache: 30,
        limit,
        offset,
        filters: { from, to, rgst, q },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/cafe24/accidents] error:', err.code, err.message)
    return NextResponse.json(
      {
        success: false,
        data: [],
        error: 'cafe24-unavailable',
        meta: {
          fetched_at: new Date().toISOString(),
          db_error: err.code || 'no-code',
        },
      },
      { status: 200 }
    )
  }
}
