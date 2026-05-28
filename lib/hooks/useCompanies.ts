'use client'
// ═══════════════════════════════════════════════════════════════
// useCompanies — SWR 기반 /api/companies fetch hook
//
// PR-HR-22 (2026-05-28, hr 세션) — companies 테이블 동적 회사 목록.
//   사용자 "구조 정리" 마무리 — 새 회사 추가 시 회사 토글에 자동 노출.
//
// 사용처:
//   · app/hr/page.tsx (visibleCompanies 동적화)
//   · 향후 회사 격리 미들웨어 (PR-HR-17) / 사이드바 자동 필터 (PR-HR-18) 등
//
// 의존: /api/companies (PR-HR-15), SWR (PR-HR-14 도입)
// ═══════════════════════════════════════════════════════════════
import useSWR from 'swr'
import { auth } from '@/lib/auth-client'

export interface CompanyRow {
  id: string
  name: string
  company_key: string | null
  subdomain: string
  label: string | null
  primary_color: string | null
  accent_color: string | null
  short_name: string | null
  is_active: boolean
  is_internal_host: boolean
  sort_order: number
}

async function fetcher(url: string): Promise<CompanyRow[]> {
  const user = auth.currentUser
  if (!user) return []
  const token = await user.getIdToken()
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) return []
  const json = await res.json()
  return json.data || []
}

/**
 * 활성 회사 목록 (sort_order ASC).
 *   미적용 마이그 또는 미인증 시 빈 배열 (Rule 23 graceful).
 *   캐시: SWR 키 '/api/companies' 공유 — 페이지 전환 시 재호출 X.
 */
export function useCompanies() {
  const { data, error, isLoading, mutate } = useSWR<CompanyRow[]>(
    '/api/companies',
    fetcher,
    {
      revalidateOnFocus: false, // 회사 row 거의 안 바뀜
      dedupingInterval: 60_000,  // 1분 cache
      fallbackData: [],
    }
  )
  return {
    companies: data || [],
    error,
    loading: isLoading,
    mutate,
  }
}
