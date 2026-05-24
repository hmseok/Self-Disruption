/**
 * /api/ride-vision/lotto-result
 *
 * GET ?drwNo=N — N 회차 당첨번호
 *   1) ride_lotto_results 캐시 조회 → 있으면 반환 (외부 호출 없음)
 *   2) 없으면 동행복권 selectMainInfo.do JSON 조회 → 최근 회차 결과 캐시
 *      · 응답 data.result.pstLtEpstInfo.lt645 = [{ ltEpsd, tm1~6WnNo, bnsWnNo, ltRflYmd }]
 *        (lt645 는 배열 — 제공 회차 전부 캐시)
 *      · 캐시 후 N 회차가 잡히면 반환, 아니면 미제공(추첨 대기)
 *
 * 옛 getLottoNumber JSON 엔드포인트는 폐기 → selectMainInfo.do AJAX 엔드포인트 사용.
 *
 * 인증: verifyUser (로그인 직원 누구나)
 * RideVision 세션 — PR-VISION-2a → 2d → 3 → 4 → 6
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

const DHLOTTERY_MAIN_INFO = 'https://www.dhlottery.co.kr/selectMainInfo.do'

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

// egress 차단이 1회 확인되면 이후 외부 호출 skip (불필요한 대기 방지 — 인스턴스 캐시)
let egressBlockedSeen = false

function isMissingTable(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e)
  return /doesn't exist|Unknown table|no such table/i.test(msg)
}

// "20260516" → "2026-05-16"
function fmtYmd(v: unknown): string | null {
  const s = String(v ?? '').replace(/[^0-9]/g, '')
  if (s.length !== 8) return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
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

// lt645 배열 1개 항목 → ResultRow (유효성 검사)
function parseLt645(item: unknown): ResultRow | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const num = (k: string) => Number(o[k])
  const drawNo = num('ltEpsd')
  const nums = [
    num('tm1WnNo'),
    num('tm2WnNo'),
    num('tm3WnNo'),
    num('tm4WnNo'),
    num('tm5WnNo'),
    num('tm6WnNo'),
  ]
  const bonus = num('bnsWnNo')
  if (!Number.isInteger(drawNo) || drawNo < 1) return null
  if (nums.some(n => !Number.isInteger(n) || n < 1 || n > 45)) return null
  if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45) return null
  return {
    draw_no: drawNo,
    n1: nums[0],
    n2: nums[1],
    n3: nums[2],
    n4: nums[3],
    n5: nums[4],
    n6: nums[5],
    bonus,
    draw_date: fmtYmd(o.ltRflYmd),
  }
}

type FetchOutcome = {
  status: 'ok' | 'no_data' | 'egress_blocked' | 'bad_response'
  results?: ResultRow[]
  debug?: string
}

// 동행복권 selectMainInfo.do — 최근 로또 6/45 회차 결과 조회 (lt645 배열)
async function fetchLatestResults(): Promise<FetchOutcome> {
  if (egressBlockedSeen) {
    return { status: 'egress_blocked', debug: 'egress 차단 확인됨(인스턴스 캐시) — 호출 skip' }
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(`${DHLOTTERY_MAIN_INFO}?_=${Date.now()}`, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://www.dhlottery.co.kr/',
      },
      cache: 'no-store',
    })
    const text = await res.text()
    let json: Record<string, unknown>
    try {
      json = JSON.parse(text)
    } catch {
      console.log(`[lotto-result] selectMainInfo non-JSON status=${res.status} body=${text.slice(0, 150)}`)
      return { status: 'bad_response', debug: `non-JSON status=${res.status}` }
    }
    // data.result.pstLtEpstInfo.lt645  (lt645 = 배열)
    const data = json.data as Record<string, unknown> | undefined
    const result = data?.result as Record<string, unknown> | undefined
    const pst = result?.pstLtEpstInfo as Record<string, unknown> | undefined
    const lt645 = pst?.lt645
    if (!Array.isArray(lt645) || lt645.length === 0) {
      return { status: 'no_data', debug: 'lt645 배열 없음 — 응답 구조 변경 가능' }
    }
    const results: ResultRow[] = []
    for (const item of lt645) {
      const r = parseLt645(item)
      if (r) results.push(r)
    }
    if (results.length === 0) {
      return { status: 'no_data', debug: `lt645 ${lt645.length}건 파싱 실패` }
    }
    console.log(`[lotto-result] selectMainInfo OK — ${results.map(r => r.draw_no).join(',')}회`)
    return { status: 'ok', results }
  } catch (e) {
    const err = e as Error
    egressBlockedSeen = true
    console.error('[lotto-result] selectMainInfo fetch 실패', err.name, err.message)
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
    // 1) 캐시
    const cached = await getCached(drwNo)
    if (cached) {
      return NextResponse.json({ success: true, data: cached, meta: { drawn: true, cached: true } })
    }

    // 2) selectMainInfo.do 조회 → 제공 회차 전부 캐시
    const fetched = await fetchLatestResults()
    if (fetched.status === 'ok' && fetched.results) {
      for (const r of fetched.results) await putCache(r)
      const hit = fetched.results.find(r => r.draw_no === drwNo)
      if (hit) {
        return NextResponse.json({ success: true, data: hit, meta: { drawn: true, cached: false } })
      }
      // 요청 회차는 selectMainInfo 가 제공하지 않음 (추첨 대기 / 과거 회차)
      return NextResponse.json({
        success: true,
        data: null,
        meta: { drawn: false, drwNo, available: fetched.results.map(r => r.draw_no) },
      })
    }

    // egress 차단 / 응답 이상
    return NextResponse.json({
      success: false,
      data: null,
      egressBlocked: fetched.status === 'egress_blocked',
      error:
        fetched.status === 'egress_blocked'
          ? 'Cloud Run 외부 송신 차단 (egress)'
          : '동행복권 응답 이상',
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
