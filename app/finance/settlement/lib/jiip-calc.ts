// ============================================
// 투자자 정산 시스템 — 지입 수익배분 계산
// 지입비 = 회사가 받는 돈 (수입)
// 배분금 = (차량수입 - 차량비용 - 지입비) × share_ratio% → 차주에게 지급
// ★ 적자 이월: 마이너스일 때 다음 달로 이월, 합산 정산
// ============================================

import type { Transaction } from './types'

// ── 정산 계산 제외 카테고리 ──
// 차량구입비용은 이미 수익분배비율에 반영됨 → 운영 수입/비용만 포함
const EXCLUDE_KEYWORDS = [
  '차량구입', '구입비', '선납금', '매입', '취득', '매각', '처분',
  '할부', '리스', '대출', '원금', '이자비용',
  '투자', '수익배분', '정산', '배분금',
  '보증금', '지입대금', '지입정산', '초기비용',
  '감가상각', '카드대금',
]

export function isExcludedCategory(category: string): boolean {
  return EXCLUDE_KEYWORDS.some(kw => category.includes(kw))
}

export type CarMonthData = Record<string, { revenue: number; expense: number }>

/**
 * 차량별 월별 수입/비용 집계 (운영 수입/비용만)
 */
export function buildCarMonthData(
  carTxs: Pick<Transaction, 'related_id' | 'transaction_date' | 'type' | 'amount' | 'category'>[]
): CarMonthData {
  const carMonthData: CarMonthData = {}
  carTxs.forEach(t => {
    if (!t.related_id) return
    if (t.category && isExcludedCategory(t.category)) return
    const m = t.transaction_date.slice(0, 7)
    const key = `${t.related_id}_${m}`
    if (!carMonthData[key]) carMonthData[key] = { revenue: 0, expense: 0 }
    if (t.type === 'income') carMonthData[key].revenue += Math.abs(t.amount)
    else carMonthData[key].expense += Math.abs(t.amount)
  })
  return carMonthData
}

export type JiipSettlementResult = {
  investorPayout: number    // 세전 배분금
  netPayout: number         // 세후 실수령액
  netProfit: number
  distributable: number
  effectiveDistributable: number
  adminFee: number
  companyProfit: number
  carryOver: number         // 이 월 이후의 이월액
  taxType: string
  taxRate: number
  taxAmount: number
  supplyAmount: number
  revenue: number
  expense: number
  shareRatio: number
}

/**
 * 단일 지입 계약/월의 정산 계산
 */
export function calcJiipSettlement(
  revenue: number,
  expense: number,
  adminFee: number,
  shareRatio: number,
  prevCarryOver: number,
  taxType: string,
  isPaid: boolean
): JiipSettlementResult {
  const netProfit = revenue - expense
  const distributable = netProfit - adminFee
  const effectiveDistributable = distributable + prevCarryOver

  let investorPayout = 0
  let carryOver = 0
  if (effectiveDistributable > 0) {
    investorPayout = Math.floor(effectiveDistributable * (shareRatio / 100))
    carryOver = 0
  } else {
    investorPayout = 0
    carryOver = isPaid ? 0 : effectiveDistributable
  }

  // 세금 계산
  let taxRate = 0
  let taxAmount = 0
  let netPayout = investorPayout
  let supplyAmount = 0

  if (taxType === '세금계산서') {
    taxRate = 10
    supplyAmount = investorPayout > 0 ? Math.round(investorPayout / 1.1) : 0
    taxAmount = investorPayout - supplyAmount
    netPayout = investorPayout
  } else if (taxType === '사업소득(3.3%)') {
    taxRate = 3.3
    taxAmount = investorPayout > 0 ? Math.round(investorPayout * taxRate / 100) : 0
    netPayout = investorPayout - taxAmount
  } else if (taxType === '이자소득(27.5%)') {
    taxRate = 27.5
    taxAmount = investorPayout > 0 ? Math.round(investorPayout * taxRate / 100) : 0
    netPayout = investorPayout - taxAmount
  }

  const companyProfit = effectiveDistributable > 0
    ? effectiveDistributable - investorPayout + adminFee
    : adminFee

  return {
    investorPayout,
    netPayout,
    netProfit,
    distributable,
    effectiveDistributable,
    adminFee,
    companyProfit,
    carryOver,
    taxType,
    taxRate,
    taxAmount,
    supplyAmount,
    revenue,
    expense,
    shareRatio,
  }
}
