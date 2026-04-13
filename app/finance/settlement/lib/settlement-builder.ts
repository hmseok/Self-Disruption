// ============================================
// 투자자 정산 시스템 — 정산 항목 빌더
// buildSettlementItems: 순수 함수로 추출
// 지입/투자/대출 정산 항목 생성 + 미수 누적 + 정산완료 추적
// ============================================

import type { Transaction, SettlementItem, JiipContract, InvestContract, LoanContract, InvestDeposit, ShareHistoryItem } from './types'
import type { InvestTxDeposit } from './investment-calc'
import { nf } from './utils'
import { nextMonthStr, prevMonthStr, getBaseMonths, calcProrataFee } from './date-utils'
import { buildCarMonthData, calcJiipSettlement } from './jiip-calc'
import { getInvestBalance, getInvestBalanceWithDaily } from './investment-calc'
import { calculateTax } from './tax-calc'

export type BuildSettlementParams = {
  jiipData: JiipContract[]
  investData: InvestContract[]
  loanData: LoanContract[]
  selectedMonth: string
  allSettleTxs: Transaction[]
  carTxs: Transaction[]
  shareHistory: ShareHistoryItem[]
  investDeposits: InvestDeposit[]
  investTxDeposits: InvestTxDeposit[]
}

export function buildSettlementItems(params: BuildSettlementParams): SettlementItem[] {
  const {
    jiipData, investData, loanData, selectedMonth,
    allSettleTxs, carTxs, shareHistory,
    investDeposits, investTxDeposits,
  } = params

  const [selYear, selMonth] = selectedMonth.split('-').map(Number)

  // ── paidMap: 정산완료 확인 ──
  // 정산 거래는 지급월(N+1)에 기록됨 → 기준월(N)로 변환
  const paidMap = new Map<string, string[]>()
  allSettleTxs.forEach(t => {
    const txMonth = t.transaction_date.slice(0, 7)
    const baseMonth = prevMonthStr(txMonth)
    const key = `${t.related_type}_${t.related_id}_${baseMonth}`
    const existing = paidMap.get(key) || []
    existing.push(t.id)
    paidMap.set(key, existing)
  })

  // shareHistory 기반 지급완료 확인
  const paidNameSet = new Set<string>()
  shareHistory.forEach(sh => {
    if (sh.paid_at) paidNameSet.add(sh.recipient_name)
  })

  const isPaidCheck = (key: string) => paidMap.has(key)

  // 차량별 월별 수입/비용
  const carMonthData = buildCarMonthData(carTxs)

  const items: SettlementItem[] = []

  // ══════════════════════════════════════
  // 1. 지입 수익배분
  // ══════════════════════════════════════
  jiipData.forEach(j => {
    const fullAdminFee = j.admin_fee || 0
    const shareRatio = j.share_ratio || 0
    if (shareRatio === 0) return

    const baseMonths = getBaseMonths(j.contract_start_date?.slice(0, 7), selYear, selMonth)

    let carryOver = 0
    baseMonths.forEach(m => {
      const isPaid = isPaidCheck(`jiip_share_${j.id}_${m}`) || paidNameSet.has(j.investor_name)
      const paymentMonth = nextMonthStr(m)
      const isCurrentPayment = paymentMonth === selectedMonth

      const carKey = `${j.car_id}_${m}`
      const cd = carMonthData[carKey] || { revenue: 0, expense: 0 }
      const adminFee = calcProrataFee(fullAdminFee, j.contract_start_date, m)
      const isProrated = adminFee !== fullAdminFee
      const taxType = j.tax_type || '세금계산서'

      const result = calcJiipSettlement(
        cd.revenue, cd.expense, adminFee, shareRatio, carryOver, taxType, isPaid
      )
      carryOver = result.carryOver

      // 이미 지급 완료된 이전 기준월은 건너뜀
      if (isPaid && !isCurrentPayment) return

      const dueDay = j.payout_day || 10
      const carryNote = carryOver < 0 && result.effectiveDistributable <= 0 ? ` [이월: ${nf(carryOver)}]` : ''
      const isOverdue = !isCurrentPayment && !isPaid
      const actualDueMonth = isOverdue ? selectedMonth : paymentMonth

      items.push({
        id: `jiip-${j.id}-${m}`,
        type: 'jiip',
        name: j.investor_name,
        amount: result.netPayout,
        dueDay,
        dueDate: `${actualDueMonth}-${dueDay.toString().padStart(2, '0')}`,
        status: isPaid ? 'paid' : 'pending',
        relatedId: j.id,
        paidTxIds: isPaid ? paidMap.get(`jiip_share_${j.id}_${m}`) : undefined,
        detail: result.effectiveDistributable > 0
          ? `${m.slice(5)}월분: 배분대상${nf(result.effectiveDistributable)}×${shareRatio}%`
          : `${m.slice(5)}월분: 적자${nf(result.effectiveDistributable)}${carryNote}`,
        carNumber: j.cars?.number,
        carModel: j.cars?.model,
        carId: j.car_id ? String(j.car_id) : undefined,
        monthLabel: m,
        isOverdue,
        breakdown: {
          revenue: cd.revenue,
          expense: cd.expense,
          adminFee,
          netProfit: result.netProfit,
          distributable: result.distributable,
          carryOver: result.effectiveDistributable - result.distributable,
          effectiveDistributable: result.effectiveDistributable,
          shareRatio,
          investorPayout: result.investorPayout,
          companyProfit: result.companyProfit,
          taxType: result.taxType,
          taxRate: result.taxRate,
          taxAmount: result.taxAmount,
          supplyAmount: result.supplyAmount,
          netPayout: result.netPayout,
        },
      })
    })
  })

  // ══════════════════════════════════════
  // 2. 투자 이자
  // ══════════════════════════════════════
  investData.forEach(inv => {
    const rate = inv.interest_rate || 0
    if (rate === 0) return

    const baseMonths = getBaseMonths(inv.contract_start_date?.slice(0, 7), selYear, selMonth)
    const contractStartMonth = inv.contract_start_date?.slice(0, 7)
    if (baseMonths.length === 0 && contractStartMonth && contractStartMonth <= selectedMonth) {
      baseMonths.push(contractStartMonth)
    }

    const taxType = inv.tax_type || '이자소득(27.5%)'

    baseMonths.forEach(m => {
      const isPaid = isPaidCheck(`invest_${inv.id}_${m}`) || paidNameSet.has(inv.investor_name)
      const paymentMonth = nextMonthStr(m)
      const isCurrentPayment = paymentMonth === selectedMonth

      const currentBalance = getInvestBalance(
        String(inv.id), m, inv.invest_amount || 0,
        investDeposits, investTxDeposits,
        inv.contract_start_date, inv.grace_period_months
      )
      const monthlyInterest = Math.floor((currentBalance * (rate / 100)) / 12)
      if (monthlyInterest === 0) return

      const tax = calculateTax(monthlyInterest, taxType)
      const dueDay = inv.payment_day || 10
      const isNextMonthPayment = paymentMonth > selectedMonth
      const isOverdueInv = !isCurrentPayment && !isPaid && !isNextMonthPayment
      const actualDueMonthInv = isOverdueInv ? selectedMonth : paymentMonth
      const displayAmount = tax.netPayout

      // 상세 정보용 잔액 조회
      const balDetail = getInvestBalanceWithDaily(
        String(inv.id), m, inv.invest_amount || 0,
        investDeposits, investTxDeposits,
        inv.contract_start_date, inv.grace_period_months
      )
      const balanceNote = balDetail.hasDepositData
        ? `가중평균잔액 ${nf(currentBalance)}원 (월말잔액 ${nf(balDetail.balance)}원)`
        : `원금 ${nf(currentBalance)}원`
      const prefix = isNextMonthPayment ? `${m.slice(5)}월분 (${paymentMonth.slice(5)}월 지급예정)` : `${m.slice(5)}월분`

      items.push({
        id: `invest-${inv.id}-${m}`,
        type: 'invest',
        name: inv.investor_name,
        amount: displayAmount,
        dueDay,
        dueDate: `${actualDueMonthInv}-${dueDay.toString().padStart(2, '0')}`,
        status: isPaid ? 'paid' : 'pending',
        relatedId: String(inv.id),
        paidTxIds: isPaid ? paidMap.get(`invest_${inv.id}_${m}`) : undefined,
        detail: `${prefix}: ${balanceNote} × ${rate}% ÷ 12`,
        carNumber: inv.car_number,
        carId: inv.car_id,
        monthLabel: m,
        isOverdue: isOverdueInv,
        breakdown: {
          revenue: currentBalance,
          expense: 0,
          adminFee: 0,
          netProfit: monthlyInterest,
          distributable: monthlyInterest,
          carryOver: 0,
          effectiveDistributable: monthlyInterest,
          shareRatio: rate,
          investorPayout: monthlyInterest,
          companyProfit: 0,
          taxType: tax.taxType,
          taxRate: tax.taxRate,
          taxAmount: tax.taxAmount,
          supplyAmount: tax.supplyAmount,
          netPayout: tax.netPayout,
        },
      })
    })
  })

  // ══════════════════════════════════════
  // 3. 대출 상환
  // ══════════════════════════════════════
  loanData.forEach(loan => {
    if (!loan.monthly_payment) return
    const baseMonths = getBaseMonths(loan.start_date?.slice(0, 7), selYear, selMonth)
    const endDate = loan.end_date ? loan.end_date.slice(0, 7) : '9999-12'

    const loanStartMonth = loan.start_date?.slice(0, 7)
    if (baseMonths.length === 0 && loanStartMonth && loanStartMonth <= selectedMonth) {
      baseMonths.push(loanStartMonth)
    }

    baseMonths.forEach(m => {
      if (m > endDate) return
      const isPaid = isPaidCheck(`loan_${loan.id}_${m}`)
      const paymentMonth = nextMonthStr(m)
      const isCurrentPayment = paymentMonth === selectedMonth
      if (isPaid && !isCurrentPayment) return

      const dueDay = loan.payment_date || 25
      const isNextMonthPayment = paymentMonth > selectedMonth
      const isOverdueLoan = !isCurrentPayment && !isPaid && !isNextMonthPayment
      const actualDueMonthLoan = isOverdueLoan ? selectedMonth : paymentMonth
      items.push({
        id: `loan-${loan.id}-${m}`,
        type: 'loan',
        name: loan.finance_name,
        amount: loan.monthly_payment || 0,
        dueDay,
        dueDate: `${actualDueMonthLoan}-${dueDay.toString().padStart(2, '0')}`,
        status: isPaid ? 'paid' : 'pending',
        relatedId: loan.id,
        paidTxIds: isPaid ? paidMap.get(`loan_${loan.id}_${m}`) : undefined,
        detail: isNextMonthPayment
          ? `${m.slice(5)}월분 (${paymentMonth.slice(5)}월 상환예정): ${loan.type === '리스' ? '리스료' : '대출 상환금'}`
          : `${m.slice(5)}월분: ${loan.type === '리스' ? '리스료' : '대출 상환금'}`,
        carNumber: loan.cars?.number,
        monthLabel: m,
        isOverdue: isOverdueLoan,
      })
    })
  })

  // ── 정렬: 미수 우선 → 미정산 → 정산완료, 날짜순 ──
  items.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
    if (a.monthLabel !== b.monthLabel) return (a.monthLabel || '') < (b.monthLabel || '') ? -1 : 1
    return a.dueDay - b.dueDay
  })

  return items
}
