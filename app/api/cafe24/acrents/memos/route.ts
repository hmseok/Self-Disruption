/**
 * GET /api/cafe24/acrents/memos?idno=&mddt=&srno=
 *
 * 사고접수 1건의 상담 메모 timeline — `acrmemoh` 1:N.
 *
 * cafe24-db: MariaDB 10.1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

export interface AcrMemoRow extends RowDataPacket {
  memoidno: string
  memomddt: string
  memosrno: number
  memonums: number
  memosort: number
  memotitl: string | null
  memotext: string | null
  memorgtp: string | null
  memognus: string | null
  memogndt: string | null
  memogntm: string | null
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  const allowed = await canAccessPage(user, '/RideAccidentReports')
  if (!allowed) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const idno = url.searchParams.get('idno')
  const mddt = url.searchParams.get('mddt')
  const srnoRaw = url.searchParams.get('srno')

  if (!idno || !mddt || !srnoRaw) {
    return NextResponse.json(
      { success: false, error: 'missing key' },
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
    const sql = `
      SELECT memoidno, memomddt, memosrno, memonums, memosort,
             memotitl, memotext, memorgtp,
             memognus, memogndt, memogntm
        FROM acrmemoh
       WHERE memoidno = ?
         AND memomddt = ?
         AND memosrno = ?
         AND memoflag = 'O'
       ORDER BY memosort ASC, memonums ASC
    `
    const rows = await cafe24Db.query<AcrMemoRow>(sql, [idno, mddt, srno])
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
    console.error('[/api/cafe24/acrents/memos] error:', err.code, err.message)
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
