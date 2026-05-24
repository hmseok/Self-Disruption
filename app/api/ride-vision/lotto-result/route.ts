/**
 * /api/ride-vision/lotto-result
 *
 * GET ?drwNo=N   — N 회차 당첨번호 (캐시 우선 → 동행복권 조회)
 * GET ?latest=1  — 최신 추첨 완료 회차 추정 + 당첨번호
 *
 * 동행복권 비공식 엔드포인트: common.do?method=getLottoNumber&drwNo=N
 *   응답: { returnValue:'success', drwNo, drwNoDate, drwtNo1~6, bnusNo, ... }
 *   미추첨 / 미존재 회차 → returnValue:'fail'
 * 결과는 ride_lotto_results 에 캐시 — 같은 회차 재호출 시 외부 호출 안 함.
 * 첫 호출 raw 응답을 로깅 (Rule 3 [B] dry-run 검증).
 *
 * 인증: verifyUser (로그인 직원 누구나 — 개인 유틸이라 page-permission 미적용)
 *
 * RideVision 세션 — PR-VISION-2a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

const DHLOTTERY_URL = 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo='

// 로또 6/45 1회차 추첨일: 2002-12-07 (토). 이후 매주 토요일 추첨.
const ROUND1_DATE_MS = Date.UTC(2002, 11, 7)
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

interface ResultRow {
  draw_no: number
  n1: number
  n2: number
  n3: number
  n4: number
  n5: number
  n6: number
  bonus: number
  draw_date: string | null
}

// 마이그레이션 미적용 감지
function isMissingTable(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e)
  return /doesn't exist|Unknown table|no such table/i.test(msg)
}

// 오늘 기준 최신 회차 추정 (KST 토요일 추첨 — ±1~2 오차는 역탐색으로 보정)
function estimateLatestRound(): number {
  const elapsed = Date.now() - ROUND1_DATE_MS
  return Math.max(1, Math.floor(elapsed / WEEK_MS) + 1)
}

// 동행복권 단건 조회 (raw 로깅 — Rule 3 dry-run)
async function fetchDhLottery(
  drwNo: number
): Promise<{ ok: boolean; drawn: boolean; result?: ResultRow }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(`${DHLOTTERY_URL}${drwNo}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (FMI-ERP RideVision)' },
      cache: 'no-store',
    })
    const text = await res.text()
    console.log(`[lotto-result] drwNo=${drwNo} status=${res.status} raw=${text.slice(0, 300)}`)
    let json: Record<string, unknown>
    try {
      json = JSON.parse(text)
    } catch {
      return { ok: false, drawn: false }
    }
    if (json.returnValue !== 'success') {
      return { ok: true, drawn: false } // 미추첨 / 미존재 회차
    }
    const num = (k: string) => Number(json[k])
    return {
      ok: true,
      drawn: true,
      result: {
        draw_no: num('drwNo'),
        n1: num('drwtNo1'),
        n2: num('drwtNo2'),
        n3: num('drwtNo3'),
        n4: num('drwtNo4'),
        n5: num('drwtNo5'),
        n6: num('drwtNo6'),
        bonus: num('bnusNo'),
        draw_date: (json.drwNoDate as string) || null,
      },
    }
  } catch (e) {
    console.error('[lotto-result] fetch 실패', drwNo, (e as Error).message)
    return { ok: false, drawn: false }
  } finally {
    clearTimeout(timer)
  }
}

// 캐시 조회 (테이블 미적용 시 null → 라이브 조회로 폴백)
async function getCached(drwNo: number): Promise<ResultRow | null> {
  try {
    const rows = await prisma.$queryRaw<ResultRow[]>`
      SELECT draw_no, n1, n2, n3, n4, n5, n6, bonus,
             DATE_FORMAT(draw_date, '%Y-%m-%d') AS draw_date
        FROM ride_lotto_results
       WHERE draw_no = ${drwNo}
       LIMIT 1
    `
    return rows[0] || null
  } catch (e) {
    if (isMissingTable(e)) return null
    throw e
  }
}

// 캐시 저장 (당첨번호는 회차당 불변 → INSERT IGNORE 멱등)
async function putCache(r: ResultRow): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT IGNORE INTO ride_lotto_results
        (draw_no, n1, n2, n3, n4, n5, n6, bonus, draw_date)
      VALUES
        (${r.draw_no}, ${r.n1}, ${r.n2}, ${r.n3}, ${r.n4}, ${r.n5}, ${r.n6}, ${r.bonus}, ${r.draw_date})
    `
  } catch (e) {
    if (!isMissingTable(e)) console.warn('[lotto-result] 캐시 저장 실패', (e as Error).message)
    // 테이블 미적용 — 캐시 없이 진행 (Rule 23 graceful fallback)
  }
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, data: null, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const latestFlag = url.searchParams.get('latest')

    // ── 최신 회차 ──
    if (latestFlag === '1' || latestFlag === 'true') {
      let round = estimateLatestRound()
      for (let attempt = 0; attempt < 3 && round >= 1; attempt++) {
        const cached = await getCached(round)
        if (cached) {
          return NextResponse.json({
            success: true,
            data: cached,
            meta: { latest: true, cached: true },
          })
        }
        const fetched = await fetchDhLottery(round)
        if (fetched.ok && fetched.drawn && fetched.result) {
          await putCache(fetched.result)
          return NextResponse.json({
            success: true,
            data: fetched.result,
            meta: { latest: true, cached: false },
          })
        }
        round -= 1
      }
      return NextResponse.json({
        success: true,
        data: null,
        meta: { latest: true, error: '최신 회차 확인 실패' },
      })
    }

    // ── 특정 회차 ──
    const drwNo = parseInt(url.searchParams.get('drwNo') || '', 10)
    if (!Number.isInteger(drwNo) || drwNo < 1) {
      return NextResponse.json(
        { success: false, data: null, error: 'drwNo 파라미터 필요 (양의 정수)' },
        { status: 400 }
      )
    }

    const cached = await getCached(drwNo)
    if (cached) {
      return NextResponse.json({ success: true, data: cached, meta: { drawn: true, cached: true } })
    }

    const fetched = await fetchDhLottery(drwNo)
    if (!fetched.ok) {
      return NextResponse.json(
        { success: false, data: null, error: '동행복권 조회 실패' },
        { status: 502 }
      )
    }
    if (!fetched.drawn || !fetched.result) {
      return NextResponse.json({ success: true, data: null, meta: { drawn: false, drwNo } })
    }
    await putCache(fetched.result)
    return NextResponse.json({
      success: true,
      data: fetched.result,
      meta: { drawn: true, cached: false },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-vision/lotto-result GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: null, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
