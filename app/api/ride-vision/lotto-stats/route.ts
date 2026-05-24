/**
 * /api/ride-vision/lotto-stats
 *
 * GET — ride_lotto_results 캐시 전체의 번호별 출현 빈도 통계
 *   재미용 통계 — 로또는 매 회차 완전히 독립된 추첨이라 과거 빈도는
 *   당첨 확률과 무관. 화면에도 그렇게 명시 표기한다.
 *   캐시된 회차만 집계 (회차 열람 시 lotto-result 가 점진 적재).
 *
 * 인증: verifyUser
 * RideVision 세션 — PR-VISION-15
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface ResultRow {
  n1: number
  n2: number
  n3: number
  n4: number
  n5: number
  n6: number
  bonus: number
}

function isMissingTable(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e)
  return /doesn't exist|Unknown table|no such table/i.test(msg)
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, data: null, error: 'unauthorized' }, { status: 401 })
  }

  const empty = { draws: 0, freq: new Array(46).fill(0), bonusFreq: new Array(46).fill(0) }

  try {
    const rows = await prisma.$queryRaw<ResultRow[]>`
      SELECT n1, n2, n3, n4, n5, n6, bonus FROM ride_lotto_results
    `
    const freq = new Array(46).fill(0) // index 1~45 — 당첨번호 출현 횟수
    const bonusFreq = new Array(46).fill(0) // 보너스 출현 횟수
    for (const r of rows) {
      for (const n of [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6]) {
        if (Number.isInteger(n) && n >= 1 && n <= 45) freq[n]++
      }
      if (Number.isInteger(r.bonus) && r.bonus >= 1 && r.bonus <= 45) bonusFreq[r.bonus]++
    }
    return NextResponse.json({
      success: true,
      data: { draws: rows.length, freq, bonusFreq },
    })
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json({ success: true, data: empty, meta: { _migration_pending: true } })
    }
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-vision/lotto-stats GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: empty, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
