'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

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

const TAX_TYPES = ['영업용', '비영업용']
const FUEL_CATEGORIES = ['내연기관', '전기']

// 법정 세율 기준 (지방세법 기준) - 사용자가 검수할 수 있도록 근거를 모두 표시
const LEGAL_TAX_STANDARDS = {
  '비영업용': {
    title: '비영업용 승용차 (자가용)',
    legalBasis: '지방세법 제127조, 시행령 제121조',
    rows: [
      { cc: '1,000cc 이하', rate: '80원/cc', education: '30%', example: '1,000cc → 연 104,000원' },
      { cc: '1,600cc 이하', rate: '140원/cc', education: '30%', example: '1,600cc → 연 291,200원' },
      { cc: '1,600cc 초과', rate: '200원/cc', education: '30%', example: '2,000cc → 연 520,000원' },
    ],
    note: '교육세 = 자동차세 × 30%, 매년 6월·12월 2회 납부',
  },
  '영업용': {
    title: '영업용 승용차 (렌터카)',
    legalBasis: '지방세법 제127조, 시행령 제121조',
    rows: [
      { cc: '1,600cc 이하', rate: '18원/cc', education: '비과세', example: '1,600cc → 연 28,800원' },
      { cc: '2,500cc 이하', rate: '19원/cc', education: '비과세', example: '2,000cc → 연 38,000원' },
      { cc: '2,500cc 초과', rate: '24원/cc', education: '비과세', example: '3,000cc → 연 72,000원' },
    ],
    note: '영업용은 교육세 비과세, 비영업용 대비 약 1/10 수준',
  },
  '전기차': {
    title: '전기차 (배기량 없음)',
    legalBasis: '지방세법 제127조 제1항 제2호',
    rows: [
      { cc: '전기차 일괄', rate: '연 130,000원 (고정)', education: '비과세', example: '모든 전기차 동일' },
    ],
    note: '전기차는 배기량이 없어 연 13만원 고정, 교육세 비과세',
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
  const supabase = createClientComponentClient()

  const [rows, setRows] = useState<TaxRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [showGuide, setShowGuide] = useState(true)

  // 시뮬레이터
  const [simTaxType, setSimTaxType] = useState('비영업용')
  const [simFuel, setSimFuel] = useState('내연기관')
  const [simCc, setSimCc] = useState(2000)
  const [simAge, setSimAge] = useState(1)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('vehicle_tax_table').select('*').order('tax_type', { ascending: true })
      if (error) throw error
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
      const { data, error } = await supabase.from('vehicle_tax_table').insert([newRow]).select()
      if (error) throw error
      if (data && data[0]) setRows([...rows, data[0]])
    } catch (err) { console.error('Error:', err) }
  }

  const updateField = async (id: number | undefined, field: string, value: any) => {
    if (!id) return
    try {
      const { error } = await supabase.from('vehicle_tax_table').update({ [field]: value }).eq('id', id)
      if (error) throw error
      setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r))
    } catch (err) { console.error('Error:', err) }
  }

  const deleteRow = async (id: number | undefined) => {
    if (!id) return
    try {
      const { error } = await supabase.from('vehicle_tax_table').delete().eq('id', id)
      if (error) throw error
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
    if (simFuel === '전기') return { baseTax: 130000, educationTax: 0, total: 130000, ageReduction: 0, finalTotal: 130000 }

    let ratePerCc = 0
    const isCommercial = simTaxType === '영업용'

    if (isCommercial) {
      if (simCc <= 1600) ratePerCc = 18
      else if (simCc <= 2500) ratePerCc = 19
      else ratePerCc = 24
    } else {
      if (simCc <= 1000) ratePerCc = 80
      else if (simCc <= 1600) ratePerCc = 140
      else ratePerCc = 200
    }

    const baseTax = simCc * ratePerCc
    const educationTax = isCommercial ? 0 : Math.round(baseTax * 0.3)
    const total = baseTax + educationTax

    // 차령 경감
    let reductionRate = 0
    if (simAge >= 3) reductionRate = Math.min((simAge - 2) * 5, 50)
    const ageReduction = Math.round(total * reductionRate / 100)
    const finalTotal = total - ageReduction

    return { baseTax, educationTax, total, ageReduction, finalTotal, reductionRate, ratePerCc }
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
              <p className="font-semibold text-gray-700 mb-1">영업용 vs 비영업용</p>
              <p>렌터카·택시·버스 등은 영업용, 개인 자가용은 비영업용입니다. 예) 2,000cc 차량: <strong>영업용 38,000원 vs 비영업용 520,000원</strong>. 약 14배 차이입니다.</p>
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
            <div key={key} className={`rounded-xl p-4 border ${key === '영업용' ? 'bg-blue-50 border-blue-200' : key === '비영업용' ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
              <p className="text-xs font-bold text-gray-800 mb-1">{std.title}</p>
              <p className="text-[10px] text-gray-500 mb-3">{std.legalBasis}</p>
              <div className="space-y-1.5">
                {std.rows.map((r, i) => (
                  <div key={i} className="flex justify-between items-center text-[11px]">
                    <span className="text-gray-600">{r.cc}</span>
                    <span className="font-semibold text-gray-800">{r.rate}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200/50">
                <p className="text-[10px] text-gray-500">{std.note}</p>
              </div>
              <div className="mt-2 space-y-0.5">
                {std.rows.map((r, i) => (
                  <p key={i} className="text-[10px] text-gray-400">{r.example}</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 왼쪽: CRUD 테이블 */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">자동차세 기준표 (편집 가능)</h3>
                <p className="text-xs text-gray-400 mt-0.5">위 법정 세율표를 기준으로 검수한 후 사용하세요</p>
              </div>
              <div className="flex gap-2">
                {!showGuide && (
                  <button onClick={() => setShowGuide(true)} className="px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">가이드 💡</button>
                )}
                <button onClick={addRow} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">+ 행 추가</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 min-w-[80px]">구분</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 min-w-[70px]">연료</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 min-w-[80px]">cc 하한</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 min-w-[80px]">cc 상한</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 min-w-[80px]">cc당 세율</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 min-w-[80px]">연 고정세</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 min-w-[70px]">교육세율</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 min-w-[80px]">비고</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-[50px]">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">데이터가 없습니다.</td></tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition">
                        <td className="px-3 py-2.5">
                          {editingId === row.id && editingField === 'tax_type' ? (
                            <select value={row.tax_type} onChange={(e) => { updateField(row.id, 'tax_type', e.target.value); setEditingId(null); setEditingField(null) }} autoFocus
                              className="w-full px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none">
                              {TAX_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
                            </select>
                          ) : (
                            <span onClick={() => { setEditingId(row.id || null); setEditingField('tax_type') }}
                              className={`cursor-pointer inline-block font-bold px-2 py-0.5 rounded text-xs ${row.tax_type === '영업용' ? 'text-blue-700 bg-blue-50' : 'text-orange-700 bg-orange-50'}`}>
                              {row.tax_type}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {editingId === row.id && editingField === 'fuel_category' ? (
                            <select value={row.fuel_category} onChange={(e) => { updateField(row.id, 'fuel_category', e.target.value); setEditingId(null); setEditingField(null) }} autoFocus
                              className="w-full px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none">
                              {FUEL_CATEGORIES.map(t => (<option key={t} value={t}>{t}</option>))}
                            </select>
                          ) : (
                            <span onClick={() => { setEditingId(row.id || null); setEditingField('fuel_category') }}
                              className="cursor-pointer text-gray-800 hover:text-blue-600 inline-block">{row.fuel_category}</span>
                          )}
                        </td>
                        {(['cc_min', 'cc_max', 'rate_per_cc', 'fixed_annual', 'education_tax_rate'] as const).map((field) => (
                          <td key={field} className="px-3 py-2.5 text-center">
                            {editingId === row.id && editingField === field ? (
                              <input type="number" value={row[field]} onChange={(e) => updateField(row.id, field, parseInt(e.target.value) || 0)}
                                onBlur={() => { setEditingId(null); setEditingField(null) }} autoFocus
                                className="w-full px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none text-center" />
                            ) : (
                              <span onClick={() => { setEditingId(row.id || null); setEditingField(field) }}
                                className={`cursor-pointer hover:text-blue-600 inline-block ${field === 'rate_per_cc' ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                                {field === 'rate_per_cc' ? `${formatCurrency(row[field])}원` :
                                 field === 'education_tax_rate' ? `${row[field]}%` :
                                 field === 'fixed_annual' ? (row[field] > 0 ? `${formatCurrency(row[field])}원` : '—') :
                                 formatCurrency(row[field])}
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-2.5">
                          {editingId === row.id && editingField === 'notes' ? (
                            <input type="text" value={row.notes} onChange={(e) => updateField(row.id, 'notes', e.target.value)}
                              onBlur={() => { setEditingId(null); setEditingField(null) }} autoFocus
                              className="w-full px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none" />
                          ) : (
                            <span onClick={() => { setEditingId(row.id || null); setEditingField('notes') }}
                              className="cursor-pointer text-gray-500 hover:text-blue-600 inline-block">{row.notes || '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => deleteRow(row.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 오른쪽: 시뮬레이터 + 검증 */}
        <div className="lg:col-span-4">
          <div className="bg-slate-900 rounded-2xl shadow-sm p-5 text-white sticky top-32">
            <h3 className="text-sm font-bold mb-1">세금 시뮬레이터</h3>
            <p className="text-[10px] text-slate-400 mb-4">차량 정보를 입력하면 자동차세를 계산합니다</p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">구분</label>
                <select value={simTaxType} onChange={(e) => setSimTaxType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500">
                  {TAX_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">연료</label>
                <select value={simFuel} onChange={(e) => setSimFuel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500">
                  {FUEL_CATEGORIES.map(t => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              {simFuel === '내연기관' && (
                <div>
                  <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">배기량 (cc)</label>
                  <input type="number" value={simCc} onChange={(e) => setSimCc(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500" />
                </div>
              )}
              <div>
                <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">차량 연식 (년차)</label>
                <input type="number" value={simAge} onChange={(e) => setSimAge(parseInt(e.target.value) || 1)} min="1" max="20"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500" />
              </div>
            </div>

            {/* 계산 결과 */}
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 mb-4">
              <p className="text-[10px] font-semibold text-blue-300 mb-3">계산 결과</p>
              <div className="space-y-2 text-[11px]">
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
                      <span className="text-blue-300 font-bold">최종 세액</span>
                      <span className="text-blue-400 font-bold text-sm">{formatCurrency(sim.finalTotal)}원/년</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500">월 환산</span>
                  <span className="text-blue-400 font-semibold">{formatCurrency(Math.round(sim.finalTotal / 12))}원/월</span>
                </div>
              </div>
            </div>

            {/* 영업용 vs 비영업용 비교 */}
            {simFuel === '내연기관' && (
              <div className="bg-slate-800 rounded-lg p-3 mb-4 border border-slate-700">
                <p className="text-[10px] font-semibold text-amber-300 mb-2">영업용 vs 비영업용 비교 ({formatCurrency(simCc)}cc)</p>
                <div className="text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-blue-400">영업용 (렌터카)</span>
                    <span className="text-white font-semibold">{formatCurrency(simCc * (simCc <= 1600 ? 18 : simCc <= 2500 ? 19 : 24))}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-orange-400">비영업용 (자가용)</span>
                    <span className="text-white font-semibold">{formatCurrency(Math.round(simCc * (simCc <= 1000 ? 80 : simCc <= 1600 ? 140 : 200) * 1.3))}원</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-600 pt-1 text-emerald-400">
                    <span>절약 효과</span>
                    <span className="font-bold">
                      {formatCurrency(Math.round(simCc * (simCc <= 1000 ? 80 : simCc <= 1600 ? 140 : 200) * 1.3) - simCc * (simCc <= 1600 ? 18 : simCc <= 2500 ? 19 : 24))}원/년
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 실시간 법정세율 검증 */}
            <button onClick={handleSearch} disabled={searching}
              className="w-full px-4 py-2.5 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 disabled:bg-slate-700 transition-colors">
              {searching ? '법정 세율 검증 중...' : '🔍 실시간 법정 세율 검증'}
            </button>

            {showResults && searchResults.length > 0 && (
              <div className="mt-4 space-y-2">
                {searchResults.map((result, idx) => (
                  <div key={idx} className={`rounded-lg p-3 border text-[11px] ${result.status === 'compliant' ? 'bg-emerald-900/30 border-emerald-600' : 'bg-red-900/30 border-red-600'}`}>
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
          </div>
        </div>
      </div>
    </div>
  )
}
