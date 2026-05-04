'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler/me — 로그인 직원 본인 시간표
// 인증 헤더로 본인 자동 추출 → MyScheduleView 가 표출
// ═══════════════════════════════════════════════════════════════════
import MyScheduleView from '../components/MyScheduleView'

export const dynamic = 'force-dynamic'

export default function MyPage() {
  return <MyScheduleView />
}
