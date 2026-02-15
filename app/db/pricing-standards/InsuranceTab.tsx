'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface InsuranceRow {
  id: number
  vehicle_type: string
  value_min: number
  value_max: number
  annual_premium: number
  coverage_desc: string
  notes: string
}

interface SearchResult {
  results: string
  sources: string[]
  searched_at: string
}

const VEHICLE_TYPES = ['국산 승용', '수입 승용', '전기차', '수입 SUV', '국산 SUV']

// 분류 기준 설명 데이터
const CLASSIFICATION_INFO = [
  { type: '국산 승용', desc: '현대·기아·제네시스·쉐보레 등 국산 세단/해치백', example: '아반떼, 소나타, K5, 그랜저', riskLevel: '보통', premiumRange: '70~120만원/년' },
  { type: '수입 승용', desc: 'BMW·벤츠·아우디·볼보 등 수입 세단', example: 'BMW 3시리즈, 벤츠 C클래스', riskLevel: '높음', premiumRange: '150~300만원/년' },
  { type: '전기차', desc: '순수 전기차(BEV) 전 차종', example: '테슬라 Model 3, 아이오닉5, EV6', riskLevel: '높음', premiumRange: '120~250만원/년' },
  { type: '수입 SUV', desc: 'BMW X시리즈, 벤츠 GLC 등 수입 SUV', example: 'BMW X3, 벤츠 GLE, 볼보 XC60', riskLevel: '매우높음', premiumRange: '200~400만원/년' },
  { type: '국산 SUV', desc: '투싼, 쏘렌토, 싼타페 등 국산 SUV', example: '투싼, 쏘렌토, 싼타페, GV70', riskLevel: '보통', premiumRange: '80~150만원/년' },
]

// 업계 보험 기준 참고
const INDUSTRY_BENCHMARKS = [
  { company: '대형 렌터카사', coverage: '종합보험 (대인무한, 대물 5억, 자손 1억)', selfInsurance: '자차 면책금 30~50만원', note: '법인 플릿 할인 적용' },
  { company: '중소 렌터카사', coverage: '종합보험 (대인무한, 대물 3억, 자손 5천)', selfInsurance: '자차 면책금 50~100만원', note: '개별 가입, 할인 적음' },
]

