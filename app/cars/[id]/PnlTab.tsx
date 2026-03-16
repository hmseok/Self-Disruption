'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../utils/supabase'

// ============================================
// 차량별 손익 분석 탭
// 수입/비용/순이익을 카테고리별로 집계
// ============================================

interface PnlTabProps {
  carId: string | number
  companyId?: string
  car?: any
}

interface TransactionRow {
  id: number
  transaction_date: string
  type: string        // income / expense
  category: string
  client_name: string
  description: string
  amount: number
  payment_method: string
  related_type?: string
  related_id?: string
}

interface LoanRow {
  id: number
  finance_name: string
  type: string
  total_amount: number
  monthly_payment: number
  start_date?: string
  end_date?: string
}

interface InsuranceRow {
  id: number
  insurance_company: string
  premium: number
  start_date?: string
  end_date?: string
  coverage_type?: string
}

// 비용 카테고리 아이콘/컬러 매핑
const CATEGORY_META: Record<string, { icon: string; color: string }> = {
  '주유비': { icon: '⛽', color: '#f97316' },
  '충전': { icon: '🔋', color: '#22c55e' },
  '주차비': { icon: '🅿️', color: '#6366f1' },
  '차량유지비': { icon: '🔧', color: '#64748b' },
  '정비비': { icon: '🛠️', color: '#ea580c' },
  '보험료': { icon: '🛡️', color: '#0ea5e9' },
  '대출이자': { icon: '🏦', color: '#a855f7' },
  '세금/과태료': { icon: '📋', color: '#ef4444' },
  '리스료': { icon: '📄', color: '#8b5cf6' },
  '렌트수입': { icon: '💰', color: '#22c55e' },
  '지입수입': { icon: '🤝', color: '#2563eb' },
  '기타수입': { icon: '💵', color: '#10b981' },
  '기타비용': { icon: '📦', color: '#94a3b8' },
}

const fmt = (n: number) => n.toLocaleString()

