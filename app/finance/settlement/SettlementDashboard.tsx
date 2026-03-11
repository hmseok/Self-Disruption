'use client'

import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useEffect, useState, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'

// ============================================
// 타입 정의
// ============================================
type Transaction = {
  id: string
  transaction_date: string
  type: 'income' | 'expense'
  status: 'completed' | 'pending'
  category: string
  client_name: string
  description: string
  amount: number
  payment_method: string
  related_type?: string
  related_id?: string
  company_id: string
}

type SettlementItem = {
  id: string
  type: 'jiip' | 'invest' | 'loan'
  name: string
  amount: number
  dueDay: number
  dueDate: string
  status: 'pending' | 'approved' | 'paid'
  relatedId: string
  detail: string
  carNumber?: string
  carModel?: string            // 차종 (모델명)
  carId?: string               // 차량 ID (통장 내역 필터링용)
  monthLabel?: string          // 기준월 (미수 누적 시 과거 월 표시)
  isOverdue?: boolean          // 이전 월 미수 여부
  breakdown?: {                // 지입 정산 상세 내역
    revenue: number
    expense: number
    adminFee: number
    netProfit: number          // 순수익 = 수입 - 비용
    distributable: number      // 당월 배분대상 = 순수익 - 지입비
    carryOver: number          // 전월 이월 적자
    effectiveDistributable: number // 실제 배분대상 = 배분대상 + 이월
    shareRatio: number
    investorPayout: number     // 차주 배분금
    companyProfit: number      // 회사 수익
  }
}

type JiipContract = {
  id: string
  investor_name: string
  admin_fee: number
  share_ratio: number
  payout_day: number
  contract_start_date?: string
  status: string
  car_id: string
  cars?: { number: string }
}

type InvestContract = {
  id: string
  investor_name: string
  invest_amount: number
  interest_rate: number
  payment_day: number
  contract_start_date?: string
  status: string
  car_id?: string
  car_number?: string
}

// InvestContract는 위의 InvestContract로 대체됨

type LoanContract = {
  id: string
  finance_name: string
  type: string
  monthly_payment: number
  payment_date: number
  start_date: string
  end_date: string
  status: string
  cars?: { number: string }
}

type ClassifiedItem = {
  id: string
  source_data: {
    transaction_date?: string
    client_name?: string
    description?: string
    amount?: number
    type?: string
    payment_method?: string
  }
  ai_category?: string
  ai_confidence?: number
  ai_related_type?: string
  ai_related_id?: string
  final_category?: string
  final_related_type?: string
  final_related_id?: string
  status: string
  created_at: string
  reviewed_at?: string
}

// ============================================
// 카테고리 그룹핑 (손익계산서용)
// ============================================
const INCOME_GROUPS: Record<string, string[]> = {
  '영업수입': ['렌트/운송수입', '관리비수입', '렌트수입', '운송수입', '매출'],
  '지입수입': ['지입 관리비/수수료', '지입료', '관리비', '수수료'],
  '금융수입': ['이자/잡이익', '이자수입', '환급', '캐시백'],
  '자본유입': ['투자원금 입금', '지입 초기비용/보증금', '대출 실행(입금)', '보증금', '투자'],
}

const EXPENSE_GROUPS: Record<string, string[]> = {
  '지입/운송원가': ['지입 수익배분금(출금)', '수익배분', '정산금', '배분금', '지입정산금', '지입대금'],
  '차량유지비': ['유류비', '정비/수리비', '차량보험료', '자동차세/공과금', '보험료'],
  '금융비용': ['차량할부/리스료', '이자비용(대출/투자)', '원금상환', '대출원리금', '리스료', '투자이자', '차량할부금'],
  '인건비': ['급여(정규직)', '용역비(3.3%)', '급여', '용역비'],
  '일반관리비': ['복리후생(식대)', '임차료/사무실', '통신/소모품', '관리비', '사무비'],
}

function categorizeAmount(category: string, groups: Record<string, string[]>): string {
  for (const [groupName, keywords] of Object.entries(groups)) {
    if (keywords.some(k => category.includes(k) || k.includes(category))) {
      return groupName
    }
  }
  return '기타'
}

// ============================================
// 숫자 포맷
// ============================================
const nf = (num: number) => num ? num.toLocaleString() : '0'
const nfSign = (num: number) => num > 0 ? `+${nf(num)}` : nf(num)

