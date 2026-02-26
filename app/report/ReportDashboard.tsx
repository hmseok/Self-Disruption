'use client'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { usePathname } from 'next/navigation'

// ============================================
// 타입 정의
// ============================================
interface Transaction {
  id: string
  transaction_date: string
  type: 'income' | 'expense'
  category: string
  amount: number
  description?: string
  client_name?: string
  status?: string
}

interface Car {
  id: string
  number: string
  brand?: string
  model?: string
  status: string
  purchase_price?: number
}

interface JiipContract {
  id: string
  investor_name?: string
  invest_amount: number
  admin_fee: number
  payout_day: number
  status: string
}

interface Investment {
  id: string
  investor_name: string
  invest_amount: number
  interest_rate: number
  payment_day: number
  status: string
  contract_end_date?: string
}

interface Loan {
  id: string
  finance_name: string
  type: string
  total_amount: number
  monthly_payment: number
  interest_rate?: number
  start_date?: string
  end_date?: string
  status?: string
}

// ============================================
// 유틸
// ============================================
const f = (n: number) => n ? n.toLocaleString() : '0'

const formatSimpleMoney = (num: number) => {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '억'
  if (num >= 10000) return Math.round(num / 10000).toLocaleString() + '만'
  return num.toLocaleString()
}

