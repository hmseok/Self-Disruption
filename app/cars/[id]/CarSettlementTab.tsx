'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../utils/supabase'

// ============================================
// 차량별 수익/정산 탭
// 수익배분 정산: 수입 - 비용 = 순수익, (순수익 - 지입비) × share_ratio = 차주 배분금
// 지입비 = 회사가 받는 돈 (수입), 수익배분 계산에 포함
// 미정산 월은 이월되어 누적 표시
// ============================================

interface CarSettlementTabProps {
  carId: string | number
  companyId?: string
  car?: any
}

interface TransactionRow {
  id: number | string
  transaction_date: string
  type: string
  category: string
  client_name: string
  description: string
  amount: number
  payment_method: string
  related_type?: string
  related_id?: string
}

interface SettlementItem {
  id: string
  type: 'jiip' | 'invest' | 'loan'
  name: string
  amount: number
  dueDay: number
  dueDate: string
  status: 'paid' | 'pending'
  relatedId: string
  detail: string
  monthLabel: string
  isOverdue: boolean
  breakdown?: {
    revenue: number
    expense: number
    adminFee: number
    netProfit: number
    distributable: number
    carryOver: number
    effectiveDistributable: number
    shareRatio: number
    investorPayout: number
    companyProfit: number
  }
}

const fmt = (n: number) => n.toLocaleString()
const fmtSign = (n: number) => n > 0 ? `+${fmt(n)}` : fmt(n)

