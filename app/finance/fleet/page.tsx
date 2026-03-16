'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import DarkHeader from '../../components/DarkHeader'

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
  const { company, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'admin' ? (adminSelectedCompanyId || company?.id) : company?.id

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

      const [carsRes, txRes, loansRes, insRes, jiipRes, investRes, settleTxRes, queueRes] = await Promise.all([
        // 전체 차량
        (() => {
          let q = supabase.from('cars').select('id, number, model, brand, status, ownership_type')
          if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
          return q.order('number')
        })(),
        // 차량 연결 거래 (당월)
        (() => {
          let q = supabase.from('transactions')
            .select('id, transaction_date, type, category, amount, related_type, related_id, client_name, description, memo')
            .eq('related_type', 'car')
            .gte('transaction_date', startDate)
            .lte('transaction_date', endDate)
          if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
          return q
        })(),
        // 대출/금융상품
        (() => {
          let q = supabase.from('loans').select('id, car_id, finance_name, type, monthly_payment, start_date, end_date')
          if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
          return q
        })(),
        // 보험
        (() => {
          let q = supabase.from('insurance_contracts').select('id, car_id, insurance_company, premium, start_date, end_date')
          if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
          return q
        })(),
        // 지입 계약
        (() => {
          let q = supabase.from('jiip_contracts').select('id, car_id, investor_name, admin_fee, share_ratio, status')
          if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
          return q.eq('status', 'active')
        })(),
        // 투자 계약
        (() => {
          let q = supabase.from('general_investments').select('id, car_id, investor_name, invest_amount, interest_rate, status')
          if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
          return q.eq('status', 'active')
        })(),
        // 정산 거래 (지입/투자 — 당월)
        (() => {
          let q = supabase.from('transactions')
            .select('id, transaction_date, type, category, amount, related_type, related_id, client_name')
            .in('related_type', ['jiip_share', 'invest'])
            .gte('transaction_date', startDate)
            .lte('transaction_date', endDate)
          if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
          return q
        })(),
        // classification_queue 확정 건 (아직 transactions에 안 간 것)
        (() => {
          let q = supabase.from('classification_queue')
            .select('id, source_data, final_category, final_matched_type, final_matched_id, status')
            .eq('final_matched_type', 'car')
            .in('status', ['confirmed', 'auto_confirmed'])
          if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId)
          return q
        })(),
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
        const end = l.end_date ? l.end_date.slice(0, 7) : '9999-12'
        if (filterDate >= start && filterDate <= end) {
          return s + (l.monthly_payment || 0)
        }
        return s
      }, 0)

      // 고정비: 보험 월할
      const insMonthly = carIns.reduce((s, ins) => {
        const start = ins.start_date ? ins.start_date.slice(0, 7) : ''
        const end = ins.end_date ? ins.end_date.slice(0, 7) : '9999-12'
        if (filterDate >= start && filterDate <= end) {
          return s + Math.round((ins.premium || 0) / 12)
        }
        return s
      }, 0)

      // 거래에 이미 보험/대출이 포함되어 있을 수 있으므로, 미포함 시에만 추가
      if (insurance === 0 && insMonthly > 0) insurance = insMonthly
      if (loanExpense === 0 && loanMonthly > 0) loanExpense = loanMonthly

      const totalExpense = fuel + insurance + maintenance + parking + tax + loanExpense + otherExpense
      const operatingProfit = revenue - totalExpense
      const totalSettlement = settle.jiip + settle.invest

      // 정산 미발생 시 예상치 계산
      let expectedJiip = 0
      let expectedInvest = 0
      if (jiip && totalSettlement === 0) {
        expectedJiip = jiip.admin_fee || 0
      }
      if (invests.length > 0 && settle.invest === 0) {
        expectedInvest = invests.reduce((s: number, inv: any) =>
          s + Math.round((inv.invest_amount || 0) * (inv.interest_rate || 0) / 100 / 12), 0)
      }
      const effectiveSettlement = totalSettlement > 0 ? totalSettlement : (expectedJiip + expectedInvest)

      const netProfit = operatingProfit - effectiveSettlement
      const profitRate = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0

      return {
        carId: cid, number: car.number || '미지정', model: car.model || '',
        brand: car.brand || '', status: car.status || '', ownershipType: car.ownership_type || '',
        revenue, expense: totalExpense, operatingProfit,
        settlement: effectiveSettlement, netProfit, profitRate,
        fuel, insurance, maintenance, loan: loanExpense, parking, tax, otherExpense,
        jiipPayout: totalSettlement > 0 ? settle.jiip : expectedJiip,
        investPayout: totalSettlement > 0 ? settle.invest : expectedInvest,
        jiipContract: jiip, investContracts: invests,
      }
    })
  }, [cars, transactions, loans, insurances, jiipContracts, investContracts, settleTxs, filterDate])

  // ── 필터 + 정렬 ──
  const filtered = useMemo(() => {
    let list = [...carPnlList]
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') list = list.filter(c => c.revenue > 0 || c.status === 'available' || c.status === 'rented')
      else if (statusFilter === 'idle') list = list.filter(c => c.revenue === 0)
    }
    if (searchText) {
      const q = searchText.toLowerCase()
      list = list.filter(c => c.number.toLowerCase().includes(q) || c.model.toLowerCase().includes(q) || c.brand.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number)
    })
    return list
  }, [carPnlList, statusFilter, searchText, sortKey, sortDir])

  // ── 전체 합계 ──
  const totals = useMemo(() => ({
    revenue: filtered.reduce((s, c) => s + c.revenue, 0),
    expense: filtered.reduce((s, c) => s + c.expense, 0),
    operating: filtered.reduce((s, c) => s + c.operatingProfit, 0),
    settlement: filtered.reduce((s, c) => s + c.settlement, 0),
    net: filtered.reduce((s, c) => s + c.netProfit, 0),
    activeCars: filtered.filter(c => c.revenue > 0).length,
  }), [filtered])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''

  // ── 날짜 변경 ──
  const handleMonthChange = (delta: number) => {
    const [y, m] = filterDate.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setFilterDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // ── 스타일 ──
  const statCard = (label: string, value: number, color: string, sub?: string): React.ReactNode => (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color }}>{fMan(value)}원</div>
      {sub && <div style={{ fontSize: 10, color: '#b0b0b0', marginTop: 1 }}>{sub}</div>}
    </div>
  )

  return (
    <>
      <DarkHeader />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
        {/* ═══ 헤더 ═══ */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>재무 &gt; 차량 수익</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: '4px 0 0' }}>차량별 수익 현황</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => handleMonthChange(-1)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>‹</button>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', minWidth: 100, textAlign: 'center' }}>
              {filterDate.replace('-', '년 ')}월
            </span>
            <button onClick={() => handleMonthChange(1)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>›</button>
          </div>
        </div>

        {/* ═══ 상단 통계 ═══ */}
        <div style={{
          display: 'flex', gap: 0, padding: '18px 24px', borderRadius: 14,
          background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          marginBottom: 20, justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>전체 차량</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{cars.length}<span style={{ fontSize: 12, color: '#94a3b8' }}>대</span></div>
            <div style={{ fontSize: 10, color: '#64748b' }}>운영 {totals.activeCars}대</div>
          </div>
          <div style={{ width: 1, height: 40, background: '#475569' }} />
          {statCard('총 매출', totals.revenue, '#34d399')}
          <div style={{ width: 1, height: 40, background: '#475569' }} />
          {statCard('운영비', totals.expense, '#fbbf24')}
          <div style={{ width: 1, height: 40, background: '#475569' }} />
          {statCard('영업이익', totals.operating, '#60a5fa')}
          <div style={{ width: 1, height: 40, background: '#475569' }} />
          {statCard('정산 배분', totals.settlement, '#f87171')}
          <div style={{ width: 1, height: 40, background: '#475569' }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>회사 순이익</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: totals.net >= 0 ? '#34d399' : '#f87171' }}>{fMan(totals.net)}원</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>수익률 {totals.revenue > 0 ? Math.round(totals.net / totals.revenue * 100) : 0}%</div>
          </div>
        </div>

        {/* ═══ 필터 바 ═══ */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 20px', background: '#fff', borderRadius: '14px 14px 0 0',
          border: '1px solid #e5e7eb', borderBottom: 'none',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'all', label: `전체 ${cars.length}` },
              { key: 'active', label: `운영중 ${carPnlList.filter(c => c.revenue > 0).length}` },
              { key: 'idle', label: `미운영 ${carPnlList.filter(c => c.revenue === 0).length}` },
            ].map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', border: statusFilter === f.key ? '1.5px solid #2d5fa8' : '1px solid #e2e8f0',
                  background: statusFilter === f.key ? '#eff6ff' : '#f8fafc',
                  color: statusFilter === f.key ? '#2d5fa8' : '#64748b',
                }}>
                {f.label}
              </button>
            ))}
          </div>
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="검색..."
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, width: 200, outline: 'none' }}
          />
        </div>

        {/* ═══ 테이블 ═══ */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>
          {/* 헤더 */}
          <div style={{
            display: 'flex', alignItems: 'center', padding: '10px 20px',
            background: '#f8fafc', borderBottom: '1px solid #e5e7eb',
            fontSize: 11, fontWeight: 700, color: '#64748b',
          }}>
            <div style={{ width: 150, flexShrink: 0 }}>차량</div>
            <div style={{ width: 100, flexShrink: 0, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('revenue')}>매출{sortIcon('revenue')}</div>
            <div style={{ width: 100, flexShrink: 0, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('expense')}>운영비{sortIcon('expense')}</div>
            <div style={{ width: 110, flexShrink: 0, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('operating')}>영업이익{sortIcon('operating')}</div>
            <div style={{ width: 100, flexShrink: 0, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('settlement')}>정산 배분{sortIcon('settlement')}</div>
            <div style={{ width: 110, flexShrink: 0, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('net')}>회사 순이익{sortIcon('net')}</div>
            <div style={{ width: 65, flexShrink: 0, textAlign: 'center', cursor: 'pointer' }} onClick={() => handleSort('rate')}>수익률{sortIcon('rate')}</div>
            <div style={{ flex: 1, textAlign: 'center' }}>계약</div>
          </div>

          {/* 로딩 */}
          {loading && (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>데이터를 불러오는 중...</div>
          )}

          {/* 데이터 없음 */}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>등록된 차량이 없습니다</div>
          )}

          {/* 행 */}
          {!loading && filtered.map(car => {
            const isExpanded = expandedCar === car.carId
            return (
              <div key={car.carId}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', padding: '12px 20px',
                    borderBottom: '1px solid #f5f5f5', cursor: 'pointer',
                    background: isExpanded ? '#f8faff' : '#fff',
                    transition: 'background 0.1s',
                  }}
                  onClick={() => setExpandedCar(isExpanded ? null : car.carId)}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#fafbff' }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '#fff' }}
                >
                  {/* 차량 */}
                  <div style={{ width: 150, flexShrink: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#111827' }}>{car.number}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{car.brand} {car.model}</div>
                  </div>
                  {/* 매출 */}
                  <div style={{ width: 100, flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: car.revenue > 0 ? '#111827' : '#d0d0d0' }}>
                      {car.revenue > 0 ? f(car.revenue) : '—'}
                    </div>
                  </div>
                  {/* 운영비 */}
                  <div style={{ width: 100, flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: car.expense > 0 ? '#ef4444' : '#d0d0d0' }}>
                      {car.expense > 0 ? f(car.expense) : '—'}
                    </div>
                  </div>
                  {/* 영업이익 */}
                  <div style={{ width: 110, flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: car.operatingProfit > 0 ? '#2563eb' : car.operatingProfit < 0 ? '#ef4444' : '#d0d0d0' }}>
                      {car.revenue > 0 || car.expense > 0 ? f(car.operatingProfit) : '—'}
                    </div>
                  </div>
                  {/* 정산 배분 */}
                  <div style={{ width: 100, flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: car.settlement > 0 ? '#f59e0b' : '#d0d0d0' }}>
                      {car.settlement > 0 ? f(car.settlement) : '—'}
                    </div>
                    {car.settlement > 0 && car.jiipPayout > 0 && car.investPayout > 0 && (
                      <div style={{ fontSize: 9, color: '#b0b0b0' }}>지입 {fMan(car.jiipPayout)} + 투자 {fMan(car.investPayout)}</div>
                    )}
                  </div>
                  {/* 회사 순이익 */}
                  <div style={{ width: 110, flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, fontSize: 14, color: car.netProfit > 0 ? '#16a34a' : car.netProfit < 0 ? '#dc2626' : '#d0d0d0' }}>
                      {car.revenue > 0 || car.expense > 0 ? f(car.netProfit) : '—'}
                    </div>
                  </div>
                  {/* 수익률 */}
                  <div style={{ width: 65, flexShrink: 0, textAlign: 'center' }}>
                    {car.revenue > 0 ? (
                      <span style={{
                        fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 4,
                        background: car.profitRate >= 30 ? '#dcfce7' : car.profitRate >= 10 ? '#fef9c3' : '#fee2e2',
                        color: car.profitRate >= 30 ? '#16a34a' : car.profitRate >= 10 ? '#ca8a04' : '#dc2626',
                      }}>{car.profitRate}%</span>
                    ) : <span style={{ fontSize: 11, color: '#d0d0d0' }}>—</span>}
                  </div>
                  {/* 계약 */}
                  <div style={{ flex: 1, textAlign: 'center', display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {car.jiipContract && (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#eff6ff', color: '#2563eb', fontWeight: 700 }}>
                        지입
                      </span>
                    )}
                    {car.investContracts.length > 0 && (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#fdf4ff', color: '#9333ea', fontWeight: 700 }}>
                        투자 {car.investContracts.length}건
                      </span>
                    )}
                    {!car.jiipContract && car.investContracts.length === 0 && (
                      <span style={{ fontSize: 10, color: '#d0d0d0' }}>—</span>
                    )}
                  </div>
                </div>

                {/* ═══ 확장 상세 ═══ */}
                {isExpanded && (
                  <div style={{ padding: '16px 20px 16px 40px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                      {/* 비용 세부 */}
                      <div style={{ minWidth: 200 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#374151', marginBottom: 8 }}>운영비 상세</div>
                        {[
                          { label: '⛽ 유류비', val: car.fuel },
                          { label: '🛡️ 보험료', val: car.insurance },
                          { label: '🔧 정비/유지', val: car.maintenance },
                          { label: '🏦 대출/리스', val: car.loan },
                          { label: '🅿️ 주차비', val: car.parking },
                          { label: '📋 세금/과태료', val: car.tax },
                          { label: '📦 기타', val: car.otherExpense },
                        ].filter(r => r.val > 0).map(r => (
                          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#374151' }}>
                            <span>{r.label}</span>
                            <span style={{ fontWeight: 700 }}>{f(r.val)}원</span>
                          </div>
                        ))}
                        {car.expense === 0 && <div style={{ fontSize: 12, color: '#b0b0b0' }}>운영비 없음</div>}
                      </div>

                      {/* 정산 세부 */}
                      <div style={{ minWidth: 200 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#374151', marginBottom: 8 }}>정산 배분 상세</div>
                        {car.jiipContract && (
                          <div style={{ fontSize: 12, padding: '3px 0', color: '#374151' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>지입 ({car.jiipContract.investor_name})</span>
                              <span style={{ fontWeight: 700 }}>{f(car.jiipPayout)}원</span>
                            </div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>배분 {car.jiipContract.share_ratio}% · 관리비 {f(car.jiipContract.admin_fee)}원</div>
                          </div>
                        )}
                        {car.investContracts.map((inv: any) => (
                          <div key={inv.id} style={{ fontSize: 12, padding: '3px 0', color: '#374151' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>투자 ({inv.investor_name})</span>
                              <span style={{ fontWeight: 700 }}>{f(Math.round((inv.invest_amount || 0) * (inv.interest_rate || 0) / 100 / 12))}원/월</span>
                            </div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>원금 {fMan(inv.invest_amount)} · {inv.interest_rate}%</div>
                          </div>
                        ))}
                        {!car.jiipContract && car.investContracts.length === 0 && (
                          <div style={{ fontSize: 12, color: '#b0b0b0' }}>정산 계약 없음</div>
                        )}
                      </div>

                      {/* 수익 구조 */}
                      <div style={{ minWidth: 180 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#374151', marginBottom: 8 }}>수익 구조</div>
                        <div style={{ fontSize: 12, color: '#374151' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                            <span>매출</span><span style={{ fontWeight: 700, color: '#16a34a' }}>+{f(car.revenue)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                            <span>운영비</span><span style={{ fontWeight: 700, color: '#ef4444' }}>-{f(car.expense)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: '1px solid #e2e8f0', marginTop: 4, paddingTop: 6 }}>
                            <span style={{ fontWeight: 700 }}>영업이익</span><span style={{ fontWeight: 800, color: '#2563eb' }}>{f(car.operatingProfit)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                            <span>정산 배분</span><span style={{ fontWeight: 700, color: '#f59e0b' }}>-{f(car.settlement)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: '1px dashed #cbd5e1', marginTop: 4, paddingTop: 6 }}>
                            <span style={{ fontWeight: 800 }}>회사 순이익</span>
                            <span style={{ fontWeight: 900, fontSize: 14, color: car.netProfit >= 0 ? '#16a34a' : '#dc2626' }}>{f(car.netProfit)}원</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/cars/${car.carId}`) }}
                        style={{
                          padding: '6px 16px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: '#2d5fa8', color: '#fff', border: 'none', cursor: 'pointer',
                        }}
                      >
                        차량 상세 보기 →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* ═══ 하단 합계 ═══ */}
          {!loading && filtered.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', padding: '12px 20px',
              background: '#f1f5f9', borderTop: '2px solid #e2e8f0',
              fontSize: 12, fontWeight: 800, color: '#374151',
            }}>
              <div style={{ width: 150, flexShrink: 0 }}>합계 {filtered.length}대</div>
              <div style={{ width: 100, flexShrink: 0, textAlign: 'right' }}>{f(totals.revenue)}</div>
              <div style={{ width: 100, flexShrink: 0, textAlign: 'right', color: '#ef4444' }}>{f(totals.expense)}</div>
              <div style={{ width: 110, flexShrink: 0, textAlign: 'right', color: '#2563eb' }}>{f(totals.operating)}</div>
              <div style={{ width: 100, flexShrink: 0, textAlign: 'right', color: '#f59e0b' }}>{f(totals.settlement)}</div>
              <div style={{ width: 110, flexShrink: 0, textAlign: 'right', color: totals.net >= 0 ? '#16a34a' : '#dc2626' }}>{f(totals.net)}</div>
              <div style={{ width: 65, flexShrink: 0, textAlign: 'center' }}>
                {totals.revenue > 0 ? `${Math.round(totals.net / totals.revenue * 100)}%` : '—'}
              </div>
              <div style={{ flex: 1 }} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
