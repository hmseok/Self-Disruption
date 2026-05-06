/**
 * GET /api/cafe24/acrents
 *
 * 라이드 사고접수 목록 — `acrotpth` (사고차 출동/접수) 4-table JOIN.
 *
 * 카페24 PHP 측 ACR0101A_datalistC 와 동일 패턴.
 *   FROM acrotpth + pmccarsm + picuserm + pmccustm
 *   조인: carsidno = otptidno + 효력기간 + userpidn = otptgnus + custcode = carscust
 *
 * cafe24-db: MariaDB 10.1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

export interface AcrentRow extends RowDataPacket {
  otptidno: string
  otptmddt: string
  otptsrno: number
  otptacdt: string | null
  otptactm: string | null
  otptacbn: string | null
  otptrgst: string | null
  otptrgtp: string | null
  otptgnus: string | null
  cars_no: string | null
  cars_model: string | null
  cars_user: string | null
  cust_name: string | null
  user_name: string | null
}

export async function GET(request: Request) {
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
  // PR-6.7.c — 비정상 mddt 필터 강화
  // 사용자 입력 오타 ('24530811', '22020225' 같은 비현실적 미래/과거) 제외
  // 합리적 범위: 2010-01-01 ~ 2099-12-31
  where.push('CHAR_LENGTH(a.otptmddt) = 8')
  where.push("a.otptmddt BETWEEN '20100101' AND '20991231'")
  // 시스템 기록 일자 (acdt) 도 비정상 제외 — NULL 허용 (옛 row)
  where.push("(a.otptacdt IS NULL OR a.otptacdt = '' OR a.otptacdt BETWEEN '20100101' AND '20991231')")
  if (from && /^\d{8}$/.test(from)) {
    where.push('a.otptmddt >= ?')
    params.push(from)
  }
  if (to && /^\d{8}$/.test(to)) {
    where.push('a.otptmddt <= ?')
    params.push(to)
  }
  if (rgst && /^[A-Z]$/.test(rgst)) {
    where.push('a.otptrgst = ?')
    params.push(rgst)
  }
  if (q && q.trim().length > 0) {
    where.push("(a.otptacbn LIKE ? OR c.carsnums LIKE ? OR cu.custname LIKE ?)")
    const like = `%${q.trim()}%`
    params.push(like, like, like)
  }
  const whereSql = where.length > 0 ? `AND ${where.join(' AND ')}` : ''

  try {
    // 4-table LEFT JOIN — pmccarsm/picuserm/pmccustm 누락 row 도 표시
    // PHP 측 INNER JOIN 패턴이지만 FMI 안전성 위해 LEFT
    const sql = `
      SELECT a.otptidno, a.otptmddt, a.otptsrno,
             a.otptacdt, a.otptactm, a.otptacbn,
             a.otptrgst, a.otptrgtp, a.otptgnus,
             c.carsnums  AS cars_no,
             c.carsodnm  AS cars_model,
             c.carsusnm  AS cars_user,
             cu.custname AS cust_name,
             u.username  AS user_name
        FROM acrotpth a
        LEFT JOIN pmccarsm c
          ON c.carsidno = a.otptidno
         AND a.otptmddt BETWEEN c.carsfrdt AND c.carstodt
        LEFT JOIN picuserm u
          ON u.userpidn = a.otptgnus
         AND a.otptmddt BETWEEN u.userfrdt AND u.usertodt
        LEFT JOIN pmccustm cu
          ON cu.custcode = c.carscust
       WHERE 1=1
        ${whereSql}
       ORDER BY a.otptmddt DESC, a.otptsrno DESC
       LIMIT ? OFFSET ?
    `
    const rows = await cafe24Db.query<AcrentRow>(sql, [...params, limit, offset])
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
    console.error('[/api/cafe24/acrents] error:', err.code, err.message)
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
