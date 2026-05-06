/**
 * GET /api/cafe24/acrents/detail?idno=&mddt=&srno=
 *
 * 라이드 사고접수 단건 상세 — acrotpth 60+ 컬럼 + 4-table JOIN.
 *
 * 카페24 PHP 측 ACR0101A_dataselectD 와 동일 패턴.
 *
 * cafe24-db: MariaDB 10.1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

export interface AcrentDetailRow extends RowDataPacket {
  // 식별
  otptidno: string
  otptmddt: string
  otptsrno: number
  // 접수 / 상태
  otptrgst: string | null
  otptrgtp: string | null
  otptmscs: string | null
  otptacdt: string | null
  otptactm: string | null
  otptacbn: string | null // 사고 번호
  otptacfe: string | null
  otptacnu: string | null // 사고 번호 추가
  // 차량 점검 (Y=문제 / N=정상)
  otptacrn: string | null // 운행가능
  otptacdi: string | null
  otptacdm: string | null
  otptacjc: string | null
  otptacjs: string | null
  otptacmb: string | null
  otptacno: string | null
  otptacph: string | null
  otptacet: string | null
  otptacad: string | null
  otptacmo: string | null
  // 운전자 (driver)
  otptdsrp: string | null
  otptdsnm: string | null
  otptdsli: string | null
  otptdshp: string | null
  otptdsbh: string | null
  otptdsbn: string | null
  otptdsus: string | null
  otptdstl: string | null
  otptdsre: string | null
  otptdspk: string | null
  otptdsmo: string | null
  otptdscd: string | null
  otptdsrs: string | null
  otptdsvp: string | null
  otptdsvd: string | null
  // 차주 (car owner)
  otptcanm: string | null
  otptcahp: string | null
  otptcare: string | null
  otptcavp: string | null
  otptcavd: string | null
  // 견인 (tow)
  otpttonm: string | null
  otpttohp: string | null
  otpttonu: string | null
  otpttomd: string | null
  otpttobm: string | null
  otpttobn: string | null
  otpttobu: string | null
  otpttobh: string | null
  otpttwgn: string | null
  otpttwnm: string | null
  otpttwhp: string | null
  otpttagt: string | null
  // 빌딩 / 주차장
  otptbdno: string | null
  otptbdnm: string | null
  otptpkno: string | null
  otptpknm: string | null
  // flag
  otptftyn: string | null
  otptjsyn: string | null
  otptdcyn: string | null
  otptrtyn: string | null
  // 등록 / 수정
  otptgnus: string | null
  otptgndt: string | null
  otptgntm: string | null
  otptupus: string | null
  otptupdt: string | null
  otptuptm: string | null
  // 차량 / 고객 / 사용자 조인
  cars_no: string | null
  cars_model: string | null
  cars_user: string | null
  cust_name: string | null
  user_name: string | null
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  if (user.role !== 'admin') {
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
      SELECT a.otptidno, a.otptmddt, a.otptsrno,
             a.otptrgst, a.otptmscs, a.otptrgtp,
             a.otptacdt, a.otptactm, a.otptacbn,
             a.otptacfe, a.otptacnu,
             a.otptacrn, a.otptacdi, a.otptacdm, a.otptacjc, a.otptacjs,
             a.otptacmb, a.otptacno, a.otptacph,
             a.otptacet, a.otptacad, a.otptacmo,
             a.otptdsrp, a.otptdsnm, a.otptdsli, a.otptdshp, a.otptdsbh, a.otptdsbn,
             a.otptdsus, a.otptdstl, a.otptdsre, a.otptdspk, a.otptdsmo,
             a.otptdscd, a.otptdsrs, a.otptdsvp, a.otptdsvd,
             a.otptcanm, a.otptcahp, a.otptcare, a.otptcavp, a.otptcavd,
             a.otpttonm, a.otpttohp, a.otpttonu, a.otpttomd,
             a.otpttobm, a.otpttobn, a.otpttobu, a.otpttobh,
             a.otpttwgn, a.otpttwnm, a.otpttwhp, a.otpttagt,
             a.otptbdno, a.otptbdnm, a.otptpkno, a.otptpknm,
             a.otptftyn, a.otptjsyn, a.otptdcyn, a.otptrtyn,
             a.otptgnus, a.otptgndt, a.otptgntm,
             a.otptupus, a.otptupdt, a.otptuptm,
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
       WHERE a.otptidno = ?
         AND a.otptmddt = ?
         AND a.otptsrno = ?
       LIMIT 1
    `
    const row = await cafe24Db.queryOne<AcrentDetailRow>(sql, [idno, mddt, srno])
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
    console.error('[/api/cafe24/acrents/detail] error:', err.code, err.message)
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
