// ─────────────────────────────────────────────────────────────
// CallScheduler 모듈 layout — SubNav 자동 적용 (factory-search 패턴)
//   매니저 영역의 모든 페이지 (page, settings, requests, [id], skips) 에 적용
//   직원 본인 페이지 (/me, /e/[token]) 는 별개 layout (이 layout 적용 안 됨 X)
//   → SubNav 가 매니저 영역 한정인지 확인 필요
//   → me, e/[token] 페이지는 본 layout 적용되지만 SubNav 가 잘못 보일 수 있어 추후 정리
// ─────────────────────────────────────────────────────────────
import { Suspense } from 'react'
import SubNav from './_components/SubNav'

export default function CallSchedulerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <SubNav />
      </Suspense>
      {children}
    </>
  )
}
