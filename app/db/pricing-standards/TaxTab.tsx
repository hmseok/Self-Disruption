'use client'

import { useEffect, useState } from 'react'
import { fetchPricingStandardsData, insertPricingStandardsRows, updatePricingStandardsRow, deletePricingStandardsRow, getAuthHeader } from '@/app/utils/pricing-standards'

interface TaxRecord {
  id?: number
  tax_type: string
  fuel_category: string
  cc_min: number
  cc_max: number
  rate_per_cc: number
  fixed_annual: number
  education_tax_rate: number
  notes: string
}

interface SearchResult {
  id: string
  tax_type: string
  fuel_category: string
  current_rate: number
  legal_rate: number
  status: string
  source: string
}

const TAX_TYPES = ['영업용']  // 렌터카 ERP: 영업용 전용
const FUEL_CATEGORIES = ['내연기관', '전기']

// 법정 세율 기준 (지방세법 기준) - 사용자가 검수할 수 있도록 근거를 모두 표시
// ★ 영업용(렌터카) 전용 법정 세율 + 전기차
const LEGAL_TAX_STANDARDS = {
  '영업용': {
    title: '영업용 승용차 (렌터카)',
    legalBasis: '지방세법 제127조, 시행령 제121조',
    rows: [
      { cc: '1,600cc 이하', rate: '18원/cc', education: '비과세', example: '1,600cc → 연 28,800원' },
      { cc: '2,500cc 이하', rate: '19원/cc', education: '비과세', example: '2,000cc → 연 38,000원' },
      { cc: '2,500cc 초과', rate: '24원/cc', education: '비과세', example: '3,000cc → 연 72,000원' },
    ],
    note: '영업용은 교육세 비과세, 비영업용(80~200원/cc) 대비 약 1/10 수준',
  },
  '전기차': {
    title: '전기차 (영업용)',
    legalBasis: '지방세법 제127조 제1항 제2호',
    rows: [
      { cc: '전기차 일괄', rate: '연 20,000원 (영업용)', education: '비과세', example: '비영업용 13만원 → 영업용 2만원' },
    ],
    note: '영업용 전기차 고정세액 2만원, 비영업용 13만원의 약 1/6',
  },
}

// 연식별 경감율 (차령 경감)
const AGE_REDUCTION = [
  { year: '3년차', rate: '5%' },
  { year: '4년차', rate: '10%' },
  { year: '5년차', rate: '15%' },
  { year: '6년차', rate: '20%' },
  { year: '7년차', rate: '25%' },
  { year: '8년차', rate: '30%' },
  { year: '9년차', rate: '35%' },
  { year: '10년차', rate: '40%' },
  { year: '11년차', rate: '45%' },
  { year: '12년차~', rate: '50% (최대)' },
]

