// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/kpi/dashboard
//   CX 통합 KPI 조회 — KPI-DESIGN.md §5-2 / §6
//
//   query:
//     · granularity = day | week | month   (기본 month)
//     · date        = YYYY-MM-DD           (granularity 의 기준일)
//     · from / to   = YYYY-MM-DD           (직접 범위 지정 — date 보다 우선)
//
//   데이터 소스 (모두 graceful try/catch — 미적재 시 빈 결과):
//     ① cs_call_records      — 통화 지표 (IB/OB·AHT·캐피탈사·유형)
//     ② cs_agent_productivity — 생산성 지표 (로그인·후처리·이석·AHT)
//     ③ cs_assignments       — 근무 지표 (근무일수·근무시간·충원율)
//     ④ cafe24 (선택)        — 접수 건수 — 실패 시 graceful (0/생략)
//
//   응답: { agents: [...], summary: {...}, byClient: [...], byType: [...] }
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

// 채널 텍스트 → IB / OB / etc (KT 채널정보: 인바운드/아웃바운드)
function channelKind(raw: string | null | undefined): 'ib' | 'ob' | 'etc' {
  const s = String(raw || '')
  if (/인바운드|inbound|^ib$|수신/i.test(s)) return 'ib'
  if (/아웃바운드|outbound|^ob$|발신/i.test(s)) return 'ob'
  return 'etc'
}

type Granularity = 'day' | 'week' | 'month'

