'use client'

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════
// 운영학습 Context — 필터/선택/캐시 공유 상태
// ═══════════════════════════════════════════════════════════════

export type OLFilter = {
  /** 최근 N일 ('30' | '90' | '180' | '365' | 'all') */
  period: '30' | '90' | '180' | '365' | 'all'
  /** 차종(vehicle_class) 필터 — '전체' 포함 */
  vehicleClasses: string[]
  /** 계약 타입 필터 (return | buyout) */
  contractTypes: string[]
}

export type Snapshot = {
  id: string
  quote_id: string
  vehicle_id: string | null
  contract_id: string | null
  purchase_price: number | string
  term_months: number
  contract_type: string | null
  annual_mileage: number | null
  loan_rate: number | string | null
  vehicle_class: string | null
  predicted_depreciation: number | string | null
  predicted_insurance: number | string | null
  predicted_maintenance: number | string | null
  predicted_tax: number | string | null
  predicted_accident_cost: number | string | null
  predicted_overhead: number | string | null
  predicted_margin: number | string | null
  predicted_rent: number | string | null
  result_json: string | null
  snapshot_date: string
  // 조인 데이터 (선택)
  accuracy?: number | null
  actuals_count?: number
}

export type AnalysisItem = {
  category: string
  predicted_monthly: number
  actual_monthly: number
  variance: number
  variance_pct: number
  status: 'accurate' | 'underestimate' | 'overestimate'
}

export type AnalysisResult = {
  snapshot: Snapshot
  actuals: any[]
  averaged: Record<string, number>
  analysis: {
    items: AnalysisItem[]
    overall_accuracy: number
    recommendations: string[]
  }
}

export type RuleSuggestion = {
  key: string
  current_value: number
  suggested_value: number
  reason: string
  confidence: 'high' | 'medium' | 'low'
  rule_id?: string | null
}

// ────────────────────────────────────────────────────────────────

type Ctx = {
  filter: OLFilter
  setFilter: (next: Partial<OLFilter>) => void

  snapshots: Snapshot[]
  setSnapshots: (s: Snapshot[]) => void

  selectedSnapshotId: string | null
  setSelectedSnapshotId: (id: string | null) => void

  analysis: AnalysisResult | null
  setAnalysis: (a: AnalysisResult | null) => void

  suggestions: RuleSuggestion[]
  setSuggestions: (s: RuleSuggestion[]) => void

  suggestionMeta: { sample_size: number; analysis_period: string }
  setSuggestionMeta: (m: { sample_size: number; analysis_period: string }) => void

  loadingSnapshots: boolean
  setLoadingSnapshots: (v: boolean) => void
  loadingAnalysis: boolean
  setLoadingAnalysis: (v: boolean) => void
  loadingSuggestions: boolean
  setLoadingSuggestions: (v: boolean) => void

  reloadKey: number
  triggerReload: () => void
}

const OLContext = createContext<Ctx | null>(null)

export function useOL() {
  const c = useContext(OLContext)
  if (!c) throw new Error('useOL must be inside <OLProvider>')
  return c
}

// ────────────────────────────────────────────────────────────────

export function OLProvider({ children }: { children: ReactNode }) {
  const [filter, setFilterState] = useState<OLFilter>({
    period: '180',
    vehicleClasses: [],
    contractTypes: [],
  })

  const setFilter = useCallback((next: Partial<OLFilter>) => {
    setFilterState(prev => ({ ...prev, ...next }))
  }, [])

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [suggestions, setSuggestions] = useState<RuleSuggestion[]>([])
  const [suggestionMeta, setSuggestionMeta] = useState<{ sample_size: number; analysis_period: string }>({
    sample_size: 0,
    analysis_period: '',
  })
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const triggerReload = useCallback(() => setReloadKey(k => k + 1), [])

  const value = useMemo<Ctx>(() => ({
    filter, setFilter,
    snapshots, setSnapshots,
    selectedSnapshotId, setSelectedSnapshotId,
    analysis, setAnalysis,
    suggestions, setSuggestions,
    suggestionMeta, setSuggestionMeta,
    loadingSnapshots, setLoadingSnapshots,
    loadingAnalysis, setLoadingAnalysis,
    loadingSuggestions, setLoadingSuggestions,
    reloadKey, triggerReload,
  }), [
    filter, setFilter,
    snapshots, selectedSnapshotId,
    analysis, suggestions, suggestionMeta,
    loadingSnapshots, loadingAnalysis, loadingSuggestions,
    reloadKey, triggerReload,
  ])

  return <OLContext.Provider value={value}>{children}</OLContext.Provider>
}

// ────────────────────────────────────────────────────────────────
// 날짜 범위 계산 유틸 (API 호출 전용)
// ────────────────────────────────────────────────────────────────
export function periodToDateRange(period: OLFilter['period']): { from?: string; to?: string } {
  if (period === 'all') return {}
  const days = Number(period)
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const from = fromDate.toISOString().slice(0, 10)
  return { from, to }
}

// ────────────────────────────────────────────────────────────────
// 숫자 포맷 — 원화 단위 (만원 이상 시 '만'·'천만')
// ────────────────────────────────────────────────────────────────
export function fmtWon(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '-'
  const v = Number(n)
  if (!isFinite(v) || v === 0) return '-'
  if (Math.abs(v) >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 10_000).toLocaleString()}만`
  return v.toLocaleString()
}

export function fmtWonFull(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '-'
  const v = Number(n)
  if (!isFinite(v)) return '-'
  return v.toLocaleString()
}
