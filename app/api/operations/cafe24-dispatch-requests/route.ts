/**
 * GET /api/operations/cafe24-dispatch-requests — PR-OPS-1.5a hotfix #3
 *
 * 「대차요청 들어온 사고」 만 필터해서 read-only 반환.
 * cafe24 ERP (skyautosvc.co.kr / MariaDB 10.1.13) 6-table JOIN.
 *
 * 모듈 책임 (CLAUDE.md Rule 21):
 *   본 세션 (trusting-relaxed-keller / operations) 자기 모듈 영역.
 *   기존 /api/cafe24/* 와 별도 endpoint — cafe24 모듈 충돌 회피.
 *
 * 가설 변천 (PHP 소스 + diag endpoint 분석 결과):
 *   가설 A (acrotpth + idno+mddt+srno):    JOIN 0건 ❌
 *   가설 B+LATEST (acrotpth + idno+mddt):   미검증 (다음 가설로 점프)
 *   가설 D (acrrentm + idno+mddt) ⭐:       사용자 명시 「acrrentm = 대차요청 본체」
 *
 * 핵심 발견 (acr0102a.php / inf0102q.php / crm0201a.php):
 *   - acrrentm = 대차 요청 본체 테이블 (사고 → 대차 요청 시 INSERT)
 *   - JOIN 키: rentidno+rentmddt = esosidno+esosmddt (rentsrno 는 카페24도 무시)
 *     → inf0102q.php:85 주석: "#AND rentsrno ='1'" (rentsrno 필터 X)
 *   - 대차업체: pmcfactm.factcode = rentfacd (factname/facthpno)
 *
 * 컬럼 매핑 (사용자 sample 메시지 ↔ DB):
 *   *대차업체    → pmcfactm.factname (GET_FACTNAME(rentfacd) 패턴)
 *   *캐피탈사    → pmccustm.custname (carscust 통해)
 *   *차량번호    → pmccarsm.carsnums (사고차)
 *   *차종       → pmccarsm.carsodnm
 *   *고객명     → pmccarsm.carsuser
 *   *운전자     → acrrentm.rentuser + rentushp
 *   *대차요청날짜 → acrrentm.rentrsdt
 *   *대차차 번호 → acrrentm.rentnums (있다면)
 *   *추가내용    → acrrentm.rentmemo
 *
 * JOIN 구조:
 *   aceesosh a   사고 본체
 *   latest       acrrentm 의 (idno, mddt, MAX(rentseqn)) 서브쿼리 (1:N 대응)
 *   acrrentm r   LATEST 대차 요청 row
 *   pmcfactm f   대차업체 마스터 (factcode = rentfacd)
 *   pmccarsm c   사고 차량 마스터
 *   pmccustm cu  캐피탈사 마스터
 *   picuserm u   등록자 마스터
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
  // 대차 요청 (acrrentm)
  rent_srno: number | null         // 대차 일련번호
  rent_seqn: number | null         // 글로벌 시퀀스
  rent_stat: string | null         // 대차 상태
  rent_rsdt: string | null         // 대차요청날짜
  rent_frdt: string | null         // 시작일
  rent_frtm: string | null         // 시작시간
  rent_todt: string | null         // 종료일
  rent_totm: string | null         // 종료시간
  rent_user: string | null         // 대차 사용자
  rent_ushp: string | null         // 대차 사용자 전화
  rent_typp: string | null         // 대차 타입
  rent_nums: string | null         // 대차차 번호
  rent_modl: string | null         // 대차차 모델
  rent_facd: string | null         // 대차업체 코드
  rent_memo: string | null         // 대차 메모
  // 대차업체 (pmcfactm)
  rental_vendor: string | null     // 대차업체 이름 (factname)
  rental_hp: string | null         // 대차업체 전화 (facthpno)
  rental_bdno: string | null       // 대차업체 사업자번호 (factbdno)
  // 사고 차량 (pmccarsm)
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

  // 비정상 mddt 필터
  where.push('CHAR_LENGTH(a.esosmddt) = 8')
  where.push("a.esosmddt BETWEEN '20100101' AND '20991231'")
  where.push("a.esosrgst = 'R'")

  if (from && /^\d{8}$/.test(from)) {
    where.push('a.esosmddt >= ?')
    params.push(from)
  }
  if (to && /^\d{8}$/.test(to)) {
    where.push('a.esosmddt <= ?')
    params.push(to)
  }
  if (q && q.trim().length > 0) {
    // 차량번호 / 대차 사용자 / 사고텍스트 통합 검색
    where.push('(c.carsnums LIKE ? OR r.rentuser LIKE ? OR a.esosrstx LIKE ? OR f.factname LIKE ?)')
    const like = `%${q.trim()}%`
    params.push(like, like, like, like)
  }

  const whereSql = `WHERE ${where.join(' AND ')}`

  try {
    // 가설 D — acrrentm 기반 (사용자 명시 「대차요청 본체」)
    // LATEST 서브쿼리: 한 사고에 대차요청 N row 가능 → MAX(rentseqn) 1건만
    // pmcfactm JOIN — 대차업체 이름 (라이드대차 등)
    const sql = `
      SELECT a.esosidno, a.esosmddt, a.esossrno,
             a.esosacdt, a.esosactm, a.esosrgst,
             a.esosrslt, a.esostypp, a.esosgnus,
             a.esosrstx,
             a.esosaddr, a.esosadnm, a.esosadtl,
             a.esosusnm, a.esosustl,
             r.rentsrno AS rent_srno,
             r.rentseqn AS rent_seqn,
             r.rentstat AS rent_stat,
             r.rentrsdt AS rent_rsdt,
             r.rentfrdt AS rent_frdt,
             r.rentfrtm AS rent_frtm,
             r.renttodt AS rent_todt,
             r.renttotm AS rent_totm,
             r.rentuser AS rent_user,
             r.rentushp AS rent_ushp,
             r.renttypp AS rent_typp,
             r.rentnums AS rent_nums,
             r.rentmodl AS rent_modl,
             r.rentfacd AS rent_facd,
             r.rentmemo AS rent_memo,
             f.factname AS rental_vendor,
             f.facthpno AS rental_hp,
             f.factbdno AS rental_bdno,
             c.carsnums  AS cars_no,
             c.carsodnm  AS cars_model,
             c.carsuser  AS cars_user,
             c.carscust  AS capital_co_code,
             cu.custname AS capital_co_name,
             u.username  AS gnus_name
        FROM aceesosh a
        INNER JOIN (
          SELECT rentidno, rentmddt, MAX(rentseqn) AS rentseqn
            FROM acrrentm
           GROUP BY rentidno, rentmddt
        ) latest
          ON latest.rentidno = a.esosidno
         AND latest.rentmddt = a.esosmddt
        INNER JOIN acrrentm r
          ON r.rentidno = latest.rentidno
         AND r.rentmddt = latest.rentmddt
         AND r.rentseqn = latest.rentseqn
        LEFT JOIN pmcfactm f
          ON f.factcode = r.rentfacd
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
          join_strategy: 'D (acrrentm + LATEST rentseqn, idno+mddt match)',
          base_table: 'acrrentm (사용자 명시 — 대차요청 본체)',
          rejected_hypotheses: {
            A: 'acrotpth + idno+mddt+srno (0건)',
            'B+LATEST': 'acrotpth + idno+mddt + MAX(srno) WHERE otptdcyn=Y (사용자가 acrrentm 명시 → 가설 채택 안 함)',
          },
          rental_vendor_source: 'pmcfactm.factname WHERE factcode = rentfacd',
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