// granularity + 기준일 → { from, to } (YYYY-MM-DD), 생산성 period_label
function resolveRange(granularity: Granularity, base: Date): {
  from: string; to: string; prodLabel: string; prodKind: 'daily' | 'monthly'
} {
  if (granularity === 'day') {
    const iso = isoOf(base)
    return { from: iso, to: iso, prodLabel: iso, prodKind: 'daily' }
  }
  if (granularity === 'week') {
    // 월요일 시작 주
    const d = new Date(base)
    const dow = (d.getDay() + 6) % 7 // 0 = 월
    const mon = new Date(d); mon.setDate(d.getDate() - dow)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    // 생산성 파일은 일/월 단위만 → 주는 월 라벨로 근사 (보조 지표)
    return {
      from: isoOf(mon), to: isoOf(sun),
      prodLabel: `${base.getFullYear()}-${pad(base.getMonth() + 1)}`,
      prodKind: 'monthly',
    }
  }
  // month
  const y = base.getFullYear()
  const m = base.getMonth() + 1
  const last = new Date(y, m, 0).getDate()
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(last)}`,
    prodLabel: `${y}-${pad(m)}`,
    prodKind: 'monthly',
  }
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const granularity = (url.searchParams.get('granularity') || 'month') as Granularity
    const dateParam = url.searchParams.get('date')
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')

    const base = dateParam ? new Date(dateParam + 'T00:00:00') : new Date()
    let { from, to, prodLabel, prodKind } = resolveRange(
      ['day', 'week', 'month'].includes(granularity) ? granularity : 'month',
      isNaN(base.getTime()) ? new Date() : base,
    )
    // from/to 직접 지정 시 범위 override (생산성 라벨은 from 기준 월)
    if (fromParam && toParam) {
      from = fromParam
      to = toParam
      prodLabel = `${fromParam.substring(0, 7)}`
      prodKind = 'monthly'
    }

    // ── 상담원 집계 맵 (worker_id 또는 kt_id 또는 이름 기준으로 통합) ──
    type AgentRow = {
      key: string
      worker_id: string | null
      kt_id: string | null
      name: string
      // 통화 (cs_call_records)
      call_count: number; ib: number; ob: number; etc: number
      call_duration_sec: number
      // 생산성 (cs_agent_productivity)
      login_sec: number; prod_ib: number; prod_ob: number
      ob_attempt: number
      aht: number; acw_sec: number; away_sec: number; wait_sec: number
      hold_sec: number; prod_active: boolean
      // 근무 (cs_assignments)
      work_days: number; work_hours: number
    }
    const agents = new Map<string, AgentRow>()
    const getAgent = (
      worker_id: string | null, kt_id: string | null, name: string,
    ): AgentRow => {
      // 통합 키 우선순위: worker_id > kt_id > name
      const key = worker_id ? `w:${worker_id}`
        : kt_id ? `k:${kt_id}`
        : `n:${name || '미상'}`
      let a = agents.get(key)
      if (!a) {
        a = {
          key, worker_id, kt_id, name: name || '미상',
          call_count: 0, ib: 0, ob: 0, etc: 0, call_duration_sec: 0,
          login_sec: 0, prod_ib: 0, prod_ob: 0, ob_attempt: 0,
          aht: 0, acw_sec: 0, away_sec: 0, wait_sec: 0, hold_sec: 0,
          prod_active: false,
          work_days: 0, work_hours: 0,
        }
        agents.set(key, a)
      }
      // 미상 → 더 구체적인 이름으로 보강
      if ((a.name === '미상' || !a.name) && name) a.name = name
      if (!a.worker_id && worker_id) a.worker_id = worker_id
      if (!a.kt_id && kt_id) a.kt_id = kt_id
      return a
    }

    // ════ ① 통화 지표 — cs_call_records ════
    const summary = {
      granularity, from, to,
      call_count: 0, ib: 0, ob: 0, etc: 0,
      call_duration_sec: 0, avg_duration_sec: 0,
      login_sec: 0, aht: 0,
      acw_sec: 0, away_sec: 0,
      work_days: 0, work_hours: 0,
      required_workers: 0, fill_rate: 0,
      intake_count: 0,
      has_call_data: false, has_prod_data: false, has_work_data: false,
      cafe24_ok: false,
    }
    const byClientMap = new Map<string, { client: string; count: number; ib: number; ob: number; duration_sec: number }>()
    const byTypeMap = new Map<string, { type: string; count: number; ib: number; ob: number; duration_sec: number }>()

    try {
      const callRows = await prisma.$queryRaw<any[]>`
        SELECT
          worker_id, agent_kt_id, agent_name,
          channel, type1, type2,
          COUNT(*) AS cnt,
          COALESCE(SUM(duration_sec), 0) AS dur
        FROM cs_call_records
        WHERE call_date BETWEEN ${from} AND ${to}
        GROUP BY worker_id, agent_kt_id, agent_name, channel, type1, type2
      `
      for (const r of callRows) {
        const cnt = Number(r.cnt || 0)
        const dur = Number(r.dur || 0)
        const kind = channelKind(r.channel)
        const a = getAgent(
          r.worker_id ? String(r.worker_id) : null,
          r.agent_kt_id ? String(r.agent_kt_id) : null,
          String(r.agent_name || ''),
        )
        a.call_count += cnt
        a.call_duration_sec += dur
        if (kind === 'ib') a.ib += cnt
        else if (kind === 'ob') a.ob += cnt
        else a.etc += cnt

        summary.call_count += cnt
        summary.call_duration_sec += dur
        if (kind === 'ib') summary.ib += cnt
        else if (kind === 'ob') summary.ob += cnt
        else summary.etc += cnt

        // 드릴다운 — 캐피탈사 (type1)
        const client = String(r.type1 || '미지정').trim() || '미지정'
        let bc = byClientMap.get(client)
        if (!bc) { bc = { client, count: 0, ib: 0, ob: 0, duration_sec: 0 }; byClientMap.set(client, bc) }
        bc.count += cnt; bc.duration_sec += dur
        if (kind === 'ib') bc.ib += cnt; else if (kind === 'ob') bc.ob += cnt

        // 드릴다운 — 유형 (type2)
        const typ = String(r.type2 || '미지정').trim() || '미지정'
        let bt = byTypeMap.get(typ)
        if (!bt) { bt = { type: typ, count: 0, ib: 0, ob: 0, duration_sec: 0 }; byTypeMap.set(typ, bt) }
        bt.count += cnt; bt.duration_sec += dur
        if (kind === 'ib') bt.ib += cnt; else if (kind === 'ob') bt.ob += cnt
      }
      summary.has_call_data = callRows.length > 0
    } catch { /* graceful — cs_call_records 미적재 */ }

    summary.avg_duration_sec = summary.call_count > 0
      ? Math.round(summary.call_duration_sec / summary.call_count)
      : 0

    // ════ ② 생산성 지표 — cs_agent_productivity (is_active=1 만) ════
    try {
      const prodRows = await prisma.$queryRaw<any[]>`
        SELECT
          worker_id, agent_kt_id, agent_name,
          COALESCE(SUM(login_sec), 0)   AS login_sec,
          COALESCE(SUM(ib_count), 0)    AS ib_count,
          COALESCE(SUM(ob_count), 0)    AS ob_count,
          COALESCE(SUM(ob_attempt_count), 0) AS ob_attempt,
          COALESCE(SUM(acw_sec), 0)     AS acw_sec,
          COALESCE(SUM(away_sec), 0)    AS away_sec,
          COALESCE(SUM(wait_sec), 0)    AS wait_sec,
          COALESCE(SUM(hold_sec), 0)    AS hold_sec,
          COALESCE(AVG(NULLIF(aht, 0)), 0) AS avg_aht
        FROM cs_agent_productivity
        WHERE period_label = ${prodLabel}
          AND is_active = 1
        GROUP BY worker_id, agent_kt_id, agent_name
      `
      for (const r of prodRows) {
        const a = getAgent(
          r.worker_id ? String(r.worker_id) : null,
          r.agent_kt_id ? String(r.agent_kt_id) : null,
          String(r.agent_name || ''),
        )
        a.login_sec += Number(r.login_sec || 0)
        a.prod_ib += Number(r.ib_count || 0)
        a.prod_ob += Number(r.ob_count || 0)
        a.ob_attempt += Number(r.ob_attempt || 0)
        a.acw_sec += Number(r.acw_sec || 0)
        a.away_sec += Number(r.away_sec || 0)
        a.wait_sec += Number(r.wait_sec || 0)
        a.hold_sec += Number(r.hold_sec || 0)
        a.aht = Number(r.avg_aht || 0)
        a.prod_active = true

        summary.login_sec += Number(r.login_sec || 0)
        summary.acw_sec += Number(r.acw_sec || 0)
        summary.away_sec += Number(r.away_sec || 0)
      }
      summary.has_prod_data = prodRows.length > 0
    } catch { /* graceful — cs_agent_productivity 미적재 */ }

    // 팀 평균 AHT — 통화 데이터가 있으면 실측 우선, 없으면 생산성 AHT 평균
    if (summary.avg_duration_sec > 0) {
      summary.aht = summary.avg_duration_sec
    } else {
      const prodAhts: number[] = []
      for (const a of agents.values()) if (a.aht > 0) prodAhts.push(a.aht)
      summary.aht = prodAhts.length > 0
        ? Math.round(prodAhts.reduce((s, v) => s + v, 0) / prodAhts.length)
        : 0
    }

    // ════ ③ 근무 지표 — cs_assignments JOIN cs_workers ════
    try {
      const workRows = await prisma.$queryRaw<any[]>`
        SELECT
          a.worker_id,
          w.name,
          COUNT(DISTINCT a.work_date) AS work_days,
          COALESCE(SUM(a.computed_hours), 0) AS work_hours
        FROM cs_assignments a
        JOIN cs_workers w ON w.id = a.worker_id
        WHERE a.work_date BETWEEN ${from} AND ${to}
          AND a.worker_id IS NOT NULL
          AND a.special_code = 'none'
        GROUP BY a.worker_id, w.name
      `
      for (const r of workRows) {
        const a = getAgent(String(r.worker_id), null, String(r.name || ''))
        a.work_days += Number(r.work_days || 0)
        a.work_hours += Number(r.work_hours || 0)
        summary.work_days += Number(r.work_days || 0)
        summary.work_hours += Number(r.work_hours || 0)
      }
      summary.has_work_data = workRows.length > 0
    } catch { /* graceful */ }

    // 충원율 — 기간 내 셀 중 worker_id IS NOT NULL 비율
    try {
      const fRows = await prisma.$queryRaw<any[]>`
        SELECT
          SUM(CASE WHEN worker_id IS NOT NULL THEN 1 ELSE 0 END) AS filled,
          COUNT(*) AS total
        FROM cs_assignments
        WHERE work_date BETWEEN ${from} AND ${to}
      `
      const fTotal = Number(fRows[0]?.total || 0)
      if (fTotal > 0) {
        summary.fill_rate = Math.round(
          (Number(fRows[0]?.filled || 0) / fTotal) * 1000,
        ) / 1000
      }
    } catch { /* graceful */ }

    // 필요 인원 (min_coverage 디폴트)
    try {
      const cRow = await prisma.$queryRaw<any[]>`
        SELECT COALESCE(SUM(min_workers), 0) AS c
        FROM cs_group_min_coverage WHERE dow IS NULL
      `
      summary.required_workers = Number(cRow[0]?.c || 0)
    } catch { /* graceful */ }

    // ════ ④' 응대현황 — cs_response_queue / cs_response_ivr (graceful) ════
    // 큐: 총인입·응대·총포기호·가중평균 응대율/SL·평균 고객대기시간
    // IVR: 시나리오별 총인입/포기
    const response = {
      has_queue_data: false,
      has_ivr_data: false,
      queue_inbound: 0,
      queue_answered: 0,
      queue_abandoned: 0,
      answer_rate: null as number | null,      // 가중평균 응대율 (%)
      abandon_rate: null as number | null,     // 포기율 (%)
      service_level: null as number | null,    // 가중평균 서비스레벨 (%)
      avg_wait_sec: null as number | null,     // 평균 고객대기시간 (초)
    }
    const bySkill: { skill: string; inbound: number; answered: number; abandoned: number; answer_rate: number; service_level: number }[] = []
    const byScenario: { scenario: string; callee_number: string; total_inbound: number; answered: number; abandoned: number }[] = []

    try {
      const qRows = await prisma.$queryRaw<any[]>`
        SELECT
          skill,
          COALESCE(SUM(inbound), 0)          AS inbound,
          COALESCE(SUM(answered), 0)         AS answered,
          COALESCE(SUM(abandoned), 0)        AS abandoned,
          COALESCE(SUM(answered_in_20s), 0)  AS answered_in_20s,
          COALESCE(SUM(avg_wait_sec * inbound), 0) AS wait_weighted
        FROM cs_response_queue
        WHERE stat_date BETWEEN ${from} AND ${to}
        GROUP BY skill
      `
      let totInbound = 0, totAnswered = 0, totAbandoned = 0, totIn20s = 0, totWaitWeighted = 0
      for (const r of qRows) {
        const inbound = Number(r.inbound || 0)
        const answered = Number(r.answered || 0)
        const abandoned = Number(r.abandoned || 0)
        const in20s = Number(r.answered_in_20s || 0)
        totInbound += inbound
        totAnswered += answered
        totAbandoned += abandoned
        totIn20s += in20s
        totWaitWeighted += Number(r.wait_weighted || 0)
        bySkill.push({
          skill: String(r.skill || '미지정'),
          inbound, answered, abandoned,
          answer_rate: inbound > 0 ? Math.round((answered / inbound) * 1000) / 10 : 0,
          service_level: inbound > 0 ? Math.round((in20s / inbound) * 1000) / 10 : 0,
        })
      }
      if (qRows.length > 0) {
        response.has_queue_data = true
        response.queue_inbound = totInbound
        response.queue_answered = totAnswered
        response.queue_abandoned = totAbandoned
        // 가중평균 — 인입 기준
        response.answer_rate = totInbound > 0
          ? Math.round((totAnswered / totInbound) * 1000) / 10 : 0
        response.abandon_rate = totInbound > 0
          ? Math.round((totAbandoned / totInbound) * 1000) / 10 : 0
        // 서비스레벨 = 20초내 응대호 / 총인입
        response.service_level = totInbound > 0
          ? Math.round((totIn20s / totInbound) * 1000) / 10 : 0
        response.avg_wait_sec = totInbound > 0
          ? Math.round(totWaitWeighted / totInbound) : 0
      }
    } catch { /* graceful — cs_response_queue 미적재 */ }

    try {
      const iRows = await prisma.$queryRaw<any[]>`
        SELECT
          scenario, callee_number,
          COALESCE(SUM(total_inbound), 0) AS total_inbound,
          COALESCE(SUM(answered), 0)      AS answered,
          COALESCE(SUM(abandoned), 0)     AS abandoned
        FROM cs_response_ivr
        WHERE stat_date BETWEEN ${from} AND ${to}
        GROUP BY scenario, callee_number
      `
      for (const r of iRows) {
        byScenario.push({
          scenario: String(r.scenario || '미지정'),
          callee_number: String(r.callee_number || ''),
          total_inbound: Number(r.total_inbound || 0),
          answered: Number(r.answered || 0),
          abandoned: Number(r.abandoned || 0),
        })
      }
      response.has_ivr_data = iRows.length > 0
    } catch { /* graceful — cs_response_ivr 미적재 */ }

    bySkill.sort((a, b) => b.inbound - a.inbound)
    byScenario.sort((a, b) => b.total_inbound - a.total_inbound)

    // ════ ④ Cafe24 접수 건수 (선택 — graceful) ════
    try {
      const { cafe24Db } = await import('@/lib/cafe24-db')
      // 카페24 날짜는 YYYYMMDD 문자열 — 사고접수 테이블 (dashboard route 패턴 재사용)
      const fromYmd = from.replace(/-/g, '')
      const toYmd = to.replace(/-/g, '')
      const acc = await cafe24Db.count(
        `SELECT COUNT(*) AS c FROM aceesosh WHERE esosmddt BETWEEN ? AND ?`,
        [fromYmd, toYmd],
      )
      summary.intake_count = Number(acc || 0)
      summary.cafe24_ok = true
    } catch { /* graceful — cafe24 미연결 시 0 */ }

    // ── 상담원 배열 변환 (이름순 정렬은 UI 에서) ──
    const agentList = Array.from(agents.values()).map(a => ({
      worker_id: a.worker_id,
      kt_id: a.kt_id,
      name: a.name,
      call_count: a.call_count,
      ib: a.ib,
      ob: a.ob,
      etc: a.etc,
      // 통화시간 기반 AHT (해당 상담원 통화 평균), 없으면 생산성 AHT
      aht: a.call_count > 0
        ? Math.round(a.call_duration_sec / a.call_count)
        : Math.round(a.aht),
      call_duration_sec: a.call_duration_sec,
      login_sec: a.login_sec,
      prod_ib: a.prod_ib,
      prod_ob: a.prod_ob,
      ob_attempt: a.ob_attempt,
      acw_sec: a.acw_sec,
      away_sec: a.away_sec,
      wait_sec: a.wait_sec,
      hold_sec: a.hold_sec,
      prod_active: a.prod_active,
      work_days: a.work_days,
      work_hours: Math.round(a.work_hours * 100) / 100,
    }))

    const byClient = Array.from(byClientMap.values())
      .sort((x, y) => y.count - x.count)
    const byType = Array.from(byTypeMap.values())
      .sort((x, y) => y.count - x.count)

    return NextResponse.json({
      data: serialize({
        meta: {
          granularity, from, to,
          prod_label: prodLabel, prod_kind: prodKind,
          agent_count: agentList.length,
        },
        summary,
        agents: agentList,
        byClient,
        byType,
        response,
        bySkill,
        byScenario,
      }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
