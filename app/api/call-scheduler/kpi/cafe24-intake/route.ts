// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/kpi/cafe24-intake — CX KPI Cafe24 접수 업무량
//
// Cafe24 ERP(read-only) 에서 일별 접수 건수 시계열을 반환.
//   · 사고 접수    — acrotpth (otptmddt, otptrgst='R')
//   · 긴급출동 접수 — aceesosh (esosmddt, esosrgst='R')
// 취소건(rgst='C') 제외 — 유효 접수만 (사용자 명시 2026-05-23).
//
// 테이블 매핑 근거: /api/operations/cafe24-dispatch-requests 진단 조사 결론
//   — acrotpth=사고차 출동/대차 접수(카페24 사고접수 페이지), aceesosh=SOS 긴급출동.
//   배포 후 실데이터 일별 숫자로 검증, 어긋나면 두 쿼리 테이블만 교체.
//
// 대시보드 본체(kpi/dashboard)와 분리된 별도 엔드포인트 —
// Cafe24 외부 DB 지연이 KPI 대시보드 로딩을 막지 않도록 독립 호출.
//
// query: granularity=day|week|month, date=YYYY-MM-DD, from/to=YYYY-MM-DD
// 응답  : { data:{ from,to, daily:[{date,accident,dispatch}],
//                  accident_total, dispatch_total, cafe24_ok }, error }
// 호환  : Cafe24 = MariaDB 10.1 — COUNT/CHAR_LENGTH/BETWEEN/GROUP BY 만 (회색함수 X)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

type Granularity = 'day' | 'week' | 'month'

// granularity + 기준일 → { from, to } (YYYY-MM-DD) — dashboard route 와 동일 규칙
function resolveRange(g: Granularity, base: Date): { from: string; to: string } {
  if (g === 'day') {
    const iso = isoOf(base)
    return { from: iso, to: iso }
  }
  if (g === 'week') {
    // 월요일 시작 주
    const d = new Date(base)
    const dow = (d.getDay() + 6) % 7
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

// from~to (YYYY-MM-DD) 사이 모든 날짜 — 빈 날(접수 0)도 시계열에 포함
function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  if (isNaN(d.getTime()) || isNaN(end.getTime())) return out
  let guard = 0
  while (d <= end && guard < 400) {
    out.push(isoOf(d))
    d.setDate(d.getDate() + 1)
    guard++
  }
  return out
}

// YYYYMMDD → YYYY-MM-DD
const ymdToIso = (ymd: string) =>
  ymd && ymd.length === 8
    ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
    : ''

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const url = new URL(request.url)
  const granularityRaw = url.searchParams.get('granularity') || 'month'
  const granularity = (['day', 'week', 'month'].includes(granularityRaw)
    ? granularityRaw
    : 'month') as Granularity
  const dateParam = url.searchParams.get('date')
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')

  const base = dateParam ? new Date(dateParam + 'T00:00:00') : new Date()
  let { from, to } = resolveRange(
    granularity,
    isNaN(base.getTime()) ? new Date() : base,
  )
  // from/to 직접 지정 시 범위 override
  if (fromParam && toParam) {
    from = fromParam
    to = toParam
  }

  const days = eachDay(from, to)
  // 일별 누적 맵 — YYYY-MM-DD → { accident, dispatch }
  const dayMap = new Map<string, { accident: number; dispatch: number }>()
  for (const d of days) dayMap.set(d, { accident: 0, dispatch: 0 })

  const fromYmd = from.replace(/-/g, '')
  const toYmd = to.replace(/-/g, '')

  let cafe24Ok = false
  let accidentTotal = 0
  let dispatchTotal = 0

  try {
    const { cafe24Db } = await import('@/lib/cafe24-db')

    // ── 사고 접수 — acrotpth (유효 'R' 만, 취소 제외) ──
    // otptmddt = 등록일자(YYYYMMDD VARCHAR) — dispatch-requests route 와 동일 키 컬럼.
    const accRows = await cafe24Db.query(
      `SELECT otptmddt AS d, COUNT(*) AS c
         FROM acrotpth
        WHERE otptmddt BETWEEN ? AND ?
          AND CHAR_LENGTH(otptmddt) = 8
          AND otptrgst = 'R'
        GROUP BY otptmddt`,
      [fromYmd, toYmd],
    )
    for (const r of accRows) {
      const iso = ymdToIso(String(r.d || ''))
      const c = Number(r.c || 0)
      const slot = dayMap.get(iso)
      if (slot) slot.accident += c
      accidentTotal += c
    }

    // ── 긴급출동 접수 — aceesosh (유효 'R' 만, 취소 제외) ──
    const dispRows = await cafe24Db.query(
      `SELECT esosmddt AS d, COUNT(*) AS c
         FROM aceesosh
        WHERE esosmddt BETWEEN ? AND ?
          AND CHAR_LENGTH(esosmddt) = 8
          AND esosrgst = 'R'
        GROUP BY esosmddt`,
      [fromYmd, toYmd],
    )
    for (const r of dispRows) {
      const iso = ymdToIso(String(r.d || ''))
      const c = Number(r.c || 0)
      const slot = dayMap.get(iso)
      if (slot) slot.dispatch += c
      dispatchTotal += c
    }

    cafe24Ok = true
  } catch {
    // graceful — Cafe24 미연결 / 환경변수 부재 시 빈 결과
    cafe24Ok = false
  }

  const daily = days.map((d) => {
    const v = dayMap.get(d)!
    return { date: d, accident: v.accident, dispatch: v.dispatch }
  })

  return NextResponse.json({
    data: {
      from,
      to,
      daily,
      accident_total: accidentTotal,
      dispatch_total: dispatchTotal,
      cafe24_ok: cafe24Ok,
    },
    error: null,
  })
}
