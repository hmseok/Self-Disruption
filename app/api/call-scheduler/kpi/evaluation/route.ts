// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/kpi/evaluation
//   CX KPI 상담원 종합 평가 — KPI-DESIGN.md §5 (평가 탭)
//
//   query:
//     · granularity = day | week | month   (기본 month — dashboard 와 동일)
//     · date        = YYYY-MM-DD           (granularity 의 기준일)
//     · from / to   = YYYY-MM-DD           (직접 범위 지정 — date 보다 우선)
//
//   데이터 소스 (dashboard route 와 동일 — 법정검사 제외 필터 동일 적용):
//     ① cs_call_records      — 통화량 (통화 1건 = 1행)
//     ② cs_agent_productivity — 로그인·후처리·이석·AHT
//     ③ cs_assignments       — 근무시간 (special_code='none')
//
//   종합 점수: 평가 지표 4개를 팀 내 min~max 정규화(0~100) 후 가중 평균.
//     · 통화량 (call_count)        — 많을수록 ↑   가중치 35
//     · 평균처리시간 (aht)         — 낮을수록 ↑   가중치 30  (역방향)
//     · 후처리+이석 비율 (acw_away)— 낮을수록 ↑   가중치 15  (역방향)
//     · 근무시간 (work_hours)      — 많을수록 ↑   가중치 20
//     데이터 없는 지표는 평가 제외 → 남은 지표 가중치 비례 재분배.
//   강점/약점: 팀 평균 대비 ±10% 초과 편차 (역방향 지표는 부호 반전).
//
//   응답: { meta, weights, team_avg, agents:[{ worker_id, name,
//           total_score, rank, metrics:{...,각 지표 score}, strengths, weaknesses }] }
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { workHoursByWorker } from '@/lib/cs-shift-hours'
import { evalPeriodKey } from '@/lib/cs-kpi-period'

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

// ── 검사 업무 제외 (법정검사·검사대행·직검검사소 — dashboard route 와 동일 기준) ──
const LEGAL_KEYWORD = '%검사%'

