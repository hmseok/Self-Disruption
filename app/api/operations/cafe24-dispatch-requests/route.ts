/**
 * GET /api/operations/cafe24-dispatch-requests — PR-OPS-1.5a hotfix #5 (가설 J 확정)
 *
 * 「대차요청 들어온 사고」 만 필터해서 read-only 반환.
 * cafe24 ERP (skyautosvc.co.kr / MariaDB 10.1.13) 6-table JOIN.
 *
 * 모듈 책임 (CLAUDE.md Rule 21):
 *   본 세션 (trusting-relaxed-keller / operations) 자기 모듈 영역.
 *
 * 가설 변천 (진단 endpoint 4회):
 *   가설 A (aceesosh + acrotpth + idno+mddt+srno): 0건 ❌
 *   가설 B+LATEST (acrotpth + idno+mddt MAX srno): 미검증 우회
 *   가설 D (aceesosh + acrrentm idno+mddt): 36건 (1년) ❌ 너무 적음
 *   가설 E (acrrentm + idno only): 2,667건 (1:N 폭증) ❌
 *   가설 J ⭐ (acrotpth + acrrentm idno+mddt+srno): 정확 1:1 매칭
 *
 * 가설 J 증거 (진단 7번 ↔ 15번 sample 4번 1:1 매칭):
 *   acrotpth: otptidno=10126347, otptmddt=20260513, otptsrno=58, otptdcyn=Y, otptcanm=이요환
 *   acrrentm: rentidno=10126347, rentmddt=20260513, rentsrno=58, rentseqn=1, rentfacd=2070
 *   → 완벽 매칭
 *
 * 추가 증거:
 *   진단 4 (acrotpth otptdcyn='Y' in range): 2,164
 *   진단 11 (acrrentm in range): 2,224
 *   → 거의 같은 row 그룹 (1:1 대응)
 *
 * 핵심 통찰 — aceesosh 와 acrotpth 는 별도 워크플로우:
 *   ACE0101A (긴급출동 접수)  → aceesosh
 *   ACR0101A (사고차 출동/대차) → acrotpth + acrrentm
 *   사용자 카페24 「사고접수 페이지」 = ACR (acrotpth) 가 메인.
 *   aceesosh JOIN 제거 — 매칭 거의 안 됨 (1년 sample 9번 NULL 10/10).
 *
 * JOIN 구조 (가설 J):
 *   acrotpth b   사고차 출동 본체 + otptdcyn='Y' 필터 (대차요청)
 *   acrrentm r   대차요청 sub-record (rentidno+mddt+srno match)
 *   pmcfactm f   대차업체 마스터 (factcode = rentfacd)
 *   pmccarsm c   차량 마스터 (carsidno = otptidno)
 *   pmccustm cu  캐피탈사 마스터 (custcode = carscust)
 *   picuserm u   등록자 마스터 (userpidn = otptgnus)
 *
 * 응답 row (사용자 sample 메시지 ↔ 1:1):
 *   *대차업체    → pmcfactm.factname (factcode=rentfacd)
 *   *캐피탈사    → pmccustm.custname (custcode=carscust)
 *   *차량번호    → pmccarsm.carsnums (carsidno=otptidno)
 *   *차종       → pmccarsm.carsodnm
 *   *고객명     → pmccarsm.carsuser
 *   *접수일시   → acrotpth.otptacdt + otptactm
 *   *통보자     → acrotpth.otptcanm / otptcahp
 *   *운전자     → acrotpth.otptdsnm / otptdshp
 *   *상대차량   → acrotpth.otpttonm/tohp/tonu/tomd/tobm/tobn/tobu
 *   *대차요청날짜 → acrrentm.rentrsdt
 *   *입고지     → ajaoderh.factname (별도, P1.5c 에서)
 *   *접수자     → picuserm.username
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
  // 사고차 출동 본체 (acrotpth) — 사고 본체 역할
  otptidno: string
  otptmddt: string
  otptsrno: number
  otptacdt: string | null     // 접수일자
  otptactm: string | null     // 접수시간
  otptacbn: string | null
  otptrgst: string | null
  otptrgtp: string | null
  otptgnus: string | null     // 등록자 코드
  otptdcyn: string | null     // ⭐ 대차요청 = 'Y'
  otptcanm: string | null     // 통보자 이름
  otptcahp: string | null     // 통보자 전화
  otptdsnm: string | null     // 운전자 이름
  otptdshp: string | null     // 운전자 전화
  otptacdi: string | null     // 대인 Y/N
  otptacdm: string | null     // 대물 Y/N
  otptacjc: string | null     // 자차 Y/N
  otptacjs: string | null     // 자손 Y/N
  otptacmb: string | null     // 무보험 Y/N
  otptacno: string | null     // 현장출동 Y/N
  otptacph: string | null     // 긴급견인 Y/N
  otptdsrp: string | null     // 수리 Y/N
  otptftyn: string | null     // 공장입고 Y/N
  // 상대차량
  otpttonm: string | null
  otpttohp: string | null
  otpttonu: string | null
  otpttomd: string | null
  otpttobm: string | null
  otpttobn: string | null
  otpttobu: string | null
  // 사고 메모/위치
  otptacad: string | null
  otptacmo: string | null
  otptacet: string | null
  // P2.1b 풍성화 — mgcap/api_accident.php SQL 검증 후 12 컬럼 (otptitem 만 derived)
  otptdsli: string | null    // 운전자면허 (코드 — get_cbsddesc('OTPTDSLI', ...) 변환)
  otptdsbh: string | null    // 생년월일
  otptdsbn: string | null    // 보험접수번호 (당사)
  otptdsre: string | null    // 계약자와의관계
  otptcare: string | null    // 운전자관계
  otptacrn: string | null    // 운행가능여부 Y/N
  otptadfg: string | null    // 공장입고여부 Y/N
  otptbdnm: string | null    // 사고장소 (정식)
  otptpknm: string | null    // 수리희망지
  otptdsus: string | null    // 대물담당자
  otptdstl: string | null    // 대물담당자 HP
  // otptpart (파손부위) — acrparth + comcbsdm subquery 별도 (다음 step)
  otptpart: string | null
  // P2.1a-pivot — 배정공장 (ajaoderh + pmcfactm subquery, 활성 oderstat<>'X' 만)
  factory_names: string | null
  // 대차요청 sub (acrrentm)
  rent_srno: number | null
  rent_seqn: number | null
  rent_stat: string | null
  rent_rsdt: string | null    // 대차요청날짜
  rent_frdt: string | null
  rent_frtm: string | null
  rent_todt: string | null
  rent_totm: string | null
  rent_user: string | null    // 대차 사용자
  rent_ushp: string | null    // 대차 사용자 전화
  rent_nums: string | null    // 대차차 번호
  rent_modl: string | null    // 대차차 모델
  rent_facd: string | null    // 대차업체 코드
  rent_memo: string | null
  // 대차업체 (pmcfactm)
  rental_vendor: string | null
  rental_hp: string | null
  rental_bdno: string | null
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
  // P1.5e — otptdcyn 필터 옵션화: 'Y' / 'N' / 'all' (사용자 명시 — 대차사용/미사용 모두)
  const dcyn = url.searchParams.get('dcyn') || 'Y'
  // rgst: 'R' (활성) / 'C' (취소) / 'all' (모두)
  const rgst = url.searchParams.get('rgst') || 'R'

  const where: string[] = []
  const params: unknown[] = []

  // 비정상 mddt 필터
  where.push('CHAR_LENGTH(b.otptmddt) = 8')
  where.push("b.otptmddt BETWEEN '20100101' AND '20991231'")

  if (rgst !== 'all' && /^[A-Z]$/.test(rgst)) {
    where.push('b.otptrgst = ?')
    params.push(rgst)
  }
  if (dcyn !== 'all' && /^[YN]$/.test(dcyn)) {
    where.push('b.otptdcyn = ?')
    params.push(dcyn)
  }

  if (from && /^\d{8}$/.test(from)) {
    where.push('b.otptmddt >= ?')
    params.push(from)
  }
  if (to && /^\d{8}$/.test(to)) {
    where.push('b.otptmddt <= ?')
    params.push(to)
  }
  if (q && q.trim().length > 0) {
    where.push('(c.carsnums LIKE ? OR b.otptcanm LIKE ? OR b.otptdsnm LIKE ? OR f.factname LIKE ? OR c.carsuser LIKE ?)')
    const like = `%${q.trim()}%`
    params.push(like, like, like, like, like)
  }

  const whereSql = `WHERE ${where.join(' AND ')}`

  try {
    // 가설 J — acrotpth 메인 + acrrentm 1:1 JOIN (sample 4번 ↔ 15번 1:1 매칭 증거)
    // aceesosh JOIN 제거 (별도 워크플로우, sample 9번 NULL 10/10)
    const sql = `
      SELECT b.otptidno, b.otptmddt, b.otptsrno,
             b.otptacdt, b.otptactm, b.otptacbn,
             b.otptrgst, b.otptrgtp, b.otptgnus,
             b.otptdcyn,
             b.otptcanm, b.otptcahp,
             b.otptdsnm, b.otptdshp,
             b.otptacdi, b.otptacdm, b.otptacjc, b.otptacjs,
             b.otptacmb, b.otptacno, b.otptacph,
             b.otptdsrp, b.otptftyn,
             b.otpttonm, b.otpttohp, b.otpttonu, b.otpttomd,
             b.otpttobm, b.otpttobn, b.otpttobu,
             b.otptacad, b.otptacmo, b.otptacet,
             b.otptdsli, b.otptdsbh, b.otptdsbn,
             b.otptdsre, b.otptcare,
             b.otptacrn, b.otptadfg,
             b.otptbdnm, b.otptpknm,
             b.otptdsus, b.otptdstl,
             (SELECT GROUP_CONCAT(DISTINCT cb.cbsddesc SEPARATOR ', ')
                FROM acrparth p
                JOIN comcbsdm cb ON p.partcode = cb.cbsdcode
               WHERE cb.cbsdjobb = 'OTPT'
                 AND cb.cbsdgubn = 'OTPTPART'
                 AND p.partflag = 'O'
                 AND p.partidno = b.otptidno
                 AND p.partmddt = b.otptmddt
                 AND p.partsrno = b.otptsrno
             ) AS otptpart,
             (SELECT GROUP_CONCAT(DISTINCT pf.factname SEPARATOR ', ')
                FROM ajaoderh aa
                LEFT JOIN pmcfactm pf ON pf.factcode = aa.oderfact
               WHERE aa.oderidno = b.otptidno
                 AND aa.odermddt = b.otptmddt
                 AND aa.odersrno = b.otptsrno
                 AND aa.oderstat <> 'X'
             ) AS factory_names,
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
        FROM acrotpth b
        LEFT JOIN acrrentm r
          ON r.rentidno = b.otptidno
         AND r.rentmddt = b.otptmddt
         AND r.rentsrno = b.otptsrno
        LEFT JOIN pmcfactm f
          ON f.factcode = r.rentfacd
        LEFT JOIN pmccarsm c
          ON c.carsidno = b.otptidno
         AND b.otptmddt BETWEEN c.carsfrdt AND c.carstodt
        LEFT JOIN pmccustm cu
          ON cu.custcode = c.carscust
        LEFT JOIN picuserm u
          ON u.userpidn = b.otptgnus
         AND b.otptmddt BETWEEN u.userfrdt AND u.usertodt
        ${whereSql}
       ORDER BY b.otptmddt DESC, b.otptsrno DESC
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
        filters: { from, to, q, dcyn, rgst },
        join_strategy: 'J (acrotpth main + acrrentm idno+mddt+srno 1:1)',
        diagnostics: {
          row_count: rows.length,
          base_table: 'acrotpth WHERE otptdcyn=Y AND otptrgst=R',
          expected_in_range_max: '~2164 (1년 진단 기준)',
          rejected_hypotheses: 'A/B/D/E (모두 0~36건, 부정확)',
          evidence: 'diag sample 4번/15번 1:1 매칭 — otptidno+mddt+srno = rentidno+mddt+srno',
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
