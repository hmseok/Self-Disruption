/**
 * GET /api/operations/cafe24-acr-memos?idno=&mddt=&srno= — PR-OPS-1.5f
 *
 * 카페24 ACR 측 「사고상담내역」 timeline (acrmemoh).
 *
 * 사용자 명시 (2026-05-13): 카페24 「사고처리관리」 화면의 「상담내용」 list = acrmemoh.
 * 본 세션이 그동안 사용한 /api/cafe24/accidents/memos (acememoh) 는 ACE 긴급출동 모듈 — 다른 source.
 *
 * 모듈 책임 (CLAUDE.md Rule 21):
 *   본 세션 (operations) 자기 모듈 영역.
 *   기존 cafe24 모듈 endpoint 와 별도 신설.
 *
 * acrmemoh 컬럼 (ACR0101A_datainsertH 패턴):
 *   memoidno + memomddt + memosrno (JOIN 키 = acrotpth/acrrentm 와 동일 가설 J)
 *   memosort + memonums (정렬 키)
 *   memotext (상담 본문) / memotitl (제목)
 *   memognus + memogndt + memogntm (등록자/일시)
 *   memoflag = 'O' (활성)
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
  memognus: string | null
  memogndt: string | null
  memogntm: string | null
  memoflag: string | null
  // picuserm JOIN — 등록자 이름
  user_name: string | null
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  }
  const allowed = await canAccessPage(user, '/RideAccidents')
  if (!allowed) {
    return NextResponse.json({ success: false, data: [], error: 'forbidden' }, { status: 403 })
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
    const sql = `
      SELECT m.memoidno, m.memomddt, m.memosrno,
             m.memonums, m.memosort,
             m.memotitl, m.memotext,
             m.memognus, m.memogndt, m.memogntm,
             m.memoflag,
             u.username AS user_name
        FROM acrmemoh m
        LEFT JOIN picuserm u
          ON u.userpidn = m.memognus
         AND m.memomddt BETWEEN u.userfrdt AND u.usertodt
       WHERE m.memoidno = ?
         AND m.memomddt = ?
         AND m.memosrno = ?
         AND m.memoflag = 'O'
       ORDER BY m.memosort ASC, m.memonums ASC
    `
    const rows = await cafe24Db.query<AcrMemoRow>(sql, [idno, mddt, srno])

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        key: { idno, mddt, srno },
        count: rows.length,
        source: 'acrmemoh (ACR 사고처리관리 상담내역)',
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/operations/cafe24-acr-memos] error:', err.code, err.message)
    return NextResponse.json(
      {
        success: false,
        data: [],
        error: 'cafe24-unavailable',
        meta: { db_error: err.code || 'no-code', db_message: (err.message || '').slice(0, 300) },
      },
      { status: 200 }
    )
  }
}
