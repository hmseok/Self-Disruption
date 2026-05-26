/**
 * lib/lotto-rank.ts
 *
 * 한국 로또 6/45 당첨 등수 계산 + 라벨/색상 공용 헬퍼.
 * 본인 기록 탭 / 갓 어드민 「전체 기록」 탭 양쪽에서 동시 사용 (Rule 14 동형 패턴).
 *
 * 등수:
 *   1등: 6개 일치
 *   2등: 5개 + 보너스 일치
 *   3등: 5개 일치
 *   4등: 4개 일치
 *   5등: 3개 일치
 *   0  : 낙첨 (2개 이하)
 *
 * RideVision 세션 — PR-VISION-18
 */

export interface LottoResult {
  n1: number
  n2: number
  n3: number
  n4: number
  n5: number
  n6: number
  bonus: number
}

export interface RankInfo {
  rank: number       // 0(낙첨) | 1~5(등) | -1(미추첨)
  matches: number    // 일치한 개수 (0~6)
  bonusHit: boolean  // 보너스 일치 여부 (2등 판정용)
}

/** 1~5등 / 0(낙첨) 만 계산. result 없으면 -1(미추첨) 처리는 호출측에서. */
export function rankOf(nums: number[], r: LottoResult): RankInfo {
  const win = [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6]
  const matches = nums.filter(n => win.includes(n)).length
  const bonusHit = nums.includes(r.bonus)
  let rank = 0
  if (matches === 6) rank = 1
  else if (matches === 5 && bonusHit) rank = 2
  else if (matches === 5) rank = 3
  else if (matches === 4) rank = 4
  else if (matches === 3) rank = 5
  return { rank, matches, bonusHit }
}

/** 4등 5만원 / 5등 5천원 (회차 무관 고정). 1~3등은 회차별 당첨금 가변 → null. */
export const FIXED_PRIZE: Record<number, number> = { 4: 50000, 5: 5000 }

/** 게임당 손익 — null 이면 1~3등 (당첨금 별도 표기), -amount 이면 낙첨. */
export function netOf(rank: number, drawn: boolean, amount: number): number | null {
  if (!drawn) return null
  if (rank === 0) return -amount
  if (rank === 4 || rank === 5) return FIXED_PRIZE[rank] - amount
  return null // 1~3등 — 회차별 당첨금 별도
}

/** 등수 라벨 (UI 표시용). */
export function rankLabel(rank: number, drawn: boolean): string {
  if (!drawn) return '추첨 대기'
  if (rank === 0) return '낙첨'
  return `${rank}등`
}

/** 등수 색상 토큰 — UI 일관성 (본인 기록 / 전체 기록 동일). */
export interface RankTone {
  bgKey: 'gray' | 'red' | 'violet' | 'green'
  borderKey: 'faint' | 'red' | 'violet' | 'green'
  colorKey: 'muted' | 'danger' | 'violet' | 'success'
}

export function rankToneKey(rank: number, drawn: boolean): RankTone {
  if (!drawn) return { bgKey: 'gray', borderKey: 'faint', colorKey: 'muted' }
  if (rank === 0) return { bgKey: 'red', borderKey: 'red', colorKey: 'danger' }
  if (rank >= 1 && rank <= 3) return { bgKey: 'violet', borderKey: 'violet', colorKey: 'violet' }
  return { bgKey: 'green', borderKey: 'green', colorKey: 'success' }
}
