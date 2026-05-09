/**
 * GET /api/cafe24/accidents/detail?idno=&mddt=&srno=
 *
 * 사고 접수 단건 상세 — aceesosh 의 30+ 컬럼 + pmccarsm 조인.
 *
 * 카페24 PHP 측 ACE0101A_dataselectD 와 동일 패턴.
 *
 * cafe24-db: MariaDB 10.1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

export interface AccidentDetailRow extends RowDataPacket {
  // 식별
  esosidno: string
  esosmddt: string
  esossrno: number
  // 접수
  esosacdt: string | null
  esosactm: string | null
  esosrgst: string | null
  esosrslt: string | null
  esostypp: string | null
  esosjsfg: string | null
  esosstat: string | null
  // 차량 점검 (1자 Y/N/null)
  esosbate: string | null
  esostire: string | null
  esosoils: string | null
  esoslock: string | null
  esosmove: string | null
  esoshelp: string | null
  // 위치
  esosaddr: string | null
  esosadnm: string | null
  esosadtl: string | null
  // 요청자
  esosusnm: string | null
  esosustl: string | null
  esosusvp: string | null
  esosusvd: string | null
  esosuser: string | null
  // 메모
  esosrstx: string | null
  esosmemo: string | null
  esosinft: string | null
  // 주행거리
  esoskilo: string | null
  // 등록/수정
  esosgndt: string | null
  esosgntm: string | null
  esosgnus: string | null
  esosupdt: string | null
  esosuptm: string | null
  esosupus: string | null
  // 차량 마스터 (조인)
  cars_no: string | null
  cars_model: string | null
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
    const sql = `
      SELECT a.esosidno, a.esosmddt, a.esossrno,
             a.esosacdt, a.esosactm, a.esosrgst,
             a.esosrslt, a.esostypp, a.esosjsfg, a.esosstat,
             a.esosbate, a.esostire, a.esosoils, a.esoslock,
             a.esosmove, a.esoshelp,
             a.esosaddr, a.esosadnm, a.esosadtl,
             a.esosusnm, a.esosustl, a.esosusvp, a.esosusvd, a.esosuser,
             a.esosrstx, a.esosmemo, a.esosinft,
             a.esoskilo,
             a.esosgndt, a.esosgntm, a.esosgnus,
             a.esosupdt, a.esosuptm, a.esosupus,
             c.carsnums AS cars_no,
             c.carsodnm AS cars_model
        FROM aceesosh a
        LEFT JOIN pmccarsm c
          ON c.carsidno = a.esosidno
         AND a.esosmddt BETWEEN c.carsfrdt AND c.carstodt
       WHERE a.esosidno = ?
         AND a.esosmddt = ?
         AND a.esossrno = ?
       LIMIT 1
    `
    const row = await cafe24Db.queryOne<AccidentDetailRow>(sql, [idno, mddt, srno])

    if (!row) {
      return NextResponse.json(
        { success: false, error: 'not-found', data: null },
        { status: 200 }
      )
    }

    return NextResponse.json({
      success: true,
      data: row,
      meta: {
        fetched_at: new Date().toISOString(),
        key: { idno, mddt, srno },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/cafe24/accidents/detail] error:', err.code, err.message)
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: 'cafe24-unavailable',
        meta: { db_error: err.code || 'no-code' },
      },
      { status: 200 }
    )
  }
}
