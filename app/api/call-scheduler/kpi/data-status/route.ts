// ═══════════════════════════════════════════════════════════════════
// GET / DELETE /api/call-scheduler/kpi/data-status
//   CX KPI — 베이스 데이터 검수·관리 (KT 엑셀 적재 현황)
//
//   업로드된 4개 소스 테이블이 「전체 다 들어왔는지 / 중복은 없는지 /
//   며칠치 기준인지」 를 확인·관리하는 데이터 탭의 백엔드.
//
//   소스 4종 (날짜 컬럼):
//     ① cs_call_records       — call_date
//     ② cs_agent_productivity — period_label (period_kind='daily' 만 일자, 'monthly' 는 월)
//     ③ cs_response_ivr       — stat_date
//     ④ cs_response_queue     — stat_date
//
//   GET   ?granularity=day|week|month&date=YYYY-MM-DD
//         (또는 ?from=YYYY-MM-DD&to=YYYY-MM-DD — 직접 범위, date 보다 우선)
//     → 각 소스별 충족율·중복 안전·빠진 날짜·날짜별 행수 등
//   DELETE ?source=call_records|productivity|response_ivr|response_queue
//          &from=YYYY-MM-DD&to=YYYY-MM-DD
//     → 잘못 올린 업로드분 삭제 (날짜 컬럼 BETWEEN)
//
//   모든 소스 쿼리 graceful try/catch — 테이블 미적재 시 available:false.
//   테이블명은 절대 보간하지 않음 — source 별 코드 분기로 고정 쿼리.
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

type Granularity = 'day' | 'week' | 'month'

