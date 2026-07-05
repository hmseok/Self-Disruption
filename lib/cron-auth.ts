import { NextRequest } from 'next/server'

// ═══════════════════════════════════════════════════════════════════
// cron-auth — Cloud Scheduler 등 외부 cron 트리거 인증 (PR-PAY-CRON, 2026-07-05)
//
// 패턴: X-Cron-Secret 헤더 === env CRON_SECRET (auto-match-schedule/run 과 동일).
// 사용처: codef/sync → codef/bank → auto-match-fmi-rental 체인 —
//   사용자 토큰 없이 주기 실행 가능하게. 시크릿 미설정 시 항상 false (안전 기본값).
// ═══════════════════════════════════════════════════════════════════

export function isCronAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || ''
  if (!expected) return false
  return (req.headers.get('x-cron-secret') || '') === expected
}

/** 내부 self-fetch 체인에 cron 시크릿 전달용 헤더 */
export function cronForwardHeaders(req: NextRequest): Record<string, string> {
  const s = req.headers.get('x-cron-secret') || ''
  return s ? { 'X-Cron-Secret': s } : {}
}
