'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

// ============================================================================
// AUTH HELPER
// ============================================================================
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
// 벤치마크 비교 — 경쟁사 렌트가 vs 우리 원가 비교 분석
// AI 경쟁사 자동 조회 · 상세 조건 비교 · 가격 갭 분석
// ============================================

const f = (n: number) => n?.toLocaleString('ko-KR') || '0'
const pct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'

const COMPETITORS = ['롯데렌터카', 'SK렌터카', '쏘카', 'AJ렌터카', '기타']
const TERM_OPTIONS = [12, 24, 36, 48, 60]

// 감가 카테고리 매핑
function mapDepCategory(brand: string, model: string): string {
  const m = (model || '').toLowerCase()
  const b = (brand || '').toLowerCase()
  const imports = ['bmw', 'benz', '벤츠', 'mercedes', 'audi', '아우디', 'volvo', '볼보', 'lexus', '렉서스', 'porsche', '포르쉐', 'land rover', '랜드로버']
  const evKw = ['ev', '전기', '아이오닉', 'ioniq', '테슬라', 'tesla', 'model']
  if (evKw.some(k => m.includes(k) || b.includes(k))) return '전기차 국산'
  if (imports.some(k => b.includes(k))) return ['suv', 'x3', 'x5', 'gle', 'glc', 'q5', 'q7', 'xc60', 'xc90'].some(k => m.includes(k)) ? '수입 중형 SUV' : '수입 중형 세단'
  if (['모닝', '스파크', '레이', '캐스퍼'].some(k => m.includes(k))) return '국산 경차'
  if (['그랜저', 'k8', 'g80', 'g90'].some(k => m.includes(k))) return '국산 대형 세단'
  if (['팰리세이드', '쏘렌토', '모하비', 'gv80'].some(k => m.includes(k))) return '국산 대형 SUV'
  if (['투싼', '스포티지', '셀토스', '코나'].some(k => m.includes(k))) return '국산 중형 SUV'
  if (['카니발', '스타리아'].some(k => m.includes(k))) return '국산 MPV/미니밴'
  return '국산 중형 세단'
}

function mapInsType(brand: string): string {
  const b = (brand || '').toLowerCase()
  const imports = ['bmw', 'benz', '벤츠', 'mercedes', 'audi', '아우디', 'volvo', '볼보', 'lexus', '렉서스', 'porsche', '포르쉐', 'land rover', '랜드로버']
  const ev = ['전기', 'ev', '테슬라', 'tesla']
  if (ev.some(k => b.includes(k))) return '전기차'
  if (imports.some(k => b.includes(k))) return '수입 승용'
  return '국산 승용'
}

