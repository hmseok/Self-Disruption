// ═══════════════════════════════════════════════════════════════════
// lib/erlang-c.ts — Erlang C 콜센터 인력 산정 엔진 (순수 함수)
//
//   WFM 필요인원 산정 (KPI-DESIGN.md §5-4).
//   외부 의존성 없음 — 서버(staffing API) / 클라이언트 양쪽에서 import 가능.
//
//   용어
//     · offeredLoad A (Erlang) = (인터벌당 콜 수 × AHT) / 인터벌 길이
//     · agents N               = 동시에 응대 가능한 상담사 수
//     · P_w                    = 콜이 대기열에 들어갈 확률 (Erlang C)
//     · SL (Service Level)     = 목표 시간 t 내 응대된 콜 비율
//     · occupancy              = 점유율 = A / N
//     · shrinkage              = 부재율 (휴식·후처리·교육 — 실가용 인원 보정)
// ═══════════════════════════════════════════════════════════════════

/**
 * Erlang C 대기확률 P_w 를 계산한다.
 *
 * 공식:
 *   P_w = ( A^N / N! · N/(N−A) ) / ( Σ_{k=0}^{N−1} A^k/k! + A^N/N! · N/(N−A) )
 *
 * 수치 안정성을 위해 A^k/k! 항을 누적 곱(반복)으로 계산한다.
 *
 * @param agents       상담사 수 N (정수, 1 이상)
 * @param offeredLoad  제공부하 A (Erlang, 0 이상)
 * @returns 대기확률 P_w (0~1). N ≤ A 이면 시스템 불안정 → 1 반환.
 */
export function erlangC(agents: number, offeredLoad: number): number {
  const N = Math.floor(agents)
  const A = offeredLoad
  if (A <= 0) return 0           // 콜 없음 → 대기 없음
  if (N <= 0) return 1           // 상담사 없음 → 전부 대기
  if (N <= A) return 1           // 불안정 (점유율 ≥ 100%) → 전부 대기

  // term_k = A^k / k!  를 반복으로 누적 — Σ_{k=0}^{N-1} term_k 와 term_N 동시 계산
  let term = 1                   // term_0 = A^0/0! = 1
  let sum = 1                    // Σ_{k=0}^{0}
  for (let k = 1; k < N; k++) {
    term = (term * A) / k        // term_k
    sum += term
  }
  const termN = (term * A) / N   // term_N = A^N / N!

  // 대기항 = term_N · N/(N−A)
  const queued = termN * (N / (N - A))
  const pw = queued / (sum + queued)
  // 부동소수 보정
  return pw < 0 ? 0 : pw > 1 ? 1 : pw
}

/**
 * 주어진 상담사 수에서의 응대수준(Service Level) 을 계산한다.
 *
 * 공식:  SL = 1 − P_w · e^(−(N−A)·t/AHT)
 *
 * @param agents      상담사 수 N
 * @param offeredLoad 제공부하 A (Erlang)
 * @param ahtSec      평균 처리시간 AHT (초)
 * @param targetSec   목표 응대 시간 t (초) — "t초 내 응대"
 * @returns SL (0~1)
 */
export function serviceLevel(
  agents: number,
  offeredLoad: number,
  ahtSec: number,
  targetSec: number,
): number {
  const N = Math.floor(agents)
  const A = offeredLoad
  if (A <= 0) return 1           // 콜 없음 → 100% 응대
  if (N <= A) return 0           // 불안정 → 응대수준 0
  if (ahtSec <= 0) return 1

  const pw = erlangC(N, A)
  const exponent = -((N - A) * targetSec) / ahtSec
  const sl = 1 - pw * Math.exp(exponent)
  return sl < 0 ? 0 : sl > 1 ? 1 : sl
}

/**
 * 점유율(Occupancy) = A / N.
 *
 * @param agents      상담사 수 N
 * @param offeredLoad 제공부하 A (Erlang)
 * @returns 점유율 (0~1). N ≤ 0 이면 1.
 */
export function occupancy(agents: number, offeredLoad: number): number {
  const N = Math.floor(agents)
  if (N <= 0) return 1
  if (offeredLoad <= 0) return 0
  return offeredLoad / N
}

