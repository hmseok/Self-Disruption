'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../context/AppContext'
import DarkHeader from '../../components/DarkHeader'
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

// ============================================
// 전체 차량 수익 현황 (Fleet P&L Dashboard)
// ============================================

const f = (n: number) => n.toLocaleString()
const fMan = (n: number) => {
  const abs = Math.abs(n)
  if (abs >= 100000000) return `${(n / 100000000).toFixed(1)}억`
  if (abs >= 10000) return `${Math.round(n / 10000)}만`
  return f(n)
}

// 비용 제외 카테고리 (자본/금융 거래)
const EXCLUDE_EXPENSE_CATS = new Set(['차량구입', '할부', '리스', '대출', '투자', '투자입금', '투자회수', '대출상환'])

type Period = 'all' | '1y' | '6m' | '3m' | '1m'
type SortKey = 'revenue' | 'expense' | 'operating' | 'settlement' | 'net' | 'rate'
type SortDir = 'asc' | 'desc'

interface CarPnl {
  carId: string
  number: string
  model: string
  brand: string
  status: string
  ownershipType: string
  // P&L
  revenue: number
  expense: number
  operatingProfit: number  // 매출 - 운영비
  settlement: number       // 정산 배분 (지입+투자)
  netProfit: number        // 영업이익 - 정산
  profitRate: number       // 수익률 (순이익/매출)
  // 세부 비용
  fuel: number
  insurance: number
  maintenance: number
  loan: number
  parking: number
  tax: number
  otherExpense: number
  // 정산 세부
  jiipPayout: number
  investPayout: number
  // 계약 정보
  jiipContract: any | null
  investContracts: any[]
}