export default function BenchmarkPage() {
  const { role } = useApp()
  const isAdmin = role === 'admin'

  // 데이터
  const [benchmarks, setBenchmarks] = useState<any[]>([])
  const [depRates, setDepRates] = useState<any[]>([])
  const [insuranceRates, setInsuranceRates] = useState<any[]>([])
  const [maintCosts, setMaintCosts] = useState<any[]>([])
  const [financeRates, setFinanceRates] = useState<any[]>([])
  const [businessRules, setBusinessRules] = useState<any[]>([])

  // UI
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCompetitor, setFilterCompetitor] = useState('all')
  const [filterTerm, setFilterTerm] = useState(0)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [detailTab, setDetailTab] = useState<'compare' | 'cost'>('compare')

  // AI 조회 모달
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<any>(null)
  const [aiForm, setAiForm] = useState({ competitor: '롯데렌터카', brand: '', model: '', term: 48 })

  // 수동 등록 모달
  const [showAddModal, setShowAddModal] = useState(false)
  const [formData, setFormData] = useState({
    competitor: '롯데렌터카', brand: '', model: '', trim: '',
    new_car_price: '', term: 48, deposit_rate: 0, monthly_price: '',
    insurance_summary: '', maintenance_summary: '', mileage_limit: '2만km/년',
    return_conditions: '', buyout_available: true, buyout_residual_rate: '',
    early_termination: '', source_url: '', memo: '',
  })

  // ─── 데이터 로드 ───
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const [bRes, dRes, insRes, mntRes, finRes, brRes] = await Promise.all([
        fetch('/api/lotte-rates', { headers }),
        fetch('/api/pricing-standards?table=depreciation_db', { headers }),
        fetch('/api/pricing-standards?table=insurance_rate_table', { headers }),
        fetch('/api/pricing-standards?table=maintenance_cost_table', { headers }),
        fetch('/api/pricing-standards?table=finance_rate_table', { headers }),
        fetch('/api/business-rules', { headers }),
      ])
      const [b, d, ins, mnt, fin, br] = await Promise.all([
        bRes.json(), dRes.json(), insRes.json(), mntRes.json(), finRes.json(), brRes.json()
      ])
      setBenchmarks(b.data || [])
      setDepRates(d.data || [])
      setInsuranceRates(ins.data || [])
      setMaintCosts(mnt.data || [])
      setFinanceRates(fin.data || [])
      setBusinessRules(br.data || [])
    } catch (e) {
      console.error('데이터 로드 실패:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ─── 원가 산출 엔진 ───
  const getRule = (key: string, def: number) => {
    const r = businessRules.find((b: any) => b.rule_key === key)
    return r ? Number(r.rule_value) : def
  }

  const calcOurCost = useCallback((brand: string, model: string, newPrice: number, termMonths: number) => {
    if (!newPrice || !termMonths || depRates.length === 0) return null
    const depCat = mapDepCategory(brand, model)
    const depRow = depRates.find((d: any) => d.category === depCat) || depRates[0]
    const years = Math.min(5, Math.ceil(termMonths / 12))
    const residualPct = (depRow?.[`rate_${years}yr`] || 50) / 100
    const residualValue = newPrice * residualPct * 0.8
    const totalAcq = newPrice * 1.07 + 500000
    const monthlyAcqDep = Math.round((totalAcq - residualValue) / termMonths)

    const ltvRate = getRule('LOAN_LTV_DEFAULT', 70) / 100
    const loanAmt = newPrice * ltvRate
    const finRow = financeRates.find((f: any) => f.finance_type === '캐피탈대출' && termMonths >= (f.term_months_min || 0) && termMonths <= (f.term_months_max || 999))
    const annualRate = finRow ? Number(finRow.annual_rate) : 4.8
    const monthlyFinance = Math.round(loanAmt * (annualRate / 100) / 12 + (newPrice - loanAmt) * (getRule('INVESTMENT_RETURN_RATE', 5) / 100) / 12)

    const insType = mapInsType(brand)
    const insRow = insuranceRates.find((i: any) => i.vehicle_type === insType && newPrice >= (i.value_min || 0) && newPrice <= (i.value_max || 999999999))
    const monthlyIns = insRow ? Math.round(Number(insRow.annual_premium) / 12) : Math.round(newPrice * 0.06 / 12)

    const isImport = insType === '수입 승용'
    const isEv = insType === '전기차'
    const maintType = isImport ? '수입차' : isEv ? '전기차' : '국산 중형'
    const maintRow = maintCosts.find((m: any) => m.vehicle_type === maintType && (m.age_min || 0) <= 1)
    const monthlyMaint = maintRow ? Number(maintRow.monthly_cost) : 50000

    const monthlyTax = isEv ? Math.round(20000 / 12) : Math.round(19 * 2000 * 1.3 / 12)
    const monthlyRisk = Math.round(newPrice * (getRule('RISK_RESERVE_RATE', 0.5) / 100) / 12)

    const totalBEP = monthlyAcqDep + monthlyFinance + monthlyIns + monthlyMaint + monthlyTax + monthlyRisk
    const buyoutPrice = Math.round(newPrice * residualPct)

    return {
      monthlyAcqDep, monthlyFinance, monthlyIns, monthlyMaint, monthlyTax, monthlyRisk,
      totalBEP, residualPct: Math.round(residualPct * 100), depCategory: depCat,
      annualRate, ltvRate: Math.round(ltvRate * 100), buyoutPrice,
      insDetail: insRow ? `대인II무한/대물2억/자손1억/자차` : '추정치',
      maintDetail: maintRow ? (maintRow.includes || '소모품+예비비') : '추정치',
    }
  }, [depRates, insuranceRates, maintCosts, financeRates, businessRules])

  // ─── 데이터 가공 ───
  const enrichedList = useMemo(() => {
    return benchmarks.map(item => {
      const meta = (() => { try { return JSON.parse(item.memo || '{}') } catch { return {} } })()
      const competitor = meta.competitor || '롯데렌터카'
      const newPrice = meta.new_car_price || meta.pricing?.new_car_price || 0
      const monthlyPrice = meta.pricing?.monthly_no_deposit || item.monthly_price || 0
      const ourCost = newPrice > 0 ? calcOurCost(item.brand, item.model, newPrice, item.term || 48) : null
      const gap = ourCost && monthlyPrice > 0 ? ((monthlyPrice - ourCost.totalBEP) / ourCost.totalBEP * 100) : null
      return { ...item, competitor, newPrice, monthlyPrice, ourCost, gap, meta }
    })
  }, [benchmarks, calcOurCost])

  const filteredList = useMemo(() => {
    return enrichedList.filter(item => {
      const ms = !searchTerm || item.brand?.toLowerCase().includes(searchTerm.toLowerCase()) || item.model?.toLowerCase().includes(searchTerm.toLowerCase())
      const mc = filterCompetitor === 'all' || item.competitor === filterCompetitor
      const mt = filterTerm === 0 || item.term === filterTerm
      return ms && mc && mt
    })
  }, [enrichedList, searchTerm, filterCompetitor, filterTerm])

  const stats = useMemo(() => {
    const withGap = enrichedList.filter(i => i.gap !== null)
    const avgGap = withGap.length > 0 ? withGap.reduce((s, i) => s + i.gap, 0) / withGap.length : 0
    return {
      total: enrichedList.length,
      analyzed: withGap.length,
      avgGap,
      advantage: withGap.filter(i => i.gap > 0).length,
      disadvantage: withGap.filter(i => i.gap < 0).length,
    }
  }, [enrichedList])

  // ─── AI 경쟁사 조회 ───
  const handleAiLookup = async () => {
    if (!aiForm.brand || !aiForm.model) { alert('브랜드와 모델을 입력하세요.'); return }
    setAiLoading(true)
    setAiResult(null)
    try {
      const res = await fetch('/api/lookup-competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiForm),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAiResult(data)
    } catch (e: any) {
      alert('조회 실패: ' + e.message)
    } finally {
      setAiLoading(false)
    }
  }

  // AI 결과 → DB 저장
  const saveAiResult = async () => {
    if (!aiResult) return
    const monthlyPrice = aiResult.pricing?.monthly_no_deposit || 0
    const meta = JSON.stringify(aiResult)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/lotte-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          brand: aiResult.brand || aiForm.brand,
          model: aiResult.model || aiForm.model,
          trim: `AI조회 · ${aiResult.confidence || 'medium'}`,
          term: aiResult.term || aiForm.term,
          deposit_rate: 0,
          monthly_price: monthlyPrice,
          memo: meta,
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '저장 실패')
    } catch (e) {
      console.error('AI 결과 저장 실패:', e)
    }
    setShowAiModal(false)
    setAiResult(null)
    await loadAll()
  }

  // ─── 수동 등록 ───
  const handleManualAdd = async () => {
    if (!formData.brand || !formData.model || !formData.monthly_price) { alert('필수 항목을 입력하세요.'); return }
    const meta = JSON.stringify({
      competitor: formData.competitor,
      new_car_price: Number(formData.new_car_price) || 0,
      source_url: formData.source_url,
      collected_at: new Date().toISOString(),
      insurance: { summary: formData.insurance_summary },
      maintenance: { summary: formData.maintenance_summary },
      mileage: { summary: formData.mileage_limit },
      return_conditions: { summary: formData.return_conditions },
      buyout: { available: formData.buyout_available, residual_value_rate: Number(formData.buyout_residual_rate) || 0, summary: formData.buyout_available ? `잔존가율 ${formData.buyout_residual_rate}%` : '인수 불가' },
      early_termination: { summary: formData.early_termination },
      note: formData.memo,
    })
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/lotte-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          brand: formData.brand, model: formData.model, trim: formData.trim,
          term: formData.term, deposit_rate: formData.deposit_rate,
          monthly_price: Number(formData.monthly_price), memo: meta,
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '등록 실패')
    } catch (e) {
      console.error('수동 등록 실패:', e)
      alert('등록에 실패했습니다.')
      return
    }
    setShowAddModal(false)
    setFormData({ competitor: '롯데렌터카', brand: '', model: '', trim: '', new_car_price: '', term: 48, deposit_rate: 0, monthly_price: '', insurance_summary: '', maintenance_summary: '', mileage_limit: '2만km/년', return_conditions: '', buyout_available: true, buyout_residual_rate: '', early_termination: '', source_url: '', memo: '' })
    await loadAll()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('삭제하시겠습니까?')) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/lotte-rates/${id}`, {
        method: 'DELETE',
        headers
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '삭제 실패')
    } catch (e) {
      console.error('삭제 실패:', e)
      alert('삭제에 실패했습니다.')
      return
    }
    if (selectedItem?.id === id) setSelectedItem(null)
    await loadAll()
  }

  // ─── 유틸 ───
  const gapColor = (g: number | null) => g === null ? 'text-gray-400' : g > 5 ? 'text-emerald-600' : g > 0 ? 'text-emerald-500' : g > -5 ? 'text-amber-600' : 'text-red-600'
  const gapBg = (g: number | null) => g === null ? 'bg-gray-50 border-gray-200' : g > 0 ? 'bg-emerald-50 border-emerald-200' : g > -5 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">벤치마크 데이터 로딩 중...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* ─── 헤더 ─── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">📈 벤치마크 비교</h1>
              <p className="text-gray-500 mt-1 text-sm">경쟁사 렌트 견적 vs 우리 원가 · 상세 조건 비교 · 가격 경쟁력 진단</p>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <button onClick={() => setShowAiModal(true)} className="px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700">
                  AI 경쟁사 조회
                </button>
                <button onClick={() => setShowAddModal(true)} className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-800">
                  + 수동 등록
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── 대시보드 ─── */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-2xl font-black">{stats.total}</p>
              <p className="text-[10px] text-slate-300">수집 견적</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-2xl font-black">{stats.analyzed}</p>
              <p className="text-[10px] text-slate-300">분석 완료</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className={`text-2xl font-black ${stats.avgGap >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.analyzed > 0 ? pct(stats.avgGap) : '-'}
              </p>
              <p className="text-[10px] text-slate-300">평균 갭</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-emerald-400">{stats.advantage}</p>
              <p className="text-[10px] text-slate-300">가격 우위</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-red-400">{stats.disadvantage}</p>
              <p className="text-[10px] text-slate-300">경쟁 열위</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* ═══ 왼쪽: 목록 ═══ */}
          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                placeholder="브랜드·모델 검색..." className="flex-1 min-w-[120px] px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white" />
              <select value={filterCompetitor} onChange={e => setFilterCompetitor(e.target.value)} className="px-2 py-2 text-xs border border-gray-200 rounded-lg bg-white">
                <option value="all">전체 경쟁사</option>
                {COMPETITORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterTerm} onChange={e => setFilterTerm(Number(e.target.value))} className="px-2 py-2 text-xs border border-gray-200 rounded-lg bg-white">
                <option value={0}>전체 기간</option>
                {TERM_OPTIONS.map(t => <option key={t} value={t}>{t}개월</option>)}
              </select>
            </div>

            <div className="space-y-2">
              {filteredList.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <p className="text-3xl mb-2">📊</p>
                  <p className="text-sm font-bold text-gray-400">등록된 경쟁사 견적이 없습니다</p>
                  <p className="text-xs text-gray-300 mt-1">'AI 경쟁사 조회'로 자동 수집하거나 '수동 등록'으로 직접 입력하세요</p>
                </div>
              )}
              {filteredList.map(item => (
                <div key={item.id} onClick={() => { setSelectedItem(item); setDetailTab('compare') }}
                  className={`bg-white rounded-xl border p-3.5 cursor-pointer transition-all hover:shadow-md ${selectedItem?.id === item.id ? 'ring-2 ring-gray-900 border-gray-900' : 'border-gray-100'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-md flex-shrink-0">{item.competitor}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{item.brand} {item.model}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-bold text-gray-500">{item.term}개월</span>
                          {item.meta?.confidence && <span className={`text-[9px] px-1 py-0.5 rounded ${item.meta.confidence === 'high' ? 'bg-green-100 text-green-600' : item.meta.confidence === 'medium' ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-500'}`}>{item.meta.confidence}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-gray-900">{f(item.monthlyPrice)}<span className="text-[10px] text-gray-400">원/월</span></p>
                    </div>
                    <div className={`flex-shrink-0 w-20 text-center px-2 py-1.5 rounded-lg border ${gapBg(item.gap)}`}>
                      {item.gap !== null ? (
                        <p className={`text-xs font-black ${gapColor(item.gap)}`}>{pct(item.gap)}</p>
                      ) : (
                        <p className="text-[10px] text-gray-300">미분석</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ 오른쪽: 상세 분석 ═══ */}
          <div className="lg:col-span-5 space-y-4">
            {selectedItem ? (
              <>
                {/* 탭 전환 */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                  <button onClick={() => setDetailTab('compare')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${detailTab === 'compare' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                    상세 조건 비교
                  </button>
                  <button onClick={() => setDetailTab('cost')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${detailTab === 'cost' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                    원가 분석
                  </button>
                </div>

                {/* ── 상세 조건 비교 탭 ── */}
                {detailTab === 'compare' && (
                  <div className="space-y-3">
                    {/* 가격 비교 헤더 */}
                    <div className="bg-slate-900 rounded-2xl p-4 text-white">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-[10px] text-slate-400">{selectedItem.competitor}</p>
                          <p className="text-sm font-black">{selectedItem.brand} {selectedItem.model}</p>
                          <p className="text-[10px] text-slate-500">{selectedItem.term}개월 · {selectedItem.meta?.confidence === 'high' ? 'AI 확인' : selectedItem.meta?.confidence === 'medium' ? 'AI 추정' : '수동입력'}</p>
                        </div>
                        <button onClick={() => setSelectedItem(null)} className="text-slate-500 hover:text-white text-xs">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-800 rounded-lg p-2.5 text-center">
                          <p className="text-[10px] text-slate-400">경쟁사 월렌트료</p>
                          <p className="text-lg font-black text-blue-400">{f(selectedItem.monthlyPrice)}<span className="text-[10px] text-slate-400">원</span></p>
                        </div>
                        <div className="bg-slate-800 rounded-lg p-2.5 text-center">
                          <p className="text-[10px] text-slate-400">우리 원가(BEP)</p>
                          <p className="text-lg font-black text-amber-400">{selectedItem.ourCost ? f(selectedItem.ourCost.totalBEP) : '-'}<span className="text-[10px] text-slate-400">원</span></p>
                        </div>
                      </div>
                      {selectedItem.gap !== null && (
                        <div className={`mt-2 rounded-lg p-2 text-center ${selectedItem.gap >= 0 ? 'bg-emerald-900/30' : 'bg-red-900/30'}`}>
                          <span className={`text-sm font-black ${selectedItem.gap >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{pct(selectedItem.gap)}</span>
                          <span className="text-[10px] text-slate-300 ml-2">{selectedItem.gap >= 0 ? '마진 확보 가능' : '원가 절감 필요'}</span>
                        </div>
                      )}
                    </div>

                    {/* 항목별 비교 카드 */}
                    {[
                      { title: '보험 조건', icon: '🛡️', ours: selectedItem.ourCost?.insDetail || '-', theirs: selectedItem.meta?.insurance?.summary || selectedItem.meta?.insurance_summary || '정보 없음', detail: selectedItem.meta?.insurance },
                      { title: '정비 포함', icon: '🔧', ours: selectedItem.ourCost?.maintDetail || '-', theirs: selectedItem.meta?.maintenance?.summary || selectedItem.meta?.maintenance_summary || '정보 없음', detail: selectedItem.meta?.maintenance },
                      { title: '주행거리', icon: '🛣️', ours: '약정 기반 차등', theirs: selectedItem.meta?.mileage?.summary || selectedItem.meta?.mileage_limit || '정보 없음', detail: selectedItem.meta?.mileage },
                      { title: '반납 조건', icon: '📋', ours: '원상복구 기본', theirs: selectedItem.meta?.return_conditions?.summary || selectedItem.meta?.return_conditions || '정보 없음', detail: selectedItem.meta?.return_conditions },
                      { title: '만기 인수', icon: '🔑', ours: selectedItem.ourCost ? `잔존가 ${selectedItem.ourCost.residualPct}% · 인수가 ${f(selectedItem.ourCost.buyoutPrice)}원` : '-', theirs: selectedItem.meta?.buyout?.summary || (selectedItem.meta?.buyout?.available ? `잔존가율 ${selectedItem.meta.buyout.residual_value_rate}%` : '정보 없음'), detail: selectedItem.meta?.buyout },
                      { title: '중도해지', icon: '⚠️', ours: '잔여 렌트료 기준', theirs: selectedItem.meta?.early_termination?.summary || selectedItem.meta?.early_termination || '정보 없음', detail: selectedItem.meta?.early_termination },
                    ].map((row, idx) => (
                      <div key={idx} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                          <span className="text-sm">{row.icon}</span>
                          <span className="text-[11px] font-bold text-gray-700">{row.title}</span>
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-gray-100">
                          <div className="p-3">
                            <p className="text-[9px] font-bold text-blue-500 mb-1">{selectedItem.competitor}</p>
                            <p className="text-[11px] text-gray-700 leading-relaxed">{row.theirs}</p>
                            {typeof row.detail === 'object' && row.detail && (
                              <div className="mt-1.5 space-y-0.5">
                                {row.detail.scope && <p className="text-[9px] text-gray-400">범위: {row.detail.scope}</p>}
                                {row.detail.excluded && <p className="text-[9px] text-gray-400">제외: {row.detail.excluded}</p>}
                                {row.detail.penalty_items && <p className="text-[9px] text-gray-400">패널티: {Array.isArray(row.detail.penalty_items) ? row.detail.penalty_items.join(', ') : row.detail.penalty_items}</p>}
                                {row.detail.conditions && <p className="text-[9px] text-gray-400">조건: {row.detail.conditions}</p>}
                                {row.detail.annual_limit_km && <p className="text-[9px] text-gray-400">연 {f(row.detail.annual_limit_km)}km, 초과 {row.detail.excess_rate_per_km ? f(row.detail.excess_rate_per_km) + '원/km' : '-'}</p>}
                                {row.detail.minimum_period && <p className="text-[9px] text-gray-400">최소유지: {row.detail.minimum_period}</p>}
                              </div>
                            )}
                          </div>
                          <div className="p-3 bg-slate-50">
                            <p className="text-[9px] font-bold text-amber-600 mb-1">우리 (추정)</p>
                            <p className="text-[11px] text-gray-700 leading-relaxed">{row.ours}</p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* AI 시장 코멘트 */}
                    {selectedItem.meta?.market_comment && (
                      <div className="bg-purple-50 rounded-xl border border-purple-100 p-3">
                        <p className="text-[10px] font-bold text-purple-600 mb-1">AI 시장 분석</p>
                        <p className="text-[11px] text-purple-800 leading-relaxed">{selectedItem.meta.market_comment}</p>
                      </div>
                    )}

                    {selectedItem.meta?.source_url && (
                      <a href={selectedItem.meta.source_url} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-blue-500 hover:underline px-1">
                        출처: {selectedItem.meta.source_url}
                      </a>
                    )}
                  </div>
                )}

                {/* ── 원가 분석 탭 ── */}
                {detailTab === 'cost' && selectedItem.ourCost && (
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50">
                      <h4 className="text-xs font-bold text-gray-700">우리 원가 구성 (월 기준)</h4>
                      <p className="text-[10px] text-gray-400">{selectedItem.ourCost.depCategory} · 잔가율 {selectedItem.ourCost.residualPct}% · LTV {selectedItem.ourCost.ltvRate}%</p>
                    </div>
                    <div className="p-4 space-y-2.5">
                      {[
                        { label: '감가상각', val: selectedItem.ourCost.monthlyAcqDep, desc: '취득원가 기준 (등록비 포함)' },
                        { label: '금융비용', val: selectedItem.ourCost.monthlyFinance, desc: `대출이자 ${selectedItem.ourCost.annualRate}% + 기회비용` },
                        { label: '보험료', val: selectedItem.ourCost.monthlyIns, desc: '영업용 자동차보험' },
                        { label: '정비비', val: selectedItem.ourCost.monthlyMaint, desc: '소모품+예비정비' },
                        { label: '자동차세', val: selectedItem.ourCost.monthlyTax, desc: '영업용 세율' },
                        { label: '리스크적립', val: selectedItem.ourCost.monthlyRisk, desc: '사고/면책 준비금' },
                      ].map((r, i) => (
                        <div key={i}>
                          <div className="flex justify-between text-[10px] mb-0.5">
                            <span className="font-bold text-gray-600">{r.label}</span>
                            <span className="font-black text-gray-900">{f(r.val)}원</span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-slate-600 rounded-full transition-all" style={{ width: `${Math.min(100, r.val / selectedItem.ourCost!.totalBEP * 100)}%` }} />
                          </div>
                          <p className="text-[9px] text-gray-400 mt-0.5">{r.desc}</p>
                        </div>
                      ))}
                      <div className="pt-3 mt-2 border-t border-gray-100">
                        <div className="flex justify-between">
                          <span className="text-xs font-bold text-gray-900">월 BEP</span>
                          <span className="text-sm font-black text-red-600">{f(selectedItem.ourCost.totalBEP)}원</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] text-gray-400">만기 인수가 (잔존가)</span>
                          <span className="text-xs font-bold text-gray-700">{f(selectedItem.ourCost.buyoutPrice)}원</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === 'cost' && !selectedItem.ourCost && (
                  <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 text-center">
                    <p className="text-sm font-bold text-amber-700">원가 분석 불가</p>
                    <p className="text-xs text-amber-600 mt-1">신차 가격이 입력되지 않아 원가를 산출할 수 없습니다</p>
                  </div>
                )}

                {isAdmin && (
                  <button onClick={() => handleDelete(selectedItem.id)} className="w-full py-2 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    이 견적 삭제
                  </button>
                )}
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h4 className="text-xs font-bold text-gray-900 mb-3">벤치마크 활용 가이드</h4>
                <div className="space-y-3 text-[11px] text-gray-600">
                  {[
                    { icon: '🤖', title: 'AI 경쟁사 조회', desc: 'Gemini AI가 경쟁사 홈페이지를 분석하여 견적·보험·정비·반납·인수 조건을 자동 수집합니다.' },
                    { icon: '📊', title: '가격 갭 분석', desc: '경쟁사 렌트료 vs 우리 원가(BEP)를 비교하여 마진 확보 가능 여부를 진단합니다.' },
                    { icon: '📋', title: '상세 조건 비교', desc: '보험·정비·주행거리·반납·인수·중도해지 조건을 항목별로 비교합니다.' },
                    { icon: '🔑', title: '인수가/잔존가', desc: '만기 시 인수 가격과 잔존가율을 비교하여 고객 혜택과 우리 수익을 최적화합니다.' },
                  ].map((g, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-base flex-shrink-0">{g.icon}</span>
                      <div>
                        <p className="font-bold text-gray-800">{g.title}</p>
                        <p className="text-gray-500 mt-0.5">{g.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 연동 페이지 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h4 className="text-xs font-bold text-gray-900 mb-2">연동 페이지</h4>
              <div className="space-y-1.5">
                {[
                  { href: '/quotes/pricing', label: '렌트가 산출기' },
                  { href: '/db/pricing-standards', label: '산출 기준 관리 (7대 테이블)' },
                ].map(l => (
                  <a key={l.href} href={l.href} className="block px-3 py-2 bg-gray-50 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100">{l.label} →</a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ AI 조회 모달 ═══ */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowAiModal(false); setAiResult(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-purple-600 text-white px-5 py-4 flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold">AI 경쟁사 견적 조회</h3>
                <p className="text-[10px] text-purple-200 mt-0.5">Gemini AI가 경쟁사 견적 + 상세 조건을 자동 수집합니다</p>
              </div>
              <button onClick={() => { setShowAiModal(false); setAiResult(null) }} className="text-white/70 hover:text-white text-lg">×</button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* 경쟁사 선택 */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1.5">경쟁사</label>
                <div className="flex flex-wrap gap-1.5">
                  {COMPETITORS.filter(c => c !== '기타').map(c => (
                    <button key={c} onClick={() => setAiForm({...aiForm, competitor: c})}
                      className={`px-3 py-1.5 text-[10px] font-bold rounded-lg ${aiForm.competitor === c ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">브랜드</label>
                  <input className="w-full px-3 py-2 text-xs border rounded-lg" placeholder="현대" value={aiForm.brand} onChange={e => setAiForm({...aiForm, brand: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">모델명</label>
                  <input className="w-full px-3 py-2 text-xs border rounded-lg" placeholder="그랜저" value={aiForm.model} onChange={e => setAiForm({...aiForm, model: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">기간</label>
                  <select className="w-full px-3 py-2 text-xs border rounded-lg bg-white" value={aiForm.term} onChange={e => setAiForm({...aiForm, term: Number(e.target.value)})}>
                    {TERM_OPTIONS.map(t => <option key={t} value={t}>{t}개월</option>)}
                  </select>
                </div>
              </div>

              {!aiResult && (
                <button onClick={handleAiLookup} disabled={aiLoading}
                  className="w-full py-3 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-700 disabled:opacity-50">
                  {aiLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      AI가 경쟁사 정보를 분석하고 있습니다...
                    </span>
                  ) : 'AI 조회 시작'}
                </button>
              )}

              {/* AI 결과 미리보기 */}
              {aiResult && (
                <div className="space-y-3">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                    <p className="text-xs font-bold text-green-700 mb-2">조회 완료 — {aiResult.confidence === 'high' ? '높은 신뢰도' : aiResult.confidence === 'medium' ? '보통 신뢰도' : '낮은 신뢰도'}</p>
                    {aiResult.pricing && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white rounded-lg p-2">
                          <p className="text-[9px] text-gray-400">보증금 0%</p>
                          <p className="font-black text-gray-900">{f(aiResult.pricing.monthly_no_deposit)}원/월</p>
                        </div>
                        <div className="bg-white rounded-lg p-2">
                          <p className="text-[9px] text-gray-400">보증금 30%</p>
                          <p className="font-black text-gray-900">{f(aiResult.pricing.monthly_30pct_deposit)}원/월</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 주요 조건 미리보기 */}
                  <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-[11px]">
                    {aiResult.insurance?.summary && <p><span className="font-bold text-gray-600">보험:</span> {aiResult.insurance.summary}</p>}
                    {aiResult.maintenance?.summary && <p><span className="font-bold text-gray-600">정비:</span> {aiResult.maintenance.summary}</p>}
                    {aiResult.mileage?.summary && <p><span className="font-bold text-gray-600">주행:</span> {aiResult.mileage.summary}</p>}
                    {aiResult.return_conditions?.summary && <p><span className="font-bold text-gray-600">반납:</span> {aiResult.return_conditions.summary}</p>}
                    {aiResult.buyout?.summary && <p><span className="font-bold text-gray-600">인수:</span> {aiResult.buyout.summary}</p>}
                    {aiResult.early_termination?.summary && <p><span className="font-bold text-gray-600">해지:</span> {aiResult.early_termination.summary}</p>}
                  </div>

                  {aiResult.market_comment && (
                    <div className="bg-purple-50 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-purple-600 mb-1">AI 시장 분석</p>
                      <p className="text-[11px] text-purple-800">{aiResult.market_comment}</p>
                    </div>
                  )}

                  {aiResult.data_note && <p className="text-[9px] text-gray-400 px-1">{aiResult.data_note}</p>}

                  <div className="flex gap-2">
                    <button onClick={saveAiResult} className="flex-1 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800">
                      DB에 저장
                    </button>
                    <button onClick={() => setAiResult(null)} className="px-4 py-2.5 border border-gray-200 text-xs font-bold rounded-xl text-gray-500 hover:bg-gray-50">
                      다시 조회
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ 수동 등록 모달 ═══ */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 text-white px-5 py-4 flex justify-between items-center flex-shrink-0">
              <h3 className="text-sm font-bold">경쟁사 견적 수동 등록</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white text-lg">×</button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto flex-1">
              {/* 경쟁사 */}
              <div className="flex flex-wrap gap-1.5">
                {COMPETITORS.map(c => (
                  <button key={c} onClick={() => setFormData({...formData, competitor: c})}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-lg ${formData.competitor === c ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>{c}</button>
                ))}
              </div>
              {/* 기본정보 */}
              <div className="grid grid-cols-2 gap-2">
                <input className="px-3 py-2 text-xs border rounded-lg" placeholder="브랜드 *" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} />
                <input className="px-3 py-2 text-xs border rounded-lg" placeholder="모델명 *" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} />
              </div>
              <input className="w-full px-3 py-2 text-xs border rounded-lg" placeholder="트림/등급" value={formData.trim} onChange={e => setFormData({...formData, trim: e.target.value})} />
              {/* 가격 */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 mb-0.5 block">월 렌트료 *</label>
                    <input type="number" className="w-full px-3 py-2 text-xs border border-red-200 rounded-lg bg-red-50 font-bold" placeholder="850000"
                      value={formData.monthly_price} onChange={e => setFormData({...formData, monthly_price: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 mb-0.5 block">신차가격</label>
                    <input type="number" className="w-full px-3 py-2 text-xs border rounded-lg" placeholder="45000000"
                      value={formData.new_car_price} onChange={e => setFormData({...formData, new_car_price: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select className="px-3 py-2 text-xs border rounded-lg bg-white" value={formData.term} onChange={e => setFormData({...formData, term: Number(e.target.value)})}>
                    {TERM_OPTIONS.map(t => <option key={t} value={t}>{t}개월</option>)}
                  </select>
                  <input type="number" className="px-3 py-2 text-xs border rounded-lg" placeholder="보증금률 %" value={formData.deposit_rate} onChange={e => setFormData({...formData, deposit_rate: Number(e.target.value)})} />
                </div>
              </div>
              {/* 상세조건 */}
              <div className="bg-blue-50 rounded-xl p-3 space-y-2">
                <p className="text-[10px] font-bold text-blue-600">상세 조건 (선택)</p>
                <input className="w-full px-3 py-1.5 text-[11px] border rounded-lg" placeholder="보험 조건 (대인무한/대물2억 등)" value={formData.insurance_summary} onChange={e => setFormData({...formData, insurance_summary: e.target.value})} />
                <input className="w-full px-3 py-1.5 text-[11px] border rounded-lg" placeholder="정비 포함 범위" value={formData.maintenance_summary} onChange={e => setFormData({...formData, maintenance_summary: e.target.value})} />
                <input className="w-full px-3 py-1.5 text-[11px] border rounded-lg" placeholder="주행거리 제한 (2만km/년)" value={formData.mileage_limit} onChange={e => setFormData({...formData, mileage_limit: e.target.value})} />
                <input className="w-full px-3 py-1.5 text-[11px] border rounded-lg" placeholder="반납 조건" value={formData.return_conditions} onChange={e => setFormData({...formData, return_conditions: e.target.value})} />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={formData.buyout_available} onChange={e => setFormData({...formData, buyout_available: e.target.checked})} className="w-3 h-3" />
                    <span className="text-[10px] font-bold text-gray-700">만기 인수 가능</span>
                  </label>
                  {formData.buyout_available && (
                    <input className="flex-1 px-2 py-1 text-[11px] border rounded-lg" placeholder="잔존가율 %" value={formData.buyout_residual_rate} onChange={e => setFormData({...formData, buyout_residual_rate: e.target.value})} />
                  )}
                </div>
                <input className="w-full px-3 py-1.5 text-[11px] border rounded-lg" placeholder="중도해지 조건" value={formData.early_termination} onChange={e => setFormData({...formData, early_termination: e.target.value})} />
              </div>
              <input className="w-full px-3 py-2 text-xs border rounded-lg" placeholder="출처 URL" value={formData.source_url} onChange={e => setFormData({...formData, source_url: e.target.value})} />
              <input className="w-full px-3 py-2 text-xs border rounded-lg" placeholder="메모" value={formData.memo} onChange={e => setFormData({...formData, memo: e.target.value})} />
              <button onClick={handleManualAdd} className="w-full py-3 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800">등록하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