/** requiredAgents 입력 파라미터. */
export interface RequiredAgentsInput {
  /** 인터벌당 콜 수 (예: 1시간 인터벌이면 시간당 콜 수) */
  callsPerInterval: number
  /** 평균 처리시간 AHT (초) */
  ahtSec: number
  /** 인터벌 길이 (초) — 예: 60분 = 3600 */
  intervalSec: number
  /** 목표 응대율 (%) — 예: 80 → 80% */
  targetSlPct: number
  /** 목표 응대 시간 (초) — 예: 20 → "20초 내 80%" */
  targetAnswerSec: number
  /** 최대 점유율 상한 (%) — 예: 85 → 점유율 ≤ 85% 가드 */
  maxOccupancyPct: number
  /** 부재율 (%) — 예: 30 → 실가용 인원 = N / (1−0.30) */
  shrinkagePct: number
}

/** requiredAgents 결과. */
export interface RequiredAgentsResult {
  /** 제공부하 A (Erlang) */
  offeredLoad: number
  /** SL·점유율 가드를 만족하는 최소 상담사 수 N (부재율 보정 전) */
  rawAgents: number
  /** 부재율 보정 후 필요 인원 = ⌈ N / (1−shrinkage) ⌉ */
  requiredAgents: number
  /** rawAgents 기준 달성 응대율 (0~1) */
  achievedServiceLevel: number
  /** rawAgents 기준 점유율 (0~1) */
  achievedOccupancy: number
}

// 무한루프 방지 상한 (콜센터 단일 인터벌에서 200명 초과는 비현실적)
const MAX_AGENTS = 200

/**
 * 목표 응대율과 점유율 상한을 만족하는 최소 필요 인원을 산정한다 (Erlang C).
 *
 * 절차:
 *   1. 제공부하 A = (callsPerInterval × ahtSec) / intervalSec
 *   2. N = ⌈A⌉ 부터 1씩 증가하며 첫 번째로
 *        · SL ≥ 목표응대율  그리고
 *        · 점유율 ≤ 최대점유율
 *      을 모두 만족하는 N 을 찾는다 (rawAgents).
 *   3. 부재율 보정: 필요인원 = ⌈ rawAgents / (1 − shrinkage) ⌉
 *
 * 콜이 0건이면 모든 값 0 으로 즉시 반환한다.
 * MAX_AGENTS(200) 도달 시 무한루프 방지를 위해 그 값으로 종료한다.
 *
 * @param input RequiredAgentsInput
 * @returns RequiredAgentsResult
 */
export function requiredAgents(input: RequiredAgentsInput): RequiredAgentsResult {
  const {
    callsPerInterval, ahtSec, intervalSec,
    targetSlPct, targetAnswerSec, maxOccupancyPct, shrinkagePct,
  } = input

  // ── 콜 0건 가드 ──
  if (!callsPerInterval || callsPerInterval <= 0 || !ahtSec || ahtSec <= 0) {
    return {
      offeredLoad: 0, rawAgents: 0, requiredAgents: 0,
      achievedServiceLevel: 1, achievedOccupancy: 0,
    }
  }

  const interval = intervalSec > 0 ? intervalSec : 3600
  // 1) 제공부하 A (Erlang)
  const A = (callsPerInterval * ahtSec) / interval

  const targetSl = Math.min(Math.max(targetSlPct, 0), 100) / 100
  const maxOcc = maxOccupancyPct > 0 ? Math.min(maxOccupancyPct, 100) / 100 : 1
  const shrink = Math.min(Math.max(shrinkagePct, 0), 99) / 100

  // 2) 최소 N 탐색 — ceil(A) 부터 (최소 A+1 명은 있어야 안정)
  let N = Math.max(1, Math.ceil(A))
  // ceil(A) === A 인 경우(정수 부하)에도 N > A 보장
  if (N <= A) N = Math.floor(A) + 1

  let achievedSl = 0
  let achievedOcc = 1
  while (N <= MAX_AGENTS) {
    achievedSl = serviceLevel(N, A, ahtSec, targetAnswerSec)
    achievedOcc = occupancy(N, A)
    if (achievedSl >= targetSl && achievedOcc <= maxOcc) break
    N++
  }
  if (N > MAX_AGENTS) {
    N = MAX_AGENTS
    achievedSl = serviceLevel(N, A, ahtSec, targetAnswerSec)
    achievedOcc = occupancy(N, A)
  }

  const rawAgents = N
  // 3) 부재율 보정
  const required = Math.ceil(rawAgents / (1 - shrink))

  return {
    offeredLoad: Math.round(A * 1000) / 1000,
    rawAgents,
    requiredAgents: required,
    achievedServiceLevel: Math.round(achievedSl * 1000) / 1000,
    achievedOccupancy: Math.round(achievedOcc * 1000) / 1000,
  }
}
