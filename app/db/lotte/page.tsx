'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useApp } from '../../context/AppContext'

// ============================================
// 벤치마크 비교 — 경쟁사 렌트가 vs 우리 원가 비교 분석
// 시장 포지셔닝 · 가격 갭 분석 · 경쟁력 대시보드
// ============================================

const f = (n: number) => n?.toLocaleString('ko-KR') || '0'
const pct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'

// 경쟁사 목록
const COMPETITORS = ['롯데렌터카', 'SK렌터카', '쏘카', 'AJ렌터카', '기타']
const TERM_OPTIONS = [12, 24, 36, 48, 60]

// 차량 카테고리 자동 매핑
function mapCategory(brand: string): string {
  const imports = ['BMW', 'Mercedes', 'Benz', '벤츠', 'Audi', '아우디', 'Volvo', '볼보', 'Lexus', '렉서스', 'Tesla', '테슬라', 'Porsche', '포르쉐', 'Land Rover', '랜드로버', 'Mini', '미니']
  const evKeywords = ['전기', 'EV', 'ev', '아이오닉', 'IONIQ', 'EV6', 'EV9', '테슬라', 'Tesla', 'Model']
  const b = brand || ''
  if (evKeywords.some(k => b.includes(k))) return '전기차'
  if (imports.some(k => b.toLowerCase().includes(k.toLowerCase()))) return '수입차'
  return '국산차'
}

// 감가 카테고리 매핑 (pricing-standards 기준)
function mapDepCategory(brand: string, model: string): string {
  const m = (model || '').toLowerCase()
  const b = (brand || '').toLowerCase()
  const imports = ['bmw', 'benz', '벤츠', 'mercedes', 'audi', '아우디', 'volvo', '볼보', 'lexus', '렉서스', 'porsche', '포르쉐', 'land rover', '랜드로버']
  const evKw = ['ev', '전기', '아이오닉', 'ioniq', '테슬라', 'tesla', 'model']
  if (evKw.some(k => m.includes(k) || b.includes(k))) return '전기차 국산'
  if (imports.some(k => b.includes(k))) {
    if (['suv', 'x3', 'x5', 'gle', 'glc', 'q5', 'q7', 'xc60', 'xc90', 'cayenne', 'rx', 'nx'].some(k => m.includes(k))) return '수입 중형 SUV'
    return '수입 중형 세단'
  }
  if (['모닝', '스파크', '레이', '캐스퍼'].some(k => m.includes(k))) return '국산 경차'
  if (['아반떼', 'k3', 'k5', '소나타', '쏘나타'].some(k => m.includes(k))) return '국산 준중형 세단'
  if (['그랜저', 'k8', 'g80', 'g90'].some(k => m.includes(k))) return '국산 대형 세단'
  if (['투싼', '스포티지', '셀토스', '코나', 'xm3'].some(k => m.includes(k))) return '국산 중형 SUV'
  if (['팰리세이드', '쏘렌토', '모하비', 'gv80'].some(k => m.includes(k))) return '국산 대형 SUV'
  if (['카니발', '스타리아'].some(k => m.includes(k))) return '국산 MPV/미니밴'
  return '국산 중형 세단'
}

