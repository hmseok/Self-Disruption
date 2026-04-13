// ============================================
// 투자자 정산 시스템 — 투자 잔액 및 일할계산 가중평균잔액
// ============================================
// 핵심 원칙:
// 1) 실제 입금된 금액만 이자 계산 대상 (입금 전 = 0원)
// 2) 입금일 기준 일할계산 (가중평균잔액)
// 3) 거치기간 동안은 이자 0원
// 4) 입금 내역이 전혀 없는 경우만 계약금액 fallback 사용
//
// 데이터 소스 우선순위:
//   investment_deposits 테이블 > transactions(related_type='invest', income) > fallback
// ============================================

import type { InvestDeposit } from './types'
import { daysInMonth } from './date-utils'

export type InvestmentBalance = {
  balance: number
  dailyWeightedBalance: number
  isGracePeriod: boolean
  hasDepositData: boolean
}

export type InvestTxDeposit = {
  id: string
  transaction_date: string
  amount: number
  type: string
  related_id: string
  client_name?: string
  description?: string
  category?: string
}

/**
 * 투자 원금 잔액 및 일할계산 가중평균잔액
 */
export function getInvestBalanceWithDaily(
  investId: string,
  baseMonth: string,
  fallbackAmount: number,
  deposits: InvestDeposit[],
  investTxDeposits: InvestTxDeposit[],
  contractStartDate?: string,
  gracePeriodMonths?: number
): InvestmentBalance {
  const [y, mo] = baseMonth.split('-').map(Number)
  const dim = daysInMonth(y, mo)
  const monthStart = `${baseMonth}-01`
  const endOfMonth = `${baseMonth}-${String(dim).padStart(2, '0')}`

  // ── 거치기간 확인 ──
  const grace = gracePeriodMonths || 0
  let isGracePeriod = false
  if (grace > 0 && contractStartDate) {
    const startDate = new Date(contractStartDate)
    const graceEndDate = new Date(startDate.getFullYear(), startDate.getMonth() + grace, startDate.getDate())
    const monthEndDate = new Date(y, mo - 1, dim)
    if (monthEndDate < graceEndDate) {
      isGracePeriod = true
    }
  }

  // ── 입금/상환 이벤트 수집 ──
  const txAll = investTxDeposits.filter(t => String(t.related_id) === String(investId))
  const txDepositsFiltered = txAll.filter(t => t.type === 'income')
  const txRepayments = txAll.filter(t => t.type === 'expense')
  const invDeposits = deposits.filter(d => String(d.investment_id) === String(investId))

  const hasAnyInvDeposits = invDeposits.length > 0
  const hasAnyTxDeposits = txDepositsFiltered.length > 0
  const hasDepositData = hasAnyInvDeposits || hasAnyTxDeposits

  type BalanceEvent = { date: string; amount: number }
  const allEvents: BalanceEvent[] = []

  if (hasAnyInvDeposits) {
    invDeposits.forEach(d => {
      allEvents.push({ date: d.deposit_date, amount: d.amount })
    })
  } else if (hasAnyTxDeposits) {
    txDepositsFiltered.forEach(t => {
      allEvents.push({ date: t.transaction_date.slice(0, 10), amount: t.amount })
    })
  }

  // ★ 원금 상환(expense) — 이자 지급은 제외
  txRepayments.forEach(t => {
    const desc = ((t.client_name || '') + (t.description || '') + (t.category || '')).toLowerCase()
    const isInterestPayment = desc.includes('이자') || desc.includes('interest') || desc.includes('배당')
    if (!isInterestPayment) {
      allEvents.push({ date: t.transaction_date.slice(0, 10), amount: -t.amount })
    }
  })

  // ── 입금 내역이 전혀 없는 경우: 계약금액 기반 fallback ──
  if (allEvents.length === 0) {
    if (contractStartDate && contractStartDate.slice(0, 7) > baseMonth) {
      return { balance: 0, dailyWeightedBalance: 0, isGracePeriod, hasDepositData: false }
    }
    if (contractStartDate && contractStartDate.slice(0, 7) === baseMonth) {
      const startDay = parseInt(contractStartDate.slice(8, 10)) || 1
      const remainingDays = dim - startDay + 1
      const dailyWeighted = Math.floor(fallbackAmount * remainingDays / dim)
      return { balance: fallbackAmount, dailyWeightedBalance: dailyWeighted, isGracePeriod, hasDepositData: false }
    }
    return { balance: fallbackAmount, dailyWeightedBalance: fallbackAmount, isGracePeriod, hasDepositData: false }
  }

  // ── 입금 내역 기반 일할계산 ──
  allEvents.sort((a, b) => a.date.localeCompare(b.date))

  let runningBalance = 0
  const beforeMonth = allEvents.filter(e => e.date < monthStart)
  beforeMonth.forEach(e => { runningBalance += e.amount })

  const inMonth = allEvents
    .filter(e => e.date >= monthStart && e.date <= endOfMonth)
    .sort((a, b) => a.date.localeCompare(b.date))

  let weightedSum = 0
  let prevDay = 1

  for (const evt of inMonth) {
    const evtDay = parseInt(evt.date.slice(8, 10)) || 1
    const holdDays = evtDay - prevDay
    if (holdDays > 0) {
      weightedSum += runningBalance * holdDays
    }
    runningBalance += evt.amount
    prevDay = evtDay
  }
  const remainDays = dim - prevDay + 1
  if (remainDays > 0) {
    weightedSum += runningBalance * remainDays
  }

  const dailyWeightedBalance = Math.floor(weightedSum / dim)

  return {
    balance: runningBalance,
    dailyWeightedBalance,
    isGracePeriod,
    hasDepositData: true,
  }
}

/**
 * 이전 호환용 래퍼 (이자 계산에 직접 사용)
 * 거치기간이면 0 반환
 */
export function getInvestBalance(
  investId: string,
  baseMonth: string,
  fallbackAmount: number,
  deposits: InvestDeposit[],
  investTxDeposits: InvestTxDeposit[],
  contractStartDate?: string,
  gracePeriodMonths?: number
): number {
  const result = getInvestBalanceWithDaily(investId, baseMonth, fallbackAmount, deposits, investTxDeposits, contractStartDate, gracePeriodMonths)
  if (result.isGracePeriod) return 0
  return result.dailyWeightedBalance
}
