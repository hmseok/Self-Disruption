'use client'

// ═══════════════════════════════════════════════════════════════════
// FinanceContext — Finance 모듈 통합 상태 관리
// ───────────────────────────────────────────────────────────────────
// Phase G (Consolidation v1) — Decisions 6~9 구현
// 목적:
//   1. /finance, /finance/upload, /finance/uploads 3개 페이지 상태 통합
//   2. URL 쿼리 ↔ Context 양방향 동기화 (공유 링크 재현)
//   3. 사용자 개인 표시 설정은 localStorage(fmi_finance_*)
// ═══════════════════════════════════════════════════════════════════

import { createContext, useContext, useEffect, useReducer, useMemo } from 'react'
import type { ReactNode } from 'react'

// ──────────────────────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────────────────────

export type FinanceTab = 'dashboard' | 'classify' | 'uploads' | 'cards' | 'codef'
export type SourceFilter = 'all' | 'bank' | 'card' | 'manual' | 'unclassified'
export type GroupBy = 'category' | 'source' | 'date' | 'amount'
export type CategoryMode = 'display' | 'accounting'

export type FinanceState = {
  // 공통 (URL)
  tab: FinanceTab
  month: string                  // 'YYYY-MM' dashboard/cards 공용
  search: string

  // classify (URL에 일부)
  sourceFilter: SourceFilter
  batchId: string | null

  // classify (localStorage — 개인 설정)
  groupBy: GroupBy
  categoryMode: CategoryMode
  showAdvancedCategory: boolean

  // uploads (URL)
  includeRolledBack: boolean

  // cards (URL)
  year: number
  cardsMonth: string             // 'MM'
}

export type FinanceAction =
  | { type: 'SET_TAB'; tab: FinanceTab }
  | { type: 'SET_MONTH'; month: string }
  | { type: 'SET_SEARCH'; q: string }
  | { type: 'SET_SOURCE_FILTER'; filter: SourceFilter }
  | { type: 'SET_BATCH'; batchId: string | null }
  | { type: 'SET_GROUP_BY'; groupBy: GroupBy }
  | { type: 'SET_CATEGORY_MODE'; mode: CategoryMode }
  | { type: 'TOGGLE_ADVANCED_CATEGORY' }
  | { type: 'SET_ADVANCED_CATEGORY'; v: boolean }
  | { type: 'SET_ROLLED_BACK'; v: boolean }
  | { type: 'SET_YEAR'; year: number }
  | { type: 'SET_CARDS_MONTH'; month: string }
  | { type: 'HYDRATE'; patch: Partial<FinanceState> }

// ──────────────────────────────────────────────────────────────
// 초기 상태 / 마이그레이션
// ──────────────────────────────────────────────────────────────

const VALID_TABS: FinanceTab[] = ['dashboard', 'classify', 'uploads', 'cards', 'codef']
const VALID_SOURCE: SourceFilter[] = ['all', 'bank', 'card', 'manual', 'unclassified']
const VALID_GROUP: GroupBy[] = ['category', 'source', 'date', 'amount']
const VALID_MODE: CategoryMode[] = ['display', 'accounting']

const OLD_KEYS = [
  'finance_categoryMode',
  'finance_showAdvancedCategory',
  'finance_sourceFilter',
  'finance_groupBy',
] as const

/** 구 키(finance_*) → 신 키(fmi_finance_*) 1회성 이관 */
function migrateLegacyKeys() {
  if (typeof window === 'undefined') return
  try {
    for (const k of OLD_KEYS) {
      const v = localStorage.getItem(k)
      if (v === null) continue
      const newKey = k.replace('finance_', 'fmi_finance_')
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, v)
      }
      localStorage.removeItem(k)
    }
  } catch {
    /* localStorage 차단 환경 — 조용히 무시 */
  }
}

function readLS(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLS(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 무시 */
  }
}

const todayMonth = () => new Date().toISOString().slice(0, 7)
const todayYear = () => new Date().getFullYear()
const todayMM = () => String(new Date().getMonth() + 1).padStart(2, '0')

export function initialState(): FinanceState {
  migrateLegacyKeys()

  const groupBy = (readLS('fmi_finance_groupBy') as GroupBy) ?? 'category'
  const categoryMode = (readLS('fmi_finance_categoryMode') as CategoryMode) ?? 'display'
  const advRaw = readLS('fmi_finance_showAdvancedCategory')
  const showAdvancedCategory =
    advRaw === null ? categoryMode === 'accounting' : advRaw === 'true'

  return {
    tab: 'dashboard',
    month: todayMonth(),
    search: '',
    sourceFilter: 'all',
    batchId: null,
    groupBy: VALID_GROUP.includes(groupBy) ? groupBy : 'category',
    categoryMode: VALID_MODE.includes(categoryMode) ? categoryMode : 'display',
    showAdvancedCategory,
    includeRolledBack: false,
    year: todayYear(),
    cardsMonth: todayMM(),
  }
}

// ──────────────────────────────────────────────────────────────
// Reducer
// ──────────────────────────────────────────────────────────────

