'use client'
import { auth } from '@/lib/firebase'

import { useApp } from '../../context/AppContext'
import { useEffect, useState, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import * as XLSX from 'xlsx'
import ContractsTab from './ContractsTab'
import ExecuteTab from './ExecuteTab'
async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/firebase')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

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
  paidTxIds?: string[]          // 정산 완료 시 해당 transaction ID(s) — 취소 시 직접 삭제용
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
    investorPayout: number     // 차주 배분금 (세전)
    companyProfit: number      // 회사 수익
    taxType?: string           // 세금 유형 (세금계산서, 사업소득(3.3%), 이자소득(27.5%))
    taxRate?: number           // 세율 (%)
    taxAmount?: number         // 공제액 또는 VAT
    supplyAmount?: number      // 공급가 (세금계산서: 배분금/1.1)
    netPayout?: number         // 실수령액
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
  tax_type?: string
  cars?: { number: string; model?: string }
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
  tax_type?: string  // '이자소득(27.5%)', '사업소득(3.3%)', '세금계산서' 등
  grace_period_months?: number  // 거치기간 (개월)
}

type InvestDeposit = {
  id: string
  investment_id: string
  deposit_date: string
  amount: number
  memo?: string
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
  final_matched_type?: string
  final_matched_id?: string
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
  const { company, role } = useApp()
  const effectiveCompanyId = company?.id

  // 상태
  const [activeTab, setActiveTab] = useState<'contracts' | 'revenue' | 'settlement' | 'pnl' | 'execute'>('contracts')
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
  const [shareHistory, setShareHistory] = useState<{ id: string; recipient_name: string; recipient_phone: string; settlement_month: string; total_amount: number; created_at: string; paid_at: string | null; items?: any[] }[]>([])
  const [investDepositHistory, setInvestDepositHistory] = useState<{ id: string; transaction_date: string; amount: number; type: string; related_id: string; client_name?: string; description?: string; category?: string }[]>([])

  // 계약 현황 탭 데이터 (전체 계약 — active/expired/terminated 포함)
  const [allJiipContracts, setAllJiipContracts] = useState<any[]>([])
  const [allInvestContracts, setAllInvestContracts] = useState<any[]>([])
  const [contractsSettleTxs, setContractsSettleTxs] = useState<any[]>([])
  const [allPaidShares, setAllPaidShares] = useState<any[]>([])

  // 정산 실행 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [executing, setExecuting] = useState(false)
  const [sendingNotify, setSendingNotify] = useState(false)
  const [notifyChannel, setNotifyChannel] = useState<'sms' | 'email'>('sms')
  const [notifyStep, setNotifyStep] = useState(1) // 스텝 상태를 부모에서 관리
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

  // 이체 미리보기 상태
  type TransferRow = {
    bank: string
    account: string
    holder: string
    amount: number
    senderLabel: string
    memo: string
    type: string         // jiip, invest, loan
    name: string         // 대상자 이름
  }
  const [transferPreview, setTransferPreview] = useState<TransferRow[]>([])
  const [showTransferPreview, setShowTransferPreview] = useState(false)

  // 정산 설정 (Step 1에서 설정)
  type SettlementSettings = {
    settlementMonth: string   // 정산월 (예: 2026-01)
    paymentDate: string       // 지급예정일 (예: 2026-03-15)
    memo: string              // 메모/안내사항
  }
  const [settlementSettings, setSettlementSettings] = useState<SettlementSettings>({
    settlementMonth: filterDate,
    paymentDate: new Date().toISOString().slice(0, 10),
    memo: '',
  })

  // filterDate 변경 시 정산월 동기화
  useEffect(() => {
    setSettlementSettings(prev => ({ ...prev, settlementMonth: filterDate }))
  }, [filterDate])

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
  }, [filterDate, company, pathname])

  // 탭 포커스 시 자동 새로고침
  useEffect(() => {
    const onFocus = () => fetchAllData()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [filterDate, company])

  // shareHistory가 로드되면: 정산월 자동 감지 + 이체 미리보기 빌드 (execute 탭일 때만)
  useEffect(() => {
    if (shareHistory.length > 0 && !loading) {
      // 가장 최근 발송 이력의 정산월이 현재 filterDate와 다르면 자동 전환
      const latestMonth = shareHistory[0]?.settlement_month
      if (latestMonth && latestMonth !== filterDate) {
        setFilterDate(latestMonth)
        // filterDate 변경 시 useEffect에서 fetchAllData가 다시 호출되므로 여기서는 빌드 안 함
        return
      }
      // execute 탭일 때만 자동 빌드 (silent=true로 alert 방지)
      if (activeTab === 'execute' && transferPreview.length === 0) {
        handleBuildTransferPreview(true)
      }
    }
  }, [shareHistory, loading, activeTab])

  const fetchAllData = async () => {
    if (!effectiveCompanyId && role !== 'admin') return
    setLoading(true)

    const [year, month] = filterDate.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const startDate = `${filterDate}-01`
    const endDate = `${filterDate}-${lastDay}`

    // 과거 12개월 시작일 (미수 누적 확인용)
    const past12Start = `${year - 1}-${String(month).padStart(2, '0')}-01`

    // 병렬 로드
    const headers = await getAuthHeader()
    const [txRes, jiipRes, investRes, loanRes, allSettleRes, carTxRes, classifyRes, shareHistoryRes, investDepositsRes, investTxDepositsRes, allJiipRes, allInvestRes, contractsSettleTxRes, allPaidSharesRes] = await Promise.all([
      // 거래 내역 (당월)
      fetch(`/api/transactions?from=${startDate}&to=${endDate}`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      // 지입 계약 (active status)
      fetch('/api/jiip?status=active', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      // 투자자 (active status)
      fetch('/api/investments?status=active', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      // 대출
      fetch('/api/loans', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      // 전체 정산 거래 (지난 12개월)
      fetch(`/api/transactions?related_type=jiip_share,invest,loan&type=expense&from=${past12Start}`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      // 차량별 거래 내역 (지난 12개월)
      fetch(`/api/transactions?related_type=car&from=${past12Start}`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      // 통장분류 내역 (당월 confirmed)
      fetch('/api/classification-queue?status=confirmed,auto_confirmed&limit=500', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      // 정산 발송 이력
      (() => {
        const [y, m] = filterDate.split('-').map(Number)
        const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
        return fetch(`/api/settlement/shares?months=${filterDate},${prevMonth}`, { headers }).then(r => r.json()).catch(() => ({ data: [] }))
      })(),
      // 투자금 입금 내역
      fetch('/api/investment-deposits', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      // 투자 관련 거래 내역
      fetch('/api/transactions?related_type=invest', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      // 전체 지입 계약 (모든 상태)
      fetch('/api/jiip', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      // 전체 투자 계약
      fetch('/api/investments', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      // 정산 거래 (지입/투자)
      fetch('/api/transactions?related_type=jiip_share,invest', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      // 지급완료된 정산 내역
      fetch('/api/settlement/shares?paid_only=true', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    ])

    const txs = txRes.data || []
    const jiipData = jiipRes.data || []
    const investData = investRes.data || []
    const loanData = loanRes.data || []
    const allSettleTxs = allSettleRes.data || []
    const carTxs = carTxRes.data || []
    const classifyData = (classifyRes.data || []) as ClassifiedItem[]
    setShareHistory(shareHistoryRes.data || [])
    const investDeposits: InvestDeposit[] = investDepositsRes?.data || []
    // 통장 거래 기반 투자금 거래 내역 (income=입금, expense=이자지급 등)
    const investTxDeposits: { id: string; transaction_date: string; amount: number; type: string; related_id: string; client_name?: string; description?: string; category?: string }[] =
      (investTxDepositsRes?.data || []).map((t: any) => ({
        id: t.id,
        transaction_date: t.transaction_date,
        amount: Math.abs(Number(t.amount) || 0),
        type: t.type || 'income',
        related_id: String(t.related_id || ''),
        client_name: t.client_name || '',
        description: t.description || '',
        category: t.category || '',
      }))

    // 계약 현황 탭 데이터 설정
    setAllJiipContracts(allJiipRes?.data || [])
    setAllInvestContracts(allInvestRes?.data || [])
    setContractsSettleTxs(contractsSettleTxRes?.data || [])
    setAllPaidShares(allPaidSharesRes?.data || [])

    // 디버그: 투자/대출 데이터 확인
    console.log('[Settlement] investData:', investData.map((i: any) => ({
      id: i.id, name: i.investor_name, amount: i.invest_amount, rate: i.interest_rate,
      startDate: i.contract_start_date, status: i.status,
    })))
    console.log('[Settlement] loanData:', loanData.map((l: any) => ({
      id: l.id, name: l.finance_name, monthly: l.monthly_payment,
      startDate: l.start_date, status: l.status,
    })))
    console.log('[Settlement] investDeposits(table):', investDeposits.length, '건, investTxDeposits(transactions):', investTxDeposits.length, '건')

    setInvestDepositHistory(investTxDeposits)
    setTransactions(txs)
    setJiips(jiipData)
    setInvestors(investData)
    setLoans(loanData)
    setCarTxHistory(carTxs)
    setClassifiedItems(classifyData)

    // 정산 항목 생성 (미수 누적 포함)
    buildSettlementItems(jiipData, investData, loanData, filterDate, allSettleTxs, carTxs, investDeposits, investTxDeposits)
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
    allSettleTxs: { id: string; related_type: string; related_id: string; transaction_date: string; amount: number }[],
    carTxs: { related_type: string; related_id: string; type: string; amount: number; transaction_date: string; category?: string }[],
    investDeposits?: InvestDeposit[],
    investTxDeposits?: { id: string; transaction_date: string; amount: number; type: string; related_id: string; client_name?: string; description?: string; category?: string }[]
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
    // `${related_type}_${related_id}_${기준월}` → [txId, ...] 매핑
    const paidMap = new Map<string, string[]>()
    allSettleTxs.forEach(t => {
      const txMonth = t.transaction_date.slice(0, 7)
      const baseMonth = prevMonthStr(txMonth)
      const key = `${t.related_type}_${t.related_id}_${baseMonth}`
      const existing = paidMap.get(key) || []
      existing.push(t.id)
      paidMap.set(key, existing)
    })
    // shareHistory 기반 지급완료 확인 (이름 → paid 상태)
    // settlement_shares.paid_at가 있으면 해당 수신자의 항목은 지급완료
    const paidNameSet = new Set<string>()
    shareHistory.forEach(sh => {
      if (sh.paid_at) paidNameSet.add(sh.recipient_name)
    })
    // paidSet 호환용: transactions 또는 shareHistory 둘 중 하나라도 있으면 paid
    const paidSet = { has: (key: string) => paidMap.has(key) }

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
        const isPaid = paidSet.has(`jiip_share_${j.id}_${m}`) || paidNameSet.has(j.investor_name)
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

        // 세금 계산
        // 세금계산서: 배분금 = 공급가 + 부가세(VAT) → 공급가 = 배분금/1.1, VAT = 배분금-공급가
        //   실수령액 = 배분금 그대로 (세금계산서 발행 목적의 내역 분리만)
        // 사업소득(3.3%): 원천징수 3.3% 차감 → 실수령액 = 배분금 - 3.3%
        // 이자소득(27.5%): 원천징수 27.5% 차감 → 실수령액 = 배분금 - 27.5%
        const taxType = j.tax_type || '세금계산서'
        let taxRate = 0
        let taxAmount = 0
        let netPayout = investorPayout
        let supplyAmount = 0  // 공급가 (세금계산서용)
        if (taxType === '세금계산서') {
          taxRate = 10
          supplyAmount = investorPayout > 0 ? Math.round(investorPayout / 1.1) : 0
          taxAmount = investorPayout - supplyAmount  // VAT = 배분금 - 공급가
          netPayout = investorPayout  // 배분금 = 실수령액 (변동 없음)
        } else if (taxType === '사업소득(3.3%)') {
          taxRate = 3.3
          taxAmount = investorPayout > 0 ? Math.round(investorPayout * taxRate / 100) : 0
          netPayout = investorPayout - taxAmount  // 원천징수 차감
        } else if (taxType === '이자소득(27.5%)') {
          taxRate = 27.5
          taxAmount = investorPayout > 0 ? Math.round(investorPayout * taxRate / 100) : 0
          netPayout = investorPayout - taxAmount  // 원천징수 차감
        }

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
          amount: netPayout,
          dueDay,
          dueDate: `${actualDueMonth}-${dueDay.toString().padStart(2, '0')}`,
          status: isPaid ? 'paid' : 'pending',
          relatedId: j.id,
          paidTxIds: isPaid ? paidMap.get(`jiip_share_${j.id}_${m}`) : undefined,
          detail: effectiveDistributable > 0
            ? `${m.slice(5)}월분: 배분대상${nf(effectiveDistributable)}×${shareRatio}%`
            : `${m.slice(5)}월분: 적자${nf(effectiveDistributable)}${carryNote}`,
          carNumber: j.cars?.number,
          carModel: j.cars?.model,
          carId: j.car_id ? String(j.car_id) : undefined,
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
            taxType,
            taxRate,
            taxAmount,
            supplyAmount,
            netPayout,
          },
        })
      })
    })

    // ── 2. 투자 이자 ──
    // 월이자 = 해당월 투자원금 × 연이자율% ÷ 12
    // 투자금은 입금내역(investment_deposits)에 따라 월별로 다를 수 있음
    // 세금: tax_type에 따라 공제 적용
    // 기준월 N의 이자 → N+1월에 지급
    const deposits = investDeposits || []

    // ============================================
    // 투자 원금 잔액 및 일할계산 가중평균잔액
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
    const getInvestBalanceWithDaily = (
      investId: string,
      baseMonth: string,
      fallbackAmount: number,
      contractStartDate?: string,
      gracePeriodMonths?: number
    ): { balance: number; dailyWeightedBalance: number; isGracePeriod: boolean; hasDepositData: boolean } => {
      const [y, mo] = baseMonth.split('-').map(Number)
      const daysInMonth = new Date(y, mo, 0).getDate()
      const monthStart = `${baseMonth}-01`
      const endOfMonth = `${baseMonth}-${String(daysInMonth).padStart(2, '0')}`

      // ── 거치기간 확인 ──
      const grace = gracePeriodMonths || 0
      let isGracePeriod = false
      if (grace > 0 && contractStartDate) {
        const startDate = new Date(contractStartDate)
        const graceEndDate = new Date(startDate.getFullYear(), startDate.getMonth() + grace, startDate.getDate())
        const monthEndDate = new Date(y, mo - 1, daysInMonth) // baseMonth의 말일
        if (monthEndDate < graceEndDate) {
          isGracePeriod = true
        }
      }

      // ── 입금/상환 이벤트 수집 ──
      // 통장 거래 기반: 입금(income) = +원금, 원금상환(expense) = -원금
      // ★ 이자 지급은 원금에 영향 없음 → category로 구분
      const txAll = (investTxDeposits || []).filter(t =>
        String(t.related_id) === String(investId)
      )
      const txDeposits = txAll.filter(t => t.type === 'income') // 원금 입금
      const txRepayments = txAll.filter(t => t.type === 'expense') // 원금 상환 + 이자 지급
      const invDeposits = deposits.filter(d => String(d.investment_id) === String(investId))

      // 전체 입금 내역 존재 여부
      const hasAnyInvDeposits = invDeposits.length > 0
      const hasAnyTxDeposits = txDeposits.length > 0
      const hasDepositData = hasAnyInvDeposits || hasAnyTxDeposits

      type BalanceEvent = { date: string; amount: number }
      const allEvents: BalanceEvent[] = []

      // investment_deposits 테이블 (전체 기간)
      if (hasAnyInvDeposits) {
        invDeposits.forEach(d => {
          allEvents.push({ date: d.deposit_date, amount: d.amount })
        })
      } else if (hasAnyTxDeposits) {
        // 통장 거래 fallback (입금만 → +)
        txDeposits.forEach(t => {
          allEvents.push({
            date: t.transaction_date.slice(0, 10),
            amount: t.amount,
          })
        })
      }

      // ★ 원금 상환(expense) 이벤트 추가 — 투자원금에서 차감
      // 이자 지급은 원금에 영향 없으므로 제외
      // 판단 기준: category/description에 '이자'가 포함 → 이자 지급
      //           '원금', '상환', '반환' 포함 또는 이자가 아닌 expense → 원금 상환
      txRepayments.forEach(t => {
        const desc = ((t.client_name || '') + (t.description || '') + (t.category || '')).toLowerCase()
        const isInterestPayment = desc.includes('이자') || desc.includes('interest') || desc.includes('배당')
        if (!isInterestPayment) {
          // 원금 상환 → 마이너스로 반영 (투자잔액 감소)
          allEvents.push({
            date: t.transaction_date.slice(0, 10),
            amount: -t.amount,
          })
          console.log(`[getInvestBalance] invest=${investId} 원금상환: ${t.transaction_date} -${t.amount.toLocaleString()}원 (${t.description || t.client_name || '상환'})`)
        }
      })

      // ── 입금 내역이 전혀 없는 경우: 계약금액 기반 fallback ──
      if (allEvents.length === 0) {
        // 입금 기록이 없으면 계약시작일부터 전액 투자로 간주 (하위 호환)
        if (contractStartDate && contractStartDate.slice(0, 7) > baseMonth) {
          // 계약시작 전 → 0원
          return { balance: 0, dailyWeightedBalance: 0, isGracePeriod, hasDepositData: false }
        }
        if (contractStartDate && contractStartDate.slice(0, 7) === baseMonth) {
          // 계약 시작 월: 시작일부터 일할 적용
          const startDay = parseInt(contractStartDate.slice(8, 10)) || 1
          const remainingDays = daysInMonth - startDay + 1
          const dailyWeighted = Math.floor(fallbackAmount * remainingDays / daysInMonth)
          return { balance: fallbackAmount, dailyWeightedBalance: dailyWeighted, isGracePeriod, hasDepositData: false }
        }
        return { balance: fallbackAmount, dailyWeightedBalance: fallbackAmount, isGracePeriod, hasDepositData: false }
      }

      // ── 입금 내역 기반 일할계산 ──
      allEvents.sort((a, b) => a.date.localeCompare(b.date))

      // 해당 월 이전까지의 누적 잔액
      let runningBalance = 0
      const beforeMonth = allEvents.filter(e => e.date < monthStart)
      beforeMonth.forEach(e => { runningBalance += e.amount })

      // 해당 월 이내 입금 이벤트
      const inMonth = allEvents
        .filter(e => e.date >= monthStart && e.date <= endOfMonth)
        .sort((a, b) => a.date.localeCompare(b.date))

      // 일별 가중치 계산
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
      // 마지막 이벤트 이후 월말까지
      const remainDays = daysInMonth - prevDay + 1
      if (remainDays > 0) {
        weightedSum += runningBalance * remainDays
      }

      const dailyWeightedBalance = Math.floor(weightedSum / daysInMonth)
      const monthEndBalance = runningBalance

      if (dailyWeightedBalance !== monthEndBalance || isGracePeriod) {
        console.log(`[getInvestBalance] invest=${investId} month=${baseMonth} → 월말잔액 ${monthEndBalance.toLocaleString()} / 가중평균잔액 ${dailyWeightedBalance.toLocaleString()} (일할계산)${isGracePeriod ? ' [거치기간]' : ''}`)
      }

      return {
        balance: monthEndBalance,
        dailyWeightedBalance: dailyWeightedBalance,
        isGracePeriod,
        hasDepositData: true,
      }
    }

    // 이전 호환용 래퍼 (이자 계산에 직접 사용)
    const getInvestBalance = (investId: string, baseMonth: string, fallbackAmount: number, contractStartDate?: string, gracePeriodMonths?: number): number => {
      const result = getInvestBalanceWithDaily(investId, baseMonth, fallbackAmount, contractStartDate, gracePeriodMonths)
      // 거치기간이면 이자 0원 → 가중평균잔액을 0으로 반환
      if (result.isGracePeriod) return 0
      return result.dailyWeightedBalance
    }

    console.log('[Settlement] Processing investData, count:', investData.length)
    investData.forEach(inv => {
      const rate = inv.interest_rate || 0
      if (rate === 0) return

      // 기준월 목록 (계약시작월 ~ 선택월 전월)
      const baseMonths = getBaseMonths(inv.contract_start_date?.slice(0, 7))

      // 당월 시작 계약: getBaseMonths가 빈 배열이면 당월을 포함하여 표시
      const contractStartMonth = inv.contract_start_date?.slice(0, 7)
      if (baseMonths.length === 0 && contractStartMonth && contractStartMonth <= selectedMonth) {
        baseMonths.push(contractStartMonth)
      }

      // 세금 타입
      const taxType = inv.tax_type || '이자소득(27.5%)'

      baseMonths.forEach(m => {
        const isPaid = paidSet.has(`invest_${inv.id}_${m}`) || paidNameSet.has(inv.investor_name)
        const paymentMonth = nextMonthStr(m)
        const isCurrentPayment = paymentMonth === selectedMonth
        // 투자: 정산 완료된 월도 모두 표시 (지입과 달리 이월 누적 없으므로 전체 이력 표시)

        // 해당 월 기준 투자 원금 (입금내역 반영, 입금일 기준 일할계산, 거치기간 적용)
        const currentBalance = getInvestBalance(String(inv.id), m, inv.invest_amount || 0, inv.contract_start_date, inv.grace_period_months)
        const monthlyInterest = Math.floor((currentBalance * (rate / 100)) / 12)
        if (monthlyInterest === 0) return

        // 세금 계산
        let taxRate = 0, taxAmount = 0, supplyAmount = 0, netPayout = monthlyInterest
        if (taxType === '세금계산서') {
          taxRate = 10
          supplyAmount = Math.round(monthlyInterest / 1.1)
          taxAmount = monthlyInterest - supplyAmount
          netPayout = monthlyInterest // 배분금 = 실수령액
        } else if (taxType === '사업소득(3.3%)') {
          taxRate = 3.3
          taxAmount = Math.round(monthlyInterest * taxRate / 100)
          netPayout = monthlyInterest - taxAmount
        } else if (taxType === '이자소득(27.5%)') {
          taxRate = 27.5
          taxAmount = Math.round(monthlyInterest * taxRate / 100)
          netPayout = monthlyInterest - taxAmount
        }

        const dueDay = inv.payment_day || 10
        const isNextMonthPayment = paymentMonth > selectedMonth
        const isOverdueInv = !isCurrentPayment && !isPaid && !isNextMonthPayment
        const actualDueMonthInv = isOverdueInv ? selectedMonth : paymentMonth

        // 세전/세후 표시 여부
        const hasTax = taxRate > 0 && taxType !== '세금계산서'
        const displayAmount = netPayout // 실지급액 기준

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
          detail: (() => {
            const balDetail = getInvestBalanceWithDaily(String(inv.id), m, inv.invest_amount || 0, inv.contract_start_date, inv.grace_period_months)
            const balanceNote = balDetail.hasDepositData
              ? `가중평균잔액 ${nf(currentBalance)}원 (월말잔액 ${nf(balDetail.balance)}원)`
              : `원금 ${nf(currentBalance)}원`
            const prefix = isNextMonthPayment ? `${m.slice(5)}월분 (${paymentMonth.slice(5)}월 지급예정)` : `${m.slice(5)}월분`
            return `${prefix}: ${balanceNote} × ${rate}% ÷ 12`
          })(),
          carNumber: inv.car_number,
          carId: inv.car_id,
          monthLabel: m,
          isOverdue: isOverdueInv,
          breakdown: {
            revenue: currentBalance, // 투자 원금 (표시용)
            expense: 0,
            adminFee: 0,
            netProfit: monthlyInterest, // 세전 이자
            distributable: monthlyInterest,
            carryOver: 0,
            effectiveDistributable: monthlyInterest,
            shareRatio: rate,
            investorPayout: monthlyInterest, // 세전 금액
            companyProfit: 0,
            taxType,
            taxRate,
            taxAmount,
            supplyAmount,
            netPayout,
          },
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
          related_id: String(item.relatedId),
          
        }
      })

      if (newTxs.length === 0) {
        alert('이미 처리된 항목이거나 처리할 항목이 없습니다.')
        setExecuting(false)
        return
      }

      const headers = await getAuthHeader()
      const res = await fetch('/api/transactions', { method: 'POST', headers, body: JSON.stringify({ transactions: newTxs }) })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || '거래 등록 실패')
      }

      alert(`✅ ${newTxs.length}건 정산 완료!`)
      setSelectedIds(new Set())
      fetchAllData()
    } catch (e: any) {
      alert('정산 실행 실패: ' + e.message)
    }
    setExecuting(false)
  }

  // ============================================
  // 다계좌이체 Excel 파일 생성 (우리은행 양식)
  // 열: 입금은행 | 계좌번호 | 이체금액 | 보내는분표시 | 받는분표시 | CMS번호
  // ============================================
  const handleDownloadBulkTransfer = async () => {
    const selected = settlementItems.filter(i => selectedIds.has(i.id) && i.status === 'pending')
    if (selected.length === 0) return alert('이체할 항목을 선택해주세요.')

    try {
      // 수신자별 은행정보 조회
      const bankMap: Record<string, { bank: string; account: string; holder: string }> = {}

      for (const item of selected) {
        const key = `${item.type}_${item.relatedId}`
        if (bankMap[key]) continue

        if (item.type === 'jiip') {
          // 지입: cars.owner_bank 우선 → jiip_contracts.bank_name fallback
          const jiip = jiips.find(j => String(j.id) === String(item.relatedId))
          const carBank = (jiip?.cars as any)?.owner_bank || ''
          const carAccount = (jiip?.cars as any)?.owner_account || ''
          const carHolder = (jiip?.cars as any)?.owner_account_holder || ''
          const jcBank = (jiip as any)?.bank_name || ''
          const jcAccount = (jiip as any)?.account_number || ''
          const jcHolder = (jiip as any)?.account_holder || ''
          bankMap[key] = {
            bank: carBank || jcBank || '',
            account: carAccount || jcAccount || '',
            holder: carHolder || jcHolder || item.name,
          }
        } else if (item.type === 'invest') {
          // 투자: investors의 은행정보
          const inv = investors.find(i => String(i.id) === String(item.relatedId))
          if (inv) {
            const headers = await getAuthHeader()
            const res = await fetch(`/api/general_investments?id=${item.relatedId}`, { headers })
            const json = await res.json()
            const invDetail = json.data ?? json ?? null
            if (invDetail) {
              bankMap[key] = {
                bank: invDetail.bank_name || '',
                account: invDetail.account_number || '',
                holder: invDetail.account_holder || item.name,
              }
            }
          }
        } else if (item.type === 'loan') {
          // 대출: 금융사 정보 (loans 테이블에 은행정보 없을 수 있음)
          const loan = loans.find(l => String(l.id) === String(item.relatedId))
          bankMap[key] = {
            bank: loan?.finance_name || '',
            account: '',
            holder: loan?.finance_name || '',
          }
        }

        if (!bankMap[key]) {
          bankMap[key] = { bank: '', account: '', holder: item.name }
        }
      }

      // 수신자별 합산 (같은 사람에게 여러 건이면 합산)
      const recipientMap: Record<string, { bank: string; account: string; holder: string; amount: number; memo: string; senderLabel: string }> = {}
      selected.forEach(item => {
        const bankKey = `${item.type}_${item.relatedId}`
        const bi = bankMap[bankKey] || { bank: '', account: '', holder: item.name }
        const recipKey = `${bi.bank}_${bi.account}`

        if (!recipientMap[recipKey]) {
          recipientMap[recipKey] = {
            bank: bi.bank,
            account: bi.account,
            holder: bi.holder,
            amount: 0,
            memo: '',
            senderLabel: '',
          }
        }
        recipientMap[recipKey].amount += item.amount
        // 메모에 항목 정보 추가
        const monthNum = item.monthLabel?.slice(5) || ''
        const typeLabel = item.type === 'jiip' ? '수익배분' : item.type === 'invest' ? '투자이자' : '대출상환'
        const itemMemo = `${monthNum}월 ${typeLabel}`
        if (recipientMap[recipKey].memo) recipientMap[recipKey].memo += '/'
        recipientMap[recipKey].memo += itemMemo
        // 보내는분 통장표시: "2월정산 에프엠아이" (정산설정월 기준, 구분 없이)
        if (!recipientMap[recipKey].senderLabel) {
          const companyShort = (company?.name || '정산').replace('주식회사', '').replace('(주)', '').trim()
          const settMonth = parseInt(settlementSettings.settlementMonth.slice(5), 10) || parseInt(monthNum, 10) || 0
          recipientMap[recipKey].senderLabel = `${settMonth}월정산 ${companyShort}`.slice(0, 14)
        }
      })

      const companyName = company?.name || '정산'
      const rows = Object.values(recipientMap).filter(r => r.amount > 0)

      if (rows.length === 0) return alert('이체 가능한 항목이 없습니다.')

      // 은행정보 누락 체크
      const missingBank = rows.filter(r => !r.bank || !r.account)
      if (missingBank.length > 0) {
        const names = missingBank.map(r => r.holder).join(', ')
        if (!confirm(`⚠️ ${names}의 은행정보가 누락되어 있습니다.\n계속 진행하시겠습니까? (누락 항목은 빈칸으로 생성됩니다)`)) return
      }

      // 우리은행 다계좌이체 양식 (.xls)
      // 헤더 없이 데이터만, 각 열: 입금은행 | 계좌번호 | 이체금액 | 보내는분표시 | 받는분표시 | CMS번호
      const wsData: (string | number)[][] = rows.map(r => {
        const bankShort = r.bank.replace('은행', '').replace('뱅크', '')
        return [
          bankShort,           // 1열: 입금은행
          r.account,           // 2열: 계좌번호 (원본 유지)
          r.amount,            // 3열: 이체금액
          r.senderLabel || companyName,  // 4열: 보내는분 통장표시 (월+구분+회사명)
          r.holder,            // 5열: 받는분 통장표시 (예금주명)
          '',                  // 6열: CMS번호
        ]
      })

      const ws = XLSX.utils.aoa_to_sheet(wsData)
      // 열 너비 설정
      ws['!cols'] = [
        { wch: 10 }, // 은행
        { wch: 20 }, // 계좌번호
        { wch: 15 }, // 금액
        { wch: 15 }, // 보내는분
        { wch: 15 }, // 받는분
        { wch: 15 }, // CMS
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      XLSX.writeFile(wb, `다계좌이체_${filterDate}_${new Date().toISOString().slice(0, 10)}.xls`, { bookType: 'biff8' })

      showToast(`✅ ${rows.length}건 다계좌이체 파일 다운로드 완료`, 'success')
    } catch (e: any) {
      alert('다계좌이체 파일 생성 실패: ' + e.message)
    }
  }

  // ============================================
  // 이체 미리보기 빌드 (발송 이력 기준)
  // ============================================
  const handleBuildTransferPreview = async (silent = false) => {
    // 미지급 share history 기준으로 이체 목록 생성
    const unpaidShares = shareHistory.filter(s => !s.paid_at)
    if (unpaidShares.length === 0) {
      if (!silent) alert('이체 대기 중인 항목이 없습니다.\n정산서를 먼저 발송해주세요.')
      return
    }

    try {
      // 미지급 share의 수신자 이름으로 매칭되는 settlement items 찾기
      const matchedItems = settlementItems.filter(item => {
        return unpaidShares.some(sh =>
          sh.recipient_name === item.name &&
          (item.type === 'jiip' || item.type === 'invest')
        )
      })

      if (matchedItems.length === 0) {
        if (!silent) alert('매칭되는 정산 항목이 없습니다.')
        return
      }

      // 은행정보 조회 (handleDownloadBulkTransfer와 동일 로직)
      const bankMap: Record<string, { bank: string; account: string; holder: string }> = {}
      for (const item of matchedItems) {
        const key = `${item.type}_${item.relatedId}`
        if (bankMap[key]) continue

        if (item.type === 'jiip') {
          const jiip = jiips.find(j => String(j.id) === String(item.relatedId))
          const carBank = (jiip?.cars as any)?.owner_bank || ''
          const carAccount = (jiip?.cars as any)?.owner_account || ''
          const carHolder = (jiip?.cars as any)?.owner_account_holder || ''
          const jcBank = (jiip as any)?.bank_name || ''
          const jcAccount = (jiip as any)?.account_number || ''
          const jcHolder = (jiip as any)?.account_holder || ''
          bankMap[key] = {
            bank: carBank || jcBank || '',
            account: carAccount || jcAccount || '',
            holder: carHolder || jcHolder || item.name,
          }
        } else if (item.type === 'invest') {
          const headers = await getAuthHeader()
          const res = await fetch(`/api/general_investments?id=${item.relatedId}`, { headers })
          const json = await res.json()
          const invDetail = json.data ?? json ?? null
          if (invDetail) {
            bankMap[key] = {
              bank: invDetail.bank_name || '',
              account: invDetail.account_number || '',
              holder: invDetail.account_holder || item.name,
            }
          }
        } else if (item.type === 'loan') {
          const loan = loans.find(l => String(l.id) === String(item.relatedId))
          bankMap[key] = {
            bank: loan?.finance_name || '',
            account: '',
            holder: loan?.finance_name || '',
          }
        }
        if (!bankMap[key]) {
          bankMap[key] = { bank: '', account: '', holder: item.name }
        }
      }

      // 수신자별 합산 + 이체 행 생성
      const recipientMap: Record<string, TransferRow> = {}
      matchedItems.forEach(item => {
        const bankKey = `${item.type}_${item.relatedId}`
        const bi = bankMap[bankKey] || { bank: '', account: '', holder: item.name }
        const recipKey = `${bi.bank}_${bi.account}_${bi.holder}`

        if (!recipientMap[recipKey]) {
          recipientMap[recipKey] = {
            bank: bi.bank,
            account: bi.account,
            holder: bi.holder,
            amount: 0,
            senderLabel: '',
            memo: '',
            type: item.type,
            name: item.name,
          }
        }
        recipientMap[recipKey].amount += item.amount

        const monthNum = item.monthLabel?.slice(5) || ''
        const typeLabel = item.type === 'jiip' ? '수익배분' : item.type === 'invest' ? '투자이자' : '대출상환'
        const itemMemo = `${monthNum}월 ${typeLabel}`
        if (recipientMap[recipKey].memo) recipientMap[recipKey].memo += '/'
        recipientMap[recipKey].memo += itemMemo

        if (!recipientMap[recipKey].senderLabel) {
          const companyShort = (company?.name || '정산').replace('주식회사', '').replace('(주)', '').trim()
          const settMonth = parseInt(settlementSettings.settlementMonth.slice(5), 10) || parseInt(monthNum, 10) || 0
          recipientMap[recipKey].senderLabel = `${settMonth}월정산 ${companyShort}`.slice(0, 14)
        }
      })

      const rows = Object.values(recipientMap).filter(r => r.amount > 0)
      setTransferPreview(rows)
      setShowTransferPreview(true)
    } catch (e: any) {
      alert('이체 미리보기 생성 실패: ' + e.message)
    }
  }

  // 이체 미리보기에서 다운로드 (다운로드 시점의 정산설정월 반영)
  const handleDownloadFromPreview = () => {
    if (transferPreview.length === 0) return

    const companyName = company?.name || '정산'
    const companyShort = companyName.replace('주식회사', '').replace('(주)', '').trim()
    const settMonth = parseInt(settlementSettings.settlementMonth.slice(5), 10) || 0
    const currentSenderLabel = `${settMonth}월정산 ${companyShort}`.slice(0, 14)

    const wsData: (string | number)[][] = transferPreview.map(r => {
      const bankShort = r.bank.replace('은행', '').replace('뱅크', '')
      return [
        bankShort,
        r.account,
        r.amount,
        currentSenderLabel,  // 항상 현재 정산설정월 기준
        r.holder,
        '',
      ]
    })

    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [
      { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, `다계좌이체_${filterDate}_${new Date().toISOString().slice(0, 10)}.xls`, { bookType: 'biff8' })

    showToast(`✅ ${transferPreview.length}건 다계좌이체 파일 다운로드 완료`, 'success')
  }

  // ============================================
  // 정산 취소 (통장내역 연결된 건도 연결 해제로 취소 가능)
  // ============================================
  const handleCancelSettlement = async (item: SettlementItem) => {
    if (!effectiveCompanyId) return
    if (!confirm(`${item.name}님의 ${item.monthLabel?.slice(5)}월 ${item.type === 'jiip' ? '지입' : item.type === 'invest' ? '투자' : '대출'} 정산을 취소하시겠습니까?\n\n생성된 거래 내역이 삭제되거나 연결이 해제됩니다.`)) return

    try {
      // ── 방법 1: paidTxIds가 있으면 직접 사용 (가장 확실) ──
      let txIds: string[] = item.paidTxIds || []

      // ── 방법 2: paidTxIds가 없으면 DB 재검색 (하위 호환) ──
      if (txIds.length === 0) {
        const relatedType = item.type === 'jiip' ? 'jiip_share' : item.type
        const relatedIdStr = String(item.relatedId)

        // 넓은 범위로 검색 (type 필터 없이)
        const headers = await getAuthHeader()
        const res = await fetch('/api/transactions?filter=all', { headers })
        const json = await res.json()
        const matchTxs = json.data ?? json ?? []

        // 느슨한 비교 (related_id 문자열/숫자 혼합 대응)
        const filtered = (matchTxs || []).filter((t: any) =>
          t.related_type === relatedType &&
          (t.related_id === relatedIdStr || String(t.related_id) === relatedIdStr)
        )

        // 날짜 매칭 우선, 없으면 전체
        const dateMatched = filtered.filter((t: any) => t.transaction_date === item.dueDate)
        txIds = (dateMatched.length > 0 ? dateMatched : filtered).map((t: any) => t.id)
      }

      if (txIds.length === 0) {
        alert(`취소할 거래 내역을 찾을 수 없습니다.\n\n[디버그]\ntype: ${item.type}\nrelatedId: ${item.relatedId}\ndueDate: ${item.dueDate}\npaidTxIds: ${JSON.stringify(item.paidTxIds)}`)
        return
      }

      // 통장내역과 연결(매칭) 여부 확인
      const headers = await getAuthHeader()
      const res = await fetch(`/api/classification-queue?transaction_ids=${txIds.join(',')}`, { headers })
      const json = await res.json()
      const linkedClassify = json.data ?? json ?? []

      if (linkedClassify && linkedClassify.length > 0) {
        // ★ 통장내역 연결된 경우: 거래 삭제 대신 연결(related_type/related_id)만 해제
        // 통장 거래 자체는 보존하고 정산 연결만 끊음
        const unlinkHeaders = await getAuthHeader()
        const updateRes = await fetch('/api/transactions/unlink', {
          method: 'PATCH',
          headers: { ...unlinkHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: txIds })
        })
        if (!updateRes.ok) {
          const errJson = await updateRes.json()
          throw new Error(errJson.error || 'Failed to unlink transactions')
        }

        // classification_queue의 매칭 정보도 초기화
        const linkedQueueIds = linkedClassify.map((lc: any) => lc.id)
        const clearHeaders = await getAuthHeader()
        await fetch('/api/classification-queue/clear-match', {
          method: 'PATCH',
          headers: { ...clearHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: linkedQueueIds })
        })

        alert(`✅ ${item.name}님의 ${item.monthLabel?.slice(5)}월 정산이 취소되었습니다.\n(통장 거래 ${txIds.length}건의 정산 연결이 해제됨 — 통장 거래는 보존됩니다)`)
      } else {
        // 통장내역 미연결: 기존처럼 거래 삭제
        const headers = await getAuthHeader()
        const deleteRes = await fetch('/api/transactions/bulk-delete', {
          method: 'DELETE',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: txIds })
        })
        if (!deleteRes.ok) {
          const errJson = await deleteRes.json()
          throw new Error(errJson.error || 'Failed to delete transactions')
        }

        alert(`✅ ${item.name}님의 ${item.monthLabel?.slice(5)}월 정산이 취소되었습니다. (${txIds.length}건 삭제)`)
      }

      fetchAllData()
    } catch (e: any) {
      alert('정산 취소 실패: ' + e.message)
    }
  }

  // ============================================
  // 정산 알림 발송 — 모달 열기 (수신자별 통합 + 월별 상세)
  // ============================================

  // 메시지 빌드 헬퍼: 수신자의 항목 목록 → 통합 메시지
  const buildRecipientMessage = (name: string, items: SmsRecipient['items'], shareUrl?: string, note?: string): string => {
    const companyName = company?.name || '회사'
    const typeLabel = (t: string) => t === 'jiip' ? '수익배분' : t === 'invest' ? '투자이자' : t
    const ss = settlementSettings

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

    let msg = `[${companyName}] 정산 안내\n`
    msg += `${name}님, 정산 내역을 안내드립니다.\n\n`

    sortedMonths.forEach(m => {
      const d = byMonth[m]
      const monthDisplay = m.slice(2, 4) + '년 ' + m.slice(5) + '월'
      msg += `■ ${monthDisplay} 정산\n`
      d.items.forEach(it => {
        msg += `  ${typeLabel(it.type)}: ${nf(it.amount)}원\n`
        const bd = it.breakdown
        if (bd && it.type === 'jiip') {
          const revenue = (bd as any).totalRevenue || bd.revenue || 0
          const expense = (bd as any).totalExpense || bd.expense || 0
          const adminFee = bd.adminFee || 0
          const ratio = bd.shareRatio || 0
          if (revenue > 0) {
            msg += `    수입 ${nf(revenue)} - 비용 ${nf(expense)}`
            if (adminFee > 0) msg += ` - 관리비 ${nf(adminFee)}`
            if (ratio > 0) msg += ` (배분 ${ratio > 1 ? ratio.toFixed(0) : (ratio * 100).toFixed(0)}%)`
            msg += `\n`
          }
          if (bd.taxType && bd.taxAmount && bd.investorPayout) {
            if (bd.taxType === '세금계산서') {
              msg += `    (세금계산서) 공급가 ${nf(bd.supplyAmount || 0)} + VAT ${nf(bd.taxAmount || 0)} = ${nf(bd.investorPayout)}원\n`
            } else if (bd.taxType === '사업소득(3.3%)') {
              msg += `    배분금 ${nf(bd.investorPayout)} - 원천징수 3.3% ${nf(bd.taxAmount || 0)} = ${nf(bd.netPayout || 0)}원\n`
            } else if (bd.taxType === '이자소득(27.5%)') {
              msg += `    배분금 ${nf(bd.investorPayout)} - 원천징수 27.5% ${nf(bd.taxAmount || 0)} = ${nf(bd.netPayout || 0)}원\n`
            }
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
    // 지급예정일 (설정값 우선)
    if (ss.paymentDate) {
      msg += `\n지급예정일: ${ss.paymentDate}\n`
    }
    if (shareUrl) {
      msg += `\n▶ 상세내역 확인:\n${shareUrl}\n`
    }
    // 메모 (설정값의 memo + 모달의 note 둘 다)
    if (ss.memo) {
      msg += `\n${ss.memo}\n`
    }
    if (note && note !== ss.memo) {
      msg += `\n${note}\n`
    }
    // 회사 정보
    msg += `\n${companyName}`
    if (company?.phone) msg += ` | ${company.phone}`
    if (company?.address) msg += `\n${company.address}${company.address_detail ? ' ' + company.address_detail : ''}`
    return msg
  }

  const handleSendNotify = async (overrideItems?: SettlementItem[]) => {
    const selected = overrideItems || settlementItems.filter(
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
        const headers = await getAuthHeader()
        const endpoint = tableName === 'jiip_contracts' ? `/api/jiip-contracts?id=${g.relatedId}` : `/api/general_investments?id=${g.relatedId}`
        const res = await fetch(endpoint, { headers })
        const json = await res.json()
        const contract = json.data ?? json ?? null

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

      setSmsModal({ open: true, recipients: recipientList, customNote: '', loading: false })
    } catch (err: any) {
      showToast(`연락처 조회 실패: ${err.message}`, 'error')
      setSmsModal({ open: false, recipients: [], customNote: '', loading: false })
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
      const authToken = auth.currentUser ? await auth.currentUser.getIdToken() : ''
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
              settlement_month: settlementSettings.settlementMonth || r.items[0]?.monthLabel || filterDate,
              payment_date: settlementSettings.paymentDate || r.items[0]?.dueDate || '',
              total_amount: r.totalAmount,
              items: r.items.map(it => ({
                type: it.type,
                relatedId: it.relatedId,
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
                    || jiips.find(j => String(j.id) === String(it.relatedId))?.car_id
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
          
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`알림 발송: ${data.sent}건 성공${data.failed > 0 ? `, ${data.failed}건 실패` : ''}`, data.failed > 0 ? 'error' : 'success')
      // 발송 완료 후 데이터 갱신 → 자동으로 이체 미리보기 빌드 → Step 2 이동
      if (data.sent > 0) {
        await fetchAllData()
        // 약간 딜레이 후 이체 미리보기 빌드 (shareHistory 갱신 대기)
        setTimeout(() => {
          handleBuildTransferPreview()
          setNotifyStep(2)
        }, 500)
      }
    } catch (err: any) {
      showToast(`알림 발송 실패: ${err.message}`, 'error')
    } finally {
      setSendingNotify(false)
    }
  }

  // 지급완료/취소 토글
  const handleTogglePaid = async (shareId: string, currentlyPaid: boolean) => {
    try {
      const authToken = auth.currentUser ? await auth.currentUser.getIdToken() : ''
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
        // 지급완료 시 SMS 알림 발송 (취소 시에는 발송하지 않음)
        if (!currentlyPaid) {
          const share = shareHistory.find(s => s.id === shareId)
          if (share?.recipient_phone) {
            const companyName = company?.name || '회사'
            const monthNum = share.settlement_month?.slice(5) || ''
            let paidMsg = `[${companyName}] 입금 완료 안내\n`
            paidMsg += `${share.recipient_name}님, ${monthNum}월 정산금이 입금되었습니다.\n\n`
            paidMsg += `입금액: ${nf(share.total_amount)}원\n`
            paidMsg += `입금일: ${new Date().toISOString().slice(0, 10)}\n`
            paidMsg += `\n${companyName}`
            if (company?.business_number) paidMsg += ` (${company.business_number})`

            // 비동기 SMS 발송 (실패해도 지급완료 상태는 유지)
            fetch('/api/settlement/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
              body: JSON.stringify({
                recipients: [{
                  name: share.recipient_name,
                  phone: share.recipient_phone,
                  message: paidMsg,
                  totalAmount: share.total_amount,
                  items: [],
                }],
                channel: 'sms',
                
              }),
            }).then(async r => {
              if (r.ok) {
                showToast(`${share.recipient_name}님에게 입금 알림 발송 완료`, 'success')
              }
            }).catch(() => {
              // 알림 실패해도 무시
            })
          }
        }
      } else {
        const err = await res.json()
        showToast(err.error || '처리 실패', 'error')
      }
    } catch (e: any) {
      showToast(`오류: ${e.message}`, 'error')
    }
  }

  // 일괄 지급완료
  const handleBulkPaid = async (shareIds: string[]) => {
    if (shareIds.length === 0) return
    if (!confirm(`${shareIds.length}건을 일괄 지급완료 처리하시겠습니까?\n각 대상에게 입금 알림 SMS가 발송됩니다.`)) return
    try {
      const authToken = auth.currentUser ? await auth.currentUser.getIdToken() : ''
      const res = await fetch('/api/settlement/share/paid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ share_ids: shareIds, action: 'mark_paid' }),
      })
      if (res.ok) {
        showToast(`${shareIds.length}건 일괄 지급완료 처리됨`, 'success')
        const now = new Date().toISOString()
        setShareHistory(prev => prev.map(sh =>
          shareIds.includes(sh.id) ? { ...sh, paid_at: now } : sh
        ))
        // 각 대상에게 입금 알림 SMS
        const companyName = company?.name || '회사'
        shareIds.forEach(sid => {
          const share = shareHistory.find(s => s.id === sid)
          if (!share?.recipient_phone) return
          const monthNum = share.settlement_month?.slice(5) || ''
          let paidMsg = `[${companyName}] 입금 완료 안내\n`
          paidMsg += `${share.recipient_name}님, ${monthNum}월 정산금이 입금되었습니다.\n\n`
          paidMsg += `입금액: ${nf(share.total_amount)}원\n`
          paidMsg += `입금일: ${new Date().toISOString().slice(0, 10)}\n`
          paidMsg += `\n${companyName}`
          if (company?.business_number) paidMsg += ` (${company.business_number})`

          fetch('/api/settlement/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({
              recipients: [{ name: share.recipient_name, phone: share.recipient_phone, message: paidMsg, totalAmount: share.total_amount, items: [] }],
              channel: 'sms',
              
            }),
          }).catch(() => {})
        })
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
  if (!company) {
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
          { key: 'contracts' as const, label: '📋 계약 현황' },
          { key: 'revenue' as const, label: '📈 매출 분석' },
          { key: 'settlement' as const, label: '💳 지급 관리' },
          { key: 'pnl' as const, label: '📊 손익계산서' },
          { key: 'execute' as const, label: '⚡ 정산 실행' },
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
            {activeTab === 'contracts' && <ContractsTab jiipList={allJiipContracts} investList={allInvestContracts} settleTxs={contractsSettleTxs} shareHistory={allPaidShares} loading={loading} />}
            {activeTab === 'revenue' && <RevenueTab revenueBySource={revenueBySource} totalIncome={summary.income} transactions={transactions} />}
            {activeTab === 'settlement' && <SettlementTab items={settlementItems} summary={settlementSummary} carTxHistory={carTxHistory} investDepositHistory={investDepositHistory} />}
            {activeTab === 'pnl' && <PnLTab revenueBySource={revenueBySource} expenseByGroup={expenseByGroup} summary={summary} filterDate={filterDate} />}
            {activeTab === 'execute' && (
              <ExecuteTab
                items={settlementItems}
                selectedIds={selectedIds}
                toggleSelect={toggleSelect}
                toggleSelectAll={toggleSelectAll}
                onSendNotify={handleSendNotify}
                sendingNotify={sendingNotify}
                notifyChannel={notifyChannel}
                setNotifyChannel={setNotifyChannel}
                shareHistory={shareHistory}
                onTogglePaid={handleTogglePaid}
                onCancelSettlement={handleCancelSettlement}
                onDownloadBulkTransfer={handleDownloadBulkTransfer}
                transferPreview={transferPreview}
                showTransferPreview={showTransferPreview}
                onBuildTransferPreview={handleBuildTransferPreview}
                onDownloadFromPreview={handleDownloadFromPreview}
                onCloseTransferPreview={() => { setShowTransferPreview(false); setTransferPreview([]) }}
                settlementSettings={settlementSettings}
                setSettlementSettings={setSettlementSettings}
                onSendIndividual={(item: SettlementItem) => handleSendNotify([item])}
                companyName={company?.name || '정산'}
                onBulkPaid={handleBulkPaid}
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
function SettlementTab({ items, summary, carTxHistory, investDepositHistory }: {
  items: SettlementItem[]
  summary: { totalItems: number; pendingCount: number; pendingAmount: number; paidCount: number; paidAmount: number }
  carTxHistory: { related_id: string; type: string; amount: number; transaction_date: string; category?: string; client_name?: string; description?: string }[]
  investDepositHistory: { id: string; transaction_date: string; amount: number; type: string; related_id: string; client_name?: string; description?: string }[]
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

        {/* 상세 breakdown (지입 수익배분 상세 — invest/loan은 별도 패널 사용) */}
        {isExpanded && item.breakdown && item.type === 'jiip' && (() => {
          // 해당 차량의 기준월 거래내역 조회 (carId로 정확히 필터링 — String 변환 필수)
          const txsForMonth = carTxHistory.filter(t =>
            t.transaction_date.startsWith(item.monthLabel || '') &&
            item.carId && String(t.related_id) === String(item.carId)
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

        {/* 투자 이자 상세 (입금 내역 + 원금 변동 히스토리 포함) */}
        {isExpanded && item.type === 'invest' && (() => {
          type InvestTx = { id: string; transaction_date: string; amount: number; type: string; related_id: string; client_name?: string; description?: string }
          // 해당 투자의 전체 거래 내역 (통장 거래 기반)
          const allInvestTxs: InvestTx[] = investDepositHistory.filter((t: InvestTx) => String(t.related_id) === String(item.relatedId))
          // income만 = 입금(투자금 납입), expense는 이자지급 등
          const depositTxs = allInvestTxs.filter((t: InvestTx) => t.type === 'income')
          // 해당 월 말일까지의 입금만 필터링
          const baseMonth = item.monthLabel || ''
          const [bY, bM] = baseMonth.split('-').map(Number)
          const endOfBaseMonth = bY && bM ? `${baseMonth}-${new Date(bY, bM, 0).getDate()}` : ''

          const depositsUpToMonth = depositTxs.filter((t: InvestTx) => endOfBaseMonth && t.transaction_date <= endOfBaseMonth)
          const cumulativeBalance = depositsUpToMonth.reduce((sum: number, t: InvestTx) => sum + t.amount, 0)

          // 세금 정보 (breakdown에서 가져오기)
          const bd = item.breakdown

          return (
            <div className="mx-5 mb-3 space-y-2">
              {/* 이자 계산 상세 */}
              <div className="bg-blue-50 rounded-xl p-4 text-sm border border-blue-100 space-y-1.5">
                <p className="text-xs font-bold text-blue-600 mb-2">💰 {baseMonth.slice(5)}월분 투자이자 계산</p>
                <div className="flex justify-between">
                  <span className="text-gray-600">투자 원금 (해당월 기준)</span>
                  <span className="font-bold text-blue-700">{nf(bd?.revenue || 0)}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">연이자율</span>
                  <span className="font-bold text-gray-700">{bd?.shareRatio || 0}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">월이자 (원금 × {bd?.shareRatio}% ÷ 12)</span>
                  <span className="font-bold text-gray-800">{nf(bd?.netProfit || 0)}원</span>
                </div>
                {bd && (bd.taxRate || 0) > 0 && (
                  <>
                    <div className="border-t border-dashed border-blue-200 my-1"></div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">{bd.taxType || '세금'}</span>
                      <span className="text-red-500 font-bold">-{nf(bd.taxAmount || 0)}원</span>
                    </div>
                    {bd.taxType === '세금계산서' && (bd.supplyAmount || 0) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">공급가액</span>
                        <span className="text-gray-600">{nf(bd.supplyAmount || 0)}원</span>
                      </div>
                    )}
                    <div className="flex justify-between bg-blue-100/70 rounded-lg px-2 py-1.5 -mx-1">
                      <span className="text-blue-800 font-bold">실지급액</span>
                      <span className="font-black text-blue-800">{nf(bd.netPayout || item.amount)}원</span>
                    </div>
                  </>
                )}
              </div>

              {/* 투자금 거래 내역 (통장 거래 기반 원금 변동 히스토리) */}
              <div className="bg-white rounded-xl p-4 text-sm border border-gray-200">
                <p className="text-xs font-bold text-gray-500 mb-3">📋 투자금 거래 내역 ({allInvestTxs.length}건)</p>
                {allInvestTxs.length > 0 ? (
                  <div className="space-y-1">
                    {allInvestTxs.map((tx: InvestTx, idx: number) => {
                      // 누적 잔액 계산 (income은 +, expense는 -)
                      const runningBalance = allInvestTxs.slice(0, idx + 1).reduce((sum: number, t: InvestTx) => {
                        return sum + (t.type === 'income' ? t.amount : -t.amount)
                      }, 0)
                      const isIncome = tx.type === 'income'
                      const isBeforeMonth = endOfBaseMonth && tx.transaction_date <= endOfBaseMonth
                      return (
                        <div key={tx.id} className={`flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 ${isBeforeMonth ? (isIncome ? 'bg-green-50/50' : 'bg-red-50/50') : 'bg-gray-50'}`}>
                          <span className="text-gray-400 w-16 shrink-0">{tx.transaction_date.slice(2)}</span>
                          <span className={`font-bold shrink-0 ${isIncome ? 'text-green-600' : 'text-red-500'}`}>
                            {isIncome ? '+' : '-'}{nf(tx.amount)}원
                          </span>
                          {(tx.client_name || tx.description) && (
                            <span className="text-gray-400 text-[10px] truncate max-w-[80px]">{tx.client_name || tx.description}</span>
                          )}
                          <span className="flex-1"></span>
                          <span className="text-gray-400 text-[10px]">잔액</span>
                          <span className={`font-bold shrink-0 ${isBeforeMonth ? 'text-blue-600' : 'text-gray-400'}`}>{nf(runningBalance)}원</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-2">통장분류에서 투자 연결된 거래가 없습니다</p>
                )}
                {cumulativeBalance > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between">
                    <span className="text-xs text-gray-500 font-bold">{baseMonth.slice(5)}월 기준 투자 원금 (입금 누적)</span>
                    <span className="text-sm font-black text-blue-700">{nf(cumulativeBalance)}원</span>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

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
type SettlementSettings = {
  settlementMonth: string
  paymentDate: string
  memo: string
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
        list = list.filter(i => !i.final_matched_type || !Object.keys(typeLabels).includes(i.final_matched_type))
      } else {
        list = list.filter(i => i.final_matched_type === targetFilter)
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
        (nameMap[i.final_matched_id || ''] || '').toLowerCase().includes(t)
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
      const t = i.final_matched_type || '기타'
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
                const relType = item.final_matched_type || ''
                const tl = typeLabels[relType]
                const matchedName = nameMap[item.final_matched_id || ''] || ''
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