// granularity + 기준일 → { from, to } (YYYY-MM-DD) — dashboard route 패턴 동일
function resolveRange(granularity: Granularity, base: Date): { from: string; to: string } {
  if (granularity === 'day') {
    const iso = isoOf(base)
    return { from: iso, to: iso }
  }
  if (granularity === 'week') {
    // 월요일 시작 주
    const d = new Date(base)
    const dow = (d.getDay() + 6) % 7 // 0 = 월
    const mon = new Date(d); mon.setDate(d.getDate() - dow)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { from: isoOf(mon), to: isoOf(sun) }
  }
  // month
  const y = base.getFullYear()
  const m = base.getMonth() + 1
  const last = new Date(y, m, 0).getDate()
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` }
}

// from~to 사이 모든 날짜 ISO 배열 (포함, 최대 366일 안전 cap)
function dateSpan(from: string, to: string): string[] {
  const out: string[] = []
  const start = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return out
  let cur = new Date(start)
  let guard = 0
  while (cur.getTime() <= end.getTime() && guard < 367) {
    out.push(isoOf(cur))
    cur.setDate(cur.getDate() + 1)
    guard++
  }
  return out
}

// 기간 일수
function periodDays(from: string, to: string): number {
  return dateSpan(from, to).length
}

// ── 소스 메타 (DELETE 화이트리스트 + 라벨) ──────────────────────
// 테이블명은 여기서만 상수로 — 쿼리는 source 별 코드 분기로 고정.
const SOURCE_KEYS = ['call_records', 'productivity', 'response_ivr', 'response_queue'] as const
type SourceKey = typeof SOURCE_KEYS[number]

interface SourceStatus {
  source: SourceKey
  label: string
  available: boolean          // 테이블 존재·조회 성공 여부
  total_rows: number          // 기간 내 총 행수
  covered_dates: number       // 데이터가 있는 distinct 날짜 수
  period_days: number         // 기간 일수
  coverage_pct: number        // 충족율 % (covered_dates / period_days)
  missing_dates: string[]     // 기간 중 데이터 없는 날짜 (최대 31)
  by_date: { date: string; rows: number }[]   // 날짜별 행수
  date_min: string | null     // 전체(기간 무관) 최초 데이터 날짜
  date_max: string | null     // 전체(기간 무관) 최후 데이터 날짜
  unique_ok: boolean          // 중복 안전 (COUNT(*) === COUNT(DISTINCT 키))
  // agent_productivity 전용 — daily/monthly 혼재
  monthly_rows?: number       // 기간과 겹치는 월 라벨 행수 (보조 표기)
}

// 빈/오류 상태 기본값
function emptyStatus(source: SourceKey, label: string, days: number): SourceStatus {
  return {
    source, label, available: false,
    total_rows: 0, covered_dates: 0, period_days: days, coverage_pct: 0,
    missing_dates: [], by_date: [], date_min: null, date_max: null,
    unique_ok: true,
  }
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const granRaw = url.searchParams.get('granularity') || 'month'
    const granularity: Granularity =
      (['day', 'week', 'month'].includes(granRaw) ? granRaw : 'month') as Granularity
    const dateParam = url.searchParams.get('date')
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')

    const base = dateParam ? new Date(dateParam + 'T00:00:00') : new Date()
    let { from, to } = resolveRange(granularity, isNaN(base.getTime()) ? new Date() : base)
    // from/to 직접 지정 시 범위 override (dashboard route 와 동일 패턴)
    if (fromParam && toParam) {
      from = fromParam
      to = toParam
    }
    const days = periodDays(from, to)
    const spanIso = dateSpan(from, to)

    // ════ ① cs_call_records (날짜=call_date, UNIQUE=call_key) ════
    let callRecords = emptyStatus('call_records', 'KT 상담이력조회', days)
    try {
      // 날짜별 행수 (기간 내)
      const byDateRows = await prisma.$queryRaw<any[]>`
        SELECT DATE_FORMAT(call_date, '%Y-%m-%d') AS d, COUNT(*) AS cnt
        FROM cs_call_records
        WHERE call_date BETWEEN ${from} AND ${to}
        GROUP BY DATE_FORMAT(call_date, '%Y-%m-%d')
        ORDER BY d
      `
      // 중복 안전 — 기간 내 COUNT(*) vs COUNT(DISTINCT call_key)
      const uqRow = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS total, COUNT(DISTINCT call_key) AS uq
        FROM cs_call_records
        WHERE call_date BETWEEN ${from} AND ${to}
      `
      // 전체 데이터 범위 (기간 무관)
      const mmRow = await prisma.$queryRaw<any[]>`
        SELECT DATE_FORMAT(MIN(call_date), '%Y-%m-%d') AS dmin,
               DATE_FORMAT(MAX(call_date), '%Y-%m-%d') AS dmax
        FROM cs_call_records
      `
      callRecords = buildDateStatus(
        'call_records', 'KT 상담이력조회', spanIso, byDateRows,
        uqRow[0], mmRow[0],
      )
    } catch { /* graceful — cs_call_records 미적재 */ }

    // ════ ② cs_agent_productivity (날짜=period_label, daily/monthly 혼재) ════
    //   daily 행 — period_label 이 YYYY-MM-DD → 일자 충족율 기준
    //   monthly 행 — period_label 이 YYYY-MM → 기간과 겹치는 월 행수만 별도 표기
    //   UNIQUE = (period_label, agent_kt_id)
    let productivity = emptyStatus('productivity', 'KT 생산성(상담사)', days)
    try {
      // daily 행 — 날짜별 행수 (기간 내)
      const byDateRows = await prisma.$queryRaw<any[]>`
        SELECT period_label AS d, COUNT(*) AS cnt
        FROM cs_agent_productivity
        WHERE period_kind = 'daily'
          AND period_label BETWEEN ${from} AND ${to}
        GROUP BY period_label
        ORDER BY period_label
      `
      // 중복 안전 — daily 기간 내 COUNT(*) vs COUNT(DISTINCT label|kt_id)
      const uqRow = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS total,
               COUNT(DISTINCT CONCAT(period_label, '|', agent_kt_id)) AS uq
        FROM cs_agent_productivity
        WHERE period_kind = 'daily'
          AND period_label BETWEEN ${from} AND ${to}
      `
      // daily 전체 데이터 범위
      const mmRow = await prisma.$queryRaw<any[]>`
        SELECT MIN(period_label) AS dmin, MAX(period_label) AS dmax
        FROM cs_agent_productivity
        WHERE period_kind = 'daily'
      `
      // monthly 행수 — 기간과 겹치는 월 라벨 (YYYY-MM)
      const monthLabels = Array.from(new Set(spanIso.map((d) => d.substring(0, 7))))
      let monthlyRows = 0
      if (monthLabels.length > 0) {
        const mRows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*) AS cnt FROM cs_agent_productivity
           WHERE period_kind = 'monthly'
             AND period_label IN (${monthLabels.map(() => '?').join(',')})`,
          ...monthLabels,
        )
        monthlyRows = Number(mRows[0]?.cnt || 0)
      }
      productivity = buildDateStatus(
        'productivity', 'KT 생산성(상담사)', spanIso, byDateRows,
        uqRow[0], mmRow[0],
      )
      productivity.monthly_rows = monthlyRows
      // daily 데이터도 monthly 도 없으면 미적재로 간주
      if (productivity.total_rows === 0 && monthlyRows === 0
          && !productivity.date_min) {
        productivity.available = false
      }
    } catch { /* graceful — cs_agent_productivity 미적재 */ }

    // ════ ③ cs_response_ivr (날짜=stat_date, UNIQUE=stat_date+callee_number) ════
    let responseIvr = emptyStatus('response_ivr', 'KT 응대현황(IVR)', days)
    try {
      const byDateRows = await prisma.$queryRaw<any[]>`
        SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS d, COUNT(*) AS cnt
        FROM cs_response_ivr
        WHERE stat_date BETWEEN ${from} AND ${to}
        GROUP BY DATE_FORMAT(stat_date, '%Y-%m-%d')
        ORDER BY d
      `
      const uqRow = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS total,
               COUNT(DISTINCT CONCAT(stat_date, '|', callee_number)) AS uq
        FROM cs_response_ivr
        WHERE stat_date BETWEEN ${from} AND ${to}
      `
      const mmRow = await prisma.$queryRaw<any[]>`
        SELECT DATE_FORMAT(MIN(stat_date), '%Y-%m-%d') AS dmin,
               DATE_FORMAT(MAX(stat_date), '%Y-%m-%d') AS dmax
        FROM cs_response_ivr
      `
      responseIvr = buildDateStatus(
        'response_ivr', 'KT 응대현황(IVR)', spanIso, byDateRows,
        uqRow[0], mmRow[0],
      )
    } catch { /* graceful — cs_response_ivr 미적재 */ }

    // ════ ④ cs_response_queue (날짜=stat_date, UNIQUE=stat_date+skill) ════
    let responseQueue = emptyStatus('response_queue', 'KT 응대현황(큐)', days)
    try {
      const byDateRows = await prisma.$queryRaw<any[]>`
        SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS d, COUNT(*) AS cnt
        FROM cs_response_queue
        WHERE stat_date BETWEEN ${from} AND ${to}
        GROUP BY DATE_FORMAT(stat_date, '%Y-%m-%d')
        ORDER BY d
      `
      const uqRow = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS total,
               COUNT(DISTINCT CONCAT(stat_date, '|', skill)) AS uq
        FROM cs_response_queue
        WHERE stat_date BETWEEN ${from} AND ${to}
      `
      const mmRow = await prisma.$queryRaw<any[]>`
        SELECT DATE_FORMAT(MIN(stat_date), '%Y-%m-%d') AS dmin,
               DATE_FORMAT(MAX(stat_date), '%Y-%m-%d') AS dmax
        FROM cs_response_queue
      `
      responseQueue = buildDateStatus(
        'response_queue', 'KT 응대현황(큐)', spanIso, byDateRows,
        uqRow[0], mmRow[0],
      )
    } catch { /* graceful — cs_response_queue 미적재 */ }

    return NextResponse.json({
      data: serialize({
        meta: { granularity, from, to, period_days: days },
        sources: {
          call_records: callRecords,
          productivity,
          response_ivr: responseIvr,
          response_queue: responseQueue,
        },
      }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

// 날짜별 행수 + 중복/범위 행 → SourceStatus 조립 (소스 공통)
function buildDateStatus(
  source: SourceKey,
  label: string,
  spanIso: string[],
  byDateRows: any[],
  uqRow: any,
  mmRow: any,
): SourceStatus {
  const days = spanIso.length
  // 날짜 → 행수 맵
  const dateMap = new Map<string, number>()
  for (const r of byDateRows) {
    const d = String(r.d || '')
    if (d) dateMap.set(d, Number(r.cnt || 0))
  }
  const by_date = spanIso
    .filter((d) => dateMap.has(d))
    .map((d) => ({ date: d, rows: dateMap.get(d) || 0 }))
  const covered_dates = by_date.length
  const total_rows = by_date.reduce((s, x) => s + x.rows, 0)
  const missing_dates = spanIso.filter((d) => !dateMap.has(d)).slice(0, 31)
  const coverage_pct = days > 0
    ? Math.round((covered_dates / days) * 1000) / 10
    : 0
  const total = Number(uqRow?.total || 0)
  const uq = Number(uqRow?.uq || 0)
  const unique_ok = total === uq
  const date_min = mmRow?.dmin ? String(mmRow.dmin) : null
  const date_max = mmRow?.dmax ? String(mmRow.dmax) : null

  return {
    source, label,
    available: true,
    total_rows, covered_dates, period_days: days, coverage_pct,
    missing_dates, by_date, date_min, date_max, unique_ok,
  }
}

// ── DELETE — 잘못 올린 업로드분 삭제 (날짜 컬럼 BETWEEN) ──────────
// source 별 코드 분기로 테이블·날짜 컬럼 고정. 테이블명 절대 보간 X.
export async function DELETE(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const source = url.searchParams.get('source') || ''
    const from = url.searchParams.get('from') || ''
    const to = url.searchParams.get('to') || ''

    // 화이트리스트 검증
    if (!SOURCE_KEYS.includes(source as SourceKey)) {
      return NextResponse.json(
        { error: `허용되지 않은 소스: ${source || '(없음)'}` },
        { status: 400 },
      )
    }
    // 날짜 형식 검증 (YYYY-MM-DD)
    const dateOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
    if (!dateOk(from) || !dateOk(to)) {
      return NextResponse.json(
        { error: 'from / to 는 YYYY-MM-DD 형식이어야 합니다.' },
        { status: 400 },
      )
    }
    if (from > to) {
      return NextResponse.json(
        { error: '시작일이 종료일보다 늦습니다.' },
        { status: 400 },
      )
    }

    let deleted = 0
    // 소스별 고정 쿼리 — 테이블명/날짜컬럼은 코드 분기로 결정 (보간 없음)
    if (source === 'call_records') {
      deleted = await prisma.$executeRaw`
        DELETE FROM cs_call_records WHERE call_date BETWEEN ${from} AND ${to}
      `
    } else if (source === 'productivity') {
      // daily 행만 날짜 BETWEEN 으로 삭제 (monthly 는 일자 개념이 아님)
      deleted = await prisma.$executeRaw`
        DELETE FROM cs_agent_productivity
        WHERE period_kind = 'daily' AND period_label BETWEEN ${from} AND ${to}
      `
    } else if (source === 'response_ivr') {
      deleted = await prisma.$executeRaw`
        DELETE FROM cs_response_ivr WHERE stat_date BETWEEN ${from} AND ${to}
      `
    } else if (source === 'response_queue') {
      deleted = await prisma.$executeRaw`
        DELETE FROM cs_response_queue WHERE stat_date BETWEEN ${from} AND ${to}
      `
    }

    return NextResponse.json({
      data: { source, from, to, deleted: Number(deleted) },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
