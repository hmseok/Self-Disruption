'use client'
// ═══════════════════════════════════════════════════════════════
// PR-MULTI-BRAND P3+f — 클라이언트 회사 키 훅
// 설계: _docs/HR-OPERATIONS.md § 9.5 (옵션 C)
// ───────────────────────────────────────────────────────────────
// 로그인 후(post-auth) 공통 UI 가 사용자의 회사 키 알아내는 단일 진입점.
//   · /api/me/company (P3+a) 1회 호출 → sessionStorage 캐시
//   · 이후 동일 세션 내 즉시 반환
//   · 'auth-change' 이벤트 시 invalidate (로그아웃/재로그인 대응)
//
// pre-auth 페이지 (로그인 페이지) 는 lib/company-brand.ts 의 쿠키 기반 사용.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { auth } from '@/lib/auth-client'
import { COMPANY_BRANDS, type CompanyKey, type CompanyBrand } from '@/lib/company-brand'

const CACHE_KEY = 'fmi_my_company'

function readCache(): CompanyKey | null {
  if (typeof window === 'undefined') return null
  try {
    const v = sessionStorage.getItem(CACHE_KEY)
    return v === 'RIDE' || v === 'FMI' ? (v as CompanyKey) : null
  } catch { return null }
}

function writeCache(k: CompanyKey) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(CACHE_KEY, k) } catch {}
}

function clearCache() {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(CACHE_KEY) } catch {}
}

async function fetchCompany(_token: string): Promise<CompanyKey> {
  // PR-FMI-ONLY-PURGE Phase 3b (2026-06-02) — 라이드 분리: 단독회사 FMI 고정 (/api/me/company 호출 제거).
  return 'FMI'
}

/**
 * 현재 로그인 사용자의 회사 키.
 *   null = 로딩 중 / 미로그인.
 * 캐시 + 로그아웃 시 자동 무효화.
 */
export function useMyCompanyKey(): CompanyKey | null {
  const [key, setKey] = useState<CompanyKey | null>(() => readCache())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const refresh = async () => {
      const currentUser = auth.currentUser
      if (!currentUser) {
        clearCache()
        setKey(null)
        return
      }
      const cached = readCache()
      if (cached) { setKey(cached); return }
      try {
        const token = await currentUser.getIdToken()
        const k = await fetchCompany(token)
        writeCache(k)
        setKey(k)
      } catch {
        setKey('FMI')
      }
    }

    refresh()
    const off = auth.onAuthStateChanged(() => { clearCache(); refresh() })
    return () => { try { off() } catch {} }
  }, [])

  return key
}

/**
 * 현재 회사 브랜드 (CompanyBrand) — null 시 FMI 폴백.
 */
export function useMyCompanyBrand(): CompanyBrand {
  const key = useMyCompanyKey()
  return COMPANY_BRANDS[key || 'FMI']
}