export default function BenchmarkPage() {
  const supabase = createClientComponentClient()
  const { role, company } = useApp()
  const isAdmin = role === 'god_admin' || role === 'master'

  // 데이터 상태
  const [benchmarks, setBenchmarks] = useState<any[]>([])
  const [depRates, setDepRates] = useState<any[]>([])
  const [insuranceRates, setInsuranceRates] = useState<any[]>([])
  const [maintCosts, setMaintCosts] = useState<any[]>([])
  const [taxRates, setTaxRates] = useState<any[]>([])
  const [financeRates, setFinanceRates] = useState<any[]>([])
  const [regCosts, setRegCosts] = useState<any[]>([])
  const [businessRules, setBusinessRules] = useState<any[]>([])

  // UI 상태
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCompetitor, setFilterCompetitor] = useState('all')
  const [filterTerm, setFilterTerm] = useState(0) // 0 = 전체
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  // 등록 폼
  const [formData, setFormData] = useState({
    competitor: '롯데렌터카', brand: '', model: '', trim: '',
    new_car_price: '', term: 48, deposit_rate: 0,
    monthly_price: '', source_url: '', memo: '',
  })

  // ─── 데이터 로드 ───
  const loadAll = useCallback(async () => {
    setLoading(true)
    const [b, d, ins, mnt, tx, fin, reg, br] = await Promise.all([
      supabase.from('lotte_rentcar_db').select('*').order('created_at', { ascending: false }),
      supabase.from('depreciation_db').select('*'),
      supabase.from('insurance_rate_table').select('*'),
      supabase.from('maintenance_cost_table').select('*'),
      supabase.from('vehicle_tax_table').select('*'),
      supabase.from('finance_rate_table').select('*'),
      supabase.from('registration_cost_table').select('*'),
      supabase.from('business_rules').select('*'),
    ])
    setBenchmarks(b.data || [])
    setDepRates(d.data || [])
    setInsuranceRates(ins.data || [])
    setMaintCosts(mnt.data || [])
    setTaxRates(tx.data || [])
    setFinanceRates(fin.data || [])
    setRegCosts(reg.data || [])
    setBusinessRules(br.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ─── 우리 원가 산출 엔진 ───
  const getRule = (key: string, def: number) => {
    const r = businessRules.find((b: any) => b.rule_key === key)
    return r ? Number(r.rule_value) : def
  }

  const calcOurCost = useCallback((brand: string, model: string, newPrice: number, termMonths: number) => {
    if (!newPrice || !termMonths || depRates.length === 0) return null

    // 1. 감가비
    const depCat = mapDepCategory(brand, model)
    const depRow = depRates.find((d: any) => d.category === depCat) || depRates[0]
    const years = Math.ceil(termMonths / 12)
    const rateKey = `rate_${years}yr`
    const residualPct = (depRow?.[rateKey] || 50) / 100
    const residualValue = newPrice * residualPct * 0.8
    const monthlyDep = Math.round((newPrice - residualValue) / termMonths)

    // 2. 취득 원가 (등록비 포함)
    const acqTaxRate = 0.07
    const regExtra = 500000 // 공채+탁송+번호판 등 간편 추정
    const totalAcq = newPrice * (1 + acqTaxRate) + regExtra
    const monthlyAcqDep = Math.round((totalAcq - residualValue) / termMonths)

    // 3. 금융비용
    const ltvRate = getRule('LOAN_LTV_DEFAULT', 70) / 100
    const loanAmt = newPrice * ltvRate
    const equityAmt = newPrice - loanAmt
    const finRow = financeRates.find((f: any) => f.finance_type === '캐피탈대출' && termMonths >= (f.term_months_min || 0) && termMonths <= (f.term_months_max || 999))
    const annualRate = finRow ? Number(finRow.annual_rate) : 4.8
    const investRate = getRule('INVESTMENT_RETURN_RATE', 5)
    const monthlyFinance = Math.round(loanAmt * (annualRate / 100) / 12 + equityAmt * (investRate / 100) / 12)

    // 4. 보험
    const vehCat = mapCategory(brand)
    const insType = vehCat === '수입차' ? '수입 승용' : vehCat === '전기차' ? '전기차' : '국산 승용'
    const insRow = insuranceRates.find((i: any) => i.vehicle_type === insType && newPrice >= (i.value_min || 0) && newPrice <= (i.value_max || 999999999))
    const monthlyIns = insRow ? Math.round(Number(insRow.annual_premium) / 12) : Math.round(newPrice * 0.06 / 12)

    // 5. 정비비
    const maintType = vehCat === '수입차' ? '수입차' : vehCat === '전기차' ? '전기차' : '국산 중형'
    const maintRow = maintCosts.find((m: any) => m.vehicle_type === maintType && (m.age_min || 0) <= 1 && (m.age_max || 99) >= 1)
    const monthlyMaint = maintRow ? Number(maintRow.monthly_cost) : 50000

    // 6. 세금
    const monthlyTax = vehCat === '전기차' ? Math.round(20000 / 12) : Math.round(19 * 2000 * 1.3 / 12) // 2000cc 기준

    // 7. 리스크 적립
    const riskRate = getRule('RISK_RESERVE_RATE', 0.5)
    const monthlyRisk = Math.round(newPrice * (riskRate / 100) / 12)

    const totalBEP = monthlyAcqDep + monthlyFinance + monthlyIns + monthlyMaint + monthlyTax + monthlyRisk

    return {
      monthlyDep, monthlyAcqDep, monthlyFinance, monthlyIns, monthlyMaint, monthlyTax, monthlyRisk,
      totalBEP, residualPct: Math.round(residualPct * 100), depCategory: depCat,
      annualRate, ltvRate: Math.round(ltvRate * 100),
    }
  }, [depRates, insuranceRates, maintCosts, financeRates, businessRules])

  // ─── 필터 + 분석 데이터 ───
  const enrichedList = useMemo(() => {
    return benchmarks.map(item => {
      const meta = (() => { try { return JSON.parse(item.memo || '{}') } catch { return {} } })()
      const competitor = meta.competitor || '롯데렌터카'
      const newPrice = meta.new_car_price || item.new_car_price || 0
      const ourCost = newPrice > 0 ? calcOurCost(item.brand, item.model, newPrice, item.term || 48) : null
      const gap = ourCost && item.monthly_price > 0
        ? ((item.monthly_price - ourCost.totalBEP) / ourCost.totalBEP * 100)
        : null

      return { ...item, competitor, newPrice, ourCost, gap, meta }
    })
  }, [benchmarks, calcOurCost])

  const filteredList = useMemo(() => {
    return enrichedList.filter(item => {
      const matchSearch = !searchTerm ||
        item.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.model?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchComp = filterCompetitor === 'all' || item.competitor === filterCompetitor
      const matchTerm = filterTerm === 0 || item.term === filterTerm
      return matchSearch && matchComp && matchTerm
    })
  }, [enrichedList, searchTerm, filterCompetitor, filterTerm])

  // ─── 전체 통계 ───
  const stats = useMemo(() => {
    const withGap = enrichedList.filter(i => i.gap !== null)
    const avgGap = withGap.length > 0 ? withGap.reduce((s, i) => s + i.gap, 0) / withGap.length : 0
    const cheaper = withGap.filter(i => i.gap > 0).length // 경쟁사가 우리보다 비싼 건
    const moreExpensive = withGap.filter(i => i.gap < 0).length // 경쟁사가 우리보다 싼 건
    const competitorCounts = COMPETITORS.reduce((acc, c) => {
      acc[c] = enrichedList.filter(i => i.competitor === c).length
      return acc
    }, {} as Record<string, number>)

    return {
      total: enrichedList.length,
      analyzed: withGap.length,
      avgGap,
      advantageCount: cheaper, // 우리 가격 우위
      disadvantageCount: moreExpensive, // 경쟁 열위
      competitorCounts,
      avgCompetitorPrice: enrichedList.length > 0
        ? Math.round(enrichedList.reduce((s, i) => s + (i.monthly_price || 0), 0) / enrichedList.length)
        : 0,
    }
  }, [enrichedList])

  // ─── 경쟁사 견적 등록 ───
  const handleAdd = async () => {
    if (!formData.brand || !formData.model || !formData.monthly_price) {
      alert('브랜드, 모델, 월 렌트료를 입력해주세요.')
      return
    }
    const meta = JSON.stringify({
      competitor: formData.competitor,
      new_car_price: Number(formData.new_car_price) || 0,
      source_url: formData.source_url,
      collected_at: new Date().toISOString(),
      note: formData.memo,
    })
    await supabase.from('lotte_rentcar_db').insert([{
      brand: formData.brand,
      model: formData.model,
      trim: formData.trim,
      term: formData.term,
      deposit_rate: formData.deposit_rate,
      monthly_price: Number(formData.monthly_price),
      memo: meta,
    }])
    setShowAddModal(false)
    setFormData({ competitor: '롯데렌터카', brand: '', model: '', trim: '', new_car_price: '', term: 48, deposit_rate: 0, monthly_price: '', source_url: '', memo: '' })
    loadAll()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('이 견적을 삭제하시겠습니까?')) return
    await supabase.from('lotte_rentcar_db').delete().eq('id', id)
    if (selectedItem?.id === id) setSelectedItem(null)
    loadAll()
  }

  // ─── 갭 색상 ───
  const gapColor = (gap: number | null) => {
    if (gap === null) return 'text-gray-400'
    if (gap > 5) return 'text-emerald-600' // 경쟁사 대비 우리가 저렴 (우위)
    if (gap > 0) return 'text-emerald-500'
    if (gap > -5) return 'text-amber-600'
    return 'text-red-600' // 경쟁사 대비 우리가 비쌈 (열위)
  }

  const gapBg = (gap: number | null) => {
    if (gap === null) return 'bg-gray-50'
    if (gap > 5) return 'bg-emerald-50 border-emerald-200'
    if (gap > 0) return 'bg-emerald-50/50 border-emerald-100'
    if (gap > -5) return 'bg-amber-50 border-amber-200'
    return 'bg-red-50 border-red-200'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">벤치마크 데이터 로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── 헤더 ─── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-black text-gray-900">벤치마크 비교</h1>
              <p className="text-xs text-gray-500 mt-1">
                경쟁사 렌트 견적 vs 우리 원가 비교 분석 · 시장 포지셔닝 · 가격 경쟁력 진단
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition-colors"
              >
                + 경쟁사 견적 등록
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── 경쟁력 요약 대시보드 ─── */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-2xl font-black">{stats.total}</p>
              <p className="text-[10px] text-slate-300 mt-0.5">수집 견적</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className={`text-2xl font-black ${stats.avgGap >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.analyzed > 0 ? pct(stats.avgGap) : '-'}
              </p>
              <p className="text-[10px] text-slate-300 mt-0.5">평균 가격 갭</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-emerald-400">{stats.advantageCount}</p>
              <p className="text-[10px] text-slate-300 mt-0.5">가격 우위</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-red-400">{stats.disadvantageCount}</p>
              <p className="text-[10px] text-slate-300 mt-0.5">가격 열위</p>
            </div>
          </div>

          {/* 경쟁사별 분포 */}
          <div className="mt-3 flex flex-wrap gap-2">
            {COMPETITORS.map(c => {
              const cnt = stats.competitorCounts[c] || 0
              if (cnt === 0) return null
              return (
                <span key={c} className="px-2 py-1 bg-white/5 rounded-lg text-[10px] text-slate-300">
                  {c} <span className="font-bold text-white ml-1">{cnt}건</span>
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* ═══ 왼쪽: 벤치마크 목록 ═══ */}
          <div className="lg:col-span-8">
            {/* 필터 바 */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input
                type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                placeholder="브랜드 · 모델명 검색..."
                className="flex-1 min-w-[140px] px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:ring-1 focus:ring-gray-300"
              />
              <select
                value={filterCompetitor} onChange={e => setFilterCompetitor(e.target.value)}
                className="px-2 py-2 text-xs border border-gray-200 rounded-lg bg-white"
              >
                <option value="all">전체 경쟁사</option>
                {COMPETITORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={filterTerm} onChange={e => setFilterTerm(Number(e.target.value))}
                className="px-2 py-2 text-xs border border-gray-200 rounded-lg bg-white"
              >
                <option value={0}>전체 기간</option>
                {TERM_OPTIONS.map(t => <option key={t} value={t}>{t}개월</option>)}
              </select>
            </div>

            {/* 견적 카드 리스트 */}
            <div className="space-y-2">
              {filteredList.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <p className="text-3xl mb-2">📊</p>
                  <p className="text-sm font-bold text-gray-400">등록된 경쟁사 견적이 없습니다</p>
                  <p className="text-xs text-gray-300 mt-1">우측 상단 '경쟁사 견적 등록'으로 데이터를 수집해주세요</p>
                </div>
              )}

              {filteredList.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
                    selectedItem?.id === item.id ? 'ring-2 ring-gray-900 border-gray-900' : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    {/* 좌: 차종 + 경쟁사 */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-lg">
                          {item.competitor}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{item.brand} {item.model}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.trim && <span className="text-[10px] text-gray-400 truncate">{item.trim}</span>}
                          <span className="text-[10px] text-gray-300">|</span>
                          <span className="text-[10px] font-bold text-gray-500">{item.term}개월</span>
                          {item.newPrice > 0 && (
                            <>
                              <span className="text-[10px] text-gray-300">|</span>
                              <span className="text-[10px] text-gray-400">신차 {f(item.newPrice)}원</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 중: 경쟁사 가격 */}
                    <div className="text-right flex-shrink-0 mx-4">
                      <p className="text-xs text-gray-400">경쟁사</p>
                      <p className="text-base font-black text-gray-900">{f(item.monthly_price)}<span className="text-[10px] text-gray-400">원/월</span></p>
                    </div>

                    {/* 우: 가격 갭 */}
                    <div className={`flex-shrink-0 w-24 text-center px-2 py-2 rounded-lg border ${gapBg(item.gap)}`}>
                      {item.gap !== null ? (
                        <>
                          <p className={`text-sm font-black ${gapColor(item.gap)}`}>{pct(item.gap)}</p>
                          <p className="text-[9px] text-gray-400 mt-0.5">
                            {item.gap > 0 ? '우리 우위' : '경쟁 열위'}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-gray-300 font-bold">-</p>
                          <p className="text-[9px] text-gray-300">신차가 필요</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ 오른쪽: 상세 분석 패널 ═══ */}
          <div className="lg:col-span-4 space-y-4">

            {/* 선택된 항목 원가 분석 */}
            {selectedItem ? (
              <>
                <div className="bg-slate-900 rounded-2xl p-5 text-white sticky top-24">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[10px] text-slate-400">원가 비교 분석</p>
                      <p className="text-sm font-black mt-0.5">{selectedItem.brand} {selectedItem.model}</p>
                      <p className="text-[10px] text-slate-500">{selectedItem.competitor} · {selectedItem.term}개월</p>
                    </div>
                    <button onClick={() => setSelectedItem(null)} className="text-slate-500 hover:text-white text-xs">✕</button>
                  </div>

                  {/* 가격 비교 바 */}
                  <div className="space-y-3 mb-4">
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-slate-400">경쟁사 월렌트료</span>
                        <span className="font-bold text-white">{f(selectedItem.monthly_price)}원</span>
                      </div>
                      <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{
                          width: selectedItem.ourCost
                            ? `${Math.min(100, selectedItem.monthly_price / Math.max(selectedItem.monthly_price, selectedItem.ourCost.totalBEP) * 100)}%`
                            : '100%'
                        }} />
                      </div>
                    </div>
                    {selectedItem.ourCost && (
                      <div>
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-slate-400">우리 원가 (BEP)</span>
                          <span className="font-bold text-amber-400">{f(selectedItem.ourCost.totalBEP)}원</span>
                        </div>
                        <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{
                            width: `${Math.min(100, selectedItem.ourCost.totalBEP / Math.max(selectedItem.monthly_price, selectedItem.ourCost.totalBEP) * 100)}%`
                          }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 갭 결과 */}
                  {selectedItem.gap !== null && (
                    <div className={`rounded-xl p-3 text-center ${selectedItem.gap >= 0 ? 'bg-emerald-900/30' : 'bg-red-900/30'}`}>
                      <p className={`text-xl font-black ${selectedItem.gap >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pct(selectedItem.gap)}
                      </p>
                      <p className="text-[10px] text-slate-300 mt-0.5">
                        {selectedItem.gap >= 0
                          ? `경쟁사가 ${f(selectedItem.monthly_price - selectedItem.ourCost!.totalBEP)}원 더 비쌈 → 마진 확보 가능`
                          : `우리가 ${f(selectedItem.ourCost!.totalBEP - selectedItem.monthly_price)}원 더 비쌈 → 원가 절감 필요`
                        }
                      </p>
                    </div>
                  )}
                </div>

                {/* 원가 구성 상세 */}
                {selectedItem.ourCost && (
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-50 bg-gray-50">
                      <h4 className="text-xs font-bold text-gray-700">우리 원가 구성 (월 기준)</h4>
                      <p className="text-[10px] text-gray-400">{selectedItem.ourCost.depCategory} · 잔가율 {selectedItem.ourCost.residualPct}%</p>
                    </div>
                    <div className="p-4 space-y-2">
                      {[
                        { label: '감가상각비', value: selectedItem.ourCost.monthlyAcqDep, desc: '취득원가 기준', pct: selectedItem.ourCost.monthlyAcqDep / selectedItem.ourCost.totalBEP * 100 },
                        { label: '금융비용', value: selectedItem.ourCost.monthlyFinance, desc: `LTV ${selectedItem.ourCost.ltvRate}% · ${selectedItem.ourCost.annualRate}%`, pct: selectedItem.ourCost.monthlyFinance / selectedItem.ourCost.totalBEP * 100 },
                        { label: '보험료', value: selectedItem.ourCost.monthlyIns, desc: '영업용 자동차보험', pct: selectedItem.ourCost.monthlyIns / selectedItem.ourCost.totalBEP * 100 },
                        { label: '정비비', value: selectedItem.ourCost.monthlyMaint, desc: '소모품+예비비', pct: selectedItem.ourCost.monthlyMaint / selectedItem.ourCost.totalBEP * 100 },
                        { label: '자동차세', value: selectedItem.ourCost.monthlyTax, desc: '영업용 세율', pct: selectedItem.ourCost.monthlyTax / selectedItem.ourCost.totalBEP * 100 },
                        { label: '리스크적립', value: selectedItem.ourCost.monthlyRisk, desc: '사고/면책 준비금', pct: selectedItem.ourCost.monthlyRisk / selectedItem.ourCost.totalBEP * 100 },
                      ].map((row, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="w-16 text-right">
                            <p className="text-[10px] font-bold text-gray-700">{row.label}</p>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-slate-600 rounded-full" style={{ width: `${Math.min(100, row.pct)}%` }} />
                              </div>
                              <span className="text-[10px] font-bold text-gray-800 w-14 text-right">{f(row.value)}</span>
                            </div>
                            <p className="text-[9px] text-gray-400 mt-0.5">{row.desc}</p>
                          </div>
                        </div>
                      ))}

                      <div className="pt-2 mt-2 border-t border-gray-100 flex justify-between">
                        <span className="text-xs font-bold text-gray-900">월 BEP 합계</span>
                        <span className="text-xs font-black text-red-600">{f(selectedItem.ourCost.totalBEP)}원</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 삭제 */}
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(selectedItem.id)}
                    className="w-full py-2 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    이 견적 삭제
                  </button>
                )}
              </>
            ) : (
              /* 기본 안내 */
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h4 className="text-xs font-bold text-gray-900 mb-3">사용 가이드</h4>
                <div className="space-y-3 text-[11px] text-gray-600">
                  <div className="flex gap-2">
                    <span className="text-base flex-shrink-0">1️⃣</span>
                    <div>
                      <p className="font-bold text-gray-800">경쟁사 견적 수집</p>
                      <p className="text-gray-500 mt-0.5">롯데/SK/쏘카 등 경쟁사 홈페이지에서 동일 차종의 렌트 견적을 수집합니다.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-base flex-shrink-0">2️⃣</span>
                    <div>
                      <p className="font-bold text-gray-800">신차가 입력 → 자동 원가 산출</p>
                      <p className="text-gray-500 mt-0.5">신차가를 입력하면 감가·보험·정비·금융·세금·리스크 6대 원가를 자동 산출합니다.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-base flex-shrink-0">3️⃣</span>
                    <div>
                      <p className="font-bold text-gray-800">가격 갭 분석</p>
                      <p className="text-gray-500 mt-0.5">경쟁사 렌트료 vs 우리 원가를 비교하여 마진 확보 가능 여부와 경쟁력을 진단합니다.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-base flex-shrink-0">💡</span>
                    <div>
                      <p className="font-bold text-gray-800">포지셔닝 전략</p>
                      <p className="text-gray-500 mt-0.5">갭이 +면 가격 경쟁력 있음, -면 원가 절감이나 서비스 차별화가 필요합니다.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 관련 페이지 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h4 className="text-xs font-bold text-gray-900 mb-2">연동 페이지</h4>
              <div className="space-y-1.5">
                <a href="/quotes/pricing" className="block px-3 py-2 bg-gray-50 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
                  렌트가 산출기 →
                </a>
                <a href="/db/pricing-standards" className="block px-3 py-2 bg-gray-50 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
                  산출 기준 관리 (7대 테이블) →
                </a>
                <a href="/db/models" className="block px-3 py-2 bg-gray-50 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
                  차량 시세 DB →
                </a>
                <a href="/db/maintenance" className="block px-3 py-2 bg-gray-50 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
                  정비/부품 DB →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 경쟁사 견적 등록 모달 ═══ */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 text-white px-5 py-4 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold">경쟁사 견적 등록</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">경쟁사 홈페이지에서 확인한 견적을 등록합니다</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white text-lg">×</button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* 경쟁사 선택 */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1.5">경쟁사</label>
                <div className="flex flex-wrap gap-1.5">
                  {COMPETITORS.map(c => (
                    <button key={c}
                      onClick={() => setFormData({...formData, competitor: c})}
                      className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-colors ${
                        formData.competitor === c ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >{c}</button>
                  ))}
                </div>
              </div>

              {/* 차량 정보 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">브랜드 *</label>
                  <input className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg" placeholder="현대"
                    value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">모델명 *</label>
                  <input className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg" placeholder="그랜저"
                    value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">트림/등급</label>
                <input className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg" placeholder="캘리그래피 2.5T"
                  value={formData.trim} onChange={e => setFormData({...formData, trim: e.target.value})} />
              </div>

              {/* 가격 정보 */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">신차가격 (원가 비교용)</label>
                  <input type="number" className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg" placeholder="45000000"
                    value={formData.new_car_price} onChange={e => setFormData({...formData, new_car_price: e.target.value})} />
                  <p className="text-[9px] text-gray-400 mt-1">* 입력 시 우리 원가(BEP)가 자동 산출되어 비교 분석됩니다</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">계약기간</label>
                    <select className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white"
                      value={formData.term} onChange={e => setFormData({...formData, term: Number(e.target.value)})}>
                      {TERM_OPTIONS.map(t => <option key={t} value={t}>{t}개월</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">보증금률 (%)</label>
                    <input type="number" className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg" placeholder="0"
                      value={formData.deposit_rate} onChange={e => setFormData({...formData, deposit_rate: Number(e.target.value)})} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-red-500 block mb-1">경쟁사 월 렌트료 (원) *</label>
                  <input type="number" className="w-full px-3 py-2 text-xs border border-red-200 rounded-lg bg-red-50 font-bold" placeholder="850000"
                    value={formData.monthly_price} onChange={e => setFormData({...formData, monthly_price: e.target.value})} />
                </div>
              </div>

              {/* 출처/메모 */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">출처 URL</label>
                <input className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg" placeholder="https://www.lotterentacar.net/..."
                  value={formData.source_url} onChange={e => setFormData({...formData, source_url: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">메모</label>
                <input className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg" placeholder="정비포함, 보험 완전자차 등"
                  value={formData.memo} onChange={e => setFormData({...formData, memo: e.target.value})} />
              </div>

              <button
                onClick={handleAdd}
                className="w-full py-3 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors"
              >
                등록하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
