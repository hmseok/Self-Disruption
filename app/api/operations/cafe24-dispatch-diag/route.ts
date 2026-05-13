/**
 * GET /api/operations/cafe24-dispatch-diag — PR-OPS-1.5a hotfix #1
 *
 * 「대차요청 row 0건」 원인 진단 endpoint.
 * 1회 호출로 모든 JOIN 가설 동시 검증.
 *
 * 호출:
 *   /api/operations/cafe24-dispatch-diag?from=20260101&to=20260513
 *   Authorization: Bearer <fmi_token>
 *
 * 진단 항목 (7개):
 *   1. acrotpth 전체 row 수
 *   2. otptdcyn distinct 분포 (Y/N/null/'')
 *   3. 시간 범위 안 acrotpth row 수
 *   4. 시간 범위 안 otptdcyn='Y' row 수
 *   5. 가설 A JOIN row 수 (otptidno+mddt+srno)
 *   6. 가설 B JOIN row 수 (otptidno+mddt 만)
 *   7. acrotpth sample 5건 (시간 범위 안)
 *
 * 모듈: app/api/operations/* (Rule 21 자기 영역)
 *
 * cafe24-db: MariaDB 10.1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  const allowed = await canAccessPage(user, '/RideAccidents')
  if (!allowed) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from') || '20260101'
  const to = url.searchParams.get('to') || '20991231'
  if (!/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) {
    return NextResponse.json({ success: false, error: 'from/to must be YYYYMMDD' }, { status: 400 })
  }

  try {
    // 1. acrotpth 전체 row 수
    const total = await cafe24Db.query<RowDataPacket & { c: number }>(
      'SELECT COUNT(*) AS c FROM acrotpth'
    )

    // 2. otptdcyn distinct 분포
    const dcynDist = await cafe24Db.query<RowDataPacket & { otptdcyn: string | null; c: number }>(
      'SELECT otptdcyn, COUNT(*) AS c FROM acrotpth GROUP BY otptdcyn ORDER BY c DESC'
    )

    // 3. 시간 범위 안 acrotpth (otptmddt 기준)
    const inRange = await cafe24Db.query<RowDataPacket & { c: number }>(
      `SELECT COUNT(*) AS c FROM acrotpth
        WHERE CHAR_LENGTH(otptmddt) = 8
          AND otptmddt BETWEEN ? AND ?`,
      [from, to]
    )

    // 4. 시간 범위 안 otptdcyn='Y'
    const yInRange = await cafe24Db.query<RowDataPacket & { c: number }>(
      `SELECT COUNT(*) AS c FROM acrotpth
        WHERE CHAR_LENGTH(otptmddt) = 8
          AND otptmddt BETWEEN ? AND ?
          AND otptdcyn = 'Y'`,
      [from, to]
    )

    // 5. 가설 A JOIN (otptidno+mddt+srno)
    const hypA = await cafe24Db.query<RowDataPacket & { c: number }>(
      `SELECT COUNT(*) AS c FROM aceesosh a
        INNER JOIN acrotpth b
          ON b.otptidno = a.esosidno
         AND b.otptmddt = a.esosmddt
         AND b.otptsrno = a.esossrno
        WHERE CHAR_LENGTH(a.esosmddt) = 8
          AND a.esosmddt BETWEEN ? AND ?`,
      [from, to]
    )

    // 6. 가설 B JOIN (otptidno+mddt 만)
    const hypB = await cafe24Db.query<RowDataPacket & { c: number }>(
      `SELECT COUNT(*) AS c FROM aceesosh a
        INNER JOIN acrotpth b
          ON b.otptidno = a.esosidno
         AND b.otptmddt = a.esosmddt
        WHERE CHAR_LENGTH(a.esosmddt) = 8
          AND a.esosmddt BETWEEN ? AND ?`,
      [from, to]
    )

    // 6.b. 가설 B + otptdcyn='Y'
    const hypBy = await cafe24Db.query<RowDataPacket & { c: number }>(
      `SELECT COUNT(*) AS c FROM aceesosh a
        INNER JOIN acrotpth b
          ON b.otptidno = a.esosidno
         AND b.otptmddt = a.esosmddt
        WHERE CHAR_LENGTH(a.esosmddt) = 8
          AND a.esosmddt BETWEEN ? AND ?
          AND b.otptdcyn = 'Y'`,
      [from, to]
    )

    // 7. acrotpth sample 5건 (시간 범위 안, srno 비교용)
    const acrotpthSample = await cafe24Db.query<RowDataPacket>(
      `SELECT otptidno, otptmddt, otptsrno, otptdcyn, otptcanm, otptdsnm,
              otptacdt, otptactm, otptrgst
         FROM acrotpth
        WHERE CHAR_LENGTH(otptmddt) = 8
          AND otptmddt BETWEEN ? AND ?
        ORDER BY otptmddt DESC, otptsrno DESC
        LIMIT 5`,
      [from, to]
    )

    // 8. aceesosh sample 5건 (같은 시간 범위 — srno 비교용)
    const aceesoshSample = await cafe24Db.query<RowDataPacket>(
      `SELECT esosidno, esosmddt, esossrno, esosrgst, esosrslt, esosacdt, esosactm
         FROM aceesosh
        WHERE CHAR_LENGTH(esosmddt) = 8
          AND esosmddt BETWEEN ? AND ?
        ORDER BY esosmddt DESC, esossrno DESC
        LIMIT 5`,
      [from, to]
    )

    // 9. 같은 idno+mddt 가지는 acrotpth ↔ aceesosh srno 비교 (가설 A vs B 결정타)
    const srnoCompare = await cafe24Db.query<RowDataPacket>(
      `SELECT a.esosidno, a.esosmddt,
              a.esossrno AS ace_srno,
              b.otptsrno AS otpt_srno,
              b.otptdcyn
         FROM aceesosh a
         LEFT JOIN acrotpth b
           ON b.otptidno = a.esosidno
          AND b.otptmddt = a.esosmddt
        WHERE CHAR_LENGTH(a.esosmddt) = 8
          AND a.esosmddt BETWEEN ? AND ?
          AND a.esosrgst = 'R'
        ORDER BY a.esosmddt DESC, a.esossrno DESC
        LIMIT 10`,
      [from, to]
    )

    return NextResponse.json({
      success: true,
      diagnostics: {
        '1_acrotpth_total': total[0]?.c,
        '2_otptdcyn_distribution': dcynDist,
        '3_in_range_acrotpth': inRange[0]?.c,
        '4_in_range_otptdcyn_Y': yInRange[0]?.c,
        '5_hypothesis_A_join_count (idno+mddt+srno)': hypA[0]?.c,
        '6_hypothesis_B_join_count (idno+mddt only)': hypB[0]?.c,
        '6b_hypothesis_B_join_count + otptdcyn=Y': hypBy[0]?.c,
        '7_acrotpth_sample_5': acrotpthSample,
        '8_aceesosh_sample_5': aceesoshSample,
        '9_srno_compare (left join, see if ace_srno == otpt_srno)': srnoCompare,
      },
      meta: {
        fetched_at: new Date().toISOString(),
        from, to,
        interpretation: {
          if_3_zero: '시간 범위에 acrotpth row 없음 — from/to 확장 필요',
          if_3_nonzero_4_zero: 'acrotpth 는 있는데 otptdcyn=Y 없음 — 다른 컬럼/값 의심',
          if_5_eq_6: '가설 A 정확 (srno 매칭)',
          if_5_zero_6_nonzero: '가설 B 사용 — srno 별도 일련번호',
          if_5_lt_6: 'acrotpth 가 사고와 1:N (출동마다 별 row, srno 다름) — 가설 C: MAX(srno) 또는 latest',
          if_9_shows_srno_diff: '9 결과의 ace_srno vs otpt_srno 다르면 → 가설 B 채택 + b.otptdcyn 만 별도 필터',
        },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/operations/cafe24-dispatch-diag] error:', err.code, err.message)
    return NextResponse.json(
      {
        success: false,
        error: 'cafe24-unavailable',
        meta: {
          db_error: err.code || 'no-code',
          db_message: (err.message || '').slice(0, 500),
        },
      },
      { status: 200 }
    )
  }
}