// ============================================
// 메인 컴포넌트
// ============================================
export default function SettlementDashboard() {
  const router = useRouter()
  const { company, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // 상태
  const [activeTab, setActiveTab] = useState<'revenue' | 'settlement' | 'pnl' | 'execute' | 'classify'>('revenue')
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)

  // 데이터
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [jiips, setJiips] = useState<JiipContract[]>([])
  const [investors, setInvestors] = useState<InvestContract[]>([])
  const [loans, setLoans] = useState<LoanContract[]>([])
  const [settlementItems, setSettlementItems] = useState<SettlementItem[]>([])
  const [carTxHistory, setCarTxHistory] = useState<{ related_id: string; type: string; amount: number; transaction_date: string; category?: string; client_name?: string; description?: string }[]>([])
  const [classifiedItems, setClassifiedItems] = useState<ClassifiedItem[]>([])
  const [shareHistory, setShareHistory] = useState<{ id: string; recipient_name: string; recipient_phone: string; settlement_month: string; total_amount: number; created_at: string; paid_at: string | null }[]>([])

  // 정산 실행 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [executing, setExecuting] = useState(false)
  const [sendingNotify, setSendingNotify] = useState(false)
  const [notifyChannel, setNotifyChannel] = useState<'sms' | 'email'>('sms')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  // SMS 발송 확인 모달 — 수신자별 1건 통합
  type SmsRecipient = {
    key: string           // relatedId (그룹핑 키)
    name: string
    phone: string
    email: string
    totalAmount: number
    items: {
      type: 'jiip' | 'invest'
      monthLabel: string  // 기준월 (예: 2026-02)
      amount: number
      detail: string
      relatedId: string
      dueDate: string
      carNumber?: string
      carModel?: string
      carId?: string
      breakdown?: SettlementItem['breakdown']
    }[]
    message: string
    shareUrl?: string     // 상세 링크 URL
    bankInfo?: { bank_name: string; account_holder: string; account_number: string }
  }
  const [smsModal, setSmsModal] = useState<{
    open: boolean
    recipients: SmsRecipient[]
    customNote: string    // 사용자 추가 메시지
    loading: boolean
  }>({ open: false, recipients: [], customNote: '', loading: false })

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ============================================
  // 데이터 로드
  // ============================================
  const pathname = usePathname()

  useEffect(() => {
    fetchAllData()
  }, [filterDate, company, adminSelectedCompanyId, pathname])

  // 탭 포커스 시 자동 새로고침
  useEffect(() => {
    const onFocus = () => fetchAllData()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [filterDate, company, adminSelectedCompanyId])

  const fetchAllData = async () => {
    if (!effectiveCompanyId && role !== 'god_admin') return
    setLoading(true)

    const [year, month] = filterDate.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const startDate = `${filterDate}-01`
    const endDate = `${filterDate}-${lastDay}`

    // 과거 12개월 시작일 (미수 누적 확인용)
    const past12Start = `${year - 1}-${String(month).padStart(2, '0')}-01`

    // 병렬 로드
    const [txRes, jiipRes, investRes, loanRes, allSettleRes, carTxRes, classifyRes, shareHistoryRes] = await Promise.all([
      // 거래 내역 (당월)
      (() => {
        let q = supabase.from('transactions').select('*')
        if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
        return q.gte('transaction_date', startDate).lte('transaction_date', endDate)
          .order('transaction_date', { ascending: false })
      })(),
      // 지입 계약 (contract_start_date 포함)
      (() => {
        let q = supabase.from('jiip_contracts').select('*, cars(number, model)').eq('status', 'active')
        if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
        return q
      })(),
      // 투자자 (cars 조인 없이 — general_investments에 car_id FK 없을 수 있음)
      (() => {
        let q = supabase.from('general_investments').select('*').eq('status', 'active')
        if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
        return q
      })(),
      // 대출
      (() => {
        let q = supabase.from('loans').select('*, cars(number)')
        if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
        return q
      })(),
      // 전체 정산 거래 (미수 누적 확인용 — 최근 12개월)
      (() => {
        let q = supabase.from('transactions').select('related_type, related_id, transaction_date, amount')
          .in('related_type', ['jiip_share', 'invest', 'loan'])
        if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
        return q.gte('transaction_date', past12Start)
      })(),
      // 차량별 거래 내역 (최근 12개월 — 지입 수익배분 계산용)
      (() => {
        let q = supabase.from('transactions').select('related_type, related_id, type, amount, transaction_date, category, client_name, description')
          .eq('related_type', 'car')
        if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
        return q.gte('transaction_date', past12Start)
      })(),
      // 통장분류 내역 (당월 confirmed 건)
      (() => {
        let q = supabase.from('classification_queue').select('*')
          .in('status', ['confirmed', 'auto_confirmed'])
        if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
        return q.order('created_at', { ascending: false }).limit(500)
      })(),
      // 정산 발송 이력 (당월)
      (() => {
        let q = supabase.from('settlement_shares')
          .select('id, recipient_name, recipient_phone, settlement_month, total_amount, created_at, paid_at')
        if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
        return q.eq('settlement_month', filterDate).order('created_at', { ascending: false })
      })(),
    ])

    const txs = txRes.data || []
    const jiipData = jiipRes.data || []
    const investData = investRes.data || []
    const loanData = loanRes.data || []
    const allSettleTxs = allSettleRes.data || []
    const carTxs = carTxRes.data || []
    const classifyData = (classifyRes.data || []) as ClassifiedItem[]
    setShareHistory(shareHistoryRes.data || [])

    // 디버그: 투자/대출 데이터 확인
    console.log('[Settlement] investData:', investData.map(i => ({
      id: i.id, name: i.investor_name, amount: i.invest_amount, rate: i.interest_rate,
      startDate: i.contract_start_date, status: i.status,
    })))
    console.log('[Settlement] loanData:', loanData.map(l => ({
      id: l.id, name: l.finance_name, monthly: l.monthly_payment,
      startDate: l.start_date, status: l.status,
    })))

    setTransactions(txs)
    setJiips(jiipData)
    setInvestors(investData)
    setLoans(loanData)
    setCarTxHistory(carTxs)
    setClassifiedItems(classifyData)

    // 정산 항목 생성 (미수 누적 포함)
    buildSettlementItems(jiipData, investData, loanData, filterDate, allSettleTxs, carTxs)
    setLoading(false)
  }

  // ============================================
  // 정산 항목 빌드 (미수 누적 포함)
  // ============================================
  const buildSettlementItems = (
    jiipData: JiipContract[],
    investData: InvestContract[],
    loanData: LoanContract[],
    selectedMonth: string,
    allSettleTxs: { related_type: string; related_id: string; transaction_date: string; amount: number }[],
    carTxs: { related_type: string; related_id: string; type: string; amount: number; transaction_date: string; category?: string }[]
  ) => {
    const [selYear, selMonth] = selectedMonth.split('-').map(Number)

    // ── 월 헬퍼 ──
    // N월 마감 → N+1월 지급 기준
    const nextMonthStr = (m: string): string => {
      const [y, mo] = m.split('-').map(Number)
      const d = new Date(y, mo, 1) // JS 0-indexed → mo(1-indexed)가 다음 달
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const prevMonthStr = (m: string): string => {
      const [y, mo] = m.split('-').map(Number)
      const d = new Date(y, mo - 2, 1) // mo-2: 이전 달
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }

    // 정산완료 확인: 정산 거래는 지급월(N+1)에 기록됨 → 기준월(N)로 변환
    // `${related_type}_${related_id}_${기준월}` 형태
    const paidSet = new Set(
      allSettleTxs.map(t => {
        const txMonth = t.transaction_date.slice(0, 7)
        const baseMonth = prevMonthStr(txMonth)
        return `${t.related_type}_${t.related_id}_${baseMonth}`
      })
    )

    // ── 정산 계산 제외 카테고리 ──
    // 차량구입비용은 이미 수익분배비율에 반영됨 → 운영 수입/비용만 포함
    const EXCLUDE_KEYWORDS = [
      // 차량 구입/취득 관련
      '차량구입', '구입비', '선납금', '매입', '취득', '매각', '처분',
      // 금융/대출 관련
      '할부', '리스', '대출', '원금', '이자비용',
      // 투자/배분 관련
      '투자', '수익배분', '정산', '배분금',
      // 보증금/초기비용
      '보증금', '지입대금', '지입정산', '초기비용',
      // 기타 비운영
      '감가상각', '카드대금',
    ]
    const isExcludedCategory = (category: string) =>
      EXCLUDE_KEYWORDS.some(kw => category.includes(kw))

    // 차량별 월별 수입/비용 집계 (운영 수입/비용만)
    const carMonthData: Record<string, { revenue: number; expense: number }> = {}
    const excludedTxs: { category: string; amount: number; type: string }[] = []
    const includedCategories = new Set<string>()
    carTxs.forEach(t => {
      if (!t.related_id) return
      if (t.category && isExcludedCategory(t.category)) {
        excludedTxs.push({ category: t.category, amount: t.amount, type: t.type })
        return // 금융/자본 거래 제외
      }
      if (t.category) includedCategories.add(t.category)
      const m = t.transaction_date.slice(0, 7)
      const key = `${t.related_id}_${m}`
      if (!carMonthData[key]) carMonthData[key] = { revenue: 0, expense: 0 }
      if (t.type === 'income') carMonthData[key].revenue += Math.abs(t.amount)
      else carMonthData[key].expense += Math.abs(t.amount)
    })
    console.log('[Settlement] 제외된 거래:', excludedTxs)
    console.log('[Settlement] 포함된 카테고리:', [...includedCategories])

    const items: SettlementItem[] = []

    // 기준월 목록 생성 헬퍼 (계약시작월 ~ 선택월의 전월)
    // 선택월 = 지급월, 기준월 = 지급월 - 1 이하
    // 예: 선택월 2026-03 → 기준월은 2026-02 이하 (2월 마감분이 3월에 지급)
    const getBaseMonths = (contractStart?: string): string[] => {
      const months: string[] = []
      const limitStart = new Date(selYear - 1, selMonth - 1, 1) // 최대 12개월 전
      let start = contractStart ? new Date(contractStart + '-01') : limitStart
      if (start < limitStart) start = limitStart

      // 기준월 상한: 선택월의 전월 (지급기준)
      const end = new Date(selYear, selMonth - 2, 1) // selMonth-2: 전월 (JS 0-indexed)
      const cur = new Date(start.getFullYear(), start.getMonth(), 1)
      while (cur <= end) {
        months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
        cur.setMonth(cur.getMonth() + 1)
      }
      return months
    }

    // ── 일할계산 헬퍼 ──
    // 초기 계약월의 지입비를 계약일 기준으로 일할계산
    const calcProrataFee = (fee: number, contractStartDate: string | undefined, baseMonth: string): number => {
      if (!contractStartDate) return fee
      const startMonth = contractStartDate.slice(0, 7)
      if (baseMonth !== startMonth) return fee // 첫 월이 아니면 전액

      const startDay = parseInt(contractStartDate.slice(8, 10)) || 1
      const [y, mo] = baseMonth.split('-').map(Number)
      const daysInMonth = new Date(y, mo, 0).getDate()
      const remainingDays = daysInMonth - startDay + 1
      return Math.floor(fee * remainingDays / daysInMonth)
    }

    // ── 1. 지입 수익배분 ──
    // 지입비 = 회사가 받는 돈 (수입)
    // 배분금 = (차량수입 - 차량비용 - 지입비) × share_ratio% → 차주에게 지급
    // 기준월 N의 매출로 계산 → N+1월에 지급
    // 초기계약월: 일할계산 적용
    // ★ 적자 이월: 마이너스일 때 다음 달로 이월, 합산 정산
    jiipData.forEach(j => {
      const fullAdminFee = j.admin_fee || 0
      const shareRatio = j.share_ratio || 0
      if (shareRatio === 0) return

      const baseMonths = getBaseMonths(j.contract_start_date?.slice(0, 7))

      // 월별 순차 처리 — 적자 이월 누적
      let carryOver = 0
      baseMonths.forEach(m => {
        const isPaid = paidSet.has(`jiip_share_${j.id}_${m}`)
        const paymentMonth = nextMonthStr(m)
        const isCurrentPayment = paymentMonth === selectedMonth

        const carKey = `${j.car_id}_${m}`
        const cd = carMonthData[carKey] || { revenue: 0, expense: 0 }

        // 초기계약월 일할계산 적용
        const adminFee = calcProrataFee(fullAdminFee, j.contract_start_date, m)
        const isProrated = adminFee !== fullAdminFee

        const netProfit = cd.revenue - cd.expense
        const distributable = netProfit - adminFee
        const effectiveDistributable = distributable + carryOver

        let investorPayout = 0
        if (effectiveDistributable > 0) {
          investorPayout = Math.floor(effectiveDistributable * (shareRatio / 100))
          carryOver = 0  // 흑자 전환: 이월 초기화
        } else {
          investorPayout = 0
          // 이미 지급 완료된 월은 이월에 포함하지 않음
          if (!isPaid) {
            carryOver = effectiveDistributable  // 적자 이월
          } else {
            carryOver = 0  // 이미 정산 완료되었으면 이월 초기화
          }
        }

        // 이미 지급 완료된 이전 기준월은 건너뜀 (당기 지급분은 항상 표시)
        if (isPaid && !isCurrentPayment) return

        const dueDay = j.payout_day || 10
        const prorataNote = isProrated ? ` (일할=${nf(adminFee)})` : ''
        const carryNote = carryOver < 0 && effectiveDistributable <= 0 ? ` [이월: ${nf(carryOver)}]` : ''
        // 이월 항목: 지급예정일은 현재 선택월 기준 (과거 paymentMonth가 아님)
        const isOverdue = !isCurrentPayment && !isPaid
        const actualDueMonth = isOverdue ? selectedMonth : paymentMonth

        items.push({
          id: `jiip-${j.id}-${m}`,
          type: 'jiip',
          name: j.investor_name,
          amount: investorPayout,
          dueDay,
          dueDate: `${actualDueMonth}-${dueDay.toString().padStart(2, '0')}`,
          status: isPaid ? 'paid' : 'pending',
          relatedId: j.id,
          detail: effectiveDistributable > 0
            ? `${m.slice(5)}월분: 배분대상${nf(effectiveDistributable)}×${shareRatio}%`
            : `${m.slice(5)}월분: 적자${nf(effectiveDistributable)}${carryNote}`,
          carNumber: j.cars?.number,
          carModel: j.cars?.model,
          carId: j.car_id,
          monthLabel: m,
          isOverdue,
          breakdown: {
            revenue: cd.revenue,
            expense: cd.expense,
            adminFee,
            netProfit,
            distributable,
            carryOver: effectiveDistributable - distributable, // 이전 이월분
            effectiveDistributable,
            shareRatio,
            investorPayout,
            companyProfit: effectiveDistributable > 0
              ? effectiveDistributable - investorPayout + adminFee
              : adminFee,
          },
        })
      })
    })

    // ── 2. 투자 이자 ──
    // 월이자 = 투자원금 × 연이자율% ÷ 12
    // 기준월 N의 이자 → N+1월에 지급
    console.log('[Settlement] Processing investData, count:', investData.length)
    investData.forEach(inv => {
      const amt = inv.invest_amount || 0
      const rate = inv.interest_rate || 0
      const monthlyInterest = Math.floor((amt * (rate / 100)) / 12)
      console.log(`[Settlement] invest ${inv.investor_name}: amt=${amt}, rate=${rate}, monthly=${monthlyInterest}, start=${inv.contract_start_date}`)
      if (monthlyInterest === 0) return

      // 기준월 목록 (계약시작월 ~ 선택월 전월)
      const baseMonths = getBaseMonths(inv.contract_start_date?.slice(0, 7))

      // 당월 시작 계약: getBaseMonths가 빈 배열이면 당월을 포함하여 표시
      // (실제 지급은 다음 달이지만 목록에는 표시)
      const contractStartMonth = inv.contract_start_date?.slice(0, 7)
      if (baseMonths.length === 0 && contractStartMonth && contractStartMonth <= selectedMonth) {
        baseMonths.push(contractStartMonth)
      }

      baseMonths.forEach(m => {
        const isPaid = paidSet.has(`invest_${inv.id}_${m}`)
        const paymentMonth = nextMonthStr(m)
        const isCurrentPayment = paymentMonth === selectedMonth
        if (isPaid && !isCurrentPayment) return

        const dueDay = inv.payment_day || 10
        const isNextMonthPayment = paymentMonth > selectedMonth
        const isOverdueInv = !isCurrentPayment && !isPaid && !isNextMonthPayment
        const actualDueMonthInv = isOverdueInv ? selectedMonth : paymentMonth
        items.push({
          id: `invest-${inv.id}-${m}`,
          type: 'invest',
          name: inv.investor_name,
          amount: monthlyInterest,
          dueDay,
          dueDate: `${actualDueMonthInv}-${dueDay.toString().padStart(2, '0')}`,
          status: isPaid ? 'paid' : 'pending',
          relatedId: inv.id,
          detail: isNextMonthPayment
            ? `${m.slice(5)}월분 (${paymentMonth.slice(5)}월 지급예정): 원금 ${nf(amt)}원 × ${rate}% ÷ 12`
            : `${m.slice(5)}월분: 원금 ${nf(amt)}원 × ${rate}% ÷ 12`,
          carNumber: inv.car_number,
          carId: inv.car_id,
          monthLabel: m,
          isOverdue: isOverdueInv,
        })
      })
    })

    // ── 3. 대출 상환 ──
    // 기준월 N → N+1월에 상환
    loanData.forEach(loan => {
      if (!loan.monthly_payment) return
      const baseMonths = getBaseMonths(loan.start_date?.slice(0, 7))
      const endDate = loan.end_date ? loan.end_date.slice(0, 7) : '9999-12'

      // 당월 시작 대출: getBaseMonths가 빈 배열이면 당월 포함
      const loanStartMonth = loan.start_date?.slice(0, 7)
      if (baseMonths.length === 0 && loanStartMonth && loanStartMonth <= selectedMonth) {
        baseMonths.push(loanStartMonth)
      }

      baseMonths.forEach(m => {
        if (m > endDate) return
        const isPaid = paidSet.has(`loan_${loan.id}_${m}`)
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
          detail: isNextMonthPayment
            ? `${m.slice(5)}월분 (${paymentMonth.slice(5)}월 상환예정): ${loan.type === '리스' ? '리스료' : '대출 상환금'}`
            : `${m.slice(5)}월분: ${loan.type === '리스' ? '리스료' : '대출 상환금'}`,
          carNumber: loan.cars?.number,
          monthLabel: m,
          isOverdue: isOverdueLoan,
        })
      })
    })

    // 정렬: 미수(이월) 우선 → 미정산 → 정산완료, 날짜순
    items.sort((a, b) => {
      // 미수(이전월 미정산) 최우선
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
      if (a.monthLabel !== b.monthLabel) return (a.monthLabel || '') < (b.monthLabel || '') ? -1 : 1
      return a.dueDay - b.dueDay
    })

    setSettlementItems(items)
  }

  // ============================================
  // 계산된 값들 (useMemo)
  // ============================================
  const summary = useMemo(() => {
    const completed = transactions.filter(t => t.status === 'completed')
    const income = completed.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = completed.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const pending = transactions.filter(t => t.status === 'pending').reduce((s, t) => s + t.amount, 0)

    return { income, expense, profit: income - expense, pending }
  }, [transactions])

  // 매출 분석 (소스별)
  const revenueBySource = useMemo(() => {
    const incomes = transactions.filter(t => t.type === 'income' && t.status === 'completed')
    const grouped: Record<string, { total: number; count: number; items: Transaction[] }> = {}

    incomes.forEach(t => {
      const group = categorizeAmount(t.category, INCOME_GROUPS)
      if (!grouped[group]) grouped[group] = { total: 0, count: 0, items: [] }
      grouped[group].total += t.amount
      grouped[group].count++
      grouped[group].items.push(t)
    })

    return Object.entries(grouped).sort((a, b) => b[1].total - a[1].total)
  }, [transactions])

  // 비용 분석 (그룹별)
  const expenseByGroup = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense' && t.status === 'completed')
    const grouped: Record<string, { total: number; count: number; items: Transaction[] }> = {}

    expenses.forEach(t => {
      const group = categorizeAmount(t.category, EXPENSE_GROUPS)
      if (!grouped[group]) grouped[group] = { total: 0, count: 0, items: [] }
      grouped[group].total += t.amount
      grouped[group].count++
      grouped[group].items.push(t)
    })

    return Object.entries(grouped).sort((a, b) => b[1].total - a[1].total)
  }, [transactions])

  // 정산 요약
  const settlementSummary = useMemo(() => {
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

  // ============================================
  // 정산 실행
  // ============================================
  const handleSettlementExecute = async () => {
    if (selectedIds.size === 0) return alert('정산할 항목을 선택해주세요.')
    if (!effectiveCompanyId) return alert('⚠️ 회사를 선택해주세요.')
    if (!confirm(`${selectedIds.size}건의 정산을 실행하시겠습니까?`)) return

    setExecuting(true)
    try {
      const selected = settlementItems.filter(i => selectedIds.has(i.id) && i.status === 'pending')
      const newTxs = selected.map(item => {
        const relatedType = item.type === 'jiip' ? 'jiip_share' : item.type
        const category = item.type === 'jiip' ? '지입 수익배분금(출금)'
          : item.type === 'invest' ? '투자이자'
          : item.type === 'loan' ? '대출원리금'
          : '기타'

        // 정산일 = 해당 월의 납부일 (이월분도 원래 납부일 기준)
        const txDate = item.dueDate

        return {
          transaction_date: txDate,
          type: 'expense' as const,
          status: 'completed' as const,
          category,
          client_name: item.name + (item.carNumber ? ` (${item.carNumber})` : ''),
          description: `${item.monthLabel || ''}월 ${item.detail}${item.isOverdue ? ' (이월)' : ''}`,
          amount: item.amount,
          payment_method: '통장',
          related_type: relatedType,
          related_id: item.relatedId,
          company_id: effectiveCompanyId,
        }
      })

      if (newTxs.length === 0) {
        alert('이미 처리된 항목이거나 처리할 항목이 없습니다.')
        setExecuting(false)
        return
      }

      const { error } = await supabase.from('transactions').insert(newTxs)
      if (error) throw error

      alert(`✅ ${newTxs.length}건 정산 완료!`)
      setSelectedIds(new Set())
      fetchAllData()
    } catch (e: any) {
      alert('정산 실행 실패: ' + e.message)
    }
    setExecuting(false)
  }

  // ============================================
  // 정산 알림 발송 — 모달 열기 (수신자별 통합 + 월별 상세)
  // ============================================

  // 메시지 빌드 헬퍼: 수신자의 항목 목록 → 통합 메시지
  const buildRecipientMessage = (name: string, items: SmsRecipient['items'], shareUrl?: string, note?: string): string => {
    const companyName = company?.name || '회사'
    const typeLabel = (t: string) => t === 'jiip' ? '수익배분' : t === 'invest' ? '투자이자' : t

    // 월별 그룹
    const byMonth: Record<string, { items: SmsRecipient['items']; subtotal: number }> = {}
    items.forEach(it => {
      const mKey = it.monthLabel || '미정'
      if (!byMonth[mKey]) byMonth[mKey] = { items: [], subtotal: 0 }
      byMonth[mKey].items.push(it)
      byMonth[mKey].subtotal += it.amount
    })

    const sortedMonths = Object.keys(byMonth).sort()
    const total = items.reduce((s, i) => s + i.amount, 0)
    const dueDate = items[0]?.dueDate || ''

    let msg = `[${companyName}] 정산 안내\n`
    msg += `${name}님, 정산 내역을 안내드립니다.\n\n`

    sortedMonths.forEach(m => {
      const d = byMonth[m]
      const monthDisplay = m.slice(2, 4) + '년 ' + m.slice(5) + '월'
      msg += `■ ${monthDisplay} 정산\n`
      d.items.forEach(it => {
        msg += `  ${typeLabel(it.type)}: ${nf(it.amount)}원\n`
        // breakdown이 있으면 대략적 계산내역 추가 (수입→비용→배분)
        const bd = it.breakdown
        if (bd && it.type === 'jiip') {
          const revenue = bd.totalRevenue || bd.revenue || 0
          const expense = bd.totalExpense || bd.expense || 0
          const adminFee = bd.adminFee || 0
          const ratio = bd.shareRatio || bd.distributionRatio || 0
          if (revenue > 0) {
            msg += `    수입 ${nf(revenue)} - 비용 ${nf(expense)}`
            if (adminFee > 0) msg += ` - 관리비 ${nf(adminFee)}`
            if (ratio > 0) msg += ` (배분 ${ratio > 1 ? ratio.toFixed(0) : (ratio * 100).toFixed(0)}%)`
            msg += `\n`
          }
        }
      })
      if (d.items.length > 1) {
        msg += `  소계: ${nf(d.subtotal)}원\n`
      }
    })

    if (sortedMonths.length > 1) {
      msg += `\n합계: ${nf(total)}원\n`
    }
    if (dueDate) {
      msg += `\n지급예정일: ${dueDate}\n`
    }
    if (shareUrl) {
      msg += `\n▶ 상세내역 확인:\n${shareUrl}\n`
    }
    if (note) {
      msg += `\n${note}\n`
    }
    msg += `\n감사합니다.`
    return msg
  }

  const handleSendNotify = async () => {
    const selected = settlementItems.filter(
      i => selectedIds.has(i.id) && (i.type === 'jiip' || i.type === 'invest')
    )
    if (selected.length === 0) {
      showToast('발송할 항목을 선택해주세요. (지입/투자 항목만 발송 가능)', 'error')
      return
    }

    setSmsModal({ open: true, loading: true, recipients: [], customNote: '' })

    try {
      // 수신자별 그룹핑 (relatedId + name 기준)
      const grouped: Record<string, {
        name: string
        relatedId: string
        type: 'jiip' | 'invest'
        items: SmsRecipient['items']
      }> = {}

      selected.forEach(item => {
        const key = item.relatedId
        if (!grouped[key]) {
          grouped[key] = {
            name: item.name,
            relatedId: item.relatedId,
            type: item.type as 'jiip' | 'invest',
            items: [],
          }
        }
        grouped[key].items.push({
          type: item.type as 'jiip' | 'invest',
          monthLabel: item.monthLabel || filterDate,
          amount: item.amount,
          detail: item.detail,
          relatedId: item.relatedId,
          dueDate: item.dueDate,
          carNumber: item.carNumber,
          carModel: item.carModel,
          carId: item.carId,
          breakdown: item.breakdown,
        })
      })

      // 계약별 연락처 조회 (중복 제거)
      const recipientList: SmsRecipient[] = []
      const queried = new Set<string>()

      for (const [key, g] of Object.entries(grouped)) {
        if (queried.has(key)) continue
        queried.add(key)

        const tableName = g.type === 'jiip' ? 'jiip_contracts' : 'general_investments'
        const { data: contract } = await supabase
          .from(tableName)
          .select('*')
          .eq('id', g.relatedId)
          .single()

        const phone = contract?.investor_phone || contract?.phone || ''
        const email = contract?.investor_email || contract?.email || ''
        const bankInfo = (contract?.bank_name || contract?.account_number || contract?.account_holder)
          ? {
              bank_name: contract?.bank_name || '',
              account_holder: contract?.account_holder || '',
              account_number: contract?.account_number || '',
            }
          : undefined

        recipientList.push({
          key,
          name: g.name,
          phone,
          email,
          totalAmount: g.items.reduce((s, i) => s + i.amount, 0),
          items: g.items,
          message: buildRecipientMessage(g.name, g.items),
          bankInfo,
        })
      }

      setSmsModal({ open: true, recipients: recipientList, loading: false })
    } catch (err: any) {
      showToast(`연락처 조회 실패: ${err.message}`, 'error')
      setSmsModal({ open: false, recipients: [], loading: false })
    }
  }

  // 실제 발송 실행 — 상세 링크 생성 → 메시지 재조합 → 발송
  const handleConfirmSend = async () => {
    const validRecipients = smsModal.recipients.filter(r =>
      notifyChannel === 'sms' ? r.phone : r.email
    )
    if (validRecipients.length === 0) {
      showToast(`발송 가능한 ${notifyChannel === 'sms' ? '전화번호' : '이메일'}가 없습니다.`, 'error')
      return
    }

    setSendingNotify(true)
    setSmsModal(prev => ({ ...prev, open: false }))

    try {
      const authToken = (await supabase.auth.getSession()).data.session?.access_token
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin

      // 1. 수신자별 상세 링크 생성
      const recipientsWithLinks = await Promise.all(validRecipients.map(async (r) => {
        try {
          const shareRes = await fetch('/api/settlement/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({
              recipient_name: r.name,
              recipient_phone: r.phone,
              settlement_month: r.items[0]?.monthLabel || filterDate,
              payment_date: r.items[0]?.dueDate || '',
              total_amount: r.totalAmount,
              items: r.items.map(it => ({
                type: it.type,
                monthLabel: it.monthLabel,
                amount: it.amount,
                detail: it.detail,
                carNumber: it.carNumber,
                carModel: it.carModel,
                carId: it.carId,
                breakdown: it.breakdown,
              })),
              // 차량별 거래 상세내역 (수입/비용 항목별)
              transaction_details: (() => {
                const details: Record<string, { date: string; description: string; amount: number; type: string; category?: string }[]> = {}
                r.items.forEach(it => {
                  const carId = it.carId
                    || settlementItems.find(si => si.id === `jiip-${it.relatedId}-${it.monthLabel}`)?.carId
                    || jiips.find(j => j.id === it.relatedId)?.car_id
                  if (!carId || it.type !== 'jiip') return
                  const carIdStr = String(carId)
                  const key = `${carIdStr}_${it.monthLabel}`
                  if (details[key]) return // 이미 처리됨
                  details[key] = carTxHistory
                    .filter(t => String(t.related_id) === carIdStr && t.transaction_date.startsWith(it.monthLabel)
                      && !(t.category || '').includes('차량구입'))
                    .map(t => ({
                      date: t.transaction_date,
                      description: t.client_name || t.description || t.category || '',
                      amount: Math.abs(t.amount),
                      type: t.type,
                      category: t.category || '',
                    }))
                    .sort((a, b) => a.date.localeCompare(b.date))
                  console.log(`[SMS Share] carId=${carIdStr}, month=${it.monthLabel}, txCount=${details[key].length}`)
                })
                console.log('[SMS Share] transaction_details keys:', Object.keys(details))
                return Object.keys(details).length > 0 ? details : undefined
              })(),
              bank_info: r.bankInfo || undefined,
              message: smsModal.customNote || undefined,
              company_id: effectiveCompanyId,
            }),
          })
          if (shareRes.ok) {
            const shareData = await shareRes.json()
            const shareUrl = `${baseUrl}${shareData.url}`
            // 링크가 포함된 메시지 재생성
            const updatedMsg = buildRecipientMessage(r.name, r.items, shareUrl, smsModal.customNote || undefined)
            return { ...r, message: updatedMsg, shareUrl }
          }
        } catch (e) {
          console.warn('[SMS] 상세 링크 생성 실패:', r.name, e)
        }
        // 링크 생성 실패 시 원본 메시지에 customNote만 추가
        if (smsModal.customNote && !r.message.includes(smsModal.customNote)) {
          const updatedMsg = buildRecipientMessage(r.name, r.items, undefined, smsModal.customNote)
          return { ...r, message: updatedMsg }
        }
        return r
      }))

      // 2. 알림 발송
      const res = await fetch('/api/settlement/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          recipients: recipientsWithLinks.map(r => ({
            name: r.name,
            phone: r.phone,
            email: r.email,
            message: r.message,
            totalAmount: r.totalAmount,
            items: r.items.map(it => ({
              type: it.type,
              relatedId: it.relatedId,
              amount: it.amount,
              dueDate: it.dueDate,
            })),
          })),
          channel: notifyChannel,
          company_id: effectiveCompanyId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`알림 발송: ${data.sent}건 성공${data.failed > 0 ? `, ${data.failed}건 실패` : ''}`, data.failed > 0 ? 'error' : 'success')
    } catch (err: any) {
      showToast(`알림 발송 실패: ${err.message}`, 'error')
    } finally {
      setSendingNotify(false)
    }
  }

  // 지급완료/취소 토글
  const handleTogglePaid = async (shareId: string, currentlyPaid: boolean) => {
    try {
      const authToken = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch('/api/settlement/share/paid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          share_ids: [shareId],
          action: currentlyPaid ? 'unmark_paid' : 'mark_paid',
        }),
      })
      if (res.ok) {
        showToast(currentlyPaid ? '지급완료 취소됨' : '지급완료 처리됨', 'success')
        // 로컬 상태 업데이트
        setShareHistory(prev => prev.map(sh =>
          sh.id === shareId
            ? { ...sh, paid_at: currentlyPaid ? null : new Date().toISOString() }
            : sh
        ))
      } else {
        const err = await res.json()
        showToast(err.error || '처리 실패', 'error')
      }
    } catch (e: any) {
      showToast(`오류: ${e.message}`, 'error')
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const pending = settlementItems.filter(i => i.status === 'pending')
    if (selectedIds.size === pending.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pending.map(i => i.id)))
    }
  }

  // ============================================
  // 탭별 그룹 카운트 뱃지
  // ============================================
  const pendingBadge = settlementSummary.pendingCount > 0
    ? <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{settlementSummary.pendingCount}</span>
    : null

  // ============================================
  // 렌더링
  // ============================================
  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="p-12 md:p-20 text-center text-gray-400 text-sm bg-white rounded-2xl">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  if (!effectiveCompanyId && !loading) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg style={{ width: 28, height: 28, color: '#2d5fa8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              매출 회계 정산
            </h1>
            <p className="text-gray-500 text-sm mt-1">매출 분석, 정산 현황, 손익계산서를 한눈에 관리합니다.</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm text-center py-20">
          <p className="text-4xl mb-3">🏢</p>
          <p className="font-semibold text-sm text-slate-500">좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p className="text-xs text-slate-400 mt-1">회사 선택 후 매출 정산을 이용할 수 있습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">

      {/* ═══ 컴팩트 요약바 ═══ */}
      <div style={{
        background: '#2d5fa8', padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: 14,
        borderRadius: '12px 12px 0 0', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
          총 매출 <b style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>{nf(summary.income)}원</b>
        </span>
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.25)' }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
          총 지출 <b style={{ color: '#fca5a5', fontSize: 14, fontWeight: 900 }}>{nf(summary.expense)}원</b>
        </span>
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.25)' }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
          영업이익 <b style={{ color: summary.profit >= 0 ? '#6ee7b7' : '#fca5a5', fontSize: 14, fontWeight: 900 }}>{nfSign(summary.profit)}원</b>
        </span>
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.25)' }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
          미정산 <b style={{ color: '#fde68a', fontSize: 14, fontWeight: 900 }}>{settlementSummary.pendingCount}건</b>
        </span>
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.25)' }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
          미정산 금액 <b style={{ color: '#fde68a', fontSize: 14, fontWeight: 900 }}>{nf(settlementSummary.pendingAmount)}원</b>
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="month"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.12)', color: '#e0ecf8',
              border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px',
              borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              outline: 'none',
            }}
          />
          <button
            onClick={() => router.push('/finance')}
            style={{
              background: 'rgba(255,255,255,0.12)', color: '#e0ecf8',
              border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px',
              borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            📚 자금 장부
          </button>
          <button
            onClick={() => router.push('/finance/upload')}
            style={{
              background: '#fff', color: '#2d5fa8', border: 'none',
              padding: '6px 12px', borderRadius: 7, fontSize: 11,
              fontWeight: 800, cursor: 'pointer',
            }}
          >
            📂 엑셀 등록
          </button>
        </div>
      </div>

      {/* ═══ 탭 네비게이션 ═══ */}
      <div style={{
        display: 'flex', gap: 0, background: '#fff',
        borderBottom: '2px solid #e2e8f0', padding: '0 24px',
      }}>
        {[
          { key: 'revenue' as const, label: '📈 매출 분석' },
          { key: 'settlement' as const, label: '💳 지급 관리' },
          { key: 'pnl' as const, label: '📊 손익계산서' },
          { key: 'execute' as const, label: '⚡ 정산 실행' },
          { key: 'classify' as const, label: '🏦 통장분류' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '12px 20px', fontSize: 13, fontWeight: 700,
              color: activeTab === tab.key ? '#0f172a' : '#94a3b8',
              cursor: 'pointer', background: 'none',
              borderBottom: activeTab === tab.key ? '3px solid #2d5fa8' : '3px solid transparent',
              marginBottom: -2,
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s',
              borderLeft: 'none', borderRight: 'none', borderTop: 'none',
            }}
          >
            {tab.label}
            {tab.key === 'classify' && classifiedItems.length > 0 && (
              <span style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                background: activeTab === tab.key ? 'rgba(45,95,168,0.1)' : '#e0ecf8',
                color: '#2d5fa8',
              }}>
                {classifiedItems.length}
              </span>
            )}
            {(tab.key === 'settlement' || tab.key === 'execute') && settlementSummary.pendingCount > 0 && (
              <span style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                background: activeTab === tab.key ? 'rgba(239,68,68,0.1)' : '#fee2e2',
                color: '#dc2626',
              }}>
                {settlementSummary.pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ 탭 콘텐츠 ═══ */}
      <div style={{ background: '#fff', borderRadius: '0 0 16px 16px', border: '1px solid #e5e7eb', borderTop: 'none' }}>
        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: '#9ca3af', fontWeight: 700 }}>데이터를 불러오는 중...</div>
        ) : (
          <>
            {activeTab === 'revenue' && <RevenueTab revenueBySource={revenueBySource} totalIncome={summary.income} transactions={transactions} />}
            {activeTab === 'settlement' && <SettlementTab items={settlementItems} summary={settlementSummary} carTxHistory={carTxHistory} />}
            {activeTab === 'pnl' && <PnLTab revenueBySource={revenueBySource} expenseByGroup={expenseByGroup} summary={summary} filterDate={filterDate} />}
            {activeTab === 'execute' && (
              <ExecuteTab
                items={settlementItems}
                selectedIds={selectedIds}
                toggleSelect={toggleSelect}
                toggleSelectAll={toggleSelectAll}
                onExecute={handleSettlementExecute}
                executing={executing}
                onSendNotify={handleSendNotify}
                sendingNotify={sendingNotify}
                notifyChannel={notifyChannel}
                setNotifyChannel={setNotifyChannel}
                shareHistory={shareHistory}
                onTogglePaid={handleTogglePaid}
              />
            )}
            {activeTab === 'classify' && (
              <ClassifyTab
                items={classifiedItems}
                jiips={jiips}
                investors={investors}
                loans={loans}
                filterDate={filterDate}
              />
            )}
          </>
        )}
      </div>

      {/* ═══ SMS 발송 확인 모달 ═══ */}
      {smsModal.open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
          }}>
            {/* 모달 헤더 */}
            <div style={{
              padding: '16px 24px', borderBottom: '1px solid #e5e7eb',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#111827' }}>
                  {notifyChannel === 'sms' ? '📱 SMS' : '📧 이메일'} 발송 확인
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                  발송 전 수신자 정보와 메시지 내용을 확인하세요.
                </p>
              </div>
              <button
                onClick={() => setSmsModal(prev => ({ ...prev, open: false }))}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', padding: 4 }}
              >
                ✕
              </button>
            </div>

            {smsModal.loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
                <p style={{ fontWeight: 700 }}>연락처 조회 중...</p>
              </div>
            ) : (
              <>
                {/* 추가 메시지 & 안내 */}
                <div style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                  <label style={{ fontSize: 12, fontWeight: 800, color: '#374151', display: 'block', marginBottom: 6 }}>
                    추가 메시지 <span style={{ fontWeight: 500, color: '#9ca3af' }}>(선택사항 — 모든 수신자에게 공통 표시)</span>
                  </label>
                  <textarea
                    value={smsModal.customNote}
                    onChange={e => setSmsModal(prev => ({ ...prev, customNote: e.target.value }))}
                    placeholder="계좌 안내, 문의처, 공지사항 등을 자유롭게 입력하세요..."
                    rows={2}
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0',
                      borderRadius: 8, fontSize: 13, lineHeight: 1.5, resize: 'vertical',
                      fontFamily: 'inherit', outline: 'none', color: '#0f172a', background: '#fff',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      발송 시 상세 정산 내역 링크가 자동 포함됩니다.
                    </span>
                    {smsModal.customNote && (
                      <button
                        onClick={() => {
                          // 추가 메시지를 모든 수신자 메시지에 반영
                          setSmsModal(prev => ({
                            ...prev,
                            recipients: prev.recipients.map(r => ({
                              ...r,
                              message: buildRecipientMessage(r.name, r.items, r.shareUrl, prev.customNote || undefined),
                            })),
                          }))
                        }}
                        style={{
                          padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', background: '#2d5fa8', color: '#fff', border: 'none',
                        }}
                      >
                        메시지 미리보기 갱신
                      </button>
                    )}
                  </div>
                </div>

                {/* 수신자 목록 */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <div style={{ padding: '8px 24px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#374151' }}>
                      수신자 {smsModal.recipients.length}명
                    </span>
                    <span style={{ width: 1, height: 14, background: '#e2e8f0' }} />
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                      총 항목 {smsModal.recipients.reduce((s, r) => s + r.items.length, 0)}건
                    </span>
                    <span style={{ width: 1, height: 14, background: '#e2e8f0' }} />
                    {smsModal.recipients.filter(r => notifyChannel === 'sms' ? !r.phone : !r.email).length > 0 && (
                      <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>
                        연락처 미등록 {smsModal.recipients.filter(r => notifyChannel === 'sms' ? !r.phone : !r.email).length}명
                      </span>
                    )}
                  </div>

                  {smsModal.recipients.map((r, idx) => {
                    const contact = notifyChannel === 'sms' ? r.phone : r.email
                    const hasContact = !!contact
                    const typeSet = [...new Set(r.items.map(i => i.type))]
                    return (
                      <div
                        key={r.key}
                        style={{
                          padding: '16px 24px', borderBottom: '1px solid #f1f5f9',
                          background: hasContact ? '#fff' : '#fef2f2',
                          opacity: hasContact ? 1 : 0.8,
                        }}
                      >
                        {/* 수신자 헤더 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          {typeSet.map(t => (
                            <span key={t} style={{
                              padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                              background: t === 'jiip' ? '#f3e8ff' : '#dbeafe',
                              color: t === 'jiip' ? '#7c3aed' : '#2563eb',
                            }}>
                              {t === 'jiip' ? '지입' : '투자'}
                            </span>
                          ))}
                          <span style={{ fontWeight: 800, color: '#111827', fontSize: 14 }}>{r.name}</span>
                          <span style={{ fontSize: 13, fontWeight: 900, color: '#dc2626' }}>합계 {nf(r.totalAmount)}원</span>
                          <span style={{ flex: 1 }} />

                          {/* 연락처 수정 가능 */}
                          {hasContact ? (
                            <input
                              type="text"
                              value={contact}
                              onChange={e => {
                                const val = e.target.value
                                setSmsModal(prev => ({
                                  ...prev,
                                  recipients: prev.recipients.map((item, i) =>
                                    i === idx
                                      ? notifyChannel === 'sms' ? { ...item, phone: val } : { ...item, email: val }
                                      : item
                                  ),
                                }))
                              }}
                              style={{
                                padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
                                fontSize: 13, fontWeight: 700, color: '#374151', width: 160,
                                outline: 'none', background: '#f8fafc',
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                              ⚠️ {notifyChannel === 'sms' ? '번호' : '이메일'} 미등록
                            </span>
                          )}
                        </div>

                        {/* 월별 내역 요약 (간결한 표) */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                            <tbody>
                              {r.items.map((it, iIdx) => (
                                <tr key={iIdx} style={{ borderBottom: iIdx < r.items.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                                  <td style={{ padding: '6px 12px', fontWeight: 700, color: '#6b7280', whiteSpace: 'nowrap', width: 70 }}>
                                    {it.monthLabel.slice(2, 4)}년{it.monthLabel.slice(5)}월
                                  </td>
                                  <td style={{ padding: '6px 12px', color: '#374151' }}>
                                    {it.type === 'jiip' ? '수익배분' : '투자이자'}
                                  </td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 900, color: '#dc2626', whiteSpace: 'nowrap' }}>
                                    {nf(it.amount)}원
                                  </td>
                                </tr>
                              ))}
                              {r.items.length > 1 && (
                                <tr style={{ background: '#f1f5f9' }}>
                                  <td colSpan={2} style={{ padding: '6px 12px', fontWeight: 800, color: '#111827', fontSize: 12 }}>합계</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 900, color: '#111827', fontSize: 13 }}>{nf(r.totalAmount)}원</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* 메시지 미리보기 (수정 가능) */}
                        <textarea
                          value={r.message}
                          onChange={e => {
                            const val = e.target.value
                            setSmsModal(prev => ({
                              ...prev,
                              recipients: prev.recipients.map((item, i) =>
                                i === idx ? { ...item, message: val } : item
                              ),
                            }))
                          }}
                          rows={Math.min(r.message.split('\n').length + 1, 12)}
                          style={{
                            width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
                            borderRadius: 8, fontSize: 12, lineHeight: 1.6, resize: 'vertical',
                            fontFamily: 'inherit', outline: 'none', color: '#374151',
                            background: '#fff',
                          }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span style={{ fontSize: 10, color: '#9ca3af' }}>
                            {Buffer ? `${new TextEncoder().encode(r.message).length}바이트` : ''} · {r.message.length > 90 ? 'LMS' : 'SMS'}
                          </span>
                          <button
                            onClick={() => {
                              const rebuilt = buildRecipientMessage(r.name, r.items)
                              setSmsModal(prev => ({
                                ...prev,
                                recipients: prev.recipients.map((item, i) =>
                                  i === idx ? { ...item, message: rebuilt } : item
                                ),
                              }))
                            }}
                            style={{
                              padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                              cursor: 'pointer', background: '#f1f5f9', color: '#6b7280',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            초기화
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 모달 푸터 */}
                <div style={{
                  padding: '14px 24px', borderTop: '1px solid #e5e7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#f8fafc', borderRadius: '0 0 16px 16px',
                }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    발송 가능 <b style={{ color: '#16a34a' }}>
                      {smsModal.recipients.filter(r => notifyChannel === 'sms' ? r.phone : r.email).length}명
                    </b>
                    {smsModal.recipients.filter(r => notifyChannel === 'sms' ? !r.phone : !r.email).length > 0 && (
                      <span style={{ marginLeft: 8, color: '#dc2626' }}>
                        불가 {smsModal.recipients.filter(r => notifyChannel === 'sms' ? !r.phone : !r.email).length}명
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setSmsModal(prev => ({ ...prev, open: false }))}
                      style={{
                        padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0',
                      }}
                    >
                      취소
                    </button>
                    <button
                      onClick={handleConfirmSend}
                      disabled={smsModal.recipients.filter(r => notifyChannel === 'sms' ? r.phone : r.email).length === 0}
                      style={{
                        padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                        cursor: 'pointer', border: 'none',
                        background: smsModal.recipients.filter(r => notifyChannel === 'sms' ? r.phone : r.email).length > 0 ? '#2d5fa8' : '#e5e7eb',
                        color: smsModal.recipients.filter(r => notifyChannel === 'sms' ? r.phone : r.email).length > 0 ? '#fff' : '#9ca3af',
                      }}
                    >
                      {smsModal.recipients.filter(r => notifyChannel === 'sms' ? r.phone : r.email).length}명에게 발송
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-sm font-bold text-white z-50 transition-all ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ============================================
// KPI 카드
// ============================================
function KPICard({ label, value, suffix, color, icon }: {
  label: string; value: string; suffix: string; color: string; icon: string
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    red: 'bg-red-50 border-red-100 text-red-700',
    green: 'bg-green-50 border-green-100 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-100 text-yellow-700',
    orange: 'bg-orange-50 border-orange-100 text-orange-700',
  }

  return (
    <div className={`p-3 md:p-4 rounded-2xl border shadow-sm ${colorMap[color] || 'bg-white border-gray-100'}`}>
      <div className="flex justify-between items-start mb-1">
        <p className="text-xs font-bold opacity-70">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-lg md:text-xl font-black">
        {value}<span className="text-xs font-bold ml-0.5 opacity-60">{suffix}</span>
      </p>
    </div>
  )
}

// ============================================
// 탭 1: 매출 분석
// ============================================
function RevenueTab({ revenueBySource, totalIncome, transactions }: {
  revenueBySource: [string, { total: number; count: number; items: Transaction[] }][]
  totalIncome: number
  transactions: Transaction[]
}) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // 일별 매출 추이 (간단한 바 차트)
  const dailyRevenue = useMemo(() => {
    const incomes = transactions.filter(t => t.type === 'income' && t.status === 'completed')
    const byDate: Record<string, number> = {}
    incomes.forEach(t => {
      const day = t.transaction_date.slice(8)
      byDate[day] = (byDate[day] || 0) + t.amount
    })
    const maxVal = Math.max(...Object.values(byDate), 1)
    return { byDate, maxVal }
  }, [transactions])

  return (
    <div className="space-y-6">
      {/* 매출 소스별 분석 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-gray-800">📊 매출 소스별 분석</h3>
          <p className="text-xs text-gray-400 mt-1">수입원별로 매출을 분류합니다</p>
        </div>

        {revenueBySource.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">해당 월의 매출 데이터가 없습니다.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {revenueBySource.map(([group, data]) => {
              const pct = totalIncome > 0 ? ((data.total / totalIncome) * 100).toFixed(1) : '0'
              const isExpanded = expandedGroup === group

              return (
                <div key={group}>
                  <button
                    onClick={() => setExpandedGroup(isExpanded ? null : group)}
                    className="w-full p-4 hover:bg-steel-50/30 transition-colors"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-700">{group}</span>
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-500 font-bold">{data.count}건</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-steel-600">{nf(data.total)}원</span>
                        <span className="text-xs font-bold text-gray-400">{pct}%</span>
                        <span className={`text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                      </div>
                    </div>
                    {/* 비율 바 */}
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-steel-400 to-steel-600 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>

                  {/* 상세 항목 */}
                  {isExpanded && (
                    <div className="bg-gray-50/50 border-t border-gray-100">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-gray-400">
                          <tr>
                            <th className="p-3 text-left">날짜</th>
                            <th className="p-3 text-left">거래처</th>
                            <th className="p-3 text-left">설명</th>
                            <th className="p-3 text-right">금액</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {data.items.map(item => (
                            <tr key={item.id} className="hover:bg-white transition-colors">
                              <td className="p-3 text-gray-600">{item.transaction_date.slice(5)}</td>
                              <td className="p-3 font-bold text-gray-800">{item.client_name}</td>
                              <td className="p-3 text-gray-500 text-xs">{item.description}</td>
                              <td className="p-3 text-right font-bold text-steel-600">+{nf(item.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 일별 매출 추이 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-bold text-gray-800 mb-4">📅 일별 매출 추이</h3>
        {Object.keys(dailyRevenue.byDate).length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">매출 데이터가 없습니다.</p>
        ) : (
          <div className="flex items-end gap-1 h-32 overflow-x-auto pb-2">
            {Array.from({ length: 31 }, (_, i) => {
              const day = (i + 1).toString().padStart(2, '0')
              const val = dailyRevenue.byDate[day] || 0
              const pct = (val / dailyRevenue.maxVal) * 100
              return (
                <div key={day} className="flex flex-col items-center flex-shrink-0 group" style={{ minWidth: '24px' }}>
                  <div className="relative w-full flex justify-center">
                    {val > 0 && (
                      <div className="absolute -top-6 bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity z-10">
                        {nf(val)}
                      </div>
                    )}
                    <div
                      className={`w-4 rounded-t transition-all ${val > 0 ? 'bg-gradient-to-t from-steel-500 to-steel-300' : 'bg-gray-100'}`}
                      style={{ height: `${Math.max(pct, val > 0 ? 8 : 2)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-gray-400 mt-1">{i + 1}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// 탭 2: 정산 현황
// ============================================
function SettlementTab({ items, summary, carTxHistory }: {
  items: SettlementItem[]
  summary: { totalItems: number; pendingCount: number; pendingAmount: number; paidCount: number; paidAmount: number }
  carTxHistory: { related_id: string; type: string; amount: number; transaction_date: string; category?: string; client_name?: string; description?: string }[]
}) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'jiip' | 'invest' | 'loan'>('all')
  const [viewMode, setViewMode] = useState<'byDate' | 'list' | 'byCar'>('byDate')
  const [expandedCars, setExpandedCars] = useState<Set<string>>(new Set())

  const filtered = typeFilter === 'all' ? items : items.filter(i => i.type === typeFilter)

  // 차량별 그룹핑
  const carGroups = useMemo(() => {
    const groups: Record<string, { carNumber: string; items: SettlementItem[]; total: number; paidCount: number; pendingCount: number }> = {}
    const noCarItems: SettlementItem[] = []

    filtered.forEach(item => {
      const carKey = item.carNumber || ''
      if (!carKey) {
        noCarItems.push(item)
        return
      }
      if (!groups[carKey]) groups[carKey] = { carNumber: carKey, items: [], total: 0, paidCount: 0, pendingCount: 0 }
      groups[carKey].items.push(item)
      groups[carKey].total += item.amount
      if (item.status === 'paid') groups[carKey].paidCount++
      else groups[carKey].pendingCount++
    })

    const sorted = Object.values(groups).sort((a, b) => b.pendingCount - a.pendingCount || b.total - a.total)
    if (noCarItems.length > 0) {
      sorted.push({
        carNumber: '차량 미연결',
        items: noCarItems,
        total: noCarItems.reduce((s, i) => s + i.amount, 0),
        paidCount: noCarItems.filter(i => i.status === 'paid').length,
        pendingCount: noCarItems.filter(i => i.status !== 'paid').length,
      })
    }
    return sorted
  }, [filtered])

  // 납부일별 그룹핑
  const dateGroups = useMemo(() => {
    const groups: Record<number, { day: number; items: SettlementItem[]; total: number; paidCount: number; pendingCount: number }> = {}
    filtered.forEach(item => {
      const day = item.dueDay
      if (!groups[day]) groups[day] = { day, items: [], total: 0, paidCount: 0, pendingCount: 0 }
      groups[day].items.push(item)
      groups[day].total += item.amount
      if (item.status === 'paid') groups[day].paidCount++
      else groups[day].pendingCount++
    })
    return Object.values(groups).sort((a, b) => a.day - b.day)
  }, [filtered])

  const today = new Date().getDate()

  const toggleCarExpand = (carNumber: string) => {
    setExpandedCars(prev => {
      const next = new Set(prev)
      if (next.has(carNumber)) next.delete(carNumber)
      else next.add(carNumber)
      return next
    })
  }

  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  const overdueItems = filtered.filter(i => i.isOverdue)
  const overdueAmount = overdueItems.reduce((s, i) => s + i.amount, 0)

  const typeLabels: Record<string, { label: string; color: string; icon: string }> = {
    jiip: { label: '수익배분', color: 'bg-purple-100 text-purple-700', icon: '🤝' },
    invest: { label: '투자이자', color: 'bg-blue-100 text-blue-700', icon: '💰' },
    loan: { label: '대출상환', color: 'bg-orange-100 text-orange-700', icon: '🏦' },
  }

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: '미정산', color: 'bg-red-100 text-red-600' },
    approved: { label: '승인됨', color: 'bg-yellow-100 text-yellow-700' },
    paid: { label: '정산완료', color: 'bg-green-100 text-green-700' },
  }

  // 정산 항목 렌더링 (상세 포함)
  const renderItem = (item: SettlementItem) => {
    const tl = typeLabels[item.type]
    const sl = statusLabels[item.status]
    const isExpanded = expandedItem === item.id

    return (
      <div key={item.id} className={`border-b border-gray-50 last:border-0 ${item.isOverdue ? 'bg-red-50/30' : ''}`}>
        <button
          onClick={() => setExpandedItem(isExpanded ? null : item.id)}
          className="w-full px-5 py-3 flex items-center gap-2 hover:bg-gray-50 transition-colors text-left"
        >
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${tl.color}`}>
            {tl.icon} {tl.label}
          </span>
          {item.isOverdue && (
            <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold">이월</span>
          )}
          {item.monthLabel && (
            <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold">
              {item.monthLabel.slice(5)}월
            </span>
          )}
          <span className="font-bold text-gray-800 text-sm">{item.name}</span>
          {item.carNumber && (
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{item.carNumber}</span>
          )}
          <span className="flex-1"></span>
          <span className="text-xs text-gray-400 hidden md:inline max-w-[200px] truncate">{item.detail}</span>
          <span className="text-sm font-bold text-gray-800">{nf(item.amount)}원</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${sl.color}`}>{sl.label}</span>
          <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
        </button>

        {/* 상세 breakdown (지입 수익배분 상세) */}
        {isExpanded && item.breakdown && (() => {
          // 해당 차량의 기준월 거래내역 조회 (carId로 정확히 필터링)
          const txsForMonth = carTxHistory.filter(t =>
            t.transaction_date.startsWith(item.monthLabel || '') &&
            item.carId && t.related_id === item.carId
          )
          const incomeTxs = txsForMonth.filter(t => t.type === 'income')
          const expenseTxs = txsForMonth.filter(t => t.type === 'expense')

          return (
            <div className="mx-5 mb-3 space-y-2">
              {/* 정산 계산 요약 */}
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 border border-gray-100">
                <p className="text-xs font-bold text-gray-500 mb-2">📊 {item.monthLabel?.slice(5)}월분 수익배분 상세</p>
                <div className="flex justify-between">
                  <span className="text-gray-600">차량 수입</span>
                  <span className="font-bold text-blue-600">{nf(item.breakdown.revenue)}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">차량 비용 (유지비 등)</span>
                  <span className="font-bold text-red-500">-{nf(item.breakdown.expense)}원</span>
                </div>
                <div className="border-t border-dashed border-gray-200 my-1"></div>
                <div className="flex justify-between">
                  <span className="text-gray-700 font-bold">순수익</span>
                  <span className={`font-bold ${item.breakdown.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {nfSign(item.breakdown.netProfit)}원
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">지입비 (회사 수입)</span>
                  <span className="font-bold text-orange-600">-{nf(item.breakdown.adminFee)}원</span>
                </div>
                <div className="border-t border-dashed border-gray-200 my-1"></div>
                <div className="flex justify-between">
                  <span className="text-gray-700 font-bold">당월 배분대상</span>
                  <span className={`font-bold ${item.breakdown.distributable >= 0 ? 'text-gray-800' : 'text-red-500'}`}>
                    {nfSign(item.breakdown.distributable)}원
                  </span>
                </div>
                {item.breakdown.carryOver !== 0 && (
                  <div className="flex justify-between bg-red-50 rounded-lg px-2 py-1 -mx-1">
                    <span className="text-red-600 font-bold text-xs">전월 이월 적자</span>
                    <span className="font-bold text-red-600">{nfSign(item.breakdown.carryOver)}원</span>
                  </div>
                )}
                {item.breakdown.carryOver !== 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-700 font-bold">실제 배분대상 (당월+이월)</span>
                    <span className={`font-bold ${item.breakdown.effectiveDistributable >= 0 ? 'text-gray-800' : 'text-red-500'}`}>
                      {nfSign(item.breakdown.effectiveDistributable)}원
                    </span>
                  </div>
                )}
                {item.breakdown.effectiveDistributable <= 0 && (
                  <div className="bg-red-50 rounded-lg px-2 py-1.5 -mx-1 text-center">
                    <span className="text-red-600 font-bold text-xs">적자 → 다음 달 이월 ({nf(item.breakdown.effectiveDistributable)}원)</span>
                  </div>
                )}
                {item.breakdown.effectiveDistributable > 0 && (
                  <div className="flex justify-between bg-purple-50 rounded-lg px-2 py-1.5 -mx-1">
                    <span className="text-purple-700 font-bold">차주 배분 ({item.breakdown.shareRatio}%)</span>
                    <span className="font-black text-purple-700">{nf(item.breakdown.investorPayout)}원</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">회사 수익 (지입비 + {Math.round((100 - item.breakdown.shareRatio) * 10) / 10}%)</span>
                  <span className="text-gray-500">{nf(item.breakdown.companyProfit)}원</span>
                </div>
              </div>

              {/* 통장 거래 내역 (수입/비용 원본) */}
              {txsForMonth.length > 0 && (
                <div className="bg-white rounded-xl p-4 text-sm border border-gray-200">
                  <p className="text-xs font-bold text-gray-500 mb-3">📋 {item.monthLabel?.slice(5)}월 통장 분류 내역 ({item.carNumber})</p>

                  {incomeTxs.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-blue-500 mb-1.5">수입 ({incomeTxs.length}건)</p>
                      <div className="space-y-1">
                        {incomeTxs.map((tx, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs bg-blue-50/50 rounded-lg px-2.5 py-1.5">
                            <span className="text-gray-400 w-14 shrink-0">{tx.transaction_date.slice(5)}</span>
                            <span className="text-gray-500 w-20 shrink-0 truncate">{tx.category || '미분류'}</span>
                            <span className="text-gray-600 flex-1 truncate">{tx.client_name || tx.description || '-'}</span>
                            <span className="font-bold text-blue-600 shrink-0">+{nf(Math.abs(tx.amount))}원</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {expenseTxs.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-red-500 mb-1.5">비용 ({expenseTxs.length}건)</p>
                      <div className="space-y-1">
                        {expenseTxs.map((tx, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs bg-red-50/50 rounded-lg px-2.5 py-1.5">
                            <span className="text-gray-400 w-14 shrink-0">{tx.transaction_date.slice(5)}</span>
                            <span className="text-gray-500 w-20 shrink-0 truncate">{tx.category || '미분류'}</span>
                            <span className="text-gray-600 flex-1 truncate">{tx.client_name || tx.description || '-'}</span>
                            <span className="font-bold text-red-500 shrink-0">-{nf(Math.abs(tx.amount))}원</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {txsForMonth.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">해당 월 통장 거래 내역 없음</p>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* 투자 이자 상세 */}
        {isExpanded && item.type === 'invest' && (
          <div className="mx-5 mb-3 bg-blue-50 rounded-xl p-4 text-sm border border-blue-100">
            <p className="text-xs font-bold text-blue-600 mb-1">💰 투자이자 계산</p>
            <p className="text-gray-700">{item.detail}</p>
          </div>
        )}

        {/* 대출 상환 상세 */}
        {isExpanded && item.type === 'loan' && (
          <div className="mx-5 mb-3 bg-orange-50 rounded-xl p-4 text-sm border border-orange-100">
            <p className="text-xs font-bold text-orange-600 mb-1">🏦 대출 상환</p>
            <p className="text-gray-700">{item.detail}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* 요약 + 필터 바 */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', gap: 12, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
          전체 <b style={{ color: '#111827', fontWeight: 900 }}>{summary.totalItems}건</b>
        </span>
        {overdueItems.length > 0 && (
          <>
            <span style={{ width: 1, height: 14, background: '#e2e8f0' }} />
            <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>
              이월 미수 <b>{overdueItems.length}건</b> ({nf(overdueAmount)}원)
            </span>
          </>
        )}
        <span style={{ width: 1, height: 14, background: '#e2e8f0' }} />
        <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
          미정산 <b style={{ fontWeight: 900 }}>{summary.pendingCount}건</b>
          <span style={{ marginLeft: 4, color: '#ef4444' }}>{nf(summary.pendingAmount)}원</span>
        </span>
        <span style={{ width: 1, height: 14, background: '#e2e8f0' }} />
        <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
          완료 <b style={{ fontWeight: 900 }}>{summary.paidCount}건</b>
        </span>
      </div>

      {/* 뷰 모드 + 타입 필터 */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', gap: 8, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
        {[
          { key: 'byDate', label: '📅 납부일순' },
          { key: 'list', label: '📋 전체 목록' },
          { key: 'byCar', label: '🚛 차량별' },
        ].map(v => (
          <button
            key={v.key}
            onClick={() => setViewMode(v.key as any)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap',
              background: viewMode === v.key ? 'rgba(45,95,168,0.08)' : '#f8fafc',
              color: viewMode === v.key ? '#2d5fa8' : '#64748b',
              border: viewMode === v.key ? '1px solid rgba(45,95,168,0.3)' : '1px solid #e2e8f0',
            }}
          >
            {v.label}
          </button>
        ))}
        <span style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 4px' }} />
        {[
          { key: 'all' as const, label: '전체', count: items.length },
          { key: 'jiip' as const, label: '지입', count: items.filter(i => i.type === 'jiip').length },
          { key: 'invest' as const, label: '투자', count: items.filter(i => i.type === 'invest').length },
          { key: 'loan' as const, label: '대출', count: items.filter(i => i.type === 'loan').length },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap',
              background: typeFilter === f.key ? 'rgba(45,95,168,0.08)' : '#f8fafc',
              color: typeFilter === f.key ? '#2d5fa8' : '#64748b',
              border: typeFilter === f.key ? '1px solid rgba(45,95,168,0.3)' : '1px solid #e2e8f0',
            }}
          >
            {f.label} <span style={{ fontWeight: 900, marginLeft: 3 }}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* 납부일순 뷰 */}
      {viewMode === 'byDate' && (
        <div className="space-y-3">
          {dateGroups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
              해당 조건의 정산 항목이 없습니다.
            </div>
          ) : (
            dateGroups.map(group => {
              const isPast = today > group.day
              const isToday = today === group.day
              const allPaid = group.pendingCount === 0

              return (
                <div key={group.day} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                  isToday ? 'border-blue-300 ring-2 ring-blue-100' :
                  isPast && group.pendingCount > 0 ? 'border-red-200' :
                  allPaid ? 'border-green-200' : 'border-gray-200'
                }`}>
                  {/* 날짜 헤더 */}
                  <div className={`px-5 py-3 flex items-center gap-3 ${
                    isToday ? 'bg-blue-50' :
                    isPast && group.pendingCount > 0 ? 'bg-red-50' :
                    allPaid ? 'bg-green-50' : 'bg-gray-50'
                  }`}>
                    <span className="text-lg">
                      {isToday ? '📌' : isPast && group.pendingCount > 0 ? '🚨' : allPaid ? '✅' : '📅'}
                    </span>
                    <span className="font-black text-gray-800 text-lg">{group.day}일</span>
                    {isToday && <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold">오늘</span>}
                    {isPast && group.pendingCount > 0 && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">연체</span>}
                    <span className="flex-1"></span>
                    {group.pendingCount > 0 && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                        미지급 {group.pendingCount}건
                      </span>
                    )}
                    {group.paidCount > 0 && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                        완료 {group.paidCount}건
                      </span>
                    )}
                    <span className="text-sm font-black text-gray-800">{nf(group.total)}원</span>
                  </div>
                  {/* 항목들 */}
                  <div>
                    {group.items.map(item => renderItem(item))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* 리스트 뷰 */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">해당 조건의 정산 항목이 없습니다.</div>
          ) : (
            <div>
              {filtered.map(item => renderItem(item))}
            </div>
          )}
        </div>
      )}

      {/* 차량별 뷰 */}
      {viewMode === 'byCar' && (
        <div className="space-y-3">
          {carGroups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
              해당 조건의 정산 항목이 없습니다.
            </div>
          ) : (
            carGroups.map(group => {
              const isExpanded = expandedCars.has(group.carNumber)
              return (
                <div key={group.carNumber} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* 차량 헤더 */}
                  <button
                    onClick={() => toggleCarExpand(group.carNumber)}
                    className="w-full px-5 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className="text-lg">🚛</span>
                    <span className="font-bold text-gray-800 flex-1">{group.carNumber}</span>
                    <div className="flex items-center gap-2">
                      {group.pendingCount > 0 && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
                          미정산 {group.pendingCount}건
                        </span>
                      )}
                      {group.paidCount > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                          완료 {group.paidCount}건
                        </span>
                      )}
                      <span className="text-sm font-black text-gray-800">{nf(group.total)}원</span>
                      <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {/* 펼쳐진 항목 */}
                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      {group.items.map(item => renderItem(item))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ============================================
// 탭 3: 손익계산서
// ============================================
function PnLTab({ revenueBySource, expenseByGroup, summary, filterDate }: {
  revenueBySource: [string, { total: number; count: number; items: Transaction[] }][]
  expenseByGroup: [string, { total: number; count: number; items: Transaction[] }][]
  summary: { income: number; expense: number; profit: number }
  filterDate: string
}) {
  const totalIncome = summary.income
  const totalExpense = summary.expense
  const operatingProfit = summary.profit
  const profitRate = totalIncome > 0 ? ((operatingProfit / totalIncome) * 100).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      {/* 손익 요약 */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-2xl p-6 md:p-8 shadow-xl">
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-gray-400 text-sm font-bold mb-1">{filterDate} 손익계산서 요약</p>
            <h2 className="text-3xl md:text-4xl font-black">
              {operatingProfit >= 0 ? '+' : ''}{nf(operatingProfit)}<span className="text-lg ml-1 text-gray-400">원</span>
            </h2>
          </div>
          <div className={`text-right px-4 py-2 rounded-xl ${operatingProfit >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            <p className="text-xs text-gray-400">이익률</p>
            <p className={`text-2xl font-black ${operatingProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{profitRate}%</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 rounded-xl p-4">
            <p className="text-xs text-gray-400 font-bold">총 매출 (수입)</p>
            <p className="text-xl font-black text-blue-300 mt-1">{nf(totalIncome)}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4">
            <p className="text-xs text-gray-400 font-bold">총 비용 (지출)</p>
            <p className="text-xl font-black text-red-300 mt-1">{nf(totalExpense)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 수입 항목 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-blue-50/50">
            <h3 className="font-bold text-blue-800 flex items-center gap-2">
              🔵 수입 항목
              <span className="text-xs bg-blue-100 px-2 py-0.5 rounded-full">{nf(totalIncome)}원</span>
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {revenueBySource.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">수입 내역이 없습니다.</div>
            ) : (
              revenueBySource.map(([group, data]) => (
                <div key={group} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-700 text-sm">{group}</p>
                    <p className="text-xs text-gray-400">{data.count}건</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-blue-600">{nf(data.total)}</p>
                    <p className="text-xs text-gray-400">{totalIncome > 0 ? ((data.total / totalIncome) * 100).toFixed(1) : 0}%</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 지출 항목 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-red-50/50">
            <h3 className="font-bold text-red-800 flex items-center gap-2">
              🔴 지출 항목
              <span className="text-xs bg-red-100 px-2 py-0.5 rounded-full">{nf(totalExpense)}원</span>
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {expenseByGroup.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">지출 내역이 없습니다.</div>
            ) : (
              expenseByGroup.map(([group, data]) => (
                <div key={group} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-700 text-sm">{group}</p>
                    <p className="text-xs text-gray-400">{data.count}건</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-red-600">{nf(data.total)}</p>
                    <p className="text-xs text-gray-400">{totalExpense > 0 ? ((data.total / totalExpense) * 100).toFixed(1) : 0}%</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 비용 구조 시각화 */}
      {expenseByGroup.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-4">📊 비용 구조</h3>
          <div className="space-y-3">
            {expenseByGroup.map(([group, data]) => {
              const pct = totalExpense > 0 ? ((data.total / totalExpense) * 100) : 0
              const colors: Record<string, string> = {
                '지입/운송원가': 'from-purple-400 to-purple-600',
                '차량유지비': 'from-orange-400 to-orange-600',
                '금융비용': 'from-blue-400 to-blue-600',
                '인건비': 'from-green-400 to-green-600',
                '일반관리비': 'from-gray-400 to-gray-600',
                '기타': 'from-gray-300 to-gray-500',
              }
              return (
                <div key={group}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-bold text-gray-700">{group}</span>
                    <span className="font-bold text-gray-500">{nf(data.total)}원 ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${colors[group] || 'from-gray-400 to-gray-600'} rounded-full transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// 탭 4: 정산 실행
// ============================================
function ExecuteTab({ items, selectedIds, toggleSelect, toggleSelectAll, onExecute, executing, onSendNotify, sendingNotify, notifyChannel, setNotifyChannel, shareHistory, onTogglePaid }: {
  items: SettlementItem[]
  selectedIds: Set<string>
  toggleSelect: (id: string) => void
  toggleSelectAll: () => void
  onExecute: () => void
  executing: boolean
  onSendNotify: () => void
  sendingNotify: boolean
  notifyChannel: 'sms' | 'email'
  setNotifyChannel: (ch: 'sms' | 'email') => void
  shareHistory: { id: string; recipient_name: string; recipient_phone: string; settlement_month: string; total_amount: number; created_at: string; paid_at: string | null }[]
  onTogglePaid: (shareId: string, currentlyPaid: boolean) => void
}) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'jiip' | 'invest' | 'loan'>('all')
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [searchText, setSearchText] = useState('')

  // 필터 적용
  const applyFilters = (list: SettlementItem[]) => {
    let result = list
    if (typeFilter !== 'all') result = result.filter(i => i.type === typeFilter)
    if (monthFilter !== 'all') result = result.filter(i => i.monthLabel === monthFilter)
    if (searchText) {
      const t = searchText.toLowerCase()
      result = result.filter(i =>
        i.name.toLowerCase().includes(t) ||
        (i.carNumber || '').toLowerCase().includes(t)
      )
    }
    return result
  }

  const pendingItems = applyFilters(items.filter(i => i.status === 'pending'))
  const paidItems = applyFilters(items.filter(i => i.status === 'paid'))
  const selectedTotal = items.filter(i => selectedIds.has(i.id)).reduce((s, i) => s + i.amount, 0)

  // 고유 월 목록
  const uniqueMonths = [...new Set(items.map(i => i.monthLabel).filter(Boolean))].sort() as string[]

  const typeLabels: Record<string, { label: string; color: string; icon: string }> = {
    jiip: { label: '지입', color: 'bg-purple-100 text-purple-700', icon: '🤝' },
    invest: { label: '투자', color: 'bg-blue-100 text-blue-700', icon: '💰' },
    loan: { label: '대출', color: 'bg-orange-100 text-orange-700', icon: '🏦' },
  }

  return (
    <div>
      {/* 실행 컨트롤 바 */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#f8fafc' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={selectedIds.size === pendingItems.length && pendingItems.length > 0}
            onChange={toggleSelectAll}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>전체 선택</span>
        </label>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          {selectedIds.size}건 선택 <b style={{ color: '#111827' }}>{nf(selectedTotal)}원</b>
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={notifyChannel}
            onChange={(e) => setNotifyChannel(e.target.value as 'sms' | 'email')}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700 }}
          >
            <option value="sms">SMS</option>
            <option value="email">이메일</option>
          </select>
          <button
            onClick={onSendNotify}
            disabled={sendingNotify || selectedIds.size === 0}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: selectedIds.size > 0 ? '#2563eb' : '#e5e7eb', color: selectedIds.size > 0 ? '#fff' : '#9ca3af',
              border: 'none', opacity: sendingNotify ? 0.5 : 1,
            }}
          >
            {sendingNotify ? '발송중...' : '정산서 발송'}
          </button>
          <button
            onClick={onExecute}
            disabled={executing || selectedIds.size === 0}
            style={{
              padding: '6px 16px', borderRadius: 7, fontSize: 12, fontWeight: 800, cursor: 'pointer',
              background: selectedIds.size > 0 ? '#2d5fa8' : '#e5e7eb', color: selectedIds.size > 0 ? '#fff' : '#9ca3af',
              border: 'none', opacity: executing ? 0.5 : 1,
            }}
          >
            {executing ? '처리 중...' : `⚡ ${selectedIds.size}건 정산 실행`}
          </button>
        </div>
      </div>

      {/* 필터 바: 타입 + 월 + 검색 */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', gap: 8, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
        {[
          { key: 'all' as const, label: '전체', count: items.filter(i => i.status === 'pending').length },
          { key: 'jiip' as const, label: '지입', count: items.filter(i => i.status === 'pending' && i.type === 'jiip').length },
          { key: 'invest' as const, label: '투자', count: items.filter(i => i.status === 'pending' && i.type === 'invest').length },
          { key: 'loan' as const, label: '대출', count: items.filter(i => i.status === 'pending' && i.type === 'loan').length },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap',
              background: typeFilter === f.key ? 'rgba(45,95,168,0.08)' : '#f8fafc',
              color: typeFilter === f.key ? '#2d5fa8' : '#64748b',
              border: typeFilter === f.key ? '1px solid rgba(45,95,168,0.3)' : '1px solid #e2e8f0',
            }}
          >
            {f.label} <span style={{ fontWeight: 900, marginLeft: 3 }}>{f.count}</span>
          </button>
        ))}
        <span style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 4px' }} />
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700, background: '#f8fafc', color: '#374151' }}
        >
          <option value="all">전체 월</option>
          {uniqueMonths.map(m => (
            <option key={m} value={m}>{m.slice(5)}월</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="이름, 차량번호 검색..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{
            marginLeft: 'auto', padding: '7px 14px', border: '1px solid #e2e8f0',
            borderRadius: 8, fontSize: 13, minWidth: 180, outline: 'none',
            background: '#f8fafc', color: '#0f172a',
          }}
        />
      </div>

      {/* 미정산 목록 */}
      {pendingItems.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <p style={{ fontWeight: 700, color: '#374151' }}>해당 조건의 미정산 항목이 없습니다.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-left text-sm" style={{ minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                <th style={{ padding: '12px 16px', width: 40 }}></th>
                {['구분', '월', '대상', '차량', '납부일'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{h}</th>
                ))}
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'right' }}>금액</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>상세</th>
              </tr>
            </thead>
            <tbody>
              {pendingItems.map((item, idx) => {
                const tl = typeLabels[item.type]
                const isSelected = selectedIds.has(item.id)
                return (
                  <tr
                    key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    style={{ borderBottom: idx < pendingItems.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer' }}
                    className={`transition-colors ${
                      item.isOverdue ? (isSelected ? 'bg-red-100' : 'bg-red-50/30 hover:bg-red-50') :
                      isSelected ? 'bg-steel-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <input
                        type="checkbox" checked={isSelected}
                        onChange={(e) => { e.stopPropagation(); toggleSelect(item.id) }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: 16, height: 16 }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${tl.color}`}>{tl.icon} {tl.label}</span>
                        {item.isOverdue && <span style={{ fontSize: 9, background: '#ef4444', color: '#fff', padding: '2px 5px', borderRadius: 4, fontWeight: 700 }}>이월</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#6b7280' }}>{item.monthLabel?.slice(5)}월</td>
                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#111827' }}>{item.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#9ca3af' }}>{item.carNumber || '-'}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#4b5563' }}>{item.dueDate.slice(5)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 900, color: '#dc2626' }}>{nf(item.amount)}원</td>
                    <td style={{ padding: '12px 16px', fontSize: 11, color: '#9ca3af', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.detail}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 정산 완료 목록 */}
      {paidItems.length > 0 && (
        <div style={{ marginTop: 16, borderTop: '2px solid #e2e8f0' }}>
          <div style={{ padding: '12px 20px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #dcfce7' }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: '#166534' }}>✅ 정산 완료 ({paidItems.length}건)</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>정산서 발송 시 체크박스로 선택하세요</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-left text-sm" style={{ minWidth: 700 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                  <th style={{ padding: '10px 16px', width: 40 }}></th>
                  {['구분', '월', '대상', '차량', '납부일'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                  <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'right' }}>금액</th>
                </tr>
              </thead>
              <tbody>
                {paidItems.map((item, idx) => {
                  const tl = typeLabels[item.type]
                  const isSelected = selectedIds.has(item.id)
                  return (
                    <tr
                      key={item.id}
                      onClick={() => toggleSelect(item.id)}
                      style={{
                        borderBottom: idx < paidItems.length - 1 ? '1px solid #f3f4f6' : 'none',
                        cursor: 'pointer', background: isSelected ? '#f0fdf4' : 'transparent',
                        opacity: isSelected ? 1 : 0.6,
                      }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f9fafb' }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <td style={{ padding: '10px 16px' }}>
                        <input type="checkbox" checked={isSelected} onChange={(e) => { e.stopPropagation(); toggleSelect(item.id) }} onClick={(e) => e.stopPropagation()} style={{ width: 16, height: 16 }} />
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${tl.color}`}>{tl.icon} {tl.label}</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: '#6b7280' }}>{item.monthLabel?.slice(5)}월</td>
                      <td style={{ padding: '10px 16px', fontWeight: 800, color: '#111827' }}>{item.name}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: '#9ca3af' }}>{item.carNumber || '-'}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 700, color: '#4b5563' }}>{item.dueDate.slice(5)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 900, color: '#16a34a' }}>{nf(item.amount)}원</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 정산 발송 이력 / 지급 관리 */}
      {shareHistory.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', marginTop: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>📋 발송 이력 · 지급 관리</span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              {shareHistory.filter(s => s.paid_at).length}/{shareHistory.length}건 지급완료
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>수신자</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#6b7280' }}>금액</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>발송일</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>상태</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>처리</th>
                </tr>
              </thead>
              <tbody>
                {shareHistory.map(sh => (
                  <tr key={sh.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, color: '#111827' }}>{sh.recipient_name}</div>
                      {sh.recipient_phone && (
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                          {sh.recipient_phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#2d5fa8' }}>{nf(sh.total_amount)}원</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
                      {new Date(sh.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {sh.paid_at ? (
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', background: '#f0fdf4', padding: '3px 10px', borderRadius: 12 }}>지급완료</span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#f59e0b', background: '#fffbeb', padding: '3px 10px', borderRadius: 12 }}>대기</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <button
                        onClick={() => onTogglePaid(sh.id, !!sh.paid_at)}
                        style={{
                          padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          background: sh.paid_at ? '#fef2f2' : '#f0fdf4',
                          color: sh.paid_at ? '#dc2626' : '#16a34a',
                          border: `1px solid ${sh.paid_at ? '#fecaca' : '#bbf7d0'}`,
                        }}
                      >
                        {sh.paid_at ? '취소' : '지급완료'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// 탭 5: 통장분류 내역
// ============================================
function ClassifyTab({ items, jiips, investors, loans, filterDate }: {
  items: ClassifiedItem[]
  jiips: JiipContract[]
  investors: InvestContract[]
  loans: LoanContract[]
  filterDate: string
}) {
  const [targetFilter, setTargetFilter] = useState<'all' | 'jiip' | 'invest' | 'loan' | 'car' | 'salary' | 'other'>('all')
  const [searchText, setSearchText] = useState('')
  const [monthFilter, setMonthFilter] = useState<string>('all')

  // 이름 매핑 (related_id → 이름)
  const nameMap = useMemo(() => {
    const map: Record<string, string> = {}
    jiips.forEach(j => { map[j.id] = j.investor_name })
    investors.forEach(i => { map[i.id] = i.investor_name })
    loans.forEach(l => { map[l.id] = l.finance_name })
    return map
  }, [jiips, investors, loans])

  // 타입 라벨
  const typeLabels: Record<string, { label: string; color: string; bg: string }> = {
    jiip: { label: '지입', color: '#7c3aed', bg: '#f3e8ff' },
    invest: { label: '투자', color: '#2563eb', bg: '#dbeafe' },
    loan: { label: '대출', color: '#ea580c', bg: '#ffedd5' },
    car: { label: '차량', color: '#0d9488', bg: '#ccfbf1' },
    salary: { label: '급여', color: '#059669', bg: '#d1fae5' },
    freelancer: { label: '용역', color: '#6366f1', bg: '#e0e7ff' },
    insurance: { label: '보험', color: '#dc2626', bg: '#fee2e2' },
  }

  // 필터 적용
  const filtered = useMemo(() => {
    let list = items
    if (targetFilter !== 'all') {
      if (targetFilter === 'other') {
        list = list.filter(i => !i.final_related_type || !Object.keys(typeLabels).includes(i.final_related_type))
      } else {
        list = list.filter(i => i.final_related_type === targetFilter)
      }
    }
    if (monthFilter !== 'all') {
      list = list.filter(i => {
        const txDate = i.source_data?.transaction_date
        return txDate && txDate.slice(0, 7) === monthFilter
      })
    }
    if (searchText) {
      const t = searchText.toLowerCase()
      list = list.filter(i =>
        (i.source_data?.client_name || '').toLowerCase().includes(t) ||
        (i.source_data?.description || '').toLowerCase().includes(t) ||
        (i.final_category || '').toLowerCase().includes(t) ||
        (nameMap[i.final_related_id || ''] || '').toLowerCase().includes(t)
      )
    }
    return list
  }, [items, targetFilter, monthFilter, searchText, nameMap])

  // 고유 월 목록
  const uniqueMonths = useMemo(() => {
    const months = new Set<string>()
    items.forEach(i => {
      const m = i.source_data?.transaction_date?.slice(0, 7)
      if (m) months.add(m)
    })
    return [...months].sort().reverse()
  }, [items])

  // 요약 통계
  const stats = useMemo(() => {
    const totalIncome = filtered.filter(i => i.source_data?.type === 'income').reduce((s, i) => s + Math.abs(i.source_data?.amount || 0), 0)
    const totalExpense = filtered.filter(i => i.source_data?.type === 'expense').reduce((s, i) => s + Math.abs(i.source_data?.amount || 0), 0)
    const byType: Record<string, number> = {}
    filtered.forEach(i => {
      const t = i.final_related_type || '기타'
      byType[t] = (byType[t] || 0) + 1
    })
    return { totalIncome, totalExpense, byType, total: filtered.length }
  }, [filtered])

  return (
    <div>
      {/* 요약 바 */}
      <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          분류 완료 <b style={{ color: '#111827', fontSize: 14, fontWeight: 900 }}>{stats.total}건</b>
        </span>
        <span style={{ width: 1, height: 16, background: '#e2e8f0' }} />
        <span style={{ fontSize: 12, color: '#64748b' }}>
          수입 <b style={{ color: '#2563eb', fontSize: 14, fontWeight: 900 }}>{nf(stats.totalIncome)}원</b>
        </span>
        <span style={{ width: 1, height: 16, background: '#e2e8f0' }} />
        <span style={{ fontSize: 12, color: '#64748b' }}>
          지출 <b style={{ color: '#dc2626', fontSize: 14, fontWeight: 900 }}>{nf(stats.totalExpense)}원</b>
        </span>
      </div>

      {/* 필터 바 */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', gap: 8, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
        {[
          { key: 'all' as const, label: '전체' },
          { key: 'jiip' as const, label: '지입' },
          { key: 'invest' as const, label: '투자' },
          { key: 'loan' as const, label: '대출' },
          { key: 'car' as const, label: '차량' },
          { key: 'salary' as const, label: '급여' },
          { key: 'other' as const, label: '기타' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setTargetFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap',
              background: targetFilter === f.key ? 'rgba(45,95,168,0.08)' : '#f8fafc',
              color: targetFilter === f.key ? '#2d5fa8' : '#64748b',
              border: targetFilter === f.key ? '1px solid rgba(45,95,168,0.3)' : '1px solid #e2e8f0',
            }}
          >
            {f.label}
            {f.key !== 'all' && stats.byType[f.key === 'other' ? '기타' : f.key] ? (
              <span style={{ fontWeight: 900, marginLeft: 3 }}>{stats.byType[f.key === 'other' ? '기타' : f.key]}</span>
            ) : null}
            {f.key === 'all' && <span style={{ fontWeight: 900, marginLeft: 3 }}>{stats.total}</span>}
          </button>
        ))}
        <span style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 4px' }} />
        <select
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700, background: '#f8fafc', color: '#374151' }}
        >
          <option value="all">전체 월</option>
          {uniqueMonths.map(m => (
            <option key={m} value={m}>{m.slice(2, 4)}년 {m.slice(5)}월</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="거래처, 내용, 분류명 검색..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{
            marginLeft: 'auto', padding: '7px 14px', border: '1px solid #e2e8f0',
            borderRadius: 8, fontSize: 13, minWidth: 200, outline: 'none',
            background: '#f8fafc', color: '#0f172a',
          }}
        />
      </div>

      {/* 내역 테이블 */}
      {filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏦</div>
          <p style={{ fontWeight: 700, color: '#374151' }}>분류 완료된 통장 내역이 없습니다.</p>
          <p style={{ fontSize: 12, marginTop: 6, color: '#9ca3af' }}>통장 엑셀을 업로드하고 AI 분류를 실행해주세요.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-left text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                {['거래일', '구분', '거래처', '내용', '분류', '연결대상', '신뢰도'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{h}</th>
                ))}
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'right' }}>금액</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const sd = item.source_data || {} as ClassifiedItem['source_data']
                const relType = item.final_related_type || ''
                const tl = typeLabels[relType]
                const matchedName = nameMap[item.final_related_id || ''] || ''
                const confidence = item.ai_confidence || 0
                return (
                  <tr
                    key={item.id}
                    style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #f3f4f6' : 'none' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f9fafb'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {sd.transaction_date?.slice(5) || '-'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: sd.type === 'income' ? '#dbeafe' : '#fee2e2',
                        color: sd.type === 'income' ? '#2563eb' : '#dc2626',
                      }}>
                        {sd.type === 'income' ? '입금' : '출금'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#111827', fontSize: 13 }}>
                      {sd.client_name || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sd.description || '-'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                        {item.final_category || item.ai_category || '-'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {tl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: tl.bg, color: tl.color }}>
                            {tl.label}
                          </span>
                          {matchedName && <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{matchedName}</span>}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {confidence > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 40, height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{
                              width: `${confidence}%`, height: '100%', borderRadius: 2,
                              background: confidence >= 80 ? '#22c55e' : confidence >= 60 ? '#f59e0b' : '#ef4444',
                            }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: confidence >= 80 ? '#16a34a' : confidence >= 60 ? '#d97706' : '#dc2626' }}>
                            {confidence}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{
                      padding: '12px 16px', textAlign: 'right', fontWeight: 900,
                      color: sd.type === 'income' ? '#2563eb' : '#dc2626',
                    }}>
                      {sd.type === 'income' ? '+' : '-'}{nf(Math.abs(sd.amount || 0))}원
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
