/**
 * /api/ride-vision/lotto-result
 *
 * GET ?drwNo=N — N 회차 당첨번호
 *   1) ride_lotto_results 캐시 조회 → 있으면 반환 (외부 호출 없음)
 *   2) 없으면 동행복권 common.do JSON 조회 (AbortController 5초 + User-Agent)
 *      · returnValue==='success' → 번호 캐시 + 반환
 *      · returnValue==='fail'    → 미추첨 회차
 *      · 타임아웃/네트워크 에러   → egressBlocked:true (Cloud Run 외부송신 차단)
 *      · JSON 아닌 응답(HTML)     → endpointDead:true  (엔드포인트 폐기)
 *
 * egress 판가름용 — 배포 후 ?drwNo=1100 1회 호출로 확정.
 * 인증: verifyUser (로그인 직원 누구나)
 * RideVision 세션 — PR-VISION-2a → 2d → 3
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

const DHLOTTERY_URL = 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo='

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

// 모듈 수명 동안 egress 차단이 1회 확인되면 이후 dhlottery 호출 skip (불필요한 5초 대기 방지)
let egressBlockedSeen = false

function isMissingTable(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e)
  return /doesn't exist|Unknown table|no such table/i.test(msg)
}

// 캐시 조회 (테이블 미적용 시 null)
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

// 캐시 저장 (회차당 불변 → INSERT IGNORE 멱등)
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
  }
}

type FetchOutcome = {
  status: 'ok' | 'not_drawn' | 'egress_blocked' | 'endpoint_dead'
  result?: ResultRow
  debug?: string
}

// 동행복권 단건 조회 (raw 로깅 — Rule 3 [B][C])
async function fetchDhLottery(drwNo: number): Promise<FetchOutcome> {
  if (egressBlockedSeen) {
    return { status: 'egress_blocked', debug: 'egress 차단 확인됨(인스턴스 캐시) — 호출 skip' }
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(`${DHLOTTERY_URL}${drwNo}`, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
      },
      cache: 'no-store',
    })
    const text = await res.text()
    console.log(`[lotto-result] drwNo=${drwNo} status=${res.status} raw=${text.slice(0, 200)}`)
    let json: Record<string, unknown>
    try {
      json = JSON.parse(text)
    } catch {
      // 연결은 됐으나 JSON 아님 → 엔드포인트 폐기 (egress 는 정상)
      return {
        status: 'endpoint_dead',
        debug: `non-JSON status=${res.status} ct=${res.headers.get('content-type') || '-'} body=${text.slice(0, 120)}`,
      }
    }
    if (json.returnValue === 'success') {
      const num = (k: string) => Number(json[k])
      return {
        status: 'ok',
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
    }
    return { status: 'not_drawn', debug: `returnValue=${String(json.returnValue)}` }
  } catch (e) {
    const err = e as Error
    egressBlockedSeen = true
    console.error('[lotto-result] egress-blocked', drwNo, err.name, err.message)
    return { status: 'egress_blocked', debug: `fetch-throw ${err.name}: ${err.message}` }
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, data: null, error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const drwNo = parseInt(url.searchParams.get('drwNo') || '', 10)
  if (!Number.isInteger(drwNo) || drwNo < 1) {
    return NextResponse.json(
      { success: false, data: null, error: 'drwNo 파라미터 필요 (양의 정수)' },
      { status: 400 }
    )
  }

  try {
    const cached = await getCached(drwNo)
    if (cached) {
      return NextResponse.json({ success: true, data: cached, meta: { drawn: true, cached: true } })
    }

    const fetched = await fetchDhLottery(drwNo)

    if (fetched.status === 'ok' && fetched.result) {
      await putCache(fetched.result)
      return NextResponse.json({ success: true, data: fetched.result, meta: { drawn: true, cached: false } })
    }
    if (fetched.status === 'not_drawn') {
      return NextResponse.json({ success: true, data: null, meta: { drawn: false, drwNo, debug: fetched.debug } })
    }

    // egress_blocked / endpoint_dead — status 200 (페이지가 플래그를 읽을 수 있도록)
    return NextResponse.json({
      success: false,
      data: null,
      egressBlocked: fetched.status === 'egress_blocked',
      endpointDead: fetched.status === 'endpoint_dead',
      error:
        fetched.status === 'egress_blocked'
          ? 'Cloud Run 외부 송신 차단 (egress)'
          : '동행복권 엔드포인트 폐기 — JSON 아님',
      debug: fetched.debug,
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
