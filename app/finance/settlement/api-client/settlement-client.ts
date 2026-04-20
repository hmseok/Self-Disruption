// ============================================
// 투자자 정산 시스템 — API 클라이언트
// 14개 병렬 API 호출을 중앙 집중화
// ============================================

import type {
  Transaction, JiipContract, InvestContract, LoanContract,
  InvestDeposit, ShareHistoryItem, ClassifiedItem,
} from '../lib/types'
import type { InvestTxDeposit } from '../lib/investment-calc'
import { N } from '../lib/utils'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

export type SettlementDataBundle = {
  transactions: Transaction[]
  jiips: JiipContract[]
  investors: InvestContract[]
  loans: LoanContract[]
  allSettleTxs: Transaction[]
  carTxHistory: Transaction[]
  classifiedItems: ClassifiedItem[]
  shareHistory: ShareHistoryItem[]
  investDeposits: InvestDeposit[]
  investTxDeposits: InvestTxDeposit[]
  allJiipContracts: JiipContract[]
  allInvestContracts: InvestContract[]
  contractsSettleTxs: Transaction[]
  allPaidShares: ShareHistoryItem[]
}

export async function fetchSettlementData(
  filterDate: string,
  companyId: string | undefined,
  role: string | undefined
): Promise<SettlementDataBundle> {
  const [year, month] = filterDate.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const startDate = `${filterDate}-01`
  const endDate = `${filterDate}-${lastDay}`
  const past12Start = `${year - 1}-${String(month).padStart(2, '0')}-01`

  // 전월 계산 (shareHistory용)
  const prevMonth = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`

  const headers = await getAuthHeader()

  const [
    txRes, jiipRes, investRes, loanRes, allSettleRes, carTxRes,
    classifyRes, shareHistoryRes, investDepositsRes, investTxDepositsRes,
    allJiipRes, allInvestRes, contractsSettleTxRes, allPaidSharesRes
  ] = await Promise.all([
    fetch(`/api/transactions?from=${startDate}&to=${endDate}`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch('/api/jiip?status=active', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch('/api/investments?status=active', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch('/api/loans', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch(`/api/transactions?related_type=jiip,jiip_share,invest,loan&type=expense&from=${past12Start}`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch(`/api/transactions?related_type=car&from=${past12Start}`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch('/api/classification-queue?status=confirmed,auto_confirmed&limit=500', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch(`/api/settlement/shares?months=${filterDate},${prevMonth}`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch('/api/investment-deposits', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch('/api/transactions?related_type=invest', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch('/api/jiip', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch('/api/investments', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch('/api/transactions?related_type=jiip,jiip_share,invest&limit=2000', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
    fetch('/api/settlement/shares?paid_only=true', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
  ])

  // Decimal → Number 변환
  const mapTx = (t: any): Transaction => ({ ...t, amount: N(t.amount) })
  const mapJiip = (c: any): JiipContract => ({
    ...c,
    invest_amount: N(c.invest_amount),
    admin_fee: N(c.admin_fee),
    share_ratio: N(c.share_ratio),
    payout_day: N(c.payout_day),
    monthly_management_fee: N(c.monthly_management_fee),
    profit_share_ratio: N(c.profit_share_ratio),
  })
  const mapInvest = (c: any): InvestContract => ({
    ...c,
    invest_amount: N(c.invest_amount),
    interest_rate: N(c.interest_rate),
    payment_day: N(c.payment_day),
  })
  const mapLoan = (l: any): LoanContract => ({
    ...l,
    monthly_payment: N(l.monthly_payment),
    loan_amount: N(l.loan_amount),
    interest_rate: N(l.interest_rate),
  })
  const mapShare = (s: any): ShareHistoryItem => ({ ...s, total_amount: N(s.total_amount) })
  const mapDeposit = (d: any): InvestDeposit => ({ ...d, amount: N(d.amount) })
  const mapInvestTx = (t: any): InvestTxDeposit => ({
    id: t.id,
    transaction_date: t.transaction_date,
    amount: Math.abs(Number(t.amount) || 0),
    type: t.type || 'income',
    related_id: String(t.related_id || ''),
    client_name: t.client_name || '',
    description: t.description || '',
    category: t.category || '',
  })

  return {
    transactions: (txRes.data || []).map(mapTx),
    jiips: (jiipRes.data || []).map(mapJiip),
    investors: (investRes.data || []).map(mapInvest),
    loans: (loanRes.data || []).map(mapLoan),
    allSettleTxs: (allSettleRes.data || []).map(mapTx),
    carTxHistory: (carTxRes.data || []).map(mapTx),
    classifiedItems: (classifyRes.data || []) as ClassifiedItem[],
    shareHistory: (shareHistoryRes.data || []).map(mapShare),
    investDeposits: (investDepositsRes?.data || []).map(mapDeposit),
    investTxDeposits: (investTxDepositsRes?.data || []).map(mapInvestTx),
    allJiipContracts: (allJiipRes?.data || []).map(mapJiip),
    allInvestContracts: (allInvestRes?.data || []).map(mapInvest),
    contractsSettleTxs: (contractsSettleTxRes?.data || []).map(mapTx),
    allPaidShares: (allPaidSharesRes?.data || []).map(mapShare),
  }
}
