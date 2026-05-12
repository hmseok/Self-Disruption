/**
 * GET /api/operations/cafe24-accidents — PR-OPS-1.5a
 *
 * 「사고접수 풍성화」 endpoint — operations 모듈 전용.
 * 기존 /api/cafe24/accidents (cafe24 모듈, 다른 세션 책임) 와 별도 신설.
 *
 * 사용자 명시 (2026-05-12):
 *   「사고접수 내역이 너무 간략한데 카페24연동된 페이지의 전체 내역이 확인되어야」
 *
 * 모듈 책임 (CLAUDE.md Rule 21):
 *   본 세션 (trusting-relaxed-keller / operations) 자기 모듈 영역.
 *   기존 /api/cafe24/accidents 수정 X — cafe24 모듈 (다른 세션) 충돌 회피.
 *
 * vs /api/cafe24/accidents 차이:
 *   - 같음: aceesosh + pmccarsm LEFT JOIN, 권한 체크, mddt 필터
 *   - 추가: pmccustm (캐피탈사) + picuserm (등록자) LEFT JOIN
 *   - 응답 키 추가: capital_co_name, gnus_name, esosrstx, esosaddr/adnm/adtl,
 *                  esosusnm, esosustl, esoskilo, cars_user, capital_co_code
 *
 * 상위 설계: _docs/OPERATIONS-REDESIGN-V2.md § 9.6 v2.2
 *
 * cafe24-db: MariaDB 10.1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

export interface RichAccidentRow extends RowDataPacket {
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
  // 풍성화 추가
  esosaddr: string | null
  esosadnm: string | null
  esosadtl: string | null
  esosusnm: string | null
  esosustl: string | null
  esoskilo: string | null
  cars_no: string | null
  cars_model: string | null
  cars_user: string | null
  capital_co_code: string | null
  capital_co_name: string | null
  gnus_name: string | null
}

export async function GET(request: Request) {
  // ── 권한 ──
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json(
      { success: false, data: [], error: 'unauthorized' },
      { status: 401 }
    )
  }
  const allowed = await canAccessPage(user, '/RideAccidents')
  if (!allowed) {
    return NextResponse.json(
      { success: false, data: [], error: 'forbidden' },
      { status: 403 }
    )
  }

  // ── Query 파싱 (기존 /api/cafe24/accidents 와 호환) ──
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

  // 비정상 mddt 필터
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
    // 통합 검색 — 사고텍스트 + 차량번호 + 요청자 + 등록자
    where.push('(a.esosrstx LIKE ? OR c.carsnums LIKE ? OR a.esosusnm LIKE ? OR u.username LIKE ?)')
    const like = `%${q.trim()}%`
    params.push(like, like, like, like)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  try {
    // PR-OPS-1.5a — pmccustm (캐피탈사) + picuserm (등록자) JOIN 추가
    const sql = `
      SELECT a.esosidno, a.esosmddt, a.esossrno,
             a.esosacdt, a.esosactm, a.esosrgst,
             a.esosrslt, a.esosrstx, a.esostypp, a.esosgnus,
             a.esosaddr, a.esosadnm, a.esosadtl,
             a.esosusnm, a.esosustl,
             a.esoskilo,
             c.carsnums  AS cars_no,
             c.carsodnm  AS cars_model,
             c.carsuser  AS cars_user,
             c.carscust  AS capital_co_code,
             cu.custname AS capital_co_name,
             u.username  AS gnus_name
        FROM aceesosh a
        LEFT JOIN pmccarsm c
          ON c.carsidno = a.esosidno
         AND a.esosmddt BETWEEN c.carsfrdt AND c.carstodt
        LEFT JOIN pmccustm cu
          ON cu.custcode = c.carscust
        LEFT JOIN picuserm u
          ON u.userpidn = a.esosgnus
         AND a.esosmddt BETWEEN u.userfrdt AND u.usertodt
        ${whereSql}
       ORDER BY a.esosmddt DESC, a.esossrno DESC
       LIMIT ? OFFSET ?
    `
    const rows = await cafe24Db.query<RichAccidentRow>(sql, [...params, limit, offset])

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
    console.error('[/api/operations/cafe24-accidents] error:', err.code, err.message)
    return NextResponse.json(
      {
        success: false,
        data: [],
        error: 'cafe24-unavailable',
        meta: {
          fetched_at: new Date().toISOString(),
          db_error: err.code || 'no-code',
          db_message: (err.message || '').slice(0, 300),
        },
      },
      { status: 200 }
    )
  }
}
