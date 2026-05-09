// ═══════════════════════════════════════════════════════════════════
// GET /factory-search/api/cafe24-accidents
//   카페24 ERP 사고접수 (acrotpth 4-table JOIN) 프록시 — READ-ONLY
//   메인 /api/cafe24/acrents 와 동일 데이터 — factory-search 격리 영역에서 검색·필터 자유롭게
//   query: q(검색어) / status(otptrgst) / type(otptacbn) / from·to(YYYYMMDD) /
//          limit(default 100, max 500) / offset
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import cafe24Db from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

export const dynamic = 'force-dynamic'

interface AcrentRow extends RowDataPacket {
  otptidno: string
  otptmddt: string
  otptsrno: number
  otptacdt: string | null
  otptactm: string | null
  otptacbn: string | null   // 사고 유형 코드 (OTPTACBN)
  otptrgst: string | null   // 처리 상태 (OTPTSTAT)
  otptrgtp: string | null   // 등록 타입
  otptmscs: string | null   // 사고 메모
  otptacad: string | null   // 사고 주소
  otptacrn: string | null   // 운행 가능 (Y/N)
  cars_no: string | null
  cars_model: string | null
  cars_user: string | null
  cust_name: string | null
  user_name: string | null
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  const status = searchParams.get('status') || ''
  const type = searchParams.get('type') || ''
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') || 100)))
  const offset = Math.max(0, Number(searchParams.get('offset') || 0))

  // 비정상 mddt 필터 (메인 acrents 와 동일)
  const where: string[] = [
    "CHAR_LENGTH(a.otptmddt) = 8",
    "a.otptmddt BETWEEN '20100101' AND '20991231'",
    "(a.otptacdt IS NULL OR a.otptacdt = '' OR a.otptacdt BETWEEN '20100101' AND '20991231')",
  ]
  const params: (string | number)[] = []
  if (status && /^[A-Z]$/.test(status)) { where.push('a.otptrgst = ?'); params.push(status) }
  if (type && /^[A-Z]$/.test(type)) { where.push('a.otptacbn = ?'); params.push(type) }
  if (from && /^\d{8}$/.test(from)) { where.push('a.otptmddt >= ?'); params.push(from) }
  if (to && /^\d{8}$/.test(to)) { where.push('a.otptmddt <= ?'); params.push(to) }
  if (q) {
    where.push('(a.otptidno LIKE ? OR c.carsnums LIKE ? OR cu.custname LIKE ? OR a.otptmscs LIKE ?)')
    const like = `%${q}%`
    params.push(like, like, like, like)
  }
  const whereSql = `WHERE ${where.join(' AND ')}`

  try {
    // 4-table LEFT JOIN — acrotpth + pmccarsm + picuserm + pmccustm
    const rows = await cafe24Db.query<AcrentRow>(
      `
      SELECT
        a.otptidno, a.otptmddt, a.otptsrno,
        a.otptacdt, a.otptactm, a.otptacbn, a.otptrgst, a.otptrgtp,
        a.otptmscs, a.otptacad, a.otptacrn,
        c.carsnums  AS cars_no,
        c.carsmnum  AS cars_model,
        c.carsusnm  AS cars_user,
        cu.custname AS cust_name,
        u.username  AS user_name
      FROM acrotpth a
      LEFT JOIN pmccarsm c
        ON c.carsidno = a.otptidno
       AND a.otptmddt BETWEEN c.carsfrdt AND c.carstodt
      LEFT JOIN pmccustm cu ON cu.custcode = c.carscust
      LEFT JOIN picuserm u  ON u.userpidn = a.otptgnus
      ${whereSql}
      ORDER BY a.otptmddt DESC, a.otptsrno DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    )

    const total = await cafe24Db.count(
      `SELECT COUNT(*) AS cnt FROM acrotpth a
       LEFT JOIN pmccarsm c ON c.carsidno = a.otptidno AND a.otptmddt BETWEEN c.carsfrdt AND c.carstodt
       LEFT JOIN pmccustm cu ON cu.custcode = c.carscust
       ${whereSql}`,
      params,
    )

    return NextResponse.json({ success: true, data: rows, total, limit, offset })
  } catch (e: unknown) {
    return NextResponse.json({
      success: false,
      data: [],
      total: 0,
      _connection_error: true,
      error: e instanceof Error ? e.message : 'cafe24 connection failed',
    }, { status: 500 })
  }
}
