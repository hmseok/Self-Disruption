/**
 * GET /api/operations/cafe24-factory-assignment?idno=&mddt=&srno= — PR-OPS-1.5f
 *
 * 카페24 「공장배정」 정보 (ajaoderh + pmcfactm).
 *
 * 사용자 명시 (2026-05-13): 카페24 「사고처리관리」 화면의 「공장배정」 섹션.
 *   사용자 sample: 「성우자동차공업(주)」 = pmcfactm.factname.
 *
 * 모듈 책임 (CLAUDE.md Rule 21):
 *   본 세션 (operations) 자기 모듈 영역.
 *
 * ajaoderh JOIN 키:
 *   oderidno + odermddt + odersrno (= acrotpth/acrmemoh 와 동일 가설 J)
 *
 * 컬럼 (aja0101a.php INSERT 패턴):
 *   oderfact = 공장 코드 (pmcfactm.factcode)
 *   odermscs / odermetp = 의뢰 타입
 *   oderstat = 상태 ('X'=취소, '1'/'2'=진행단계)
 *   oderseqn = 시퀀스
 *   odergnus + odergndt + odergntm = 등록자/일시
 *
 * cafe24-db: MariaDB 10.1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

export interface FactoryAssignmentRow extends RowDataPacket {
  oderidno: string
  odermddt: string
  odersrno: number
  oderseqn: number | null
  oderfact: string | null
  odermscs: string | null
  odermetp: string | null
  oderstat: string | null
  odergnus: string | null
  odergndt: string | null
  odergntm: string | null
  // pmcfactm JOIN — 공장 정보
  factname: string | null
  factbdno: string | null
  facthpno: string | null
  facttelo: string | null
  factaddr: string | null
  // picuserm JOIN — 등록자
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
    // ajaoderh 1:N — 한 사고에 N 공장배정 가능 (oderseqn 별)
    // 활성만 (oderstat <> 'X')
    const sql = `
      SELECT a.oderidno, a.odermddt, a.odersrno,
             a.oderseqn, a.oderfact,
             a.odermscs, a.odermetp, a.oderstat,
             a.odergnus, a.odergndt, a.odergntm,
             f.factname, f.factbdno, f.facthpno, f.facttelo,
             f.factaddr,
             u.username AS user_name
        FROM ajaoderh a
        LEFT JOIN pmcfactm f
          ON f.factcode = a.oderfact
        LEFT JOIN picuserm u
          ON u.userpidn = a.odergnus
         AND a.odermddt BETWEEN u.userfrdt AND u.usertodt
       WHERE a.oderidno = ?
         AND a.odermddt = ?
         AND a.odersrno = ?
         AND a.oderstat <> 'X'
       ORDER BY a.oderseqn DESC, a.odergndt DESC, a.odergntm DESC
       LIMIT 50
    `
    const rows = await cafe24Db.query<FactoryAssignmentRow>(sql, [idno, mddt, srno])

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        key: { idno, mddt, srno },
        count: rows.length,
        source: 'ajaoderh (공장배정 본체) + pmcfactm (공장 마스터)',
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/operations/cafe24-factory-assignment] error:', err.code, err.message)
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