export default function FleetPnlPage() {
  const router = useRouter()
  const { company, role } = useApp()
  const effectiveCompanyId = company?.id

  const [loading, setLoading] = useState(true)
  const [cars, setCars] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [loans, setLoans] = useState<any[]>([])
  const [insurances, setInsurances] = useState<any[]>([])
  const [jiipContracts, setJiipContracts] = useState<any[]>([])
  const [investContracts, setInvestContracts] = useState<any[]>([])
  const [settleTxs, setSettleTxs] = useState<any[]>([])

  const [period, setPeriod] = useState<Period>('1m')
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7))
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedCar, setExpandedCar] = useState<string | null>(null)

  // ── 데이터 로드 ──
  useEffect(() => {
    if (!effectiveCompanyId) return
    loadAll()
  }, [effectiveCompanyId, filterDate])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [year, month] = filterDate.split('-').map(Number)
      const startDate = `${filterDate}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${filterDate}-${lastDay}`

      const headers = await getAuthHeader()

      const [carsRes, txRes, loansRes, insRes, jiipRes, investRes, settleTxRes, queueRes] = await Promise.all([
        // 전체 차량
        fetch(`/api/cars`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
        // 차량 연결 거래 (당월)
        fetch(`/api/transactions?related_type=car&from=${startDate}&to=${endDate}`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
        // 대출/금융상품
        fetch(`/api/loans`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
        // 보험
        fetch(`/api/insurance`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
        // 지입 계약
        fetch(`/api/jiip`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
        // 투자 계약
        fetch(`/api/investments`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
        // 정산 거래 (지입/투자 — 당월)
        fetch(`/api/transactions?related_type=jiip_share,invest&from=${startDate}&to=${endDate}`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
        // classification_queue 확정 건 (아직 transactions에 안 간 것)
        fetch(`/api/classification-queue?final_matched_type=car&status=confirmed,auto_confirmed`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
      ])

      setCars(carsRes.data || [])

      // transactions + classification_queue 병합
      const txData = txRes.data || []
      const txIds = new Set(txData.map((t: any) => t.id))
      const queueTx = (queueRes.data || [])
        .filter((q: any) => !txIds.has(q.id))
        .map((q: any) => {
          const src = typeof q.source_data === 'string' ? JSON.parse(q.source_data) : (q.source_data || {})
          const txDate = src.transaction_date || src.date || ''
          // 당월 필터
          if (!txDate.startsWith(filterDate)) return null
          return {
            id: q.id,
            transaction_date: txDate,
            type: src.type || 'expense',
            category: q.final_category || src.category || '기타',
            amount: Math.abs(src.amount || 0),
            related_type: 'car',
            related_id: String(q.final_matched_id || ''),
            client_name: src.client_name || src.merchant || '',
            description: src.description || src.memo || '',
            memo: '',
          }
        })
        .filter(Boolean)
      setTransactions([...txData, ...queueTx])

      setLoans(loansRes.data || [])
      setInsurances(insRes.data || [])
      setJiipContracts(jiipRes.data || [])
      setInvestContracts(investRes.data || [])
      setSettleTxs(settleTxRes.data || [])
    } catch (err) {
      console.error('Fleet P&L load error:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── 차량별 P&L 집계 ──
  const carPnlList = useMemo<CarPnl[]>(() => {
    if (!cars.length) return []

    // 인덱싱
    const txByCar: Record<string, any[]> = {}
    for (const tx of transactions) {
      const cid = tx.related_id
      if (!txByCar[cid]) txByCar[cid] = []
      txByCar[cid].push(tx)
    }

    const loanByCar: Record<string, any[]> = {}
    for (const l of loans) {
      const cid = String(l.car_id)
      if (!loanByCar[cid]) loanByCar[cid] = []
      loanByCar[cid].push(l)
    }

    const insByCar: Record<string, any[]> = {}
    for (const ins of insurances) {
      const cid = String(ins.car_id)
      if (!insByCar[cid]) insByCar[cid] = []
      insByCar[cid].push(ins)
    }

    const jiipByCar: Record<string, any> = {}
    for (const j of jiipContracts) {
      jiipByCar[String(j.car_id)] = j
    }

    const investByCar: Record<string, any[]> = {}
    for (const inv of investContracts) {
      const cid = String(inv.car_id)
      if (!investByCar[cid]) investByCar[cid] = []
      investByCar[cid].push(inv)
    }

    // 정산 거래 → 지입계약 car_id 매핑
    const jiipIdToCarId: Record<string, string> = {}
    for (const j of jiipContracts) {
      jiipIdToCarId[String(j.id)] = String(j.car_id)
    }
    const investIdToCarId: Record<string, string> = {}
    for (const inv of investContracts) {
      investIdToCarId[String(inv.id)] = String(inv.car_id)
    }

    const settleByCar: Record<string, { jiip: number; invest: number }> = {}
    for (const stx of settleTxs) {
      let carId = ''
      if (stx.related_type === 'jiip_share') {
        carId = jiipIdToCarId[stx.related_id] || ''
      } else if (stx.related_type === 'invest') {
        carId = investIdToCarId[stx.related_id] || ''
      }
      if (!carId) continue
      if (!settleByCar[carId]) settleByCar[carId] = { jiip: 0, invest: 0 }
      const amt = Math.abs(Number(stx.amount) || 0)
      if (stx.related_type === 'jiip_share') {
        settleByCar[carId].jiip += amt
      } else {
        settleByCar[carId].invest += amt
      }
    }

    return cars.map(car => {
      const cid = String(car.id)
      const carTxs = txByCar[cid] || []
      const carLoans = loanByCar[cid] || []
      const carIns = insByCar[cid] || []
      const jiip = jiipByCar[cid] || null
      const invests = investByCar[cid] || []
      const settle = settleByCar[cid] || { jiip: 0, invest: 0 }

      // 수입
      let revenue = 0
      // 비용 세부
      let fuel = 0, insurance = 0, maintenance = 0, parking = 0, tax = 0, otherExpense = 0, loanExpense = 0

      for (const tx of carTxs) {
        const amt = Math.abs(Number(tx.amount) || 0)
        if (tx.type === 'income') {
          revenue += amt
        } else {
          const cat = tx.category || ''
          if (EXCLUDE_EXPENSE_CATS.has(cat)) continue
          if (cat === '주유비' || cat === '충전') fuel += amt
          else if (cat === '보험료') insurance += amt
          else if (cat === '정비비' || cat === '차량유지비') maintenance += amt
          else if (cat === '주차비') parking += amt
          else if (cat === '세금/과태료') tax += amt
          else if (cat === '대출이자' || cat === '리스료') loanExpense += amt
          else otherExpense += amt
        }
      }

      // 고정비: 대출 월 납부
      const loanMonthly = carLoans.reduce((s, l) => {
        const start = l.start_date ? l.start_date.slice(0, 7) : ''
        const end = l.end_date ? l.end_date.slice(0, 7) : ''
        if (start && start <= filterDate && (!end || end >= filterDate)) {
          return s + (Number(l.monthly_payment) || 0)
        }
        return s
      }, 0)

      // 고정비: 보험료 월 납부
      const insMonthly = carIns.reduce((s, i) => {
        const start = i.start_date ? i.start_date.slice(0, 7) : ''
        const end = i.end_date ? i.end_date.slice(0, 7) : ''
        if (start && start <= filterDate && (!end || end >= filterDate)) {
          return s + (Number(i.premium) || 0) / 12
        }
        return s
      }, 0)

      const totalFixed = loanMonthly + insMonthly
      const totalExpense = fuel + insurance + maintenance + parking + tax + otherExpense + totalFixed
      const operatingProfit = revenue - totalExpense
      const settlement = settle.jiip + settle.invest
      const netProfit = operatingProfit - settlement
      const profitRate = revenue > 0 ? (netProfit / revenue) * 100 : 0

      return {
        carId: cid,
        number: car.number || '',
        model: car.model || '',
        brand: car.brand || '',
        status: car.status || '',
        ownershipType: car.ownership_type || '',
        revenue,
        expense: totalExpense,
        operatingProfit,
        settlement,
        netProfit,
        profitRate,
        fuel,
        insurance,
        maintenance,
        loan: totalFixed,
        parking,
        tax,
        otherExpense,
        jiipPayout: settle.jiip,
        investPayout: settle.invest,
        jiipContract: jiip,
        investContracts: invests,
      }
    })
  }, [cars, transactions, loans, insurances, jiipContracts, investContracts, settleTxs, filterDate])

  // ── 필터링 및 정렬 ──
  const filtered = useMemo(() => {
    let result = carPnlList
    if (searchText) {
      const q = searchText.toLowerCase()
      result = result.filter(p => p.number.toLowerCase().includes(q) || p.model.toLowerCase().includes(q))
    }
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter)
    }
    return result
  }, [carPnlList, searchText, statusFilter])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      let aVal = 0, bVal = 0
      switch (sortKey) {
        case 'revenue': aVal = a.revenue; bVal = b.revenue; break
        case 'expense': aVal = a.expense; bVal = b.expense; break
        case 'operating': aVal = a.operatingProfit; bVal = b.operatingProfit; break
        case 'settlement': aVal = a.settlement; bVal = b.settlement; break
        case 'net': aVal = a.netProfit; bVal = b.netProfit; break
        case 'rate': aVal = a.profitRate; bVal = b.profitRate; break
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal
    })
    return copy
  }, [filtered, sortKey, sortDir])

  // ── 합계 ──
  const totals = useMemo(() => {
    return filtered.reduce((acc, p) => ({
      revenue: acc.revenue + p.revenue,
      expense: acc.expense + p.expense,
      operatingProfit: acc.operatingProfit + p.operatingProfit,
      settlement: acc.settlement + p.settlement,
      netProfit: acc.netProfit + p.netProfit,
    }), { revenue: 0, expense: 0, operatingProfit: 0, settlement: 0, netProfit: 0 })
  }, [filtered])

  const avgProfitRate = filtered.length > 0
    ? (totals.netProfit / totals.revenue) * 100
    : 0

  if (loading) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8'>
        <DarkHeader icon='🚗' title='Fleet P&L Dashboard' />
        <div className='text-center text-slate-400 mt-8'>로딩 중...</div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8'>
      <DarkHeader icon='🚗' title='Fleet P&L Dashboard' />

      <div className='max-w-7xl mx-auto mt-8'>
        {/* 필터 & 제어 */}
        <div className='bg-white/[0.08] backdrop-blur-xl rounded-xl p-6 border border-white/[0.1] mb-6'>
          <div className='grid grid-cols-1 md:grid-cols-4 gap-4 mb-4'>
            <div>
              <label className='block text-sm font-medium text-slate-300 mb-2'>조회 기간</label>
              <input
                type='month'
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className='w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white'
              />
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-300 mb-2'>상태</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className='w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white'
              >
                <option value='all'>전체</option>
                <option value='active'>운영 중</option>
                <option value='inactive'>중지</option>
              </select>
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-300 mb-2'>정렬</label>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className='w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white'
              >
                <option value='revenue'>매출</option>
                <option value='expense'>비용</option>
                <option value='operating'>영업이익</option>
                <option value='settlement'>정산</option>
                <option value='net'>순이익</option>
                <option value='rate'>수익률</option>
              </select>
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-300 mb-2'>검색</label>
              <input
                type='text'
                placeholder='차량번호, 모델명...'
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className='w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500'
              />
            </div>
          </div>
        </div>

        {/* 요약 통계 */}
        <div className='grid grid-cols-2 md:grid-cols-5 gap-4 mb-6'>
          <div className='bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-xl p-4 border border-blue-400/30'>
            <div className='text-xs text-blue-300 mb-1'>총 매출</div>
            <div className='text-xl font-bold text-blue-100'>{fMan(totals.revenue)}</div>
          </div>
          <div className='bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl p-4 border border-red-400/30'>
            <div className='text-xs text-red-300 mb-1'>총 비용</div>
            <div className='text-xl font-bold text-red-100'>{fMan(totals.expense)}</div>
          </div>
          <div className='bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 rounded-xl p-4 border border-yellow-400/30'>
            <div className='text-xs text-yellow-300 mb-1'>영업이익</div>
            <div className='text-xl font-bold text-yellow-100'>{fMan(totals.operatingProfit)}</div>
          </div>
          <div className='bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-xl p-4 border border-purple-400/30'>
            <div className='text-xs text-purple-300 mb-1'>정산액</div>
            <div className='text-xl font-bold text-purple-100'>{fMan(totals.settlement)}</div>
          </div>
          <div className='bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-xl p-4 border border-green-400/30'>
            <div className='text-xs text-green-300 mb-1'>순이익</div>
            <div className='text-xl font-bold text-green-100'>{fMan(totals.netProfit)}</div>
          </div>
        </div>

        {/* 테이블 */}
        <div className='bg-white/[0.08] backdrop-blur-xl rounded-xl border border-white/[0.1] overflow-hidden'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b border-white/[0.1] bg-white/[0.03]'>
                <th className='px-4 py-3 text-left text-slate-300 font-medium'>차량번호</th>
                <th className='px-4 py-3 text-left text-slate-300 font-medium'>모델</th>
                <th className='px-4 py-3 text-right text-slate-300 font-medium'>매출</th>
                <th className='px-4 py-3 text-right text-slate-300 font-medium'>비용</th>
                <th className='px-4 py-3 text-right text-slate-300 font-medium'>영업이익</th>
                <th className='px-4 py-3 text-right text-slate-300 font-medium'>정산</th>
                <th className='px-4 py-3 text-right text-slate-300 font-medium'>순이익</th>
                <th className='px-4 py-3 text-right text-slate-300 font-medium'>수익률</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((pnl, idx) => (
                <tr key={pnl.carId} className='border-b border-white/[0.05] hover:bg-white/[0.03] transition'>
                  <td className='px-4 py-3 text-slate-100 font-mono'>{pnl.number}</td>
                  <td className='px-4 py-3 text-slate-300'>{pnl.model}</td>
                  <td className='px-4 py-3 text-right text-blue-300'>{fMan(pnl.revenue)}</td>
                  <td className='px-4 py-3 text-right text-red-300'>{fMan(pnl.expense)}</td>
                  <td className='px-4 py-3 text-right text-yellow-300'>{fMan(pnl.operatingProfit)}</td>
                  <td className='px-4 py-3 text-right text-purple-300'>{fMan(pnl.settlement)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${pnl.netProfit >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {fMan(pnl.netProfit)}
                  </td>
                  <td className='px-4 py-3 text-right text-slate-300'>{pnl.profitRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 빈 상태 */}
        {sorted.length === 0 && (
          <div className='text-center text-slate-400 py-12'>
            <p>조회 결과가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
