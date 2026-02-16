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

// ★ 렌터카 영업용 플릿보험 기준 가이드
const FLEET_INSURANCE_GUIDE = {
  coverage: {
    title: '렌터카 영업용 기본 담보',
    items: [
      { name: '대인배상 I', desc: '의무보험, 사망 1.5억/부상 3천만', required: true },
      { name: '대인배상 II', desc: '무한 (업계 표준)', required: true },
      { name: '대물배상', desc: '최소 2억 ~ 5억 (대형사 5억)', required: true },
      { name: '자기신체사고', desc: '사망 1억, 부상 3천만', required: true },
      { name: '자기차량손해', desc: '자차보험, 면책금 30~100만원', required: true },
      { name: '무보험차상해', desc: '2억 (선택)', required: false },
    ],
  },
  fleetDiscount: {
    title: '플릿(다대수) 할인 구조',
    tiers: [
      { size: '10대 미만', discount: '없음', note: '개별 가입과 동일' },
      { size: '10~49대', discount: '10~15%', note: '소규모 플릿' },
      { size: '50~199대', discount: '15~25%', note: '중규모 플릿' },
      { size: '200~999대', discount: '25~35%', note: '대규모 플릿' },
      { size: '1,000대 이상', discount: '35~45%', note: '대형 렌터카사 수준' },
    ],
  },
}

// 렌터카 영업용 vs 개인 보험 비교
const INSURANCE_COMPARISON = [
  { item: '가입 방식', fleet: '법인 플릿계약 (일괄)', personal: '개인 개별가입' },
  { item: '보험료 수준', fleet: '개인 대비 60~70%', personal: '100% (기준)' },
  { item: '운전자 범위', fleet: '누구나 (임차인)', personal: '지정 1~2인' },
  { item: '사고 할증', fleet: '플릿 전체 경험율 반영', personal: '개인 할증' },
  { item: '면책금', fleet: '30~100만원 (업체 부담 가능)', personal: '20~50만원' },
  { item: '대물 한도', fleet: '2억~5억', personal: '1억~3억' },
]

