/**
 * /api/ride-vision/lotto-sms
 *
 * POST { draw_no } — 본인이 그 회차에 기록한 게임을 본인 휴대폰으로 문자 발송.
 *   "나한테" = profiles.phone (로그인 사용자 본인). 다른 번호로는 못 보냄.
 *   Aligo 발송은 기존 app/utils/messaging.ts 의 sendSMS 재사용.
 *
 * 인증: verifyUser
 * RideVision 세션 — PR-VISION-17
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { sendSMS } from '@/app/utils/messaging'

interface GameRow {
  n1: number
  n2: number
  n3: number
  n4: number
  n5: number
  n6: number
}

function isMissingTable(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e)
  return /doesn't exist|Unknown table|no such table/i.test(msg)
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }
  const drawNo = parseInt(String(body.draw_no ?? ''), 10)
  if (!Number.isInteger(drawNo) || drawNo < 1) {
    return NextResponse.json({ success: false, error: '회차(draw_no) 필요' }, { status: 400 })
  }

  try {
    // 본인 휴대폰 — profiles.phone
    const profs = await prisma.$queryRaw<{ phone: string | null }[]>`
      SELECT phone FROM profiles WHERE id = ${user.id} LIMIT 1
    `
    const phone = String(profs[0]?.phone || '').replace(/[^0-9]/g, '')
    if (!/^01[0-9]{8,9}$/.test(phone)) {
      return NextResponse.json(
        { success: false, error: '프로필에 휴대폰 번호가 없습니다 — 관리자에게 등록을 요청하세요' },
        { status: 400 }
      )
    }

    // 그 회차에 본인이 기록한 게임
    const rows = await prisma.$queryRaw<GameRow[]>`
      SELECT n1, n2, n3, n4, n5, n6
        FROM ride_lotto_entries
       WHERE user_id = ${user.id} AND draw_no = ${drawNo}
       ORDER BY created_at ASC
    `
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: `${drawNo}회차 구매 기록이 없습니다` },
        { status: 400 }
      )
    }

    const lines = rows.map(
      (r, i) => `${i + 1}게임  ${[r.n1, r.n2, r.n3, r.n4, r.n5, r.n6].join(', ')}`
    )
    const message = `[로또 ${drawNo}회]\n${lines.join('\n')}\n\nmade by seok`

    const result = await sendSMS({ phone, message, title: `로또 ${drawNo}회 번호` })
    if (result.success) {
      const masked = `${phone.slice(0, 3)}****${phone.slice(-4)}`
      return NextResponse.json({ success: true, sentTo: masked, games: rows.length, draw_no: drawNo })
    }
    return NextResponse.json(
      { success: false, error: result.error || 'SMS 발송 실패' },
      { status: 502 }
    )
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json(
        { success: false, error: 'migration 미적용 — ride_lotto_entries 테이블 필요' },
        { status: 503 }
      )
    }
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-vision/lotto-sms POST]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