export default function PnlTab({ carId, companyId, car }: PnlTabProps) {
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loans, setLoans] = useState<LoanRow[]>([])
  const [insurance, setInsurance] = useState<InsuranceRow[]>([])
  const [period, setPeriod] = useState<'all' | '1y' | '6m' | '3m' | '1m'>('all')

  // ── 데이터 로드 ──────────────────────
  useEffect(() => {
    if (!carId) return
    loadAll()
  }, [carId])

  const loadAll = async () => {
    setLoading(true)
    try {
      // 1. 이 차량에 연결된 거래내역 (직접 연결: related_type='car')
      const txPromise = supabase
        .from('transactions')
        .select('id, transaction_date, type, category, client_name, description, amount, payment_method, related_type, related_id')
        .eq('related_type', 'car')
        .eq('related_id', String(carId))
        .order('transaction_date', { ascending: false })

      // 2. 대출/금융상품
      const loanPromise = supabase
        .from('loans')
        .select('id, finance_name, type, total_amount, monthly_payment, start_date, end_date')
        .eq('car_id', carId)

      // 3. 보험 계약
      const insPromise = supabase
        .from('insurance_contracts')
        .select('id, insurance_company, premium, start_date, end_date, coverage_type')
        .eq('car_id', carId)

      // 4. classification_queue에서 확정된 것 (아직 transactions에 안 간 것)
      const queuePromise = supabase
        .from('classification_queue')
        .select('id, source_data, final_category, final_matched_type, final_matched_id, status')
        .eq('final_matched_type', 'car')
        .eq('final_matched_id', String(carId))
        .in('status', ['confirmed', 'auto_confirmed'])

      const [txRes, loanRes, insRes, queueRes] = await Promise.all([txPromise, loanPromise, insPromise, queuePromise])

      // transactions
      const txData = txRes.data || []

      // queue에서 추가 (transactions에 없는 것만)
      const txIds = new Set(txData.map(t => t.id))
      const queueTx: TransactionRow[] = (queueRes.data || [])
        .filter((q: any) => !txIds.has(q.id))
        .map((q: any) => {
          const src = typeof q.source_data === 'string' ? JSON.parse(q.source_data) : (q.source_data || {})
          return {
            id: q.id,
            transaction_date: src.transaction_date || src.date || '',
            type: src.type || 'expense',
            category: q.final_category || src.category || '기타',
            client_name: src.client_name || src.merchant || '',
            description: src.description || src.memo || '',
            amount: Math.abs(src.amount || 0),
            payment_method: src.payment_method || '',
            related_type: 'car',
            related_id: String(carId),
          }
        })

      setTransactions([...txData, ...queueTx])
      setLoans(loanRes.data || [])
      setInsurance(insRes.data || [])
    } catch (err) {
      console.error('손익 데이터 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── 기간 필터링 ──────────────────────
  const filteredTx = useMemo(() => {
    if (period === 'all') return transactions
    const now = new Date()
    const months = period === '1y' ? 12 : period === '6m' ? 6 : period === '3m' ? 3 : 1
    const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate())
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return transactions.filter(t => t.transaction_date >= cutoffStr)
  }, [transactions, period])

  // ── 집계 계산 ────────────────────────
  const summary = useMemo(() => {
    const incomeByCategory: Record<string, number> = {}
    const expenseByCategory: Record<string, number> = {}
    let totalIncome = 0
    let totalExpense = 0

    filteredTx.forEach(tx => {
      const amt = Math.abs(tx.amount)
      const cat = tx.category || '기타'

      if (tx.type === 'income') {
        totalIncome += amt
        incomeByCategory[cat] = (incomeByCategory[cat] || 0) + amt
      } else {
        totalExpense += amt
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amt
      }
    })

    // 보험료 추가 (연간 → 기간 비례)
    const monthsInPeriod = period === 'all' ? 12 : period === '1y' ? 12 : period === '6m' ? 6 : period === '3m' ? 3 : 1
    insurance.forEach(ins => {
      if (ins.premium) {
        const monthlyPremium = Math.round(ins.premium / 12)
        const insuranceCost = monthlyPremium * monthsInPeriod
        totalExpense += insuranceCost
        expenseByCategory['보험료'] = (expenseByCategory['보험료'] || 0) + insuranceCost
      }
    })

    // 대출 월납입 추가
    loans.forEach(loan => {
      if (loan.monthly_payment) {
        const loanCost = loan.monthly_payment * monthsInPeriod
        totalExpense += loanCost
        const cat = loan.type === '리스' ? '리스료' : '대출이자'
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + loanCost
      }
    })

    const netProfit = totalIncome - totalExpense

    // 정렬된 카테고리 배열
    const incomeItems = Object.entries(incomeByCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => ({ category: cat, amount: amt }))

    const expenseItems = Object.entries(expenseByCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => ({ category: cat, amount: amt }))

    return { totalIncome, totalExpense, netProfit, incomeItems, expenseItems }
  }, [filteredTx, loans, insurance, period])

  // 구매가 대비 수익률 (연환산)
  const purchasePrice = car?.purchase_price || 0
  const annualROI = purchasePrice > 0
    ? ((summary.netProfit / purchasePrice) * 100).toFixed(1)
    : null

  // ── 렌더링 ───────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-3 border-gray-300 border-t-steel-600 rounded-full mx-auto mb-3"></div>
          <p className="text-gray-400 text-sm font-medium">손익 데이터 로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">

      {/* 기간 선택 */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: 'all' as const, label: '전체' },
          { key: '1y' as const, label: '최근 1년' },
          { key: '6m' as const, label: '6개월' },
          { key: '3m' as const, label: '3개월' },
          { key: '1m' as const, label: '1개월' },
        ].map(opt => (
          <button
            key={opt.key}
            onClick={() => setPeriod(opt.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              period === opt.key
                ? 'bg-steel-600 text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 핵심 KPI 카드 3개 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 총 수입 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-lg">💰</div>
            <span className="text-sm font-bold text-gray-500">총 수입</span>
          </div>
          <p className="text-2xl font-black text-blue-600">{fmt(summary.totalIncome)}원</p>
          <p className="text-xs text-gray-400 mt-1">{summary.incomeItems.length}개 항목</p>
        </div>

        {/* 총 비용 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-lg">📉</div>
            <span className="text-sm font-bold text-gray-500">총 비용</span>
          </div>
          <p className="text-2xl font-black text-red-500">{fmt(summary.totalExpense)}원</p>
          <p className="text-xs text-gray-400 mt-1">{summary.expenseItems.length}개 항목</p>
        </div>

        {/* 순이익 */}
        <div className={`rounded-2xl border p-5 shadow-sm ${
          summary.netProfit >= 0
            ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200'
            : 'bg-gradient-to-br from-red-50 to-orange-50 border-red-200'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${
              summary.netProfit >= 0 ? 'bg-green-200' : 'bg-red-200'
            }`}>
              {summary.netProfit >= 0 ? '📈' : '📉'}
            </div>
            <span className="text-sm font-bold text-gray-500">순이익</span>
          </div>
          <p className={`text-2xl font-black ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {summary.netProfit >= 0 ? '+' : ''}{fmt(summary.netProfit)}원
          </p>
          {annualROI && (
            <p className="text-xs text-gray-500 mt-1">
              구매가 대비 <span className={`font-bold ${Number(annualROI) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{annualROI}%</span>
            </p>
          )}
        </div>
      </div>

      {/* 구매 정보 요약 */}
      {purchasePrice > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h4 className="text-sm font-bold text-gray-500 mb-3">차량 기본 정보</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400">구매가</p>
              <p className="font-bold text-gray-800">{fmt(purchasePrice)}원</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">취득일</p>
              <p className="font-bold text-gray-800">{car?.acq_date || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">대출 건수</p>
              <p className="font-bold text-gray-800">{loans.length}건</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">보험 건수</p>
              <p className="font-bold text-gray-800">{insurance.length}건</p>
            </div>
          </div>
        </div>
      )}

      {/* 수입 카테고리 상세 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <span className="text-lg">💰</span>
          <h4 className="font-bold text-gray-800">수입 내역</h4>
          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold ml-auto">{fmt(summary.totalIncome)}원</span>
        </div>
        {summary.incomeItems.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">연결된 수입 내역이 없습니다</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {summary.incomeItems.map(item => {
              const meta = CATEGORY_META[item.category] || { icon: '💵', color: '#64748b' }
              const pct = summary.totalIncome > 0 ? (item.amount / summary.totalIncome * 100).toFixed(1) : '0'
              return (
                <div key={item.category} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                  <span className="text-lg">{meta.icon}</span>
                  <span className="flex-1 text-sm font-medium text-gray-700">{item.category}</span>
                  <span className="text-xs text-gray-400 w-12 text-right">{pct}%</span>
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                  </div>
                  <span className="text-sm font-bold text-blue-600 w-28 text-right">{fmt(item.amount)}원</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 비용 카테고리 상세 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <span className="text-lg">📉</span>
          <h4 className="font-bold text-gray-800">비용 내역</h4>
          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold ml-auto">{fmt(summary.totalExpense)}원</span>
        </div>
        {summary.expenseItems.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">연결된 비용 내역이 없습니다</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {summary.expenseItems.map(item => {
              const meta = CATEGORY_META[item.category] || { icon: '📦', color: '#94a3b8' }
              const pct = summary.totalExpense > 0 ? (item.amount / summary.totalExpense * 100).toFixed(1) : '0'
              return (
                <div key={item.category} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                  <span className="text-lg">{meta.icon}</span>
                  <span className="flex-1 text-sm font-medium text-gray-700">{item.category}</span>
                  <span className="text-xs text-gray-400 w-12 text-right">{pct}%</span>
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                  </div>
                  <span className="text-sm font-bold text-red-500 w-28 text-right">{fmt(item.amount)}원</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 최근 거래 내역 (최신 20건) */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <span className="text-lg">📋</span>
          <h4 className="font-bold text-gray-800">최근 거래 내역</h4>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold ml-auto">
            총 {filteredTx.length}건
          </span>
        </div>
        {filteredTx.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">거래 내역이 없습니다</div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
            {filteredTx.slice(0, 20).map(tx => {
              const isIncome = tx.type === 'income'
              return (
                <div key={tx.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                  <span className="text-xs text-gray-400 w-20 shrink-0">{tx.transaction_date?.slice(0, 10)}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    isIncome ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-500'
                  }`}>
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

      {/* 대출/금융 요약 */}
      {loans.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <span className="text-lg">🏦</span>
            <h4 className="font-bold text-gray-800">대출/금융 현황</h4>
          </div>
          <div className="divide-y divide-gray-50">
            {loans.map(loan => (
              <div key={loan.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-lg">💳</div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800">{loan.finance_name}</p>
                  <p className="text-xs text-gray-400">{loan.type} · 원금 {fmt(loan.total_amount)}원</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-800">월 {fmt(loan.monthly_payment)}원</p>
                  {loan.end_date && <p className="text-xs text-gray-400">~{loan.end_date}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 보험 요약 */}
      {insurance.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <span className="text-lg">🛡️</span>
            <h4 className="font-bold text-gray-800">보험 현황</h4>
          </div>
          <div className="divide-y divide-gray-50">
            {insurance.map(ins => (
              <div key={ins.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center text-lg">🛡️</div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800">{ins.insurance_company}</p>
                  <p className="text-xs text-gray-400">{ins.coverage_type || '종합보험'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-800">연 {fmt(ins.premium || 0)}원</p>
                  <p className="text-xs text-gray-400">월 {fmt(Math.round((ins.premium || 0) / 12))}원</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