export default function CarSettlementTab({ carId, companyId, car }: CarSettlementTabProps) {
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7))
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [settlementItems, setSettlementItems] = useState<SettlementItem[]>([])
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  useEffect(() => {
    if (!carId) return
    loadAll()
  }, [carId, filterDate])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [year, month] = filterDate.split('-').map(Number)
      const lastDay = new Date(year, month, 0).getDate()
      const startDate = `${filterDate}-01`
      const endDate = `${filterDate}-${lastDay}`
      const past12Start = `${year - 1}-${String(month).padStart(2, '0')}-01`

      const [txRes, queueRes, jiipRes, investRes, loanRes, allSettleRes, carTxHistRes] = await Promise.all([
        // 당월 거래내역
        supabase.from('transactions')
          .select('id, transaction_date, type, category, client_name, description, amount, payment_method, related_type, related_id')
          .eq('related_type', 'car').eq('related_id', String(carId))
          .gte('transaction_date', startDate).lte('transaction_date', endDate)
          .order('transaction_date', { ascending: false }),
        // classification_queue
        supabase.from('classification_queue')
          .select('id, source_data, final_category, final_related_type, final_related_id, status')
          .eq('final_related_type', 'car').eq('final_related_id', String(carId))
          .in('status', ['confirmed', 'auto_confirmed']),
        // 지입 계약
        supabase.from('jiip_contracts')
          .select('id, investor_name, admin_fee, payout_day, share_ratio, contract_start_date, status')
          .eq('car_id', carId).eq('status', 'active'),
        // 투자 계약
        supabase.from('general_investments')
          .select('id, investor_name, invest_amount, interest_rate, payment_day, contract_start_date, status')
          .eq('car_id', carId).eq('status', 'active'),
        // 대출
        supabase.from('loans')
          .select('id, finance_name, type, monthly_payment, payment_date, start_date, end_date')
          .eq('car_id', carId),
        // 전체 정산 거래 (미수 확인용)
        supabase.from('transactions')
          .select('related_type, related_id, transaction_date, amount')
          .in('related_type', ['jiip_share', 'invest', 'loan'])
          .gte('transaction_date', past12Start),
        // 차량 거래 히스토리 (월별 수입/비용 계산용 - category 포함)
        supabase.from('transactions')
          .select('type, amount, transaction_date, category')
          .eq('related_type', 'car').eq('related_id', String(carId))
          .gte('transaction_date', past12Start),
      ])

      // 거래 내역 정리
      const txData = txRes.data || []
      const txIds = new Set(txData.map(t => t.id))
      const queueTx: TransactionRow[] = (queueRes.data || [])
        .filter((q: any) => {
          if (txIds.has(q.id)) return false
          const src = typeof q.source_data === 'string' ? JSON.parse(q.source_data) : (q.source_data || {})
          const txDate = src.transaction_date || src.date || ''
          return txDate >= startDate && txDate <= endDate
        })
        .map((q: any) => {
          const src = typeof q.source_data === 'string' ? JSON.parse(q.source_data) : (q.source_data || {})
          return {
            id: q.id, transaction_date: src.transaction_date || src.date || '',
            type: src.type || 'expense', category: q.final_category || src.category || '기타',
            client_name: src.client_name || src.merchant || '', description: src.description || src.memo || '',
            amount: Math.abs(src.amount || 0), payment_method: src.payment_method || '',
            related_type: 'car', related_id: String(carId),
          }
        })
      setTransactions([...txData, ...queueTx])

      // 정산 계산 제외 카테고리 (차량구입비용은 수익분배비율에 반영됨 → 운영 수입/비용만)
      const EXCLUDE_KW = [
        '차량구입', '구입비', '선납금', '매입', '취득', '매각', '처분',
        '할부', '리스', '대출', '원금', '이자비용',
        '투자', '수익배분', '정산', '배분금',
        '보증금', '지입대금', '지입정산', '초기비용',
        '감가상각', '카드대금',
      ]
      const isExcluded = (cat: string) => EXCLUDE_KW.some(kw => cat.includes(kw))

      // 월별 수입/비용 집계 (운영 수입/비용만)
      const monthlyData: Record<string, { revenue: number; expense: number }> = {}
      ;(carTxHistRes.data || []).forEach((t: any) => {
        if (t.category && isExcluded(t.category)) return // 금융/자본 거래 제외
        const m = t.transaction_date.slice(0, 7)
        if (!monthlyData[m]) monthlyData[m] = { revenue: 0, expense: 0 }
        if (t.type === 'income') monthlyData[m].revenue += Math.abs(t.amount)
        else monthlyData[m].expense += Math.abs(t.amount)
      })

      // ── 월 헬퍼 (N월 마감 → N+1월 지급) ──
      const nextMonthStr = (m: string): string => {
        const [y2, mo2] = m.split('-').map(Number)
        const d2 = new Date(y2, mo2, 1)
        return `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}`
      }
      const prevMonthStr = (m: string): string => {
        const [y2, mo2] = m.split('-').map(Number)
        const d2 = new Date(y2, mo2 - 2, 1)
        return `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}`
      }

      // 정산완료 확인 셋: 정산 거래는 지급월(N+1)에 기록 → 기준월(N)로 변환
      const paidSet = new Set(
        (allSettleRes.data || []).map((t: any) => {
          const txMonth = t.transaction_date.slice(0, 7)
          const baseMonth = prevMonthStr(txMonth)
          return `${t.related_type}_${t.related_id}_${baseMonth}`
        })
      )

      // 기준월 목록 헬퍼 (계약시작월 ~ 선택월의 전월)
      // 선택월 = 지급월, 기준월 = 지급월 - 1 이하
      const getBaseMonths = (contractStart?: string): string[] => {
        const months: string[] = []
        const limitStart = new Date(year - 1, month - 1, 1)
        let start = contractStart ? new Date(contractStart.slice(0, 7) + '-01') : limitStart
        if (start < limitStart) start = limitStart
        const end = new Date(year, month - 2, 1) // 전월 (지급기준)
        const cur = new Date(start.getFullYear(), start.getMonth(), 1)
        while (cur <= end) {
          months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
          cur.setMonth(cur.getMonth() + 1)
        }
        return months
      }

      const items: SettlementItem[] = []

      // ── 지입 수익배분 ──
      // 지입비 = 회사 수입, 배분금 = (순수익 - 지입비) × share_ratio%
      // 일할계산 헬퍼
      const calcProrataFee = (fee: number, contractStartDate: string | undefined, baseMonth: string): number => {
        if (!contractStartDate) return fee
        const startMonth = contractStartDate.slice(0, 7)
        if (baseMonth !== startMonth) return fee
        const startDay = parseInt(contractStartDate.slice(8, 10)) || 1
        const [y2, mo2] = baseMonth.split('-').map(Number)
        const daysInMonth = new Date(y2, mo2, 0).getDate()
        const remainingDays = daysInMonth - startDay + 1
        return Math.floor(fee * remainingDays / daysInMonth)
      }

      const jiipData = jiipRes.data || []
      jiipData.forEach((j: any) => {
        const fullAdminFee = j.admin_fee || 0
        const shareRatio = j.share_ratio || 0
        if (shareRatio === 0) return

        const baseMonths = getBaseMonths(j.contract_start_date)

        // 월별 순차 처리 — 적자 이월 누적
        let carryOver = 0
        baseMonths.forEach(m => {
          const isPaid = paidSet.has(`jiip_share_${j.id}_${m}`)
          const paymentMonth = nextMonthStr(m)
          const isCurrentPayment = paymentMonth === filterDate

          const md = monthlyData[m] || { revenue: 0, expense: 0 }
          const adminFee = calcProrataFee(fullAdminFee, j.contract_start_date, m)
          const netProfit = md.revenue - md.expense
          const distributable = netProfit - adminFee
          const effectiveDistributable = distributable + carryOver

          let investorPayout = 0
          if (effectiveDistributable > 0) {
            investorPayout = Math.floor(effectiveDistributable * (shareRatio / 100))
            carryOver = 0
          } else {
            if (!isPaid) {
              carryOver = effectiveDistributable
            } else {
              carryOver = 0
            }
          }

          if (isPaid && !isCurrentPayment) return

          const dueDay = j.payout_day || 10

          items.push({
            id: `jiip-${j.id}-${m}`, type: 'jiip',
            name: j.investor_name || '지입차주', amount: investorPayout,
            dueDay,
            dueDate: `${paymentMonth}-${dueDay.toString().padStart(2, '0')}`,
            status: isPaid ? 'paid' : 'pending', relatedId: j.id,
            detail: effectiveDistributable > 0
              ? `${m.slice(5)}월분: 배분대상${fmt(effectiveDistributable)}×${shareRatio}%`
              : `${m.slice(5)}월분: 적자${fmt(effectiveDistributable)}`,
            monthLabel: m, isOverdue: !isCurrentPayment && !isPaid,
            breakdown: {
              revenue: md.revenue, expense: md.expense, adminFee,
              netProfit, distributable,
              carryOver: effectiveDistributable - distributable,
              effectiveDistributable,
              shareRatio, investorPayout,
              companyProfit: effectiveDistributable > 0
                ? effectiveDistributable - investorPayout + adminFee
                : adminFee,
            },
          })
        })
      })

      // ── 투자 이자 ──
      const investData = investRes.data || []
      investData.forEach((inv: any) => {
        const amt = inv.invest_amount || 0
        const rate = inv.interest_rate || 0
        const monthlyInterest = Math.floor((amt * (rate / 100)) / 12)
        if (monthlyInterest === 0) return

        const baseMonths = getBaseMonths(inv.contract_start_date)
        // 당월 시작 계약: getBaseMonths가 빈 배열이면 당월을 포함하여 표시
        const contractStartMonth = inv.contract_start_date?.slice(0, 7)
        if (baseMonths.length === 0 && contractStartMonth && contractStartMonth <= filterDate) {
          baseMonths.push(contractStartMonth)
        }

        baseMonths.forEach(m => {
          const isPaid = paidSet.has(`invest_${inv.id}_${m}`)
          const paymentMonth = nextMonthStr(m)
          const isCurrentPayment = paymentMonth === filterDate
          if (isPaid && !isCurrentPayment) return
          const dueDay = inv.payment_day || 10
          const isNextMonthPayment = paymentMonth > filterDate
          items.push({
            id: `invest-${inv.id}-${m}`, type: 'invest',
            name: inv.investor_name || '투자자', amount: monthlyInterest,
            dueDay,
            dueDate: `${paymentMonth}-${dueDay.toString().padStart(2, '0')}`,
            status: isPaid ? 'paid' : 'pending', relatedId: inv.id,
            detail: isNextMonthPayment
              ? `${m.slice(5)}월분 (${paymentMonth.slice(5)}월 지급예정): 원금 ${fmt(amt)}원 × ${rate}% ÷ 12`
              : `${m.slice(5)}월분: 원금 ${fmt(amt)}원 × ${rate}% ÷ 12`,
            monthLabel: m, isOverdue: !isCurrentPayment && !isPaid && !isNextMonthPayment,
          })
        })
      })

      // ── 대출 상환 ──
      const loanData = loanRes.data || []
      loanData.forEach((loan: any) => {
        if (!loan.monthly_payment) return
        const baseMonths = getBaseMonths(loan.start_date)
        const loanEnd = loan.end_date ? loan.end_date.slice(0, 7) : '9999-12'

        // 당월 시작 대출: getBaseMonths가 빈 배열이면 당월 포함
        const loanStartMonth = loan.start_date?.slice(0, 7)
        if (baseMonths.length === 0 && loanStartMonth && loanStartMonth <= filterDate) {
          baseMonths.push(loanStartMonth)
        }

        baseMonths.forEach(m => {
          if (m > loanEnd) return
          const isPaid = paidSet.has(`loan_${loan.id}_${m}`)
          const paymentMonth = nextMonthStr(m)
          const isCurrentPayment = paymentMonth === filterDate
          if (isPaid && !isCurrentPayment) return
          const dueDay = loan.payment_date || 25
          const isNextMonthPayment = paymentMonth > filterDate
          items.push({
            id: `loan-${loan.id}-${m}`, type: 'loan',
            name: loan.finance_name || '금융사', amount: loan.monthly_payment || 0,
            dueDay,
            dueDate: `${paymentMonth}-${dueDay.toString().padStart(2, '0')}`,
            status: isPaid ? 'paid' : 'pending', relatedId: loan.id,
            detail: isNextMonthPayment
              ? `${m.slice(5)}월분 (${paymentMonth.slice(5)}월 상환예정): ${loan.type === '리스' ? '리스료' : '대출 상환'}`
              : `${m.slice(5)}월분: ${loan.type === '리스' ? '리스료' : '대출 상환'}`,
            monthLabel: m, isOverdue: !isCurrentPayment && !isPaid && !isNextMonthPayment,
          })
        })
      })

      items.sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
        return (a.monthLabel || '') < (b.monthLabel || '') ? -1 : 1
      })

      setSettlementItems(items)
    } catch (err) {
      console.error('정산 데이터 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── 월 이동 ──
  const changeMonth = (delta: number) => {
    const [y, m] = filterDate.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setFilterDate(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`)
  }

  // ── 수입/비용 집계 ──
  const summary = useMemo(() => {
    let totalIncome = 0, totalExpense = 0
    const incomeByCategory: Record<string, number> = {}
    const expenseByCategory: Record<string, number> = {}
    transactions.forEach(tx => {
      const amt = Math.abs(tx.amount)
      const cat = tx.category || '기타'
      if (tx.type === 'income') { totalIncome += amt; incomeByCategory[cat] = (incomeByCategory[cat] || 0) + amt }
      else { totalExpense += amt; expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amt }
    })
    return {
      totalIncome, totalExpense, netProfit: totalIncome - totalExpense,
      incomeItems: Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]),
      expenseItems: Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]),
    }
  }, [transactions])

  // ── 정산 집계 ──
  const settleSummary = useMemo(() => {
    const pending = settlementItems.filter(i => i.status === 'pending')
    const paid = settlementItems.filter(i => i.status === 'paid')
    const overdue = settlementItems.filter(i => i.isOverdue)
    return {
      totalAmount: settlementItems.reduce((s, i) => s + i.amount, 0),
      paidCount: paid.length, pendingCount: pending.length,
      paidAmount: paid.reduce((s, i) => s + i.amount, 0),
      pendingAmount: pending.reduce((s, i) => s + i.amount, 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((s, i) => s + i.amount, 0),
    }
  }, [settlementItems])

  // ── 당월 지급 수익배분 계산 (지입계약이 있는 경우) ──
  // 기준월 = 전월 (전월 마감분이 당월에 지급)
  const prevBaseMonth = useMemo(() => {
    const [y, mo] = filterDate.split('-').map(Number)
    const d = new Date(y, mo - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [filterDate])

  const profitDist = useMemo(() => {
    const jiipItem = settlementItems.find(i => i.type === 'jiip' && i.monthLabel === prevBaseMonth && i.breakdown)
    return jiipItem?.breakdown || null
  }, [settlementItems, prevBaseMonth])

  const SETTLE_META: Record<string, { icon: string; label: string }> = {
    jiip: { icon: '🤝', label: '수익배분' },
    invest: { icon: '📈', label: '투자이자' },
    loan: { icon: '🏦', label: '대출상환' },
  }

  const [displayYear, displayMonth] = filterDate.split('-').map(Number)
  const monthLabel = `${displayYear}년 ${displayMonth}월`

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-3 border-gray-300 border-t-steel-600 rounded-full mx-auto mb-3"></div>
          <p className="text-gray-400 text-sm font-medium">정산 데이터 로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">

      {/* 월 선택기 */}
      <div className="flex items-center justify-between">
        <button onClick={() => changeMonth(-1)}
          className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-bold transition-all">
          ← 이전달
        </button>
        <h3 className="text-lg font-black text-gray-800">{monthLabel}</h3>
        <button onClick={() => changeMonth(1)}
          className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-bold transition-all">
          다음달 →
        </button>
      </div>

      {/* 수익배분 정산 구조 (지입계약이 있는 경우) */}
      {profitDist && profitDist.shareRatio > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <span className="text-lg">📊</span>
            <h4 className="font-bold text-gray-800">{prevBaseMonth.split('-')[1]}월분 수익배분 → {monthLabel} 지급</h4>
            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold ml-auto">
              배분비율 {profitDist.shareRatio}%
            </span>
          </div>
          <div className="p-5 space-y-2">
            <div className="flex justify-between py-1.5">
              <span className="text-sm text-gray-600">💰 차량 수입</span>
              <span className="font-black text-blue-600">{fmt(profitDist.revenue)}원</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-sm text-gray-600">📉 차량 비용 (유지비 등)</span>
              <span className="font-bold text-red-500">-{fmt(profitDist.expense)}원</span>
            </div>
            <div className="border-t border-dashed border-gray-200 my-1"></div>
            <div className="flex justify-between py-1.5">
              <span className="text-sm font-bold text-gray-700">순수익</span>
              <span className={`font-bold ${profitDist.netProfit > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                {fmt(profitDist.netProfit)}원
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-sm text-gray-600">🤝 지입비 (회사 수입)</span>
              <span className="font-bold text-orange-600">-{fmt(profitDist.adminFee)}원</span>
            </div>
            <div className="border-t border-dashed border-gray-200 my-1"></div>
            <div className={`flex justify-between py-2 px-3 rounded-xl ${profitDist.distributable >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <span className="text-sm font-bold text-gray-700">당월 배분대상</span>
              <span className={`text-lg font-black ${profitDist.distributable >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {fmtSign(profitDist.distributable)}원
              </span>
            </div>
            {profitDist.carryOver !== 0 && (
              <div className="flex justify-between py-1.5 px-3 bg-red-50 rounded-xl">
                <span className="text-sm font-bold text-red-600">전월 이월 적자</span>
                <span className="font-bold text-red-600">{fmtSign(profitDist.carryOver)}원</span>
              </div>
            )}
            {profitDist.carryOver !== 0 && (
              <div className={`flex justify-between py-2 px-3 rounded-xl ${profitDist.effectiveDistributable >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <span className="text-sm font-bold text-gray-700">실제 배분대상 (당월+이월)</span>
                <span className={`text-lg font-black ${profitDist.effectiveDistributable >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {fmtSign(profitDist.effectiveDistributable)}원
                </span>
              </div>
            )}
            {profitDist.effectiveDistributable > 0 ? (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-purple-600 font-bold mb-1">차주 배분 ({profitDist.shareRatio}%)</p>
                  <p className="text-lg font-black text-purple-700">{fmt(profitDist.investorPayout)}원</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-blue-600 font-bold mb-1">회사 수익</p>
                  <p className="text-lg font-black text-blue-700">{fmt(profitDist.companyProfit)}원</p>
                </div>
              </div>
            ) : profitDist.effectiveDistributable < 0 ? (
              <div className="bg-red-50 rounded-xl p-3 text-center mt-2">
                <p className="text-xs text-red-600 font-bold">적자 → 다음 달 이월</p>
                <p className="text-lg font-black text-red-600">{fmt(profitDist.effectiveDistributable)}원</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-2">배분대상 수익이 없어 수익배분이 발생하지 않습니다</p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs text-gray-400 font-bold mb-1">💰 총 수입</p>
            <p className="text-2xl font-black text-blue-600">{fmt(summary.totalIncome)}원</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs text-gray-400 font-bold mb-1">📉 총 비용</p>
            <p className="text-2xl font-black text-red-500">{fmt(summary.totalExpense)}원</p>
          </div>
          <div className={`rounded-2xl border p-5 shadow-sm ${summary.netProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <p className="text-xs text-gray-400 font-bold mb-1">{summary.netProfit >= 0 ? '📈' : '📉'} 순이익</p>
            <p className={`text-2xl font-black ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.netProfit >= 0 ? '+' : ''}{fmt(summary.netProfit)}원
            </p>
          </div>
        </div>
      )}

      {/* 지급 현황 (미수 누적 포함) */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">💳</span>
            <h4 className="font-bold text-gray-800">지급 현황</h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {settleSummary.overdueCount > 0 && (
              <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-bold">
                이월 {settleSummary.overdueCount}건 · {fmt(settleSummary.overdueAmount)}원
              </span>
            )}
            {settleSummary.pendingCount - settleSummary.overdueCount > 0 && (
              <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-bold">
                당월 미지급 {settleSummary.pendingCount - settleSummary.overdueCount}건
              </span>
            )}
            {settleSummary.paidCount > 0 && (
              <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-bold">
                완료 {settleSummary.paidCount}건
              </span>
            )}
          </div>
        </div>

        {settlementItems.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            <div className="text-4xl mb-3">💳</div>
            <p className="font-bold text-gray-500">이 차량에 연결된 정산 항목이 없습니다</p>
            <p className="text-xs mt-1">지입 계약, 투자 계약, 대출을 등록하면 여기에 표시됩니다.</p>
          </div>
        ) : (
          <div>
            {(['jiip', 'invest', 'loan'] as const).map(type => {
              const typeItems = settlementItems.filter(i => i.type === type)
              if (typeItems.length === 0) return null
              const meta = SETTLE_META[type]
              const typeTotal = typeItems.reduce((s, i) => s + i.amount, 0)
              const typePending = typeItems.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0)

              return (
                <div key={type}>
                  <div className="px-5 py-3 bg-gray-50/80 flex items-center gap-2 border-t border-gray-100">
                    <span className="text-base">{meta.icon}</span>
                    <span className="text-sm font-bold text-gray-600">{meta.label}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {typeItems.length}건 · 미지급 {fmt(typePending)}원
                    </span>
                  </div>
                  {typeItems.map(item => {
                    const isPaid = item.status === 'paid'
                    const isExpanded = expandedItem === item.id

                    return (
                      <div key={item.id} className={`${item.isOverdue ? 'bg-red-50/30' : ''}`}>
                        <button
                          onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                          className="w-full px-5 py-3.5 flex items-center gap-2 hover:bg-gray-50 transition-colors text-left"
                        >
                          {item.isOverdue && (
                            <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold">이월</span>
                          )}
                          <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold">
                            {item.monthLabel.slice(5)}월
                          </span>
                          <span className="text-sm font-bold text-gray-800 flex-1">{item.name}</span>
                          <span className="text-xs text-gray-400 hidden md:inline max-w-[180px] truncate">{item.detail}</span>
                          <span className="text-sm font-bold text-gray-800 shrink-0">{fmt(item.amount)}원</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            isPaid ? 'bg-green-100 text-green-700' :
                            item.isOverdue ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {isPaid ? '✅ 완료' : item.isOverdue ? '🚨 미수' : '⏳ 미지급'}
                          </span>
                          {item.breakdown && <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>}
                        </button>

                        {isExpanded && item.breakdown && (
                          <div className="mx-5 mb-3 bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 border border-gray-100">
                            <p className="text-xs font-bold text-gray-500 mb-2">📊 {item.monthLabel?.slice(5)}월분 수익배분 상세</p>
                            <div className="flex justify-between">
                              <span className="text-gray-600">차량 수입</span>
                              <span className="font-bold text-blue-600">{fmt(item.breakdown.revenue)}원</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">차량 비용</span>
                              <span className="font-bold text-red-500">-{fmt(item.breakdown.expense)}원</span>
                            </div>
                            <div className="border-t border-dashed border-gray-200 my-1"></div>
                            <div className="flex justify-between">
                              <span className="font-bold text-gray-700">순수익</span>
                              <span className={`font-bold ${item.breakdown.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {fmtSign(item.breakdown.netProfit)}원
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">지입비 (회사 수입)</span>
                              <span className="font-bold text-orange-600">-{fmt(item.breakdown.adminFee)}원</span>
                            </div>
                            <div className="border-t border-dashed border-gray-200 my-1"></div>
                            <div className="flex justify-between">
                              <span className="font-bold text-gray-700">당월 배분대상</span>
                              <span className={`font-bold ${item.breakdown.distributable >= 0 ? 'text-gray-800' : 'text-red-500'}`}>
                                {fmtSign(item.breakdown.distributable)}원
                              </span>
                            </div>
                            {item.breakdown.carryOver !== 0 && (
                              <div className="flex justify-between bg-red-50 rounded-lg px-2 py-1">
                                <span className="text-red-600 font-bold text-xs">전월 이월 적자</span>
                                <span className="font-bold text-red-600">{fmtSign(item.breakdown.carryOver)}원</span>
                              </div>
                            )}
                            {item.breakdown.carryOver !== 0 && (
                              <div className="flex justify-between">
                                <span className="font-bold text-gray-700">실제 배분대상</span>
                                <span className={`font-bold ${item.breakdown.effectiveDistributable >= 0 ? 'text-gray-800' : 'text-red-500'}`}>
                                  {fmtSign(item.breakdown.effectiveDistributable)}원
                                </span>
                              </div>
                            )}
                            {item.breakdown.effectiveDistributable > 0 ? (
                              <div className="flex justify-between bg-purple-50 rounded-lg px-2 py-1.5">
                                <span className="text-purple-700 font-bold">차주 배분 ({item.breakdown.shareRatio}%)</span>
                                <span className="font-black text-purple-700">{fmt(item.breakdown.investorPayout)}원</span>
                              </div>
                            ) : (
                              <div className="bg-red-50 rounded-lg px-2 py-1.5 text-center">
                                <span className="text-red-600 font-bold text-xs">적자 → 다음 달 이월</span>
                              </div>
                            )}
                          </div>
                        )}

                        {isExpanded && item.type === 'invest' && (
                          <div className="mx-5 mb-3 bg-blue-50 rounded-xl p-4 text-sm border border-blue-100">
                            <p className="text-xs font-bold text-blue-600 mb-1">💰 투자이자 계산</p>
                            <p className="text-gray-700">{item.detail}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {settleSummary.pendingAmount > 0 && (
              <div className="px-5 py-4 bg-amber-50 border-t border-amber-100 flex items-center justify-between">
                <span className="text-sm font-bold text-amber-800">총 미지급 합계 (이월 + 당월)</span>
                <span className="text-lg font-black text-amber-800">{fmt(settleSummary.pendingAmount)}원</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 수입 내역 */}
      {summary.incomeItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <span className="text-lg">💰</span>
            <h4 className="font-bold text-gray-800">수입 내역</h4>
            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold ml-auto">{fmt(summary.totalIncome)}원</span>
          </div>
          <div className="divide-y divide-gray-50">
            {summary.incomeItems.map(([cat, amt]) => (
              <div key={cat} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <span className="text-sm text-gray-700">{cat}</span>
                <span className="text-sm font-bold text-blue-600">{fmt(amt)}원</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 비용 내역 */}
      {summary.expenseItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <span className="text-lg">📉</span>
            <h4 className="font-bold text-gray-800">비용 내역</h4>
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold ml-auto">{fmt(summary.totalExpense)}원</span>
          </div>
          <div className="divide-y divide-gray-50">
            {summary.expenseItems.map(([cat, amt]) => (
              <div key={cat} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <span className="text-sm text-gray-700">{cat}</span>
                <span className="text-sm font-bold text-red-500">{fmt(amt)}원</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 거래 내역 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <span className="text-lg">📋</span>
          <h4 className="font-bold text-gray-800">거래 내역</h4>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold ml-auto">총 {transactions.length}건</span>
        </div>
        {transactions.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">해당 월 거래 내역이 없습니다</div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
            {transactions.map(tx => {
              const isIncome = tx.type === 'income'
              return (
                <div key={tx.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                  <span className="text-xs text-gray-400 w-20 shrink-0">{tx.transaction_date?.slice(0, 10)}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isIncome ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-500'}`}>
                    {isIncome ? '수입' : '지출'}
                  </span>
                  <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{tx.category}</span>
                  <span className="flex-1 text-sm text-gray-700 truncate">{tx.client_name || tx.description}</span>
                  <span className={`text-sm font-bold ${isIncome ? 'text-blue-600' : 'text-red-500'}`}>
                    {isIncome ? '+' : '-'}{fmt(Math.abs(tx.amount))}원
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
