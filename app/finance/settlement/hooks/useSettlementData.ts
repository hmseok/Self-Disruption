'use client'
// ============================================
// 투자자 정산 시스템 — 데이터 로드 + 정산항목 빌드 Hook
// fetchAllData + buildSettlementItems + useMemo 통합
// ============================================

import { useEffect, useState, useMemo, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import type {
  Transaction, JiipContract, InvestContract, LoanContract,
  InvestDeposit, ShareHistoryItem, ClassifiedItem,
  SettlementItem, SettlementSummary, FinanceSummary
} from '../lib/types'
import { INCOME_GROUPS, EXPENSE_GROUPS } from '../lib/types'
import { N, categorizeAmount } from '../lib/utils'
import { fetchSettlementData, type SettlementDataBundle } from '../api-client/settlement-client'
import { buildSettlementItems } from '../lib/settlement-builder'

export interface UseSettlementDataResult {
  // 데이터
  data: SettlementDataBundle | null
  transactions: Transaction[]
  jiips: JiipContract[]
  investors: InvestContract[]
  loans: LoanContract[]
  investDeposits: InvestDeposit[]
  shareHistory: ShareHistoryItem[]
  classifiedItems: ClassifiedItem[]
  carTxHistory: Transaction[]
  investDepositHistory: Transaction[]
  allJiipContracts: JiipContract[]
  allInvestContracts: InvestContract[]
  contractsSettleTxs: Transaction[]
  allPaidShares: ShareHistoryItem[]

  // 계산된 값
  settlementItems: SettlementItem[]
  summary: FinanceSummary
  settlementSummary: SettlementSummary
  revenueBySource: [string, { total: number; count: number; items: Transaction[] }][]
  expenseByGroup: [string, { total: number; count: number; items: Transaction[] }][]

  // 상태
  loading: boolean
  error: string | null

  // 액션
  refresh: () => Promise<void>
  setShareHistory: React.Dispatch<React.SetStateAction<ShareHistoryItem[]>>
}

export function useSettlementData(
  filterDate: string,
  companyId: string | undefined,
  role: string | undefined
): UseSettlementDataResult {
  const pathname = usePathname()

  const [data, setData] = useState<SettlementDataBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // shareHistory는 로컬 상태로 관리 (지급완료 토글 시 즉시 반영)
  const [shareHistory, setShareHistory] = useState<ShareHistoryItem[]>([])

  const fetchAll = useCallback(async () => {
    if (!companyId && role !== 'admin') return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchSettlementData(filterDate, companyId, role)
      setData(result)
      setShareHistory(result.shareHistory)
    } catch (e: any) {
      setError(e.message || '데이터 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [filterDate, companyId, role])

  // 초기 로드 + filterDate 변경 시
  useEffect(() => {
    fetchAll()
  }, [fetchAll, pathname])

  // 탭 포커스 시 자동 새로고침
  useEffect(() => {
    const onFocus = () => fetchAll()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchAll])

  // ── 정산 항목 빌드 ──
  const settlementItems = useMemo(() => {
    if (!data) return []
    return buildSettlementItems({
      jiipData: data.jiips,
      investData: data.investors,
      loanData: data.loans,
      selectedMonth: filterDate,
      allSettleTxs: data.allSettleTxs,
      carTxs: data.carTxHistory,
      shareHistory,
      investDeposits: data.investDeposits,
      investTxDeposits: data.investTxDeposits,
    })
  }, [data, filterDate, shareHistory])

  // ── 재무 요약 ──
  const summary = useMemo<FinanceSummary>(() => {
    const txs = data?.transactions || []
    const completed = txs.filter(t => t.status === 'completed')
    const income = completed.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = completed.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const pending = txs.filter(t => t.status === 'pending').reduce((s, t) => s + t.amount, 0)
    return { income, expense, profit: income - expense, pending }
  }, [data?.transactions])

  // ── 정산 요약 ──
  const settlementSummary = useMemo<SettlementSummary>(() => {
    const pending = settlementItems.filter(i => i.status === 'pending')
    const paid = settlementItems.filter(i => i.status === 'paid')
    return {
      totalItems: settlementItems.length,
      pendingCount: pending.length,
      pendingAmount: pending.reduce((s, i) => s + i.amount, 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((s, i) => s + i.amount, 0),
    }
  }, [settlementItems])

  // ── 매출 분석 (소스별) ──
  const revenueBySource = useMemo(() => {
    const txs = data?.transactions || []
    const incomes = txs.filter(t => t.type === 'income' && t.status === 'completed')
    const grouped: Record<string, { total: number; count: number; items: Transaction[] }> = {}
    incomes.forEach(t => {
      const group = categorizeAmount(t.category, INCOME_GROUPS)
      if (!grouped[group]) grouped[group] = { total: 0, count: 0, items: [] }
      grouped[group].total += t.amount
      grouped[group].count++
      grouped[group].items.push(t)
    })
    return Object.entries(grouped).sort((a, b) => b[1].total - a[1].total)
  }, [data?.transactions])

  // ── 비용 분석 (그룹별) ──
  const expenseByGroup = useMemo(() => {
    const txs = data?.transactions || []
    const expenses = txs.filter(t => t.type === 'expense' && t.status === 'completed')
    const grouped: Record<string, { total: number; count: number; items: Transaction[] }> = {}
    expenses.forEach(t => {
      const group = categorizeAmount(t.category, EXPENSE_GROUPS)
      if (!grouped[group]) grouped[group] = { total: 0, count: 0, items: [] }
      grouped[group].total += t.amount
      grouped[group].count++
      grouped[group].items.push(t)
    })
    return Object.entries(grouped).sort((a, b) => b[1].total - a[1].total)
  }, [data?.transactions])

  return {
    data,
    transactions: data?.transactions || [],
    jiips: data?.jiips || [],
    investors: data?.investors || [],
    loans: data?.loans || [],
    investDeposits: data?.investDeposits || [],
    shareHistory,
    classifiedItems: data?.classifiedItems || [],
    carTxHistory: data?.carTxHistory || [],
    investDepositHistory: data?.investTxDeposits as any || [],
    allJiipContracts: data?.allJiipContracts || [],
    allInvestContracts: data?.allInvestContracts || [],
    contractsSettleTxs: data?.contractsSettleTxs || [],
    allPaidShares: data?.allPaidShares || [],
    settlementItems,
    summary,
    settlementSummary,
    revenueBySource,
    expenseByGroup,
    loading,
    error,
    refresh: fetchAll,
    setShareHistory,
  }
}
