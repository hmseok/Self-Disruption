'use client'

import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

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
}

type JiipContract = {
  id: string
  contractor_name: string
  admin_fee: number
  payout_day: number
  status: string
  car_id: string
  cars?: { number: string }
}

type InvestorContract = {
  id: string
  investor_name: string
  invest_amount: number
  interest_rate: number
  payment_day: number
  status: string
}

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
  const [activeTab, setActiveTab] = useState<'revenue' | 'settlement' | 'pnl' | 'execute'>('revenue')
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)

  // 데이터
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [jiips, setJiips] = useState<JiipContract[]>([])
  const [investors, setInvestors] = useState<InvestorContract[]>([])
  const [loans, setLoans] = useState<LoanContract[]>([])
  const [settlementItems, setSettlementItems] = useState<SettlementItem[]>([])

  // 정산 실행 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [executing, setExecuting] = useState(false)
  const [sendingNotify, setSendingNotify] = useState(false)
  const [notifyChannel, setNotifyChannel] = useState<'sms' | 'email'>('sms')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ============================================
  // 데이터 로드
  // ============================================
  useEffect(() => {
    fetchAllData()
  }, [filterDate, company, adminSelectedCompanyId])

  const fetchAllData = async () => {
    if (!effectiveCompanyId && role !== 'god_admin') return
    setLoading(true)

    const [year, month] = filterDate.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const startDate = `${filterDate}-01`
    const endDate = `${filterDate}-${lastDay}`

    // 병렬 로드
    const [txRes, jiipRes, investRes, loanRes] = await Promise.all([
      // 거래 내역
      (() => {
        let q = supabase.from('transactions').select('*')
        if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
        return q.gte('transaction_date', startDate).lte('transaction_date', endDate)
          .order('transaction_date', { ascending: false })
      })(),
      // 지입 계약
      (() => {
        let q = supabase.from('jiip_contracts').select('*, cars(number)').eq('status', 'active')
        if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
        return q
      })(),
      // 투자자
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
    ])

    const txs = txRes.data || []
    const jiipData = jiipRes.data || []
    const investData = investRes.data || []
    const loanData = loanRes.data || []

    setTransactions(txs)
    setJiips(jiipData)
    setInvestors(investData)
    setLoans(loanData)

    // 정산 항목 생성
    buildSettlementItems(txs, jiipData, investData, loanData, filterDate)
    setLoading(false)
  }

  // ============================================
  // 정산 항목 빌드
  // ============================================
  const buildSettlementItems = (
    txs: Transaction[],
    jiipData: JiipContract[],
    investData: InvestorContract[],
    loanData: LoanContract[],
    monthStr: string
  ) => {
    const [year, month] = monthStr.split('-').map(Number)
    const existingSet = new Set(txs.filter(t => t.related_id).map(t => `${t.related_type}_${t.related_id}`))

    const items: SettlementItem[] = []

    // 1. 지입 정산
    jiipData.forEach(j => {
      const key = `jiip_${j.id}`
      const isPaid = existingSet.has(key)
      items.push({
        id: `jiip-${j.id}`,
        type: 'jiip',
        name: j.contractor_name,
        amount: j.admin_fee || 0,
        dueDay: j.payout_day || 10,
        dueDate: `${monthStr}-${(j.payout_day || 10).toString().padStart(2, '0')}`,
        status: isPaid ? 'paid' : 'pending',
        relatedId: j.id,
        detail: `${monthStr}월 지입 정산금`,
        carNumber: j.cars?.number,
      })
    })

    // 2. 투자자 이자
    investData.forEach(inv => {
      const key = `invest_${inv.id}`
      const isPaid = existingSet.has(key)
      const monthlyInterest = Math.floor((inv.invest_amount * (inv.interest_rate / 100)) / 12)
      items.push({
        id: `invest-${inv.id}`,
        type: 'invest',
        name: inv.investor_name,
        amount: monthlyInterest,
        dueDay: inv.payment_day || 10,
        dueDate: `${monthStr}-${(inv.payment_day || 10).toString().padStart(2, '0')}`,
        status: isPaid ? 'paid' : 'pending',
        relatedId: inv.id,
        detail: `${monthStr}월 투자이자 (${inv.interest_rate}% / 원금 ${nf(inv.invest_amount)}원)`,
      })
    })

    // 3. 대출 상환
    const startDt = new Date(`${monthStr}-01`)
    const endDt = new Date(year, month, 0)
    loanData.forEach(loan => {
      const ls = loan.start_date ? new Date(loan.start_date) : null
      const le = loan.end_date ? new Date(loan.end_date) : null
      if ((ls && ls > endDt) || (le && le < startDt)) return

      const key = `loan_${loan.id}`
      const isPaid = existingSet.has(key)
      items.push({
        id: `loan-${loan.id}`,
        type: 'loan',
        name: loan.finance_name,
        amount: loan.monthly_payment || 0,
        dueDay: loan.payment_date || 25,
        dueDate: `${monthStr}-${(loan.payment_date || 25).toString().padStart(2, '0')}`,
        status: isPaid ? 'paid' : 'pending',
        relatedId: loan.id,
        detail: `${monthStr}월 ${loan.type === '리스' ? '리스료' : '대출 상환금'}`,
        carNumber: loan.cars?.number,
      })
    })

    // 정렬: 미정산 우선, 날짜순
    items.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
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
      const newTxs = selected.map(item => ({
        transaction_date: item.dueDate,
        type: 'expense' as const,
        status: 'completed' as const,
        category: item.type === 'jiip' ? '지입정산금'
               : item.type === 'invest' ? '투자이자'
               : item.type === 'loan' ? '대출원리금'
               : '기타',
        client_name: item.name + (item.carNumber ? ` (${item.carNumber})` : ''),
        description: item.detail,
        amount: item.amount,
        payment_method: '통장',
        related_type: item.type,
        related_id: item.relatedId,
        company_id: effectiveCompanyId,
      }))

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
  // 정산 완료 알림 발송
  // ============================================
  const handleSendNotify = async () => {
    // 정산 완료된 항목 중 선택된 것 (지입/투자만 — 대출은 알림 불필요)
    const paidSelected = settlementItems.filter(
      i => selectedIds.has(i.id) && i.status === 'paid' && (i.type === 'jiip' || i.type === 'invest')
    )
    if (paidSelected.length === 0) {
      showToast('알림 발송할 정산 완료 항목을 선택해주세요.', 'error')
      return
    }

    setSendingNotify(true)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch('/api/settlement/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: paidSelected.map(i => ({
            type: i.type,
            relatedId: i.relatedId,
            name: i.name,
            amount: i.amount,
            dueDate: i.dueDate,
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
  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50 animate-fade-in">

      {/* 헤더 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b pb-6 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">📊 매출 회계 정산</h1>
            <input
              type="month"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1 font-bold text-lg bg-gray-50 hover:bg-white focus:border-steel-500 transition-colors cursor-pointer text-gray-700"
            />
          </div>
          <p className="text-gray-500 text-sm">매출 분석, 정산 현황, 손익계산서를 한눈에 관리합니다.</p>
        </div>

        {/* 우측: 빠른 이동 */}
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/finance')}
            className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 shadow-sm"
          >
            📚 자금 장부
          </button>
          <button
            onClick={() => router.push('/finance/upload')}
            className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 shadow-sm"
          >
            📂 엑셀 등록
          </button>
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
        <KPICard label="총 매출" value={nf(summary.income)} suffix="원" color="blue" icon="🔵" />
        <KPICard label="총 지출" value={nf(summary.expense)} suffix="원" color="red" icon="🔴" />
        <KPICard label="영업이익" value={nfSign(summary.profit)} suffix="원"
          color={summary.profit >= 0 ? 'green' : 'red'}
          icon={summary.profit >= 0 ? '📈' : '📉'} />
        <KPICard label="미정산 건" value={String(settlementSummary.pendingCount)} suffix="건" color="yellow" icon="⏳" />
        <KPICard label="미정산 금액" value={nf(settlementSummary.pendingAmount)} suffix="원" color="orange" icon="💸" />
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl mb-6 overflow-x-auto">
        <div className="flex bg-white rounded-xl shadow-sm p-1 w-full md:w-auto gap-1">
          {[
            { key: 'revenue' as const, label: '📈 매출 분석', badge: null },
            { key: 'settlement' as const, label: '📋 정산 현황', badge: pendingBadge },
            { key: 'pnl' as const, label: '📊 손익계산서', badge: null },
            { key: 'execute' as const, label: '⚡ 정산 실행', badge: pendingBadge },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg font-bold text-xs md:text-sm transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-steel-600 text-white shadow'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {tab.label}{tab.badge}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      {loading ? (
        <div className="bg-white rounded-2xl p-20 text-center border border-gray-200">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600 mx-auto mb-3"></div>
          <p className="text-gray-400 font-bold">데이터를 불러오는 중...</p>
        </div>
      ) : (
        <>
          {activeTab === 'revenue' && <RevenueTab revenueBySource={revenueBySource} totalIncome={summary.income} transactions={transactions} />}
          {activeTab === 'settlement' && <SettlementTab items={settlementItems} summary={settlementSummary} />}
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
            />
          )}
        </>
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
function SettlementTab({ items, summary }: {
  items: SettlementItem[]
  summary: { totalItems: number; pendingCount: number; pendingAmount: number; paidCount: number; paidAmount: number }
}) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'jiip' | 'invest' | 'loan'>('all')

  const filtered = typeFilter === 'all' ? items : items.filter(i => i.type === typeFilter)

  const typeLabels: Record<string, { label: string; color: string; icon: string }> = {
    jiip: { label: '지입 정산', color: 'bg-purple-100 text-purple-700', icon: '🤝' },
    invest: { label: '투자 이자', color: 'bg-blue-100 text-blue-700', icon: '💰' },
    loan: { label: '대출 상환', color: 'bg-orange-100 text-orange-700', icon: '🏦' },
  }

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: '미정산', color: 'bg-red-100 text-red-600' },
    approved: { label: '승인됨', color: 'bg-yellow-100 text-yellow-700' },
    paid: { label: '정산완료', color: 'bg-green-100 text-green-700' },
  }

  return (
    <div className="space-y-6">
      {/* 정산 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-400 font-bold">전체 정산 건수</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{summary.totalItems}<span className="text-sm font-bold text-gray-400">건</span></p>
        </div>
        <div className="bg-red-50 p-4 rounded-xl border border-red-100">
          <p className="text-xs text-red-500 font-bold">미정산</p>
          <p className="text-2xl font-black text-red-600 mt-1">{summary.pendingCount}<span className="text-sm font-bold">건</span></p>
          <p className="text-xs text-red-400 mt-0.5">{nf(summary.pendingAmount)}원</p>
        </div>
        <div className="bg-green-50 p-4 rounded-xl border border-green-100">
          <p className="text-xs text-green-600 font-bold">정산 완료</p>
          <p className="text-2xl font-black text-green-700 mt-1">{summary.paidCount}<span className="text-sm font-bold">건</span></p>
          <p className="text-xs text-green-500 mt-0.5">{nf(summary.paidAmount)}원</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-400 font-bold">정산율</p>
          <p className="text-2xl font-black text-steel-600 mt-1">
            {summary.totalItems > 0 ? ((summary.paidCount / summary.totalItems) * 100).toFixed(0) : 0}
            <span className="text-sm font-bold text-gray-400">%</span>
          </p>
        </div>
      </div>

      {/* 타입 필터 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: 'all' as const, label: '전체', count: items.length },
          { key: 'jiip' as const, label: '🤝 지입', count: items.filter(i => i.type === 'jiip').length },
          { key: 'invest' as const, label: '💰 투자', count: items.filter(i => i.type === 'invest').length },
          { key: 'loan' as const, label: '🏦 대출', count: items.filter(i => i.type === 'loan').length },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
              typeFilter === f.key
                ? 'bg-steel-600 text-white shadow'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* 리스트 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">해당 조건의 정산 항목이 없습니다.</div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider border-b">
                  <tr>
                    <th className="p-4">구분</th>
                    <th className="p-4">대상</th>
                    <th className="p-4">차량</th>
                    <th className="p-4">납부일</th>
                    <th className="p-4 text-right">금액</th>
                    <th className="p-4 text-center">상태</th>
                    <th className="p-4">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(item => {
                    const tl = typeLabels[item.type]
                    const sl = statusLabels[item.status]
                    return (
                      <tr key={item.id} className="hover:bg-steel-50/30 transition-colors">
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${tl.color}`}>
                            {tl.icon} {tl.label}
                          </span>
                        </td>
                        <td className="p-4 font-bold text-gray-800">{item.name}</td>
                        <td className="p-4 text-gray-500 text-xs">{item.carNumber || '-'}</td>
                        <td className="p-4 font-bold text-gray-600">{item.dueDate.slice(5)}</td>
                        <td className="p-4 text-right font-black text-gray-900">{nf(item.amount)}원</td>
                        <td className="p-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${sl.color}`}>{sl.label}</span>
                        </td>
                        <td className="p-4 text-xs text-gray-400">{item.detail}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-gray-100">
              {filtered.map(item => {
                const tl = typeLabels[item.type]
                const sl = statusLabels[item.status]
                return (
                  <div key={item.id} className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tl.color}`}>{tl.icon} {tl.label}</span>
                        <div className="font-bold text-gray-800 mt-1">{item.name}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${sl.color}`}>{sl.label}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 text-xs">{item.dueDate.slice(5)} {item.carNumber ? `· ${item.carNumber}` : ''}</span>
                      <span className="font-black text-gray-900">{nf(item.amount)}원</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
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
function ExecuteTab({ items, selectedIds, toggleSelect, toggleSelectAll, onExecute, executing, onSendNotify, sendingNotify, notifyChannel, setNotifyChannel }: {
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
}) {
  const pendingItems = items.filter(i => i.status === 'pending')
  const paidItems = items.filter(i => i.status === 'paid')
  const selectedTotal = items.filter(i => selectedIds.has(i.id)).reduce((s, i) => s + i.amount, 0)

  const typeLabels: Record<string, { label: string; color: string; icon: string }> = {
    jiip: { label: '지입', color: 'bg-purple-100 text-purple-700', icon: '🤝' },
    invest: { label: '투자', color: 'bg-blue-100 text-blue-700', icon: '💰' },
    loan: { label: '대출', color: 'bg-orange-100 text-orange-700', icon: '🏦' },
  }

  return (
    <div className="space-y-6">
      {/* 실행 컨트롤 바 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 md:p-5 sticky top-0 z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === pendingItems.length && pendingItems.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-steel-600 rounded focus:ring-steel-500"
              />
              <span className="text-sm font-bold text-gray-700">전체 선택</span>
            </label>
            <span className="text-sm text-gray-400">
              {selectedIds.size}건 선택 · <span className="font-bold text-gray-700">{nf(selectedTotal)}원</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* 정산 완료 알림 발송 */}
            <select
              value={notifyChannel}
              onChange={(e) => setNotifyChannel(e.target.value as 'sms' | 'email')}
              className="px-2 py-2 rounded-lg border border-gray-200 text-xs font-bold focus:outline-none"
            >
              <option value="sms">SMS</option>
              <option value="email">이메일</option>
            </select>
            <button
              onClick={onSendNotify}
              disabled={sendingNotify || selectedIds.size === 0}
              className="px-4 py-2.5 rounded-xl font-bold text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 shadow-sm transition-all"
            >
              {sendingNotify ? '발송중...' : '정산서 발송'}
            </button>
            {/* 정산 실행 */}
            <button
              onClick={onExecute}
              disabled={executing || selectedIds.size === 0}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all ${
                selectedIds.size > 0
                ? 'bg-steel-600 text-white hover:bg-steel-700 active:scale-95'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {executing ? '처리 중...' : `⚡ ${selectedIds.size}건 정산 실행`}
            </button>
          </div>
        </div>
      </div>

      {/* 미정산 목록 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-red-50/30">
          <h3 className="font-bold text-red-800">⏳ 미정산 항목 ({pendingItems.length}건)</h3>
        </div>

        {pendingItems.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            <span className="text-4xl block mb-3">✅</span>
            <p className="font-bold text-gray-600">모든 정산이 완료되었습니다!</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider border-b">
                  <tr>
                    <th className="p-4 w-12"></th>
                    <th className="p-4">구분</th>
                    <th className="p-4">대상</th>
                    <th className="p-4">차량</th>
                    <th className="p-4">납부일</th>
                    <th className="p-4 text-right">금액</th>
                    <th className="p-4">상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pendingItems.map(item => {
                    const tl = typeLabels[item.type]
                    const isSelected = selectedIds.has(item.id)
                    return (
                      <tr
                        key={item.id}
                        onClick={() => toggleSelect(item.id)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-steel-50' : 'hover:bg-gray-50'}`}
                      >
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(item.id)}
                            className="w-4 h-4 text-steel-600 rounded focus:ring-steel-500"
                          />
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${tl.color}`}>{tl.icon} {tl.label}</span>
                        </td>
                        <td className="p-4 font-bold text-gray-800">{item.name}</td>
                        <td className="p-4 text-gray-500 text-xs">{item.carNumber || '-'}</td>
                        <td className="p-4 font-bold text-gray-600">{item.dueDate.slice(5)}</td>
                        <td className="p-4 text-right font-black text-red-600">{nf(item.amount)}원</td>
                        <td className="p-4 text-xs text-gray-400 max-w-[200px] truncate">{item.detail}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-gray-100">
              {pendingItems.map(item => {
                const tl = typeLabels[item.type]
                const isSelected = selectedIds.has(item.id)
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    className={`p-4 cursor-pointer transition-colors ${isSelected ? 'bg-steel-50' : 'active:bg-gray-50'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        className="w-4 h-4 mt-1 text-steel-600 rounded focus:ring-steel-500 flex-shrink-0"
                      />
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tl.color}`}>{tl.icon} {tl.label}</span>
                            <div className="font-bold text-gray-800 mt-1">{item.name}</div>
                          </div>
                          <span className="font-black text-red-600 text-sm">{nf(item.amount)}원</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {item.dueDate.slice(5)} {item.carNumber ? `· ${item.carNumber}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* 정산 완료 목록 */}
      {paidItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-green-50/30 flex items-center justify-between">
            <h3 className="font-bold text-green-800">✅ 정산 완료 ({paidItems.length}건)</h3>
            <span className="text-xs text-gray-400">정산서 발송 시 체크박스로 선택하세요</span>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider border-b">
                <tr>
                  <th className="p-4 w-12"></th>
                  <th className="p-4">구분</th>
                  <th className="p-4">대상</th>
                  <th className="p-4">차량</th>
                  <th className="p-4">납부일</th>
                  <th className="p-4 text-right">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paidItems.map(item => {
                  const tl = typeLabels[item.type]
                  const isSelected = selectedIds.has(item.id)
                  return (
                    <tr key={item.id} onClick={() => toggleSelect(item.id)} className={`cursor-pointer transition-colors ${isSelected ? 'bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                      <td className="p-4">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)} className="w-4 h-4 text-green-600 rounded focus:ring-green-500" />
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${isSelected ? '' : 'opacity-60'} ${tl.color}`}>{tl.icon} {tl.label}</span>
                      </td>
                      <td className="p-4 font-bold">{item.name}</td>
                      <td className="p-4 text-xs">{item.carNumber || '-'}</td>
                      <td className="p-4">{item.dueDate.slice(5)}</td>
                      <td className="p-4 text-right font-bold">{nf(item.amount)}원</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-gray-100">
            {paidItems.map(item => {
              const tl = typeLabels[item.type]
              return (
                <div key={item.id} className="p-4 opacity-60">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tl.color}`}>{tl.icon} {tl.label}</span>
                      <div className="font-bold text-gray-600 mt-1">{item.name}</div>
                    </div>
                    <span className="font-bold text-gray-500 text-sm">{nf(item.amount)}원</span>
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
