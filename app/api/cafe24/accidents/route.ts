/**
 * GET /api/cafe24/accidents
 *
 * 카페24 ERP (skyautosvc.co.kr / MariaDB 10.1) 의 사고 접수 헤더 (aceesosh) 를
 * read-only 로 반환.
 *
 * 본 API 는 다음 두 곳에서 호출:
 *   1. app/(employees)/Cafe24 ERP/accidents/page.tsx (PR-6.3 신설)
 *   2. app/operations/intake/page.tsx (broken call — PR-6.3 에서 본 라우트로 해소)
 *
 * Query:
 *   limit:    기본 50, 최대 200
 *   offset:   pagination
 *   from:     YYYYMMDD (esosmddt 시작)
 *   to:       YYYYMMDD (esosmddt 끝)
 *   rgst:     상태 코드 (R/C/X 등)
 *   q:        통합 검색 (esosrstx LIKE)
 *
 * Response:
 *   {
 *     success: true,
 *     data: AccidentRow[],
 *     meta: { total?: number, fetched_at: string, cache: number }
 *   }
 *
 *   에러 시 graceful:
 *   {
 *     success: false,
 *     data: [],
 *     error: 'cafe24-unavailable' | 'forbidden' | 'unauthorized'
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
  const from = url.searchParams.get('from') // YYYYMMDD
  const to = url.searchParams.get('to') // YYYYMMDD
  const rgst = url.searchParams.get('rgst') // 1자 코드
  const q = url.searchParams.get('q') // 검색어

  // ── WHERE 절 동적 구성 ──
  const where: string[] = []
  const params: unknown[] = []

  if (from && /^\d{8}$/.test(from)) {
    where.push('esosmddt >= ?')
    params.push(from)
  }
  if (to && /^\d{8}$/.test(to)) {
    where.push('esosmddt <= ?')
    params.push(to)
  }
  if (rgst && /^[A-Z]$/.test(rgst)) {
    where.push('esosrgst = ?')
    params.push(rgst)
  }
  if (q && q.trim().length > 0) {
    where.push('esosrstx LIKE ?')
    params.push(`%${q.trim()}%`)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  try {
    // ── 데이터 조회 ──
    // PR-6.3 첫 PR — raw aceesosh 컬럼만 (pmccustm/pmccarsm 조인은 PR-6.3.b)
    const sql = `
      SELECT esosidno, esosmddt, esossrno,
             esosacdt, esosactm, esosrgst, esosrslt, esosrstx, esostypp
        FROM aceesosh
        ${whereSql}
       ORDER BY esosmddt DESC, esossrno DESC
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
      { status: 200 } // graceful — UI 가 빈 배열 + 배너 처리
    )
  }
}
