// ═══════════════════════════════════════════════════════════════════
// /CallScheduler/e/[token] — 비로그인 영구 링크 진입
// 매니저가 RideEmployees 에서 발급한 토큰으로 직원이 본인 일정 열람
// status='published' 스케줄만 노출 (API me/route.ts 가 강제)
// ═══════════════════════════════════════════════════════════════════
import { use } from 'react'
import MyScheduleView from '../../components/MyScheduleView'

export const dynamic = 'force-dynamic'

export default function PublicTokenPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  return <MyScheduleView token={token} />
}
