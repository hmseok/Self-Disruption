// ═══════════════════════════════════════════════════════════════════
// useEmployees — /api/profiles SWR hook (실시간 동기화 1단계)
//
// PR-HR-14 (2026-05-28, hr 세션) — 「사용자 표시 공통화 + 실시간 연동」 1단계.
//   현재 분산 상태:
//     · /api/profiles 호출 5개 페이지 (admin/developer / admin / ProtectedRoute / PayrollOps / hr)
//     · 각자 fetch + state — 캐시 X / 페이지 간 동기화 X
//     · 한 페이지 변경 → 다른 페이지는 다음 mount 까지 옛 데이터
//   조치 (사용자 결정: 옵션 A SWR 도입 hr 모듈 입점):
//     · 본 hook 이 SWR cache 단일 source → 모든 사용처가 같은 데이터 공유.
//     · 변경 후 mutate() 호출 → 모든 사용처 자동 refetch.
//     · revalidateOnFocus → 다른 탭 클릭 진입 시 자동 동기화.
//     · 다른 모듈 (RideOrgPanel / admin / CallScheduler) 은 점진 확장 (별 PR).
//
// 사용 예:
//   const { employees, isLoading, mutate } = useEmployees()
//   // 변경 후:
//   await fetch('/api/profiles/abc', { method: 'PATCH', ... })
//   await mutate()  // 다른 사용처도 자동 refetch
// ═══════════════════════════════════════════════════════════════════
'use client'
import useSWR from 'swr'
import { getAuthHeader } from '@/app/utils/auth-client'

const PROFILES_KEY = '/api/profiles'

const fetcher = async (url: string) => {
  const headers = await getAuthHeader()
  const res = await fetch(url, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`)
  const json = await res.json()
  return json.data || []
}

export function useEmployees() {
  const { data, error, isLoading, mutate } = useSWR<any[]>(PROFILES_KEY, fetcher, {
    revalidateOnFocus: true,        // 탭 다시 들어오면 자동 refetch
    revalidateOnReconnect: true,    // 네트워크 재연결 시 refetch
    dedupingInterval: 2000,         // 2초 내 동일 키 fetch 중복 방지
    // refreshInterval: 0           // 폴링 X (focus 기반으로 충분)
  })
  return {
    employees: data || [],
    isLoading: isLoading || (!data && !error),
    error,
    mutate,   // 변경 후 호출 → 모든 useEmployees() 사용처 자동 refetch
  }
}

// ─── 외부에서 직접 invalidate 하고 싶을 때 ──────────────────────
//   예: 다른 hook 또는 useEffect 안에서 employees 무효화 필요 시.
//   import { mutate } from 'swr' 후 mutate(PROFILES_KEY) 호출하면 됨.
//   본 파일에서는 PROFILES_KEY 상수만 export.
export { PROFILES_KEY }