// granularity + 기준일 → { from, to } + 생산성 period_label (dashboard route 동일)
function resolveRange(granularity: Granularity, base: Date): {
  from: string; to: string; prodLabel: string
} {
  if (granularity === 'day') {
    const iso = isoOf(base)
    return { from: iso, to: iso, prodLabel: iso }
  }
  if (granularity === 'week') {
    const d = new Date(base)
    const dow = (d.getDay() + 6) % 7 // 0 = 월
    const mon = new Date(d); mon.setDate(d.getDate() - dow)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return {
      from: isoOf(mon), to: isoOf(sun),
      prodLabel: `${base.getFullYear()}-${pad(base.getMonth() + 1)}`,
    }
  }
  const y = base.getFullYear()
  const m = base.getMonth() + 1
  const last = new Date(y, m, 0).getDate()
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(last)}`,
    prodLabel: `${y}-${pad(m)}`,
  }
}

// ── 평가 지표 가중치 ──────────────────────────────────────────────
//   설정 항목 — cs_kpi_eval_weights 테이블에서 로드 (KPI 설정 탭에서 편집).
//   테이블 미적재 / 빈 경우 아래 기본 상수로 graceful fallback.
//   통화량 35 : 핵심 생산성 지표 — 가장 직접적인 처리 실적
//   AHT    30 : 통화 효율 — 빠른 처리(낮을수록 우수)
//   후처리·이석 15 : 로그인시간 대비 비통화 시간 비율 — 가동 집중도(낮을수록 우수)
//   근무시간 20 : 근무 기여(충원) — 많을수록 팀 부담 분담
const DEFAULT_WEIGHTS = {
  call_count: 35,  // 많을수록 ↑
  aht: 30,         // 낮을수록 ↑ (역방향)
  acw_away_ratio: 15, // 낮을수록 ↑ (역방향)
  work_hours: 20,  // 많을수록 ↑
} as const
// 역방향 지표 (낮을수록 우수) — 정규화 시 점수 반전
const LOWER_IS_BETTER = new Set<MetricKey>(['aht', 'acw_away_ratio'])

type MetricKey = keyof typeof DEFAULT_WEIGHTS

// cs_kpi_eval_weights 에서 enabled=1 인 지표·가중치 로드.
// 테이블 미적재 / 빈 경우 DEFAULT_WEIGHTS 반환 (graceful).
async function loadWeights(): Promise<Record<MetricKey, number>> {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT metric, enabled, weight FROM cs_kpi_eval_weights
    `
    if (rows.length === 0) return { ...DEFAULT_WEIGHTS }
    const out: Partial<Record<MetricKey, number>> = {}
    for (const r of rows) {
      const metric = String(r.metric || '') as MetricKey
      if (!(metric in DEFAULT_WEIGHTS)) continue
      // enabled=0 → 가중치 0 (평가에서 제외 — activeMetrics 필터로 빠짐)
      out[metric] = Number(r.enabled ?? 1)
        ? Math.max(0, Number(r.weight) || 0)
        : 0
    }
    // 누락 지표는 기본값 보완
    for (const k of Object.keys(DEFAULT_WEIGHTS) as MetricKey[]) {
      if (out[k] === undefined) out[k] = DEFAULT_WEIGHTS[k]
    }
    return out as Record<MetricKey, number>
  } catch {
    // cs_kpi_eval_weights 미적재 — graceful fallback
    return { ...DEFAULT_WEIGHTS }
  }
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const granularity = (['day', 'week', 'month'].includes(
      url.searchParams.get('granularity') || '',
    ) ? url.searchParams.get('granularity') : 'month') as Granularity
    const dateParam = url.searchParams.get('date')
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')
    const base = dateParam ? new Date(dateParam + 'T00:00:00') : new Date()
    let { from, to, prodLabel } = resolveRange(
      granularity, isNaN(base.getTime()) ? new Date() : base,
    )
    // from/to 직접 지정 시 범위 override (생산성 라벨은 from 기준 월 — dashboard route 동일)
    if (fromParam && toParam) {
      from = fromParam
      to = toParam
      prodLabel = `${fromParam.substring(0, 7)}`
    }

    // ── 평가 가중치 (DB 설정 — cs_kpi_eval_weights, 미적재 시 기본값) ──
    const WEIGHTS = await loadWeights()

    // ── 커스텀 평가 항목 + 점수 (cs_kpi_eval_items / cs_kpi_eval_scores) ──
    // 매니저가 만든 정성 항목(친절도·모니터링 등) — 종합점수에 가중 합산.
    // 점수는 score/max_score×100 절대 정규화 (계산지표의 팀 min~max 와 별개).
    type CustomItem = { id: string; name: string; max_score: number; weight: number }
    let customItems: CustomItem[] = []
    const customScoreMap = new Map<string, number>() // `${itemId}|${workerId}` → score
    try {
      const itemRows = await prisma.$queryRaw<any[]>`
        SELECT id, name, max_score, weight
        FROM cs_kpi_eval_items
        WHERE is_active = 1 AND weight > 0
        ORDER BY sort_order ASC, name ASC
      `
      customItems = itemRows.map((r) => ({
        id: String(r.id),
        name: String(r.name || ''),
        max_score: Number(r.max_score) > 0 ? Number(r.max_score) : 100,
        weight: Math.max(0, Number(r.weight) || 0),
      }))
    } catch {
      customItems = [] // cs_kpi_eval_items 미적재 — graceful
    }
    if (customItems.length > 0) {
      try {
        const { period_kind, period_label } = evalPeriodKey(
          granularity, dateParam || '',
        )
        const scoreRows = await prisma.$queryRaw<any[]>`
          SELECT item_id, worker_id, score
          FROM cs_kpi_eval_scores
          WHERE period_kind = ${period_kind} AND period_label = ${period_label}
        `
        for (const r of scoreRows) {
          customScoreMap.set(
            `${String(r.item_id)}|${String(r.worker_id)}`,
            Number(r.score) || 0,
          )
        }
      } catch { /* graceful — cs_kpi_eval_scores 미적재 */ }
    }

    // ── 상담원 집계 맵 (worker_id > kt_id > name 우선) ──
    type AgentRow = {
      worker_id: string | null
      kt_id: string | null
      name: string
      call_count: number
      call_duration_sec: number
      login_sec: number
      acw_sec: number
      away_sec: number
      aht: number          // 생산성 AHT (통화데이터 없을 때 fallback)
      work_hours: number
    }
    const agents = new Map<string, AgentRow>()
    const getAgent = (
      worker_id: string | null, kt_id: string | null, name: string,
    ): AgentRow => {
      const key = worker_id ? `w:${worker_id}`
        : kt_id ? `k:${kt_id}`
        : `n:${name || '미상'}`
      let a = agents.get(key)
      if (!a) {
        a = {
          worker_id, kt_id, name: name || '미상',
          call_count: 0, call_duration_sec: 0,
          login_sec: 0, acw_sec: 0, away_sec: 0, aht: 0, work_hours: 0,
        }
        agents.set(key, a)
      }
      if ((a.name === '미상' || !a.name) && name) a.name = name
      if (!a.worker_id && worker_id) a.worker_id = worker_id
      if (!a.kt_id && kt_id) a.kt_id = kt_id
      return a
    }

    let hasCallData = false
    let hasProdData = false
    let hasWorkData = false

    // ════ ① 통화량 — cs_call_records (법정검사 제외) ════
    try {
      const callRows = await prisma.$queryRaw<any[]>`
        SELECT
          worker_id, agent_kt_id, agent_name,
          COUNT(*) AS cnt,
          COALESCE(SUM(duration_sec), 0) AS dur
        FROM cs_call_records
        WHERE call_date BETWEEN ${from} AND ${to}
          AND COALESCE(department, '') NOT LIKE ${LEGAL_KEYWORD}
          AND COALESCE(center, '')     NOT LIKE ${LEGAL_KEYWORD}
          AND COALESCE(type1, '')      NOT LIKE ${LEGAL_KEYWORD}
          AND COALESCE(type2, '')      NOT LIKE ${LEGAL_KEYWORD}
        GROUP BY worker_id, agent_kt_id, agent_name
      `
      for (const r of callRows) {
        const a = getAgent(
          r.worker_id ? String(r.worker_id) : null,
          r.agent_kt_id ? String(r.agent_kt_id) : null,
          String(r.agent_name || ''),
        )
        a.call_count += Number(r.cnt || 0)
        a.call_duration_sec += Number(r.dur || 0)
      }
      hasCallData = callRows.length > 0
    } catch { /* graceful — cs_call_records 미적재 */ }

    // ════ ② 생산성 — cs_agent_productivity (is_active=1, 법정검사 제외) ════
    try {
      const prodRows = await prisma.$queryRaw<any[]>`
        SELECT
          worker_id, agent_kt_id, agent_name,
          COALESCE(SUM(login_sec), 0)   AS login_sec,
          COALESCE(SUM(acw_sec), 0)     AS acw_sec,
          COALESCE(SUM(away_sec), 0)    AS away_sec,
          COALESCE(AVG(NULLIF(aht, 0)), 0) AS avg_aht
        FROM cs_agent_productivity
        WHERE period_label = ${prodLabel}
          AND is_active = 1
          AND COALESCE(department, '') NOT LIKE ${LEGAL_KEYWORD}
        GROUP BY worker_id, agent_kt_id, agent_name
      `
      for (const r of prodRows) {
        const a = getAgent(
          r.worker_id ? String(r.worker_id) : null,
          r.agent_kt_id ? String(r.agent_kt_id) : null,
          String(r.agent_name || ''),
        )
        a.login_sec += Number(r.login_sec || 0)
        a.acw_sec += Number(r.acw_sec || 0)
        a.away_sec += Number(r.away_sec || 0)
        a.aht = Number(r.avg_aht || 0)
      }
      hasProdData = prodRows.length > 0
    } catch { /* graceful — cs_agent_productivity 미적재 */ }

    // ════ ③ 근무시간 — cs_assignments JOIN cs_shift_slots ════
    // work_hours 는 슬롯 구간 union — 같은 날 여러 슬롯(부엉+달빛) 겹침 중복 제거.
    try {
      const workRows = await prisma.$queryRaw<any[]>`
        SELECT
          a.worker_id                            AS worker_id,
          w.name                                 AS worker_name,
          DATE_FORMAT(a.work_date, '%Y-%m-%d')   AS work_date,
          TIME_FORMAT(s.start_time, '%H:%i')     AS start_time,
          TIME_FORMAT(s.end_time, '%H:%i')       AS end_time,
          s.is_overnight                         AS is_overnight
        FROM cs_assignments a
        JOIN cs_workers w     ON w.id = a.worker_id
        JOIN cs_shift_slots s ON s.id = a.shift_slot_id
        WHERE a.work_date BETWEEN ${from} AND ${to}
          AND a.worker_id IS NOT NULL
          AND a.special_code = 'none'
      `
      const nameByWorker = new Map<string, string>()
      const shiftRows = workRows.map((r) => {
        const wid = String(r.worker_id)
        nameByWorker.set(wid, String(r.worker_name || ''))
        return {
          worker_id: wid,
          work_date: String(r.work_date),
          start_time: r.start_time ? String(r.start_time) : null,
          end_time: r.end_time ? String(r.end_time) : null,
          is_overnight: Number(r.is_overnight) === 1,
        }
      })
      const byWorker = workHoursByWorker(shiftRows)
      for (const [workerId, agg] of byWorker) {
        const a = getAgent(workerId, null, nameByWorker.get(workerId) || '')
        a.work_hours += agg.work_hours
      }
      hasWorkData = workRows.length > 0
    } catch { /* graceful */ }

    // ── 상담원별 지표 산출 ──────────────────────────────────────
    type AgentMetric = {
      worker_id: string | null
      kt_id: string | null
      name: string
      call_count: number
      aht: number              // 통화시간 실측 우선, 없으면 생산성 AHT
      acw_sec: number
      away_sec: number
      acw_away_ratio: number   // (후처리+이석) / 로그인시간 — 0~1, 데이터 없으면 -1
      login_sec: number
      work_hours: number
    }
    const metricList: AgentMetric[] = Array.from(agents.values()).map((a) => {
      const aht = a.call_count > 0
        ? Math.round(a.call_duration_sec / a.call_count)
        : Math.round(a.aht)
      const acwAway = a.acw_sec + a.away_sec
      // 후처리+이석 비율 — 로그인시간 기준. 로그인 데이터 없으면 -1 (평가 제외)
      const acwAwayRatio = a.login_sec > 0
        ? Math.round((acwAway / a.login_sec) * 1000) / 1000
        : -1
      return {
        worker_id: a.worker_id,
        kt_id: a.kt_id,
        name: a.name,
        call_count: a.call_count,
        aht,
        acw_sec: a.acw_sec,
        away_sec: a.away_sec,
        acw_away_ratio: acwAwayRatio,
        login_sec: a.login_sec,
        work_hours: Math.round(a.work_hours * 100) / 100,
      }
    })

    // ── 지표별 raw 값 추출 (평가 유효값만 — 0 이하/누락은 제외) ──
    //   call_count·work_hours: > 0 만 유효
    //   aht: > 0 만 유효
    //   acw_away_ratio: >= 0 만 유효 (-1 = 로그인 데이터 없음)
    const rawOf = (m: AgentMetric, k: MetricKey): number => {
      if (k === 'call_count') return m.call_count
      if (k === 'aht') return m.aht
      if (k === 'acw_away_ratio') return m.acw_away_ratio
      return m.work_hours
    }
    const isValidRaw = (k: MetricKey, v: number): boolean => {
      if (k === 'acw_away_ratio') return v >= 0
      return v > 0
    }

    // 지표별 min/max (유효값만) — 정규화 기준
    const range: Record<MetricKey, { min: number; max: number; n: number }> = {
      call_count: { min: Infinity, max: -Infinity, n: 0 },
      aht: { min: Infinity, max: -Infinity, n: 0 },
      acw_away_ratio: { min: Infinity, max: -Infinity, n: 0 },
      work_hours: { min: Infinity, max: -Infinity, n: 0 },
    }
    for (const m of metricList) {
      for (const k of Object.keys(DEFAULT_WEIGHTS) as MetricKey[]) {
        const v = rawOf(m, k)
        if (!isValidRaw(k, v)) continue
        const r = range[k]
        if (v < r.min) r.min = v
        if (v > r.max) r.max = v
        r.n++
      }
    }
    // 평가 대상 지표 — 가중치 > 0 (enabled) + 팀에 유효값 1명 이상
    //   enabled=0 인 지표는 WEIGHTS[k]=0 → 평가에서 제외 (가중치 재분배)
    const activeMetrics = (Object.keys(DEFAULT_WEIGHTS) as MetricKey[])
      .filter((k) => WEIGHTS[k] > 0 && range[k].n > 0)

    // ── 팀 평균 (유효값 기준) ──────────────────────────────────
    const teamAvg: Record<string, number> = {}
    for (const k of Object.keys(DEFAULT_WEIGHTS) as MetricKey[]) {
      const vals = metricList.map((m) => rawOf(m, k)).filter((v) => isValidRaw(k, v))
      teamAvg[k] = vals.length > 0
        ? vals.reduce((s, v) => s + v, 0) / vals.length
        : 0
    }

    // ── min~max 정규화 0~100 (역방향 지표는 반전) ──────────────
    const normalize = (k: MetricKey, v: number): number => {
      const r = range[k]
      if (r.max <= r.min) return 100 // 전원 동일값 → 만점 처리
      const t = (v - r.min) / (r.max - r.min) // 0~1
      const score = LOWER_IS_BETTER.has(k) ? (1 - t) : t
      return Math.round(score * 1000) / 10 // 0~100, 소수 1자리
    }

    // ── 상담원별 종합 점수 + 강·약점 ───────────────────────────
    const STRENGTH_THRESHOLD = 0.10 // 팀 평균 +10%↑ = 강점
    const METRIC_LABEL: Record<MetricKey, string> = {
      call_count: '통화량',
      aht: '평균처리시간',
      acw_away_ratio: '후처리·이석 관리',
      work_hours: '근무시간',
    }

    const evaluated = metricList.map((m) => {
      // 각 지표 점수 — 평가 대상 지표 + 본인이 유효값일 때만
      const scores: Record<string, number | null> = {}
      let weightSum = 0
      let weightedTotal = 0
      for (const k of activeMetrics) {
        const v = rawOf(m, k)
        if (!isValidRaw(k, v)) { scores[k] = null; continue }
        const sc = normalize(k, v)
        scores[k] = sc
        weightedTotal += sc * WEIGHTS[k]
        weightSum += WEIGHTS[k]
      }
      // ── 커스텀 항목 점수 (매니저 입력 — score/max×100 절대 정규화) ──
      // worker_id 매칭 + 입력 점수 존재 시에만 합산 (없으면 가중치 재분배에서 제외).
      const customScores: Record<string, { score: number; norm: number } | null> = {}
      for (const it of customItems) {
        const raw = m.worker_id
          ? customScoreMap.get(`${it.id}|${m.worker_id}`)
          : undefined
        if (raw != null && it.weight > 0) {
          const norm = Math.max(0, Math.min(100, (raw / it.max_score) * 100))
          customScores[it.id] = { score: raw, norm: Math.round(norm * 10) / 10 }
          weightedTotal += norm * it.weight
          weightSum += it.weight
        } else {
          customScores[it.id] = null
        }
      }
      // 가중치 재분배 — 본인이 가진 지표(계산+커스텀) 가중치 합으로 나눔
      const totalScore = weightSum > 0
        ? Math.round((weightedTotal / weightSum) * 10) / 10
        : 0

      // 강점/약점 — 팀 평균 대비 ±10% 편차 (역방향 지표는 부호 반전)
      const strengths: string[] = []
      const weaknesses: string[] = []
      for (const k of activeMetrics) {
        const v = rawOf(m, k)
        if (!isValidRaw(k, v)) continue
        const avg = teamAvg[k]
        if (!avg || avg <= 0) continue
        let dev = (v - avg) / avg // 평균 대비 편차 비율
        if (LOWER_IS_BETTER.has(k)) dev = -dev // 낮을수록 좋은 지표 반전
        if (dev >= STRENGTH_THRESHOLD) strengths.push(METRIC_LABEL[k])
        else if (dev <= -STRENGTH_THRESHOLD) weaknesses.push(METRIC_LABEL[k])
      }

      return {
        worker_id: m.worker_id,
        kt_id: m.kt_id,
        name: m.name,
        total_score: totalScore,
        rank: 0, // 아래에서 채움
        metrics: {
          call_count: m.call_count,
          aht: m.aht,
          acw_sec: m.acw_sec,
          away_sec: m.away_sec,
          acw_away_ratio: m.acw_away_ratio,
          login_sec: m.login_sec,
          work_hours: m.work_hours,
          // 지표별 정규화 점수 (0~100, 평가 제외 시 null)
          call_count_score: scores.call_count ?? null,
          aht_score: scores.aht ?? null,
          acw_away_score: scores.acw_away_ratio ?? null,
          work_hours_score: scores.work_hours ?? null,
        },
        // 커스텀 항목 점수 — { [item_id]: { score(원점수), norm(0~100) } | null }
        custom_scores: customScores,
        strengths,
        weaknesses,
      }
    })

    // ── 팀 내 순위 (종합 점수 desc, 동점은 통화량 desc) ──
    const ranked = [...evaluated].sort((a, b) =>
      b.total_score - a.total_score ||
      b.metrics.call_count - a.metrics.call_count,
    )
    ranked.forEach((e, i) => { e.rank = i + 1 })

    // ── 팀 요약 ──
    const scoreList = evaluated.map((e) => e.total_score)
    const teamAvgScore = scoreList.length > 0
      ? Math.round((scoreList.reduce((s, v) => s + v, 0) / scoreList.length) * 10) / 10
      : 0

    return NextResponse.json({
      data: serialize({
        meta: {
          granularity, from, to,
          prod_label: prodLabel,
          agent_count: ranked.length,
          has_call_data: hasCallData,
          has_prod_data: hasProdData,
          has_work_data: hasWorkData,
          active_metrics: activeMetrics, // 실제 평가에 쓰인 지표 키
        },
        weights: WEIGHTS,           // UI 에 가중치 공개 (투명)
        custom_items: customItems,  // 커스텀 평가 항목 (id·name·max_score·weight)
        team_avg: {
          score: teamAvgScore,
          call_count: Math.round(teamAvg.call_count * 10) / 10,
          aht: Math.round(teamAvg.aht),
          acw_away_ratio: Math.round(teamAvg.acw_away_ratio * 1000) / 1000,
          work_hours: Math.round(teamAvg.work_hours * 10) / 10,
          best_score: scoreList.length > 0 ? Math.max(...scoreList) : 0,
          worst_score: scoreList.length > 0 ? Math.min(...scoreList) : 0,
        },
        agents: ranked,
      }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