export default function TaxTab() {
  const [rows, setRows] = useState<TaxRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const [showAIPanel, setShowAIPanel] = useState(false)

  // 시뮬레이터
  const [simTaxType, setSimTaxType] = useState('영업용')
  const [simFuel, setSimFuel] = useState('내연기관')
  const [simCc, setSimCc] = useState(2000)
  const [simAge, setSimAge] = useState(1)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const data = await fetchPricingStandardsData('vehicle_tax_table')
      setRows(data || [])
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const addRow = async () => {
    try {
      const newRow = { tax_type: '영업용', fuel_category: '내연기관', cc_min: 0, cc_max: 2000, rate_per_cc: 18, fixed_annual: 0, education_tax_rate: 0, notes: '' }
      await insertPricingStandardsRows('vehicle_tax_table', [newRow])
      await fetchData()
    } catch (err) { console.error('Error:', err) }
  }

  const updateField = async (id: number | undefined, field: string, value: any) => {
    if (!id) return
    try {
      await updatePricingStandardsRow('vehicle_tax_table', String(id), { [field]: value })
      setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r))
    } catch (err) { console.error('Error:', err) }
  }

  const deleteRow = async (id: number | undefined) => {
    if (!id) return
    try {
      await deletePricingStandardsRow('vehicle_tax_table', String(id))
      setRows(rows.filter(r => r.id !== id))
    } catch (err) { console.error('Error:', err) }
  }

  const handleSearch = async () => {
    setSearching(true)
    try {
      const response = await fetch('/api/search-pricing-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'tax' })
      })
      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.results || [])
        setShowResults(true)
      }
    } catch (err) { console.error('Error:', err) }
    finally { setSearching(false) }
  }

  // 시뮬레이션 계산
  const simulateTax = () => {
    // 영업용 전기차: 고정 2만원
    if (simFuel === '전기') return { baseTax: 20000, educationTax: 0, total: 20000, ageReduction: 0, finalTotal: 20000, reductionRate: 0, ratePerCc: 0, nonBizTotal: 130000 }

    // 영업용 내연기관
    let ratePerCc = 0
    if (simCc <= 1600) ratePerCc = 18
    else if (simCc <= 2500) ratePerCc = 19
    else ratePerCc = 24

    const baseTax = simCc * ratePerCc
    const educationTax = 0 // 영업용은 교육세 비과세
    const total = baseTax + educationTax

    // 차령 경감
    let reductionRate = 0
    if (simAge >= 3) reductionRate = Math.min((simAge - 2) * 5, 50)
    const ageReduction = Math.round(total * reductionRate / 100)
    const finalTotal = total - ageReduction

    // 비영업용 비교값 (참고용)
    const nonBizRate = simCc <= 1000 ? 80 : simCc <= 1600 ? 140 : 200
    const nonBizTotal = Math.round(simCc * nonBizRate * 1.3) // 교육세 30% 포함

    return { baseTax, educationTax, total, ageReduction, finalTotal, reductionRate, ratePerCc, nonBizTotal }
  }

  const formatCurrency = (value: number) => new Intl.NumberFormat('ko-KR').format(value)
  const sim = simulateTax()

  if (loading) {
    return <div className="bg-white rounded-2xl shadow-sm p-8 text-center"><p className="text-gray-500">로딩 중...</p></div>
  }

  return (
    <div className="space-y-4">
      {/* 가이드 */}
      {showGuide && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-5 border border-amber-100">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏛️</span>
              <h3 className="text-sm font-bold text-gray-800">자동차세 기준이란?</h3>
            </div>
            <button onClick={() => setShowGuide(false)} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600 leading-relaxed">
            <div>
              <p className="font-semibold text-gray-700 mb-1">핵심 개념</p>
              <p>자동차세는 배기량(cc) × 세율로 산출됩니다. <strong className="text-red-600">렌터카는 영업용</strong>으로 분류되어 비영업용(자가용)의 약 1/10 수준입니다. 이 차이가 렌트 사업의 핵심 수익원 중 하나입니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">영업용 세율 혜택</p>
              <p>렌터카=영업용 등록이므로 자가용 대비 약 1/10 세율입니다. 예) 2,000cc: <strong>영업용 38,000원 vs 자가용 520,000원</strong>. 이 차이가 렌트료에 직접 반영됩니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">차령 경감</p>
              <p>3년차부터 매년 5%씩 감면, 최대 50%까지 경감됩니다. 12년 이상 차량은 세금이 절반입니다. 장기 보유 차량일수록 세 부담이 줄어듭니다.</p>
            </div>
          </div>
        </div>
      )}

      {/* 법정 세율 기준표 (영업용 + 비영업용 + 전기차) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚖️</span>
            <h3 className="text-xs font-bold text-gray-700">법정 자동차세 세율표 (검수용 참고 기준)</h3>
          </div>
          <span className="text-[10px] text-gray-400">지방세법 기준 · 이 표를 기준으로 아래 기준표의 정확성을 검증하세요</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(LEGAL_TAX_STANDARDS).map(([key, std]) => (
            <div key={key} className={`rounded-xl p-4 border ${key === '영업용' ? 'bg-steel-50 border-steel-200' : 'bg-green-50 border-green-200'}`}>
              <p className="text-xs font-bold text-gray-800 mb-1">{std.title}</p>
              <p className="text-[10px] text-gray-500 mb-3">{std.legalBasis}</p>
              <div className="space-y-1.5">
                {std.rows.map((r, i) => (
                  <div key={i} className="flex justify-between items-center text-xs">
                    <span className="text-gray-600 whitespace-nowrap">{r.cc}</span>
                    <span className="font-semibold text-gray-800 whitespace-nowrap">{r.rate}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200/50">
                <p className="text-[10px] text-gray-500">{std.note}</p>
              </div>
              <div className="mt-2 space-y-0.5">
                {std.rows.map((r, i) => (
                  <p key={i} className="text-[10px] text-gray-400 whitespace-nowrap">{r.example}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 차령 경감율 */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-2">📅 차령 경감율 (3년차부터 적용)</p>
          <div className="flex flex-wrap gap-2">
            {AGE_REDUCTION.map((a) => (
              <span key={a.year} className="px-2 py-1 bg-white rounded border border-gray-200 text-[10px] text-gray-600">
                {a.year}: <strong className="text-gray-800">-{a.rate}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 자동차세 기준표 (전체 너비) */}
      <div className="bg-white rounded-2xl shadow-sm overflow-visible border border-gray-100">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900">자동차세 기준표 (편집 가능)</h3>
            <p className="text-xs text-gray-400 mt-0.5">위 법정 세율표를 기준으로 검수한 후 사용하세요</p>
          </div>
          <div className="flex gap-2">
            {!showGuide && (
              <button onClick={() => setShowGuide(true)} className="px-3 py-1.5 text-xs text-steel-600 bg-steel-50 rounded-lg hover:bg-steel-100">가이드 💡</button>
            )}
            <button onClick={() => setShowAIPanel(!showAIPanel)} 
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${showAIPanel ? 'bg-slate-900 text-white' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'}`}>
              {showAIPanel ? '🔍 AI 검증 닫기' : '🔍 AI 검증'}
            </button>
            <button onClick={addRow} className="px-3 py-1.5 bg-steel-600 text-white text-xs font-semibold rounded-lg hover:bg-steel-700">+ 행 추가</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">구분</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">연료</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">cc하한</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">cc상한</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">세율</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">고정세</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">교육세</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">비고</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">삭제</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">데이터가 없습니다.</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/30 transition">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {editingId === row.id && editingField === 'tax_type' ? (
                        <select value={row.tax_type} onChange={(e) => { updateField(row.id, 'tax_type', e.target.value); setEditingId(null); setEditingField(null) }} autoFocus
                          className="w-full px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none">
                          {TAX_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
                        </select>
                      ) : (
                        <span onClick={() => { setEditingId(row.id || null); setEditingField('tax_type') }}
                          className={`cursor-pointer inline-block font-bold px-2 py-0.5 rounded text-xs ${row.tax_type === '영업용' ? 'text-steel-700 bg-steel-50' : 'text-orange-700 bg-orange-50'}`}>
                          {row.tax_type}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {editingId === row.id && editingField === 'fuel_category' ? (
                        <select value={row.fuel_category} onChange={(e) => { updateField(row.id, 'fuel_category', e.target.value); setEditingId(null); setEditingField(null) }} autoFocus
                          className="w-full px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none">
                          {FUEL_CATEGORIES.map(t => (<option key={t} value={t}>{t}</option>))}
                        </select>
                      ) : (
                        <span onClick={() => { setEditingId(row.id || null); setEditingField('fuel_category') }}
                          className="cursor-pointer text-gray-800 hover:text-gray-600 inline-block">{row.fuel_category}</span>
                      )}
                    </td>
                    {(['cc_min', 'cc_max', 'rate_per_cc', 'fixed_annual', 'education_tax_rate'] as const).map((field) => (
                      <td key={field} className="px-3 py-2 text-center">
                        {editingId === row.id && editingField === field ? (
                          <input type="number" value={row[field]} onChange={(e) => updateField(row.id, field, parseInt(e.target.value) || 0)}
                            onBlur={() => { setEditingId(null); setEditingField(null) }} autoFocus
                            className="w-full px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none text-center" />
                        ) : (
                          <span onClick={() => { setEditingId(row.id || null); setEditingField(field) }}
                            className={`cursor-pointer hover:text-gray-600 inline-block ${field === 'rate_per_cc' ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                            {field === 'rate_per_cc' ? `${formatCurrency(row[field])}원` :
                             field === 'education_tax_rate' ? `${row[field]}%` :
                             field === 'fixed_annual' ? (row[field] > 0 ? `${formatCurrency(row[field])}원` : '—') :
                             formatCurrency(row[field])}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {editingId === row.id && editingField === 'notes' ? (
                        <input type="text" value={row.notes} onChange={(e) => updateField(row.id, 'notes', e.target.value)}
                          onBlur={() => { setEditingId(null); setEditingField(null) }} autoFocus
                          className="w-full px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none" />
                      ) : (
                        <span onClick={() => { setEditingId(row.id || null); setEditingField('notes') }}
                          className="cursor-pointer text-gray-500 hover:text-gray-600 inline-block">{row.notes || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => deleteRow(row.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI 검증 패널 (조건부 렌더링) */}
      {showAIPanel && (
        <div className="bg-slate-900 rounded-2xl shadow-sm p-5 text-white border border-slate-700">
          <h3 className="text-sm font-bold mb-4">AI 세금 검증 시스템</h3>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 시뮬레이터 */}
            <div className="lg:col-span-1">
              <h4 className="text-xs font-bold text-slate-300 mb-3">세금 시뮬레이터</h4>
              <p className="text-[10px] text-slate-400 mb-4">차량 정보를 입력하면 자동차세를 계산합니다</p>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">구분</label>
                  <select value={simTaxType} onChange={(e) => setSimTaxType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-steel-500">
                    {TAX_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">연료</label>
                  <select value={simFuel} onChange={(e) => setSimFuel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-steel-500">
                    {FUEL_CATEGORIES.map(t => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </div>
                {simFuel === '내연기관' && (
                  <div>
                    <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">배기량 (cc)</label>
                    <input type="number" value={simCc} onChange={(e) => setSimCc(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-steel-500" />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">차량 연식 (년차)</label>
                  <input type="number" value={simAge} onChange={(e) => setSimAge(parseInt(e.target.value) || 1)} min="1" max="20"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-steel-500" />
                </div>
              </div>

              {/* 계산 결과 */}
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <p className="text-[10px] font-semibold text-slate-300 mb-3">계산 결과</p>
                <div className="space-y-2 text-xs">
                  {simFuel === '내연기관' && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">적용 세율</span>
                      <span className="text-white font-semibold">{sim.ratePerCc}원/cc</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">기본세</span>
                    <span className="text-white">{formatCurrency(sim.baseTax)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">교육세</span>
                    <span className="text-white">{sim.educationTax > 0 ? formatCurrency(sim.educationTax) + '원' : '비과세'}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-600 pt-2">
                    <span className="text-slate-300 font-semibold">세금 합계</span>
                    <span className="text-white font-bold">{formatCurrency(sim.total)}원</span>
                  </div>
                  {sim.ageReduction > 0 && (
                    <>
                      <div className="flex justify-between text-emerald-400">
                        <span>차령 경감 (-{sim.reductionRate}%)</span>
                        <span>-{formatCurrency(sim.ageReduction)}원</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-600 pt-2">
                        <span className="text-slate-300 font-bold">최종 세액</span>
                        <span className="text-slate-300 font-bold text-sm">{formatCurrency(sim.finalTotal)}원/년</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-500">월 환산</span>
                    <span className="text-slate-300 font-semibold">{formatCurrency(Math.round(sim.finalTotal / 12))}원/월</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 영업용 절약 효과 (참고) */}
            <div className="lg:col-span-1">
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 h-full">
                <p className="text-[10px] font-semibold text-amber-300 mb-3">영업용 절약 효과 (참고)</p>
                <p className="text-xs text-slate-400 mb-3">{simFuel === '전기' ? '전기차' : `${formatCurrency(simCc)}cc`} 기준</p>
                <div className="text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-steel-400">영업용 (우리 적용)</span>
                    <span className="text-white font-bold">{formatCurrency(sim.finalTotal)}원/년</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 line-through">비영업용 (일반 참고)</span>
                    <span className="text-gray-500">{formatCurrency(sim.nonBizTotal)}원/년</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-600 pt-2 text-emerald-400">
                    <span>연간 절약</span>
                    <span className="font-bold">{formatCurrency(sim.nonBizTotal - sim.finalTotal)}원</span>
                  </div>
                  <div className="flex justify-between text-emerald-300">
                    <span>월 환산 절약</span>
                    <span className="font-semibold">{formatCurrency(Math.round((sim.nonBizTotal - sim.finalTotal) / 12))}원/월</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 실시간 법정세율 검증 */}
            <div className="lg:col-span-1">
              <button onClick={handleSearch} disabled={searching}
                className="w-full px-4 py-3 bg-steel-600 text-white font-semibold text-xs rounded-lg hover:bg-steel-700 disabled:bg-slate-700 transition-colors mb-3">
                {searching ? '법정 세율 검증 중...' : '🔍 실시간 법정 세율 검증'}
              </button>

              {showResults && searchResults.length > 0 && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {searchResults.map((result, idx) => (
                    <div key={idx} className={`rounded-lg p-3 border text-xs ${result.status === 'compliant' ? 'bg-emerald-900/30 border-emerald-600' : 'bg-red-900/30 border-red-600'}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-white font-semibold">{result.tax_type} · {result.fuel_category}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${result.status === 'compliant' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                          {result.status === 'compliant' ? '적정' : '검토필요'}
                        </span>
                      </div>
                      <div className="text-slate-400 space-y-0.5">
                        <div>현재: {formatCurrency(result.current_rate)}원/cc → 법정: {formatCurrency(result.legal_rate)}원/cc</div>
                        <div className="text-[10px]">출처: {result.source}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {showResults && searchResults.length === 0 && (
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 text-center">
                  <p className="text-xs text-slate-400">검증 결과가 없습니다</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