// 업계 벤치마크 (렌터카사 규모별)
const INDUSTRY_BENCHMARKS = [
  { company: '대형 렌터카사 (1000대+)', coverage: '대인무한, 대물5억, 자손1억, 자차', selfInsurance: '면책 30만원', note: '플릿 40%+ 할인, 손해율 관리 전담팀' },
  { company: '중형 렌터카사 (100~999대)', coverage: '대인무한, 대물3억, 자손1억, 자차', selfInsurance: '면책 50만원', note: '플릿 20~30% 할인' },
  { company: '소형 렌터카사 (100대 미만)', coverage: '대인무한, 대물2억, 자손5천, 자차', selfInsurance: '면책 50~100만원', note: '플릿 10~15% 할인, 개별과 큰 차이 없음' },
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
  const [showComparison, setShowComparison] = useState(false)

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
      const newRow = { vehicle_type: '국산 승용', value_min: 10000000, value_max: 20000000, annual_premium: 500000, coverage_desc: '대인무한/대물2억/자손1억/자차', notes: '' }
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
        body: JSON.stringify({ category: 'insurance', context: { vehicle_type: selectedVehicleType, vehicle_value: vehicleValueWon, insurance_type: '렌터카 영업용 플릿보험' } }),
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

  const getMatchingPremium = () => {
    if (!selectedVehicleType || !vehicleValue) return null
    const valueWon = parseFloat(vehicleValue) * 10000
    return rows.find(r => r.vehicle_type === selectedVehicleType && valueWon >= r.value_min && valueWon <= r.value_max)
  }

  if (loading) {
    return <div className="bg-white rounded-2xl shadow-sm p-8 text-center"><p className="text-gray-500">로딩 중...</p></div>
  }

  const matchedPremium = getMatchingPremium()

  return (
    <div className="space-y-4">
      {/* 영업용 전용 배너 */}
      <div className="bg-gradient-to-r from-steel-600 to-steel-800 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🛡️</span>
          <h3 className="text-sm font-bold">렌터카 영업용 플릿보험 기준</h3>
          <span className="ml-auto px-2 py-0.5 bg-white/20 rounded text-[10px] font-semibold">영업용 플릿</span>
        </div>
        <p className="text-xs text-white/80 leading-relaxed">
          렌터카 법인 플릿보험 기준 연간 보험료입니다. 개인보험 대비 30~45% 저렴하며,
          보유 대수가 많을수록 할인율이 높아집니다. 이 데이터가 렌트가 산출에 직접 반영됩니다.
        </p>
      </div>

      {/* 가이드 */}
      {showGuide && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">📋</span>
              <h3 className="text-xs font-bold text-gray-800">렌터카 영업용 보험 가이드</h3>
            </div>
            <button onClick={() => setShowGuide(false)} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* 기본 담보 구성 */}
            <div className="bg-steel-50 rounded-lg p-4 border border-steel-100">
              <p className="text-xs font-bold text-steel-800 mb-2">{FLEET_INSURANCE_GUIDE.coverage.title}</p>
              <div className="space-y-1.5">
                {FLEET_INSURANCE_GUIDE.coverage.items.map((item) => (
                  <div key={item.name} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] flex-shrink-0 ${item.required ? 'bg-steel-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                      {item.required ? '✓' : '△'}
                    </span>
                    <div>
                      <span className="font-semibold text-gray-800">{item.name}</span>
                      <span className="text-gray-500 ml-1">{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 플릿 할인 구조 */}
            <div className="bg-green-50 rounded-lg p-4 border border-green-100">
              <p className="text-xs font-bold text-green-800 mb-2">{FLEET_INSURANCE_GUIDE.fleetDiscount.title}</p>
              <div className="space-y-1.5">
                {FLEET_INSURANCE_GUIDE.fleetDiscount.tiers.map((tier) => (
                  <div key={tier.size} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700">{tier.size}</span>
                    <div className="text-right">
                      <span className="font-bold text-green-700">{tier.discount}</span>
                      <span className="text-gray-400 ml-1 text-[10px]">{tier.note}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-2 pt-2 border-t border-green-200">
                ※ 현재 기준표는 중소 렌터카(50~200대) 플릿 기준으로 설정되어 있습니다
              </p>
            </div>
          </div>

          {/* 업계 벤치마크 */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-600 mb-3">🏢 렌터카사 규모별 보험 기준</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {INDUSTRY_BENCHMARKS.map((b, i) => (
                <div key={i} className="bg-white rounded-lg p-3 border border-gray-100 text-xs">
                  <p className="font-bold text-gray-700 mb-1.5">{b.company}</p>
                  <p className="text-gray-500 mb-1">담보: {b.coverage}</p>
                  <p className="text-gray-500 mb-1">면책: {b.selfInsurance}</p>
                  <p className="text-gray-400 text-[10px]">{b.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 영업용 vs 개인 비교 (접이식) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <button
          onClick={() => setShowComparison(!showComparison)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition rounded-2xl"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">📊</span>
            <span className="text-xs font-bold text-gray-800">렌터카 플릿보험 vs 개인보험 비교</span>
          </div>
          <span className="text-gray-400 text-xs">{showComparison ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>
        {showComparison && (
          <div className="px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr className="border-b-2 border-steel-200 bg-steel-50">
                    <th className="text-left py-2 px-3 font-bold text-steel-800">항목</th>
                    <th className="text-center py-2 px-3 font-bold text-steel-700">렌터카 플릿보험</th>
                    <th className="text-center py-2 px-3 font-bold text-gray-400">개인보험 (참고)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {INSURANCE_COMPARISON.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2 px-3 font-semibold text-gray-800">{row.item}</td>
                      <td className="py-2 px-3 text-center text-steel-700 font-bold">{row.fleet}</td>
                      <td className="py-2 px-3 text-center text-gray-400">{row.personal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 보험료 기준표 (편집) */}
      <div className="bg-white rounded-2xl shadow-sm overflow-visible border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-gray-900">영업용 플릿보험료 기준표 (편집 가능)</h3>
              <p className="text-xs text-gray-400 mt-0.5">차종·차량가액별 연간 플릿보험료 — 렌트가 산출에 직접 반영</p>
            </div>
            <div className="flex gap-2">
              {!showGuide && (
                <button onClick={() => setShowGuide(true)} className="px-3 py-1.5 text-xs text-steel-600 bg-steel-50 rounded-lg hover:bg-steel-100">가이드</button>
              )}
              <button onClick={() => setShowAIPanel(!showAIPanel)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${showAIPanel ? 'bg-steel-900 text-white' : 'text-steel-600 bg-steel-100 hover:bg-steel-200'}`}>
                {showAIPanel ? '🔍 AI 검증 닫기' : '🔍 AI 검증'}
              </button>
              <button onClick={handleAddRow} className="px-3 py-1.5 bg-steel-600 text-white text-xs font-semibold rounded-lg hover:bg-steel-700">+ 행 추가</button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">차종</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">하한(만)</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">상한(만)</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">연보험료(플릿)</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">담보 구성</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">비고</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">삭제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">데이터가 없습니다.</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-steel-50/30 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {editingCell?.rowId === row.id && editingCell?.field === 'vehicle_type' ? (
                        <select value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-full px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none">
                          {VEHICLE_TYPES.map((type) => (<option key={type} value={type}>{type}</option>))}
                        </select>
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'vehicle_type', row.vehicle_type)}
                          className="cursor-pointer hover:bg-steel-50 px-2 py-1 rounded inline-block font-medium">{row.vehicle_type}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {editingCell?.rowId === row.id && editingCell?.field === 'value_min' ? (
                        <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-20 px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none text-center" placeholder="만원" />
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'value_min', row.value_min)}
                          className="cursor-pointer hover:bg-steel-50 px-2 py-1 rounded inline-block text-gray-700">{formatAmount(row.value_min)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {editingCell?.rowId === row.id && editingCell?.field === 'value_max' ? (
                        <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-20 px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none text-center" placeholder="만원" />
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'value_max', row.value_max)}
                          className="cursor-pointer hover:bg-steel-50 px-2 py-1 rounded inline-block text-gray-700">{formatAmount(row.value_max)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {editingCell?.rowId === row.id && editingCell?.field === 'annual_premium' ? (
                        <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-24 px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none text-center" />
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'annual_premium', row.annual_premium)}
                          className="cursor-pointer hover:bg-steel-50 px-2 py-1 rounded inline-block font-bold text-steel-700">{formatPremium(row.annual_premium)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingCell?.rowId === row.id && editingCell?.field === 'coverage_desc' ? (
                        <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-full px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none" />
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'coverage_desc', row.coverage_desc)}
                          className="cursor-pointer hover:bg-steel-50 px-2 py-1 rounded inline-block text-gray-600">{row.coverage_desc || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingCell?.rowId === row.id && editingCell?.field === 'notes' ? (
                        <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-full px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none" />
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'notes', row.notes)}
                          className="cursor-pointer hover:bg-steel-50 px-2 py-1 rounded inline-block text-gray-500">{row.notes || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => handleDeleteRow(row.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI 검증 패널 */}
      {showAIPanel && (
        <div className="bg-steel-900 rounded-2xl shadow-sm p-5 text-white">
          <h3 className="text-sm font-bold mb-1">렌터카 영업용 보험료 검증</h3>
          <p className="text-[10px] text-steel-400 mb-4">영업용 플릿보험 시장가를 조회하여 기준표 적정성을 확인합니다</p>

          <div className="mb-3">
            <label className="text-[10px] font-semibold text-steel-300 block mb-1.5">차종</label>
            <select value={selectedVehicleType} onChange={(e) => setSelectedVehicleType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-steel-800 border border-steel-700 text-white text-xs focus:outline-none focus:border-steel-500">
              <option value="">선택하세요</option>
              {VEHICLE_TYPES.map((type) => (<option key={type} value={type}>{type}</option>))}
            </select>
          </div>
          <div className="mb-3">
            <label className="text-[10px] font-semibold text-steel-300 block mb-1.5">차량가 (만원)</label>
            <input type="number" value={vehicleValue} onChange={(e) => setVehicleValue(e.target.value)} placeholder="예: 3000"
              className="w-full px-3 py-2 rounded-lg bg-steel-800 border border-steel-700 text-white text-xs focus:outline-none focus:border-steel-500 placeholder-steel-500" />
          </div>

          <button onClick={handleSearch} disabled={searching || !selectedVehicleType || !vehicleValue}
            className="w-full px-4 py-2.5 bg-steel-600 text-white font-semibold text-xs rounded-lg hover:bg-steel-500 disabled:bg-steel-800 disabled:cursor-not-allowed transition-colors mb-4">
            {searching ? '보험료 조회 중...' : '🔍 렌터카 플릿보험료 검증'}
          </button>

          {matchedPremium && (
            <div className="bg-steel-800 rounded-lg p-3 mb-3 border border-steel-700">
              <p className="text-[10px] font-semibold text-emerald-400 mb-1.5">현재 기준표 매칭</p>
              <div className="text-xs text-steel-300 space-y-1">
                <div className="flex justify-between">
                  <span>차종</span>
                  <span className="font-semibold text-white">{matchedPremium.vehicle_type}</span>
                </div>
                <div className="flex justify-between">
                  <span>차량가 구간</span>
                  <span className="text-white">{formatAmount(matchedPremium.value_min)} ~ {formatAmount(matchedPremium.value_max)}</span>
                </div>
                <div className="flex justify-between">
                  <span>연 보험료 (플릿)</span>
                  <span className="font-bold text-steel-300">{formatPremium(matchedPremium.annual_premium)}</span>
                </div>
                <div className="flex justify-between">
                  <span>월 환산</span>
                  <span className="font-bold text-steel-300">{formatPremium(Math.round(matchedPremium.annual_premium / 12))}/월</span>
                </div>
              </div>
            </div>
          )}

          {searchResults && (
            <div className="bg-steel-800 rounded-lg p-3 border border-steel-700">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-semibold text-steel-300">검증 결과</h4>
                <span className="text-[9px] text-steel-500">{searchResults.searched_at}</span>
              </div>
              <div className="text-xs text-steel-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {searchResults.results}
              </div>
              {searchResults.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-steel-700">
                  <h4 className="text-[10px] font-semibold text-steel-400 mb-1">출처</h4>
                  {searchResults.sources.map((source, idx) => (
                    <a key={idx} href={source} target="_blank" rel="noopener noreferrer"
                      className="text-steel-400 hover:text-steel-300 text-[10px] break-all underline block leading-snug">
                      {source.length > 60 ? source.substring(0, 60) + '...' : source}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
