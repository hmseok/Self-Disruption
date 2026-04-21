'use client'

// ═══════════════════════════════════════════════════════════════════
// useFinanceUrlSync — URL 쿼리 ↔ FinanceContext 양방향 동기화
// ───────────────────────────────────────────────────────────────────
// Phase G (Consolidation v1) — Decision 9β
// 동작:
//   1. 마운트 시 URL → Context (HYDRATE)
//   2. Context 변경 시 URL → router.replace (단방향 플래그로 무한 루프 방지)
//   3. 공유 가능한 필드만 URL에 반영 (개인 설정은 localStorage 전용)
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useFinance } from './FinanceContext'
import type { FinanceState, FinanceTab, SourceFilter } from './FinanceContext'

const VALID_TABS: FinanceTab[] = ['dashboard', 'classify', 'uploads', 'cards', 'codef']
const VALID_SOURCE: SourceFilter[] = ['all', 'bank', 'card', 'manual', 'unclassified']

/** URL에 싣을 필드만 골라 QueryString 생성 */
function buildQuery(s: FinanceState): URLSearchParams {
  const p = new URLSearchParams()
  // 기본값과 다른 경우에만 URL에 포함 (URL 단출성)
  if (s.tab && s.tab !== 'dashboard') p.set('tab', s.tab)
  if (s.month) p.set('month', s.month)
  if (s.search) p.set('q', s.search)
  if (s.sourceFilter && s.sourceFilter !== 'all') p.set('filter', s.sourceFilter)
  if (s.batchId) p.set('batch', s.batchId)
  if (s.includeRolledBack) p.set('rolled', '1')
  if (s.year && s.year !== new Date().getFullYear()) p.set('year', String(s.year))
  // cardsMonth는 cards 탭에서만 의미
  if (s.tab === 'cards' && s.cardsMonth) p.set('cmonth', s.cardsMonth)
  return p
}

/**
 * useFinanceUrlSync
 * - 이 훅을 호출하는 컴포넌트는 반드시 FinanceProvider 하위여야 한다.
 * - 훅 자체는 render-phase에 URL을 건드리지 않고 useEffect로만 동작한다.
 */
export function useFinanceUrlSync() {
  const { state, dispatch } = useFinance()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // URL → Context (최초 1회만)
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true

    const patch: Partial<FinanceState> = {}
    const tab = searchParams.get('tab') as FinanceTab | null
    if (tab && VALID_TABS.includes(tab)) patch.tab = tab

    const month = searchParams.get('month')
    if (month && /^\d{4}-\d{2}$/.test(month)) patch.month = month

    const q = searchParams.get('q')
    if (q !== null) patch.search = q

    const filter = searchParams.get('filter') as SourceFilter | null
    if (filter && VALID_SOURCE.includes(filter)) patch.sourceFilter = filter

    const batch = searchParams.get('batch')
    if (batch) patch.batchId = batch

    const rolled = searchParams.get('rolled')
    if (rolled === '1' || rolled === 'true') patch.includeRolledBack = true

    const year = searchParams.get('year')
    if (year && /^\d{4}$/.test(year)) patch.year = Number(year)

    const cmonth = searchParams.get('cmonth')
    if (cmonth && /^\d{2}$/.test(cmonth)) patch.cardsMonth = cmonth

    if (Object.keys(patch).length > 0) {
      dispatch({ type: 'HYDRATE', patch })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Context → URL (state 변화 시)
  const lastUrlRef = useRef<string>('')
  useEffect(() => {
    if (!hydratedRef.current) return
    const next = buildQuery(state).toString()
    if (next === lastUrlRef.current) return
    lastUrlRef.current = next
    const url = next ? `${pathname}?${next}` : pathname
    router.replace(url, { scroll: false })
  }, [
    state.tab,
    state.month,
    state.search,
    state.sourceFilter,
    state.batchId,
    state.includeRolledBack,
    state.year,
    state.cardsMonth,
    pathname,
    router,
  ])
}