// 최근 N개월 배열 생성
const getRecentMonths = (count: number): string[] => {
  const months: string[] = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

// ============================================
// 메인 컴포넌트
// ============================================
export default function ReportDashboard() {
  const { company, role, adminSelectedCompanyId } = useApp()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // 데이터
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cars, setCars] = useState<Car[]>([])
  const [jiipContracts, setJiipContracts] = useState<JiipContract[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loans, setLoans] = useState<Loan[]>([])

  // 기간 필터
  const [periodMonths, setPeriodMonths] = useState(6) // 최근 N개월

  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  const pathname = usePathname()

  useEffect(() => {
    fetchAllData()
  }, [company, role, adminSelectedCompanyId, pathname])

  // 탭 포커스 시 자동 새로고침
  useEffect(() => {
    const onFocus = () => fetchAllData()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [effectiveCompanyId])

  const fetchAllData = async () => {
    if (!effectiveCompanyId && role !== 'god_admin') return
    setLoading(true)

    const companyFilter = (q: any) => {
      if (role === 'god_admin') {
        if (adminSelectedCompanyId) return q.eq('company_id', adminSelectedCompanyId)
        return q
      }
      return q.eq('company_id', company?.id)
    }

    const [txRes, carRes, jiipRes, investRes, loanRes] = await Promise.all([
      companyFilter(supabase.from('transactions').select('*')).order('transaction_date', { ascending: false }),
      companyFilter(supabase.from('cars').select('*')),
      companyFilter(supabase.from('jiip_contracts').select('*')),
      companyFilter(supabase.from('general_investments').select('*')),
      companyFilter(supabase.from('loans').select('*')),
    ])

    setTransactions(txRes.data || [])
    setCars(carRes.data || [])
    setJiipContracts(jiipRes.data || [])
    setInvestments(investRes.data || [])
    setLoans(loanRes.data || [])
    setLoading(false)
  }

  // ============================================
  // 파생 데이터 (useMemo)
  // ============================================
  const recentMonths = useMemo(() => getRecentMonths(periodMonths), [periodMonths])

  // 월별 수입/지출 집계
  const monthlyData = useMemo(() => {
    return recentMonths.map(month => {
      const monthTx = transactions.filter(tx => tx.transaction_date?.startsWith(month))
      const income = monthTx.filter(tx => tx.type === 'income').reduce((s, tx) => s + (tx.amount || 0), 0)
      const expense = monthTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + (tx.amount || 0), 0)
      return { month, label: month.split('-')[1] + '월', income, expense, profit: income - expense }
    })
  }, [transactions, recentMonths])

  // 카테고리별 수입 집계
  const incomeByCat = useMemo(() => {
    const map: Record<string, number> = {}
    transactions.filter(tx => tx.type === 'income').forEach(tx => {
      const cat = tx.category || '기타'
      map[cat] = (map[cat] || 0) + (tx.amount || 0)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [transactions])

  // 카테고리별 지출 집계
  const expenseByCat = useMemo(() => {
    const map: Record<string, number> = {}
    transactions.filter(tx => tx.type === 'expense').forEach(tx => {
      const cat = tx.category || '기타'
      map[cat] = (map[cat] || 0) + (tx.amount || 0)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [transactions])

  // 총 수입/지출
  const totalIncome = useMemo(() => transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0), [transactions])
  const totalExpense = useMemo(() => transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0), [transactions])
  const netProfit = totalIncome - totalExpense
  const profitRate = totalIncome > 0 ? ((netProfit / totalIncome) * 100) : 0

  // 차량 통계
  const carStats = useMemo(() => ({
    total: cars.length,
    available: cars.filter(c => c.status === 'available').length,
    rented: cars.filter(c => c.status === 'rented').length,
    maintenance: cars.filter(c => c.status === 'maintenance').length,
    totalValue: cars.reduce((s, c) => s + (c.purchase_price || 0), 0),
    utilizationRate: cars.length > 0 ? ((cars.filter(c => c.status === 'rented').length / cars.length) * 100) : 0,
  }), [cars])

  // 투자/파트너 통계
  const partnerStats = useMemo(() => {
    const activeJiip = jiipContracts.filter(j => j.status === 'active')
    const activeInvest = investments.filter(i => i.status === 'active')

    return {
      jiipCount: activeJiip.length,
      jiipMonthly: activeJiip.reduce((s, j) => s + (j.admin_fee || 0), 0),
      investCount: activeInvest.length,
      investPrincipal: activeInvest.reduce((s, i) => s + (i.invest_amount || 0), 0),
      investMonthlyInterest: activeInvest.reduce((s, i) => s + ((i.invest_amount || 0) * (i.interest_rate || 0) / 100 / 12), 0),
      loanCount: loans.length,
      loanTotal: loans.reduce((s, l) => s + (l.total_amount || 0), 0),
      loanMonthly: loans.reduce((s, l) => s + (l.monthly_payment || 0), 0),
    }
  }, [jiipContracts, investments, loans])

  // 월 고정 지출 총합
  const monthlyFixedCost = partnerStats.jiipMonthly + partnerStats.investMonthlyInterest + partnerStats.loanMonthly

  // ============================================
  // 탭 정의
  // ============================================
  const tabs = [
    { key: 'overview', label: '종합 현황' },
    { key: 'revenue', label: '매출/수익 분석' },
    { key: 'expense', label: '비용/지출 분석' },
    { key: 'fleet', label: '차량 운용' },
    { key: 'partner', label: '투자/파트너' },
  ]

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

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">📊</div>
          <p className="text-gray-500 font-bold">리포트 데이터를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
        <div style={{ textAlign: 'left' }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg style={{ width: 28, height: 28, color: '#2d5fa8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            리포트 / 통계
          </h1>
          <p className="text-gray-500 text-sm mt-1">{company?.name} 전체 운영 데이터를 한눈에 분석합니다.</p>
        </div>
        <div className="flex gap-2">
          {[3, 6, 12].map(m => (
            <button
              key={m}
              onClick={() => setPeriodMonths(m)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                periodMonths === m ? 'bg-steel-600 text-white shadow' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              최근 {m}개월
            </button>
          ))}
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 text-sm font-bold transition-all whitespace-nowrap border-b-2 ${
              activeTab === tab.key
                ? 'border-steel-600 text-steel-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      {activeTab === 'overview' && (
        <OverviewTab
          totalIncome={totalIncome}
          totalExpense={totalExpense}
          netProfit={netProfit}
          profitRate={profitRate}
          carStats={carStats}
          partnerStats={partnerStats}
          monthlyFixedCost={monthlyFixedCost}
          monthlyData={monthlyData}
          transactions={transactions}
        />
      )}
      {activeTab === 'revenue' && (
        <RevenueTab
          totalIncome={totalIncome}
          monthlyData={monthlyData}
          incomeByCat={incomeByCat}
          transactions={transactions}
        />
      )}
      {activeTab === 'expense' && (
        <ExpenseTab
          totalExpense={totalExpense}
          monthlyData={monthlyData}
          expenseByCat={expenseByCat}
          monthlyFixedCost={monthlyFixedCost}
          partnerStats={partnerStats}
        />
      )}
      {activeTab === 'fleet' && (
        <FleetTab carStats={carStats} cars={cars} />
      )}
      {activeTab === 'partner' && (
        <PartnerTab
          partnerStats={partnerStats}
          jiipContracts={jiipContracts}
          investments={investments}
          loans={loans}
        />
      )}
    </div>
  )
}

// ============================================
// KPI 카드 컴포넌트
// ============================================
function KPICard({ label, value, unit, color = 'gray', sub }: {
  label: string; value: string; unit?: string; color?: string; sub?: string
}) {
  const colorMap: Record<string, string> = {
    gray: 'bg-white border-gray-200',
    green: 'bg-green-50 border-green-100',
    red: 'bg-red-50 border-red-100',
    blue: 'bg-blue-50 border-blue-100',
    amber: 'bg-amber-50 border-amber-200',
    steel: 'bg-steel-50 border-steel-100',
  }
  const textMap: Record<string, string> = {
    gray: 'text-gray-800',
    green: 'text-green-700',
    red: 'text-red-600',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    steel: 'text-steel-700',
  }
  const labelMap: Record<string, string> = {
    gray: 'text-gray-400',
    green: 'text-green-600',
    red: 'text-red-500',
    blue: 'text-blue-500',
    amber: 'text-amber-600',
    steel: 'text-steel-500',
  }

  return (
    <div className={`p-3 md:p-4 rounded-xl border shadow-sm ${colorMap[color]}`}>
      <p className={`text-xs font-bold ${labelMap[color]}`}>{label}</p>
      <p className={`text-lg md:text-xl font-black mt-1 ${textMap[color]}`}>
        {value}{unit && <span className="text-xs ml-0.5 opacity-60">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ============================================
// 바 차트 (CSS 기반)
// ============================================
function BarChart({ data, maxVal }: { data: { label: string; income: number; expense: number; profit: number }[]; maxVal: number }) {
  const max = maxVal || 1
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-10 text-xs font-bold text-gray-500 text-right shrink-0">{d.label}</div>
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="h-5 rounded-r bg-green-400" style={{ width: `${Math.max((d.income / max) * 100, 0.5)}%` }} />
              <span className="text-xs text-green-600 font-bold whitespace-nowrap">{formatSimpleMoney(d.income)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 rounded-r bg-red-400" style={{ width: `${Math.max((d.expense / max) * 100, 0.5)}%` }} />
              <span className="text-xs text-red-500 font-bold whitespace-nowrap">{formatSimpleMoney(d.expense)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// 종합 현황 탭
// ============================================
function OverviewTab({ totalIncome, totalExpense, netProfit, profitRate, carStats, partnerStats, monthlyFixedCost, monthlyData, transactions }: any) {
  // 최근 거래 5건
  const recentTx = transactions.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* 핵심 KPI */}
      <div className="bg-gradient-to-r from-gray-900 to-steel-800 rounded-2xl p-6 md:p-8 text-white">
        <h3 className="text-sm font-bold text-gray-300 mb-4">경영 요약</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <div>
            <p className="text-xs text-gray-400">총 매출</p>
            <p className="text-2xl md:text-3xl font-black mt-1">{formatSimpleMoney(totalIncome)}<span className="text-sm ml-1 text-gray-400">원</span></p>
          </div>
          <div>
            <p className="text-xs text-gray-400">총 비용</p>
            <p className="text-2xl md:text-3xl font-black mt-1 text-red-400">{formatSimpleMoney(totalExpense)}<span className="text-sm ml-1 text-red-400/60">원</span></p>
          </div>
          <div>
            <p className="text-xs text-gray-400">순이익</p>
            <p className={`text-2xl md:text-3xl font-black mt-1 ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {netProfit >= 0 ? '+' : ''}{formatSimpleMoney(netProfit)}<span className="text-sm ml-1 opacity-60">원</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">이익률</p>
            <p className={`text-2xl md:text-3xl font-black mt-1 ${profitRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {profitRate.toFixed(1)}<span className="text-sm ml-1 opacity-60">%</span>
            </p>
          </div>
        </div>
      </div>

      {/* 운영 현황 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <KPICard label="보유 차량" value={String(carStats.total)} unit="대" color="gray" sub={`가동률 ${carStats.utilizationRate.toFixed(0)}%`} />
        <KPICard label="대여 중" value={String(carStats.rented)} unit="대" color="green" />
        <KPICard label="월 고정 지출" value={formatSimpleMoney(monthlyFixedCost)} unit="원" color="red" sub="지입+투자이자+대출" />
        <KPICard label="총 투자 유치" value={formatSimpleMoney(partnerStats.investPrincipal)} unit="원" color="steel" />
        <KPICard label="총 대출 잔액" value={formatSimpleMoney(partnerStats.loanTotal)} unit="원" color="amber" />
      </div>

      {/* 월별 수입/지출 트렌드 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">월별 수입 / 지출 추이</h3>
        <BarChart
          data={monthlyData}
          maxVal={Math.max(...monthlyData.map((d: any) => Math.max(d.income, d.expense)), 1)}
        />
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-green-400" /><span className="text-xs text-gray-500">수입</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-400" /><span className="text-xs text-gray-500">지출</span></div>
        </div>
      </div>

      {/* 최근 거래 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">최근 거래 내역</h3>
        </div>
        {recentTx.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">거래 내역이 없습니다.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentTx.map((tx: Transaction) => (
              <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                    tx.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
                  }`}>
                    {tx.type === 'income' ? '↑' : '↓'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{tx.description || tx.category || '-'}</p>
                    <p className="text-xs text-gray-400">{tx.transaction_date} · {tx.client_name || '미지정'}</p>
                  </div>
                </div>
                <p className={`font-black text-sm ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                  {tx.type === 'income' ? '+' : '-'}{f(tx.amount)}원
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// 매출/수익 분석 탭
// ============================================
function RevenueTab({ totalIncome, monthlyData, incomeByCat, transactions }: any) {
  const totalCatAmount = incomeByCat.reduce((s: number, [, v]: [string, number]) => s + v, 0) || 1

  // 월 평균 수입
  const nonZeroMonths = monthlyData.filter((d: any) => d.income > 0).length || 1
  const avgMonthlyIncome = totalIncome / nonZeroMonths

  // 최고 수입 월
  const maxMonth = monthlyData.reduce((best: any, cur: any) => cur.income > (best?.income || 0) ? cur : best, monthlyData[0])

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KPICard label="총 매출" value={formatSimpleMoney(totalIncome)} unit="원" color="green" />
        <KPICard label="월 평균 매출" value={formatSimpleMoney(avgMonthlyIncome)} unit="원" color="steel" />
        <KPICard label="최고 매출 월" value={maxMonth?.label || '-'} color="blue" sub={maxMonth ? formatSimpleMoney(maxMonth.income) + '원' : ''} />
        <KPICard label="수입 카테고리" value={String(incomeByCat.length)} unit="개" color="gray" />
      </div>

      {/* 월별 매출 추이 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">월별 매출 추이</h3>
        <div className="space-y-2">
          {monthlyData.map((d: any, i: number) => {
            const maxIncome = Math.max(...monthlyData.map((m: any) => m.income), 1)
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 text-xs font-bold text-gray-500 text-right shrink-0">{d.label}</div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="h-6 rounded-r bg-gradient-to-r from-green-400 to-green-500" style={{ width: `${Math.max((d.income / maxIncome) * 100, 1)}%` }} />
                  <span className="text-xs text-gray-600 font-bold whitespace-nowrap">{formatSimpleMoney(d.income)}원</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 카테고리별 수입 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">수입 카테고리 비중</h3>
        {incomeByCat.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">수입 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {incomeByCat.map(([cat, amount]: [string, number], i: number) => {
              const pct = ((amount / totalCatAmount) * 100)
              const colors = ['bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-pink-500', 'bg-teal-500']
              return (
                <div key={cat}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-bold text-gray-700">{cat}</span>
                    <span className="text-sm text-gray-500">{f(amount)}원 ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors[i % colors.length]}`} style={{ width: `${pct}%` }} />
                  </div>
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
// 비용/지출 분석 탭
// ============================================
function ExpenseTab({ totalExpense, monthlyData, expenseByCat, monthlyFixedCost, partnerStats }: any) {
  const totalCatAmount = expenseByCat.reduce((s: number, [, v]: [string, number]) => s + v, 0) || 1

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KPICard label="총 비용" value={formatSimpleMoney(totalExpense)} unit="원" color="red" />
        <KPICard label="월 고정 지출" value={formatSimpleMoney(monthlyFixedCost)} unit="원" color="amber" sub="파트너 정산 합계" />
        <KPICard label="대출 월 납입" value={formatSimpleMoney(partnerStats.loanMonthly)} unit="원" color="steel" />
        <KPICard label="투자자 이자" value={formatSimpleMoney(partnerStats.investMonthlyInterest)} unit="원" color="blue" sub="월 예상 이자" />
      </div>

      {/* 월별 지출 추이 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">월별 지출 추이</h3>
        <div className="space-y-2">
          {monthlyData.map((d: any, i: number) => {
            const maxExpense = Math.max(...monthlyData.map((m: any) => m.expense), 1)
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 text-xs font-bold text-gray-500 text-right shrink-0">{d.label}</div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="h-6 rounded-r bg-gradient-to-r from-red-400 to-red-500" style={{ width: `${Math.max((d.expense / maxExpense) * 100, 1)}%` }} />
                  <span className="text-xs text-gray-600 font-bold whitespace-nowrap">{formatSimpleMoney(d.expense)}원</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 카테고리별 지출 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">지출 카테고리 비중</h3>
        {expenseByCat.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">지출 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {expenseByCat.map(([cat, amount]: [string, number], i: number) => {
              const pct = ((amount / totalCatAmount) * 100)
              const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-rose-500', 'bg-pink-500', 'bg-fuchsia-500']
              return (
                <div key={cat}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-bold text-gray-700">{cat}</span>
                    <span className="text-sm text-gray-500">{f(amount)}원 ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors[i % colors.length]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 고정 비용 구조 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">월 고정 비용 구조</h3>
        <div className="space-y-4">
          {[
            { label: '지입 관리비', amount: partnerStats.jiipMonthly, count: partnerStats.jiipCount, color: 'bg-blue-500' },
            { label: '투자자 이자', amount: partnerStats.investMonthlyInterest, count: partnerStats.investCount, color: 'bg-purple-500' },
            { label: '대출 납입금', amount: partnerStats.loanMonthly, count: partnerStats.loanCount, color: 'bg-red-500' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full ${item.color} shrink-0`} />
              <div className="flex-1">
                <div className="flex justify-between">
                  <span className="text-sm font-bold text-gray-700">{item.label} ({item.count}건)</span>
                  <span className="text-sm font-black text-gray-900">{f(Math.round(item.amount))}원</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full mt-1 overflow-hidden">
                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${monthlyFixedCost > 0 ? (item.amount / monthlyFixedCost) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================
// 차량 운용 탭
// ============================================
function FleetTab({ carStats, cars }: { carStats: any; cars: Car[] }) {
  // 브랜드별 분포
  const brandMap: Record<string, number> = {}
  cars.forEach(c => {
    const brand = c.brand || '미지정'
    brandMap[brand] = (brandMap[brand] || 0) + 1
  })
  const brandDist = Object.entries(brandMap).sort((a, b) => b[1] - a[1])

  // 상태별 분포 데이터
  const statusData = [
    { label: '대기 중', count: carStats.available, color: 'bg-blue-500', textColor: 'text-blue-600' },
    { label: '대여 중', count: carStats.rented, color: 'bg-green-500', textColor: 'text-green-600' },
    { label: '정비/사고', count: carStats.maintenance, color: 'bg-amber-500', textColor: 'text-amber-600' },
  ]

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <KPICard label="전체 차량" value={String(carStats.total)} unit="대" color="gray" />
        <KPICard label="대여 중" value={String(carStats.rented)} unit="대" color="green" />
        <KPICard label="대기 중" value={String(carStats.available)} unit="대" color="blue" />
        <KPICard label="정비/사고" value={String(carStats.maintenance)} unit="대" color="amber" />
        <KPICard label="총 자산가치" value={formatSimpleMoney(carStats.totalValue)} unit="원" color="steel" />
      </div>

      {/* 가동률 게이지 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">차량 가동률</h3>
        <div className="flex items-center gap-6">
          <div className="relative w-32 h-32">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#f3f4f6" strokeWidth="12" />
              <circle
                cx="60" cy="60" r="50" fill="none"
                stroke={carStats.utilizationRate >= 70 ? '#22c55e' : carStats.utilizationRate >= 40 ? '#f59e0b' : '#ef4444'}
                strokeWidth="12"
                strokeDasharray={`${2 * Math.PI * 50}`}
                strokeDashoffset={`${2 * Math.PI * 50 * (1 - carStats.utilizationRate / 100)}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-black text-gray-900">{carStats.utilizationRate.toFixed(0)}%</span>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            {statusData.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${s.color}`} />
                <span className="text-sm text-gray-600 flex-1">{s.label}</span>
                <span className={`text-sm font-black ${s.textColor}`}>{s.count}대</span>
                <span className="text-xs text-gray-400">({carStats.total > 0 ? ((s.count / carStats.total) * 100).toFixed(0) : 0}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 브랜드별 분포 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">브랜드별 보유 현황</h3>
        {brandDist.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">차량 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {brandDist.map(([brand, count], i) => {
              const pct = carStats.total > 0 ? ((count / carStats.total) * 100) : 0
              const colors = ['bg-steel-500', 'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-amber-500', 'bg-pink-500']
              return (
                <div key={brand}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-bold text-gray-700">{brand}</span>
                    <span className="text-sm text-gray-500">{count}대 ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors[i % colors.length]}`} style={{ width: `${pct}%` }} />
                  </div>
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
// 투자/파트너 탭
// ============================================
function PartnerTab({ partnerStats, jiipContracts, investments, loans }: {
  partnerStats: any; jiipContracts: JiipContract[]; investments: Investment[]; loans: Loan[]
}) {
  const activeJiip = jiipContracts.filter(j => j.status === 'active')
  const activeInvest = investments.filter(i => i.status === 'active')

  // 대출 타입별 분포
  const loanTypeMap: Record<string, { count: number; total: number }> = {}
  loans.forEach(l => {
    const type = l.type || '기타'
    if (!loanTypeMap[type]) loanTypeMap[type] = { count: 0, total: 0 }
    loanTypeMap[type].count++
    loanTypeMap[type].total += l.total_amount || 0
  })
  const loanTypeDist = Object.entries(loanTypeMap).sort((a, b) => b[1].total - a[1].total)

  // 총 파트너 부채/의무
  const totalObligation = partnerStats.investPrincipal + partnerStats.loanTotal

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KPICard label="총 자금 조달" value={formatSimpleMoney(totalObligation)} unit="원" color="gray" sub="투자+대출 합계" />
        <KPICard label="월 정산 합계" value={formatSimpleMoney(partnerStats.jiipMonthly + partnerStats.investMonthlyInterest + partnerStats.loanMonthly)} unit="원" color="red" />
        <KPICard label="활성 파트너" value={String(partnerStats.jiipCount + partnerStats.investCount)} unit="건" color="green" sub="지입+투자" />
        <KPICard label="대출 건수" value={String(partnerStats.loanCount)} unit="건" color="amber" />
      </div>

      {/* 지입 현황 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-gray-900">지입/위수탁 현황</h3>
          <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-lg font-bold">운영 중 {activeJiip.length}건</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">총 계약</p>
            <p className="text-lg font-black text-gray-900">{jiipContracts.length}건</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">월 관리비 합계</p>
            <p className="text-lg font-black text-blue-600">{f(partnerStats.jiipMonthly)}원</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">총 투자 유치</p>
            <p className="text-lg font-black text-steel-600">{formatSimpleMoney(jiipContracts.reduce((s: number, j: JiipContract) => s + (j.invest_amount || 0), 0))}원</p>
          </div>
        </div>
      </div>

      {/* 일반 투자 현황 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-gray-900">일반 투자 현황</h3>
          <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-lg font-bold">운용 중 {activeInvest.length}건</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">총 투자 원금</p>
            <p className="text-lg font-black text-gray-900">{formatSimpleMoney(partnerStats.investPrincipal)}원</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">월 예상 이자</p>
            <p className="text-lg font-black text-red-600">{f(Math.round(partnerStats.investMonthlyInterest))}원</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">평균 이자율</p>
            <p className="text-lg font-black text-steel-600">
              {activeInvest.length > 0
                ? (activeInvest.reduce((s: number, i: Investment) => s + (i.interest_rate || 0), 0) / activeInvest.length).toFixed(1)
                : '0'}%
            </p>
          </div>
        </div>
      </div>

      {/* 대출 타입별 현황 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-gray-900">대출/금융 타입별 현황</h3>
          <span className="text-xs bg-amber-100 text-amber-600 px-2 py-1 rounded-lg font-bold">총 {loans.length}건</span>
        </div>
        {loanTypeDist.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">대출 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {loanTypeDist.map(([type, data], i) => {
              const pct = partnerStats.loanTotal > 0 ? ((data.total / partnerStats.loanTotal) * 100) : 0
              const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-blue-500']
              return (
                <div key={type}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-bold text-gray-700">{type} ({data.count}건)</span>
                    <span className="text-sm text-gray-500">{formatSimpleMoney(data.total)}원 ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors[i % colors.length]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 종합 부채 구조 */}
      <div className="bg-gradient-to-r from-gray-900 to-steel-800 rounded-2xl p-5 md:p-6 text-white">
        <h3 className="text-sm font-bold text-gray-300 mb-4">종합 부채/의무 구조</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-400">투자자 원금</p>
            <p className="text-xl font-black mt-1">{formatSimpleMoney(partnerStats.investPrincipal)}<span className="text-xs ml-1 text-gray-400">원</span></p>
          </div>
          <div>
            <p className="text-xs text-gray-400">대출 잔액</p>
            <p className="text-xl font-black mt-1">{formatSimpleMoney(partnerStats.loanTotal)}<span className="text-xs ml-1 text-gray-400">원</span></p>
          </div>
          <div>
            <p className="text-xs text-gray-400">총 의무 금액</p>
            <p className="text-xl font-black mt-1 text-amber-400">{formatSimpleMoney(totalObligation)}<span className="text-xs ml-1 text-amber-400/60">원</span></p>
          </div>
          <div>
            <p className="text-xs text-gray-400">월 고정 상환</p>
            <p className="text-xl font-black mt-1 text-red-400">{f(Math.round(partnerStats.jiipMonthly + partnerStats.investMonthlyInterest + partnerStats.loanMonthly))}<span className="text-xs ml-1 text-red-400/60">원</span></p>
          </div>
        </div>
      </div>
    </div>
  )
}