function reducer(s: FinanceState, a: FinanceAction): FinanceState {
  switch (a.type) {
    case 'SET_TAB':
      return VALID_TABS.includes(a.tab) ? { ...s, tab: a.tab } : s
    case 'SET_MONTH':
      return { ...s, month: a.month }
    case 'SET_SEARCH':
      return { ...s, search: a.q }
    case 'SET_SOURCE_FILTER':
      return VALID_SOURCE.includes(a.filter) ? { ...s, sourceFilter: a.filter } : s
    case 'SET_BATCH':
      return { ...s, batchId: a.batchId }
    case 'SET_GROUP_BY': {
      if (!VALID_GROUP.includes(a.groupBy)) return s
      writeLS('fmi_finance_groupBy', a.groupBy)
      return { ...s, groupBy: a.groupBy }
    }
    case 'SET_CATEGORY_MODE': {
      if (!VALID_MODE.includes(a.mode)) return s
      writeLS('fmi_finance_categoryMode', a.mode)
      return { ...s, categoryMode: a.mode }
    }
    case 'TOGGLE_ADVANCED_CATEGORY': {
      const next = !s.showAdvancedCategory
      writeLS('fmi_finance_showAdvancedCategory', String(next))
      // 고급 OFF로 전환 시 회계 모드면 display로 되돌림
      const mode = !next && s.categoryMode === 'accounting' ? 'display' : s.categoryMode
      if (mode !== s.categoryMode) writeLS('fmi_finance_categoryMode', mode)
      return { ...s, showAdvancedCategory: next, categoryMode: mode }
    }
    case 'SET_ADVANCED_CATEGORY': {
      writeLS('fmi_finance_showAdvancedCategory', String(a.v))
      const mode = !a.v && s.categoryMode === 'accounting' ? 'display' : s.categoryMode
      if (mode !== s.categoryMode) writeLS('fmi_finance_categoryMode', mode)
      return { ...s, showAdvancedCategory: a.v, categoryMode: mode }
    }
    case 'SET_ROLLED_BACK':
      return { ...s, includeRolledBack: a.v }
    case 'SET_YEAR':
      return { ...s, year: a.year }
    case 'SET_CARDS_MONTH':
      return { ...s, cardsMonth: a.month }
    case 'HYDRATE':
      return { ...s, ...a.patch }
    default:
      return s
  }
}

// ──────────────────────────────────────────────────────────────
// Context
// ──────────────────────────────────────────────────────────────

type FinanceContextValue = {
  state: FinanceState
  dispatch: React.Dispatch<FinanceAction>
  // 편의 setter (URL 동기화 훅에서 주로 사용)
  setTab: (t: FinanceTab) => void
  setMonth: (m: string) => void
  setSearch: (q: string) => void
  setSourceFilter: (f: SourceFilter) => void
  setBatch: (id: string | null) => void
  setGroupBy: (g: GroupBy) => void
  setCategoryMode: (m: CategoryMode) => void
  toggleAdvancedCategory: () => void
  setAdvancedCategory: (v: boolean) => void
  setRolledBack: (v: boolean) => void
  setYear: (y: number) => void
  setCardsMonth: (m: string) => void
}

const FinanceCtx = createContext<FinanceContextValue | null>(null)

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  // VALID_* 검증 (HYDRATE로 들어올 수 있는 쓰레기 필터)
  useEffect(() => {
    if (!VALID_TABS.includes(state.tab)) dispatch({ type: 'SET_TAB', tab: 'dashboard' })
  }, [state.tab])

  const value = useMemo<FinanceContextValue>(
    () => ({
      state,
      dispatch,
      setTab: (t) => dispatch({ type: 'SET_TAB', tab: t }),
      setMonth: (m) => dispatch({ type: 'SET_MONTH', month: m }),
      setSearch: (q) => dispatch({ type: 'SET_SEARCH', q }),
      setSourceFilter: (f) => dispatch({ type: 'SET_SOURCE_FILTER', filter: f }),
      setBatch: (id) => dispatch({ type: 'SET_BATCH', batchId: id }),
      setGroupBy: (g) => dispatch({ type: 'SET_GROUP_BY', groupBy: g }),
      setCategoryMode: (m) => dispatch({ type: 'SET_CATEGORY_MODE', mode: m }),
      toggleAdvancedCategory: () => dispatch({ type: 'TOGGLE_ADVANCED_CATEGORY' }),
      setAdvancedCategory: (v) => dispatch({ type: 'SET_ADVANCED_CATEGORY', v }),
      setRolledBack: (v) => dispatch({ type: 'SET_ROLLED_BACK', v }),
      setYear: (y) => dispatch({ type: 'SET_YEAR', year: y }),
      setCardsMonth: (m) => dispatch({ type: 'SET_CARDS_MONTH', month: m }),
    }),
    [state]
  )

  return <FinanceCtx.Provider value={value}>{children}</FinanceCtx.Provider>
}

/**
 * useFinance — FinanceProvider 하위에서만 사용 가능
 * Provider 바깥이면 콘솔 경고 후 기본 상태 반환 (구 페이지에서 직접 import 시 안전망)
 */
export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceCtx)
  if (!ctx) {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[FinanceContext] useFinance called outside FinanceProvider — using fallback')
    }
    const fallbackState = initialState()
    const noop = () => {}
    return {
      state: fallbackState,
      dispatch: noop as any,
      setTab: noop,
      setMonth: noop,
      setSearch: noop,
      setSourceFilter: noop,
      setBatch: noop,
      setGroupBy: noop,
      setCategoryMode: noop,
      toggleAdvancedCategory: noop,
      setAdvancedCategory: noop,
      setRolledBack: noop,
      setYear: noop,
      setCardsMonth: noop,
    }
  }
  return ctx
}

/** Provider 여부만 확인 (구 페이지에서 조건부 분기용) */
export function useFinanceOptional(): FinanceContextValue | null {
  return useContext(FinanceCtx)
}
