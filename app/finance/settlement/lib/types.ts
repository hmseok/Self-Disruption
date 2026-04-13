// ============================================
// 투자자 정산 시스템 — 중앙 타입 정의
// ============================================

// ── 거래 내역 ──
export type Transaction = {
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
  memo?: string
}

// ── 정산 항목 ──
export type SettlementItemType = 'jiip' | 'invest' | 'loan'
export type SettlementStatus = 'pending' | 'approved' | 'paid'

export type SettlementBreakdown = {
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
  taxType?: string
  taxRate?: number
  taxAmount?: number
  supplyAmount?: number
  netPayout?: number
}

export type SettlementItem = {
  id: string
  type: SettlementItemType
  name: string
  amount: number
  dueDay: number
  dueDate: string
  status: SettlementStatus
  relatedId: string
  detail: string
  paidTxIds?: string[]
  carNumber?: string
  carModel?: string
  carId?: string
  monthLabel?: string
  isOverdue?: boolean
  breakdown?: SettlementBreakdown
}

// ── 지입 계약 ──
export type JiipContract = {
  id: string
  investor_name: string
  admin_fee: number
  share_ratio: number
  payout_day: number
  contract_start_date?: string
  status: string
  car_id: string
  tax_type?: string
  bank_name?: string
  account_number?: string
  account_holder?: string
  investor_phone?: string
  investor_email?: string
  cars?: { number: string; model?: string; owner_bank?: string; owner_account?: string; owner_account_holder?: string }
}

// ── 투자 계약 ──
export type InvestContract = {
  id: string
  investor_name: string
  invest_amount: number
  interest_rate: number
  payment_day: number
  contract_start_date?: string
  status: string
  car_id?: string
  car_number?: string
  tax_type?: string
  grace_period_months?: number
  bank_name?: string
  account_number?: string
  account_holder?: string
  investor_phone?: string
  investor_email?: string
}

// ── 투자금 입금 기록 ──
export type InvestDeposit = {
  id: string
  investment_id: string
  deposit_date: string
  amount: number
  memo?: string
}

// ── 대출 계약 ──
export type LoanContract = {
  id: string
  finance_name: string
  type: string
  monthly_payment: number
  payment_date: number
  start_date: string
  end_date: string
  status: string
  loan_amount?: number
  interest_rate?: number
  cars?: { number: string }
}

// ── 정산서 공유 이력 ──
export type ShareHistoryItem = {
  id: string
  recipient_name: string
  recipient_phone: string
  settlement_month: string
  total_amount: number
  created_at: string
  paid_at: string | null
  items?: any[]
}

// ── 통장분류 내역 ──
export type ClassifiedItem = {
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

// ── 이체 행 ──
export type TransferRow = {
  bank: string
  account: string
  holder: string
  amount: number
  senderLabel: string
  memo: string
  type: string
  name: string
}

// ── 정산 설정 ──
export type SettlementSettings = {
  settlementMonth: string
  paymentDate: string
  memo: string
}

// ── SMS 수신자 ──
export type SmsRecipient = {
  key: string
  name: string
  phone: string
  email: string
  totalAmount: number
  items: {
    type: 'jiip' | 'invest'
    monthLabel: string
    amount: number
    detail: string
    relatedId: string
    dueDate: string
    carNumber?: string
    carModel?: string
    carId?: string
    breakdown?: SettlementBreakdown
  }[]
  message: string
  shareUrl?: string
  bankInfo?: { bank_name: string; account_holder: string; account_number: string }
}

// ── SMS 모달 상태 ──
export type SmsModalState = {
  open: boolean
  recipients: SmsRecipient[]
  customNote: string
  loading: boolean
}

// ── 정산 요약 ──
export type SettlementSummary = {
  totalItems: number
  pendingCount: number
  pendingAmount: number
  paidCount: number
  paidAmount: number
}

// ── 재무 요약 ──
export type FinanceSummary = {
  income: number
  expense: number
  profit: number
  pending: number
}

// ── 카테고리 그룹 ──
export const INCOME_GROUPS: Record<string, string[]> = {
  '영업수입': ['렌트/운송수입', '관리비수입', '렌트수입', '운송수입', '매출'],
  '지입수입': ['지입 관리비/수수료', '지입료', '관리비', '수수료'],
  '금융수입': ['이자/잡이익', '이자수입', '환급', '캐시백'],
  '자본유입': ['투자원금 입금', '지입 초기비용/보증금', '대출 실행(입금)', '보증금', '투자'],
}

export const EXPENSE_GROUPS: Record<string, string[]> = {
  '지입/운송원가': ['지입 수익배분금(출금)', '수익배분', '정산금', '배분금', '지입정산금', '지입대금'],
  '차량유지비': ['유류비', '정비/수리비', '차량보험료', '자동차세/공과금', '보험료'],
  '금융비용': ['차량할부/리스료', '이자비용(대출/투자)', '원금상환', '대출원리금', '리스료', '투자이자', '차량할부금'],
  '인건비': ['급여(정규직)', '용역비(3.3%)', '급여', '용역비'],
  '일반관리비': ['복리후생(식대)', '임차료/사무실', '통신/소모품', '관리비', '사무비'],
}
