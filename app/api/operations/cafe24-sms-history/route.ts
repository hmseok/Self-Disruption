/**
 * GET /api/operations/cafe24-sms-history?idno=&mddt=&srno= — PR-B3 (2026-05-16)
 *
 * 카페24 「문자 발송 이력 + 발송문구」 read-only.
 * 사용자 명시 (2026-05-16): 「문자 발송이력과 발송문구 내용도 카페24 접수에 있긴한데」
 *
 * 모듈 책임 (CLAUDE.md Rule 21):
 *   본 세션 (operations) 자기 모듈 영역.
 *
 * 테이블 (cafe24_source 사전 조사 — agent 결과):
 *   crmsendh — SMS 발송 이력 본체
 *   crmsmsgh — SMS 메시지 템플릿/그룹 (smsgcust + smsggubn + smsgcode JOIN)
 *
 * JOIN 키 (가설 J 동등 — sendidno + sendmddt + sendsrno):
 *   crm0201a.php:2863-2876 패턴 그대로 차용
 *
 * 화이트리스트 컬럼 (사용자 화면 표출용):
 *   sendseqn / sendsndt / sendsntm / sendmobl / sendmesg / sendstat / sendrslt
 *   sendtype / sendsbjt / sendresv / sendhpdt / sendhptm
 *   smsgdesc (템플릿 설명)
 *   sendgnus + username (발송자)
 *
 * cafe24-db: MariaDB 10.1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

export interface Cafe24SmsRow extends RowDataPacket {
  sendseqn: number
  sendidno: string
  sendmddt: string
  sendsrno: number
  sendsndt: string | null     // 발송일자 (YYYYMMDD)
  sendsntm: string | null     // 발송시간 (HHMMSS)
  sendhpdt: string | null     // 예약 발송일자
  sendhptm: string | null     // 예약 발송시간
  sendresv: string | null     // 예약 여부 (Y/N)
  sendmobl: string | null     // 수신자 번호
  sendmesg: string | null     // 발송 본문 (raw)
  sendsbjt: string | null     // 제목
  sendstat: string | null     // 발송 상태 (Y/N/F/X)
  sendrslt: string | null     // 결과 메시지
  sendtype: string | null     // SMS/LMS/MMS/KAKAO
  sendcust: string | null
  sendgubn: string | null
  sendcode: string | null
  sendgnus: string | null     // 발송자 코드
  user_name: string | null    // picuserm.username
  smsgdesc: string | null     // 템플릿 설명 (crmsmsgh)
}

export async function GET(request: Request) {
  // ── 권한 ──
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  }
  const allowed = await canAccessPage(user, '/RideAccidents')
  if (!allowed) {
    return NextResponse.json({ success: false, data: [], error: 'forbidden' }, { status: 403 })
  }

  // ── Query 파싱 ──
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
    // crm0201a.php:2863-2876 패턴 — crmsendh LEFT JOIN crmsmsgh (템플릿 설명 fallback)
    // sendsndt vs sendhpdt 우선순위: 예약(Y) 시 sendhpdt/hptm, 즉시(N) 시 sendsndt/sntm
    const sql = `
      SELECT s.sendseqn,
             s.sendidno, s.sendmddt, s.sendsrno,
             s.sendsndt, s.sendsntm,
             s.sendhpdt, s.sendhptm,
             s.sendresv,
             s.sendmobl, s.sendmesg, s.sendsbjt,
             s.sendstat, s.sendrslt, s.sendtype,
             s.sendcust, s.sendgubn, s.sendcode,
             s.sendgnus,
             u.username AS user_name,
             g.smsgdesc
        FROM crmsendh s
        LEFT JOIN crmsmsgh g
          ON g.smsgcust = s.sendcust
         AND g.smsgcode = s.sendcode
         AND g.smsggubn = s.sendgubn
        LEFT JOIN picuserm u
          ON u.userpidn = s.sendgnus
         AND s.sendmddt BETWEEN u.userfrdt AND u.usertodt
       WHERE s.sendidno = ?
         AND s.sendmddt = ?
         AND s.sendsrno = ?
       ORDER BY s.sendsndt DESC, s.sendhpdt DESC, s.sendsntm DESC
       LIMIT 100
    `
    const rows = await cafe24Db.query<Cafe24SmsRow>(sql, [idno, mddt, srno])

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        key: { idno, mddt, srno },
        count: rows.length,
        source: 'crmsendh (발송 이력) + crmsmsgh (템플릿)',
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/operations/cafe24-sms-history] error:', err.code, err.message)
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