export default function InsuranceTab() {
  const supabase = createClientComponentClient()

  const [rows, setRows] = useState<InsuranceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [selectedVehicleType, setSelectedVehicleType] = useState('')
  const [vehicleValue, setVehicleValue] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const [showAIPanel, setShowAIPanel] = useState(false)

  const fetchData = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.from('insurance_rate_table').select('*').order('id', { ascending: true })
      if (error) throw error
      setRows(data || [])
    } catch (error) {
      console.error('데이터 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleCellClick = (rowId: number, field: string, value: any) => {
    setEditingCell({ rowId, field })
    if (field === 'value_min' || field === 'value_max') {
      setEditValue(String((value / 10000) || ''))
    } else {
      setEditValue(String(value || ''))
    }
  }

  const handleCellBlur = async () => {
    if (!editingCell) return
    const { rowId, field } = editingCell
    const row = rows.find(r => r.id === rowId)
    if (!row) return

    let newValue: any = editValue
    if (field === 'value_min' || field === 'value_max') newValue = Math.round(parseFloat(editValue) * 10000) || 0
    else if (field === 'annual_premium') newValue = Math.round(parseFloat(editValue)) || 0

    const oldValue = row[field as keyof InsuranceRow]
    if (oldValue === newValue) { setEditingCell(null); return }

    try {
      const { error } = await supabase.from('insurance_rate_table').update({ [field]: newValue }).eq('id', rowId)
      if (error) throw error
      setRows(rows.map(r => r.id === rowId ? { ...r, [field]: newValue } : r))
    } catch (error) {
      console.error('업데이트 실패:', error)
    } finally {
      setEditingCell(null)
    }
  }

  const handleAddRow = async () => {
    try {
      const newRow = { vehicle_type: '국산 승용', value_min: 10000000, value_max: 20000000, annual_premium: 500000, coverage_desc: '종합보험', notes: '' }
      const { data, error } = await supabase.from('insurance_rate_table').insert([newRow]).select()
      if (error) throw error
      if (data && data[0]) setRows([...rows, data[0]])
    } catch (error) {
      console.error('행 추가 실패:', error)
    }
  }

  const handleDeleteRow = async (rowId: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      const { error } = await supabase.from('insurance_rate_table').delete().eq('id', rowId)
      if (error) throw error
      setRows(rows.filter(r => r.id !== rowId))
    } catch (error) {
      console.error('삭제 실패:', error)
    }
  }

  const formatAmount = (amount: number) => (amount / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + '만'
  const formatPremium = (amount: number) => amount.toLocaleString('ko-KR') + '원'

  const handleSearch = async () => {
    if (!selectedVehicleType || !vehicleValue) return
    try {
      setSearching(true)
      const vehicleValueWon = Math.round(parseFloat(vehicleValue) * 10000)
      const response = await fetch('/api/search-pricing-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'insurance', context: { vehicle_type: selectedVehicleType, vehicle_value: vehicleValueWon } }),
      })
      if (!response.ok) throw new Error('검색 실패')
      const data: SearchResult = await response.json()
      setSearchResults(data)
    } catch (error) {
      console.error('검색 실패:', error)
    } finally {
      setSearching(false)
    }
  }

  // 현재 기준표에서 해당 차종의 보험료 매칭
  const getMatchingPremium = () => {
    if (!selectedVehicleType || !vehicleValue) return null
    const valueWon = parseFloat(vehicleValue) * 10000
    return rows.find(r => r.vehicle_type === selectedVehicleType && valueWon >= r.value_min && valueWon <= r.value_max)
  }

  const riskLevelColor = (level: string) => {
    if (level === '매우높음') return 'text-red-600 bg-red-50'
    if (level === '높음') return 'text-orange-600 bg-orange-50'
    return 'text-green-600 bg-green-50'
  }

  if (loading) {
    return <div className="bg-white rounded-2xl shadow-sm p-8 text-center"><p className="text-gray-500">로딩 중...</p></div>
  }

  const matchedPremium = getMatchingPremium()

  return (
    <div className="space-y-4">
      {/* 가이드 섹션 */}
      {showGuide && (
        <div className="bg-gradient-to-r from-blue-50 to-sky-50 rounded-2xl p-5 border border-blue-100">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🛡️</span>
              <h3 className="text-sm font-bold text-gray-800">보험료 기준이란?</h3>
            </div>
            <button onClick={() => setShowGuide(false)} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600 leading-relaxed">
            <div>
              <p className="font-semibold text-gray-700 mb-1">개념</p>
              <p>차종·차량가액 구간별 연간 보험료입니다. 렌터카는 법인 플릿보험으로 가입하며, 개인보험 대비 20~40% 저렴합니다. 대인무한·대물·자손·자차가 기본 포함됩니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">산출 영향</p>
              <p>월 렌트료에 보험료를 월할(연보험료 ÷ 12)로 포함합니다. 수입차·전기차는 부품비가 비싸 보험료가 국산차의 2~3배입니다. 렌트료의 15~25%를 차지합니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">대형사 기준</p>
              <p>롯데렌탈·SK렌터카는 수천대 규모 플릿계약으로 보험사와 특별요율을 협상합니다. 소규모 업체는 이보다 10~20% 높을 수 있으며, 실시간 검증으로 현재 시세를 확인하세요.</p>
            </div>
          </div>
        </div>
      )}

      {/* 차종별 분류 기준표 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">📋</span>
            <h3 className="text-xs font-bold text-gray-700">차종 분류 기준 (보험 적용 기준)</h3>
          </div>
          <span className="text-[10px] text-gray-400">이 분류에 따라 보험료가 차등 적용됩니다</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap min-w-[90px]">분류</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap min-w-[180px]">설명</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap min-w-[160px]">해당 차종 예시</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap min-w-[70px]">위험등급</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap min-w-[110px]">보험료 범위</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {CLASSIFICATION_INFO.map((info) => (
                <tr key={info.type} className="hover:bg-gray-50/50">
                  <td className="px-2 py-2 font-semibold text-gray-800">{info.type}</td>
                  <td className="px-2 py-2 text-gray-600">{info.desc}</td>
                  <td className="px-2 py-2 text-gray-500">{info.example}</td>
                  <td className="px-2 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${riskLevelColor(info.riskLevel)}`}>
                      {info.riskLevel}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center font-medium text-gray-700">{info.premiumRange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 보험료 기준표 - 전체 너비 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-visible border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-900">보험료 기준표</h3>
            <div className="flex gap-2">
              {!showGuide && (
                <button onClick={() => setShowGuide(true)} className="px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">가이드 💡</button>
              )}
              <button onClick={() => setShowAIPanel(!showAIPanel)} 
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${showAIPanel ? 'bg-slate-900 text-white' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'}`}>
                {showAIPanel ? '🔍 AI 검증 닫기' : '🔍 AI 검증'}
              </button>
              <button onClick={handleAddRow} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">+ 행 추가</button>
            </div>
          </div>
          <p className="text-xs text-gray-400">셀 클릭 → 편집 → 자동 저장 · 차량가는 만원 단위 입력</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap min-w-[110px]">차종</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-[90px]">하한(만)</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-[90px]">상한(만)</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-[110px]">연보험료</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">보장</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">비고</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-[50px]">삭제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">데이터가 없습니다.</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-2 py-2 whitespace-nowrap">
                      {editingCell?.rowId === row.id && editingCell?.field === 'vehicle_type' ? (
                        <select value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-full px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none">
                          {VEHICLE_TYPES.map((type) => (<option key={type} value={type}>{type}</option>))}
                        </select>
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'vehicle_type', row.vehicle_type)}
                          className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block font-medium">{row.vehicle_type}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {editingCell?.rowId === row.id && editingCell?.field === 'value_min' ? (
                        <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-20 px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none text-center" placeholder="만원" />
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'value_min', row.value_min)}
                          className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block text-gray-700">{formatAmount(row.value_min)}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {editingCell?.rowId === row.id && editingCell?.field === 'value_max' ? (
                        <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-20 px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none text-center" placeholder="만원" />
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'value_max', row.value_max)}
                          className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block text-gray-700">{formatAmount(row.value_max)}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {editingCell?.rowId === row.id && editingCell?.field === 'annual_premium' ? (
                        <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-24 px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none text-center" />
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'annual_premium', row.annual_premium)}
                          className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block font-bold text-blue-600">{formatPremium(row.annual_premium)}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editingCell?.rowId === row.id && editingCell?.field === 'coverage_desc' ? (
                        <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-full px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none" />
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'coverage_desc', row.coverage_desc)}
                          className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block text-gray-600">{row.coverage_desc || '—'}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editingCell?.rowId === row.id && editingCell?.field === 'notes' ? (
                        <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-full px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none" />
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'notes', row.notes)}
                          className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block text-gray-500">{row.notes || '—'}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => handleDeleteRow(row.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 업계 보험 기준 참고 */}
        <div className="p-5 border-t border-gray-100 bg-gray-50/50">
          <p className="text-xs font-semibold text-gray-500 mb-3">🏢 업계 보험 가입 기준 비교</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {INDUSTRY_BENCHMARKS.map((b, i) => (
              <div key={i} className="bg-white rounded-lg p-3 border border-gray-100 text-xs">
                <p className="font-bold text-gray-700 mb-1.5">{b.company}</p>
                <p className="text-gray-500 mb-1">보장: {b.coverage}</p>
                <p className="text-gray-500 mb-1">면책: {b.selfInsurance}</p>
                <p className="text-gray-400">{b.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 실시간 검색 패널 - 조건부 렌더링 */}
      {showAIPanel && (
        <div className="bg-slate-900 rounded-2xl shadow-sm p-5 text-white">
          <h3 className="text-sm font-bold mb-1">실시간 보험료 검증</h3>
          <p className="text-[10px] text-slate-400 mb-4">Gemini AI로 현재 보험 시장가를 조회하여 기준표 적정성을 확인합니다</p>

          <div className="mb-3">
            <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">차종</label>
            <select value={selectedVehicleType} onChange={(e) => setSelectedVehicleType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500">
              <option value="">선택하세요</option>
              {VEHICLE_TYPES.map((type) => (<option key={type} value={type}>{type}</option>))}
            </select>
          </div>
          <div className="mb-3">
            <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">차량가 (만원)</label>
            <input type="number" value={vehicleValue} onChange={(e) => setVehicleValue(e.target.value)} placeholder="예: 3000"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500 placeholder-slate-500" />
          </div>

          <button onClick={handleSearch} disabled={searching || !selectedVehicleType || !vehicleValue}
            className="w-full px-4 py-2.5 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors mb-4">
            {searching ? '보험료 조회 중...' : '🔍 실시간 보험료 검증'}
          </button>

          {/* 현재 기준표 매칭 결과 */}
          {matchedPremium && (
            <div className="bg-slate-800 rounded-lg p-3 mb-3 border border-slate-700">
              <p className="text-[10px] font-semibold text-emerald-400 mb-1.5">현재 기준표 매칭</p>
              <div className="text-xs text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span>차종</span>
                  <span className="font-semibold text-white">{matchedPremium.vehicle_type}</span>
                </div>
                <div className="flex justify-between">
                  <span>차량가 구간</span>
                  <span className="text-white">{formatAmount(matchedPremium.value_min)} ~ {formatAmount(matchedPremium.value_max)}</span>
                </div>
                <div className="flex justify-between">
                  <span>연 보험료</span>
                  <span className="font-bold text-blue-400">{formatPremium(matchedPremium.annual_premium)}</span>
                </div>
                <div className="flex justify-between">
                  <span>월 환산</span>
                  <span className="font-bold text-blue-400">{formatPremium(Math.round(matchedPremium.annual_premium / 12))}/월</span>
                </div>
              </div>
            </div>
          )}

          {/* Gemini 검색 결과 */}
          {searchResults && (
            <div className="space-y-3">
              <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] font-semibold text-blue-300">Gemini 검증 결과</h4>
                  <span className="text-[9px] text-slate-500">{searchResults.searched_at}</span>
                </div>
                <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {searchResults.results}
                </div>
              </div>
              {searchResults.sources.length > 0 && (
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <h4 className="text-[10px] font-semibold text-blue-300 mb-2">참고 출처</h4>
                  <div className="space-y-1">
                    {searchResults.sources.map((source, idx) => (
                      <a key={idx} href={source} target="_blank" rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-[10px] break-all underline block leading-snug">
                        {source.length > 60 ? source.substring(0, 60) + '...' : source}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!searchResults && !searching && !matchedPremium && (
            <div className="text-center text-slate-500 text-xs py-3">
              차종과 차량가를 입력하고 검증을 시작하세요
            </div>
          )}
        </div>
      )}
    </div>
  )
}
