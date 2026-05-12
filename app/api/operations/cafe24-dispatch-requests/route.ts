/**
 * GET /api/operations/cafe24-dispatch-requests — PR-OPS-1.5a
 *
 * 「대차요청 들어온 사고」 만 필터해서 read-only 반환.
 * cafe24 ERP (skyautosvc.co.kr / MariaDB 10.1.13) 6-table JOIN.
 *
 * 모듈 책임 (CLAUDE.md Rule 21):
 *   본 세션 (trusting-relaxed-keller / operations) 자기 모듈 영역.
 *   기존 app/api/cafe24/accidents 와 별도 endpoint 로 분리 — cafe24 모듈
 *   (다른 세션 책임) 충돌 회피.
 *
 * 식별 컬럼: acrotpth.otptdcyn = 'Y'  (대차요청 = 'Y')
 *   증거 1: crm0201a.php:1825 「대차여부가 [대차미사용] 입니다」
 *   증거 2: acr0101a.php:139 「대차없음」 디폴트 'N'
 *   증거 3: jandi_move.php:144 잔디 메시지 발송 트리거 = otptdcyn='Y'
 *
 * JOIN 구조:
 *   aceesosh a   사고 본체
 *   acrotpth b   대차/출동 (otptdcyn='Y' 필터, INNER JOIN)
 *   pmccarsm c   차량 마스터 (carsnums/carsodnm/carsuser/carscust)
 *   pmccustm cu  캐피탈사 마스터 (custname)
 *   picuserm u   등록자 마스터 (username)
 *   ⚠ acrrentm r 대차업체 마스터 — JOIN 키 미확정, 1차에선 제외 (rental_vendor=null)
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

export interface DispatchRequestRow extends RowDataPacket {
  // 사고 본체 (aceesosh)
  esosidno: string
  esosmddt: string
  esossrno: number
  esosacdt: string | null
  esosactm: string | null
  esosrgst: string | null
  esosrslt: string | null
  esostypp: string | null
  esosgnus: string | null
  esosrstx: string | null
  esosaddr: string | null
  esosadnm: string | null
  esosadtl: string | null
  esosusnm: string | null
  esosustl: string | null
  // 대차/출동 본체 (acrotpth)
  otptdcyn: string | null    // ⭐ 'Y' = 대차요청
  otptacbn: string | null
  otptcanm: string | null    // 통보자 이름
  otptcahp: string | null    // 통보자 전화
  otptdsnm: string | null    // 운전자 이름
  otptdshp: string | null    // 운전자 전화
  // 사고 종류 Y/N flag
  otptacdi: string | null    // 대인
  otptacdm: string | null    // 대물
  otptacjc: string | null    // 자차
  otptacjs: string | null    // 자손
  otptacmb: string | null    // 무보험
  otptacno: string | null    // 현장출동
  otptacph: string | null    // 긴급견인
  otptdsrp: string | null    // 수리 Y
  otptftyn: string | null    // 공장입고
  // 대차요청 상세
  otptdsre: string | null    // 대차요청날짜
  otptdsbn: string | null    // 대차요청지 (코드?)
  otptdsbh: string | null    // 대차요청지 (보조?)
  // 상대차량
  otpttonm: string | null
  otpttohp: string | null
  otpttonu: string | null
  otpttomd: string | null
  otpttobm: string | null
  otpttobn: string | null
  otpttobu: string | null
  // 차량 마스터 (pmccarsm)
  cars_no: string | null
  cars_model: string | null
  cars_user: string | null
  capital_co_code: string | null
  capital_co_name: string | null
  // 등록자 (picuserm)
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

  // ── Query 파싱 ──
  const url = new URL(request.url)
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1),
    200
  )
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const q = url.searchParams.get('q')

  const where: string[] = []
  const params: unknown[] = []

  // 비정상 mddt 필터 (PR-6.7.c 패턴)
  where.push('CHAR_LENGTH(a.esosmddt) = 8')
  where.push("a.esosmddt BETWEEN '20100101' AND '20991231'")
  // 등록 활성 + 대차요청 = Y (핵심)
  where.push("a.esosrgst = 'R'")
  where.push("b.otptdcyn = 'Y'")

  if (from && /^\d{8}$/.test(from)) {
    where.push('a.esosmddt >= ?')
    params.push(from)
  }
  if (to && /^\d{8}$/.test(to)) {
    where.push('a.esosmddt <= ?')
    params.push(to)
  }
  if (q && q.trim().length > 0) {
    // 차량번호 / 통보자 / 운전자 / 사고텍스트 통합 검색
    where.push('(c.carsnums LIKE ? OR b.otptcanm LIKE ? OR b.otptdsnm LIKE ? OR a.esosrstx LIKE ?)')
    const like = `%${q.trim()}%`
    params.push(like, like, like, like)
  }

  const whereSql = `WHERE ${where.join(' AND ')}`

  try {
    // 5-table JOIN (acrrentm 제외 — JOIN 키 가설 검증 후 hotfix 추가)
    // JOIN 키 가설 A: otptidno+mddt+srno = esosidno+mddt+srno (acr0101a.php INSERT 패턴)
    // 1차 호출 시 응답 row 수 + 사용자 sample 메시지 매칭으로 검증.
    const sql = `
      SELECT a.esosidno, a.esosmddt, a.esossrno,
             a.esosacdt, a.esosactm, a.esosrgst,
             a.esosrslt, a.esostypp, a.esosgnus,
             a.esosrstx,
             a.esosaddr, a.esosadnm, a.esosadtl,
             a.esosusnm, a.esosustl,
             b.otptdcyn, b.otptacbn,
             b.otptcanm, b.otptcahp,
             b.otptdsnm, b.otptdshp,
             b.otptacdi, b.otptacdm, b.otptacjc, b.otptacjs,
             b.otptacmb, b.otptacno, b.otptacph,
             b.otptdsrp, b.otptftyn,
             b.otptdsre, b.otptdsbn, b.otptdsbh,
             b.otpttonm, b.otpttohp, b.otpttonu, b.otpttomd,
             b.otpttobm, b.otpttobn, b.otpttobu,
             c.carsnums  AS cars_no,
             c.carsodnm  AS cars_model,
             c.carsuser  AS cars_user,
             c.carscust  AS capital_co_code,
             cu.custname AS capital_co_name,
             u.username  AS gnus_name
        FROM aceesosh a
        INNER JOIN acrotpth b
          ON b.otptidno = a.esosidno
         AND b.otptmddt = a.esosmddt
         AND b.otptsrno = a.esossrno
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
    const rows = await cafe24Db.query<DispatchRequestRow>(sql, [...params, limit, offset])

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        cache: 30,
        limit,
        offset,
        filters: { from, to, q },
        join_diagnostics: {
          row_count: rows.length,
          join_key_hypothesis: 'A (otptidno+mddt+srno = esos*)',
          rental_vendor_join: 'pending (acrrentm 키 미확정 — 1차 응답 검토 후 결정)',
        },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/operations/cafe24-dispatch-requests] error:', err.code, err.message)
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
