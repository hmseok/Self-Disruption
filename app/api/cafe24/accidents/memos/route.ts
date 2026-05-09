/**
 * GET /api/cafe24/accidents/memos?idno=&mddt=&srno=
 *
 * 사고 (긴급출동) 1건의 상담내역 timeline — `acememoh` 1:N.
 *
 * 카페24 PHP 측 ACE0101A_dataselectJ 와 동일 패턴.
 *
 * Response:
 *   {
 *     success: true,
 *     data: MemoRow[]  -- 정렬: memosort ASC (PHP 측 ORDER BY memosort)
 *   }
 *
 * cafe24-db: MariaDB 10.1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

export interface MemoRow extends RowDataPacket {
  memoidno: string
  memomddt: string
  memosrno: number
  memonums: number
  memosort: number
  memotitl: string | null
  memotext: string | null
  memognus: string | null
  memogndt: string | null
  memogntm: string | null
  memoupus: string | null
  memoupdt: string | null
  memouptm: string | null
}

export async function GET(request: Request) {
  // ── admin 권한 체크 ──
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  const allowed = await canAccessPage(user, '/RideAccidents')
  if (!allowed) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const idno = url.searchParams.get('idno')
  const mddt = url.searchParams.get('mddt')
  const srnoRaw = url.searchParams.get('srno')

  if (!idno || !mddt || !srnoRaw) {
    return NextResponse.json(
      { success: false, error: 'missing key — idno + mddt + srno required' },
      { status: 400 }
    )
  }
  if (!/^\d{1,8}$/.test(idno) || !/^\d{8}$/.test(mddt) || !/^\d+$/.test(srnoRaw)) {
    return NextResponse.json(
      { success: false, error: 'invalid key format' },
      { status: 400 }
    )
  }
  const srno = parseInt(srnoRaw, 10)

  try {
    // PHP 측: SELECT * FROM acememoh ... ORDER BY memosort
    const sql = `
      SELECT memoidno, memomddt, memosrno, memonums, memosort,
             memotitl, memotext,
             memognus, memogndt, memogntm,
             memoupus, memoupdt, memouptm
        FROM acememoh
       WHERE memoidno = ?
         AND memomddt = ?
         AND memosrno = ?
         AND memoflag = 'O'
       ORDER BY memosort ASC, memonums ASC
    `
    const rows = await cafe24Db.query<MemoRow>(sql, [idno, mddt, srno])

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        key: { idno, mddt, srno },
        count: rows.length,
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/cafe24/accidents/memos] error:', err.code, err.message)
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
