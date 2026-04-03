'use client'

import { useEffect, useState } from 'react'
import { fetchPricingStandardsData, insertPricingStandardsRows, updatePricingStandardsRow, deletePricingStandardsRow, getAuthHeader } from '@/app/utils/pricing-standards'

interface MaintenanceRecord {
  id?: number
  vehicle_type: string
  fuel_type: string
  age_min: number
  age_max: number
  monthly_cost: number
  includes: string
  notes: string
}

interface SearchResult { results: string; sources: string[]; searched_at: string }

const VEHICLE_TYPES = ['국산 경차/소형', '국산 중형', '국산 대형/SUV', '수입차', '전기차', '하이브리드']
const FUEL_TYPES = ['내연기관', '전기', '하이브리드']

// 차종별 분류 기준 (사용자 검수용)
const CLASSIFICATION_INFO = [
  { type: '국산 경차/소형', desc: '모닝, 레이, 아반떼, 엑센트 등', costRange: '5~10만원/월', note: '부품비 저렴, 정비 수요 적음' },
  { type: '국산 중형', desc: '소나타, K5, 그랜저, K8 등', costRange: '8~15만원/월', note: '가장 일반적인 정비 수준' },
  { type: '국산 대형/SUV', desc: '투싼, 싼타페, 쏘렌토, GV70 등', costRange: '10~20만원/월', note: 'SUV는 타이어·브레이크 비용 높음' },
  { type: '수입차', desc: 'BMW, 벤츠, 아우디, 볼보 등', costRange: '20~40만원/월', note: '부품비 2~5배, 공임 1.5~2배' },
  { type: '전기차', desc: '테슬라, 아이오닉5, EV6, EV9 등', costRange: '3~8만원/월', note: '엔진오일·미션 정비 없음, 타이어 마모 빠름' },
  { type: '하이브리드', desc: '소나타HEV, 투싼HEV, RAV4HEV 등', costRange: '7~12만원/월', note: '내연기관 대비 브레이크 마모 적음' },
]

// 정비 항목별 주기 참고
const MAINTENANCE_ITEMS = [
  { item: '엔진오일 교환', cycle: '10,000km / 6개월', cost: '5~15만원', note: '내연기관 필수' },
  { item: '타이어 교체', cycle: '40,000km / 3년', cost: '40~120만원(4개)', note: '전기차는 전용 타이어' },
  { item: '브레이크 패드', cycle: '40,000km / 2년', cost: '15~30만원', note: '전기차는 회생제동으로 수명 김' },
  { item: '에어컨 필터', cycle: '15,000km / 1년', cost: '1~3만원', note: '전차종 동일' },
  { item: '와이퍼', cycle: '1년', cost: '2~5만원', note: '전차종 동일' },
  { item: '배터리(12V)', cycle: '3~5년', cost: '10~20만원', note: '고전압 배터리 별도' },
]

export default function MaintenanceTab() {
  const [rows, setRows] = useState<MaintenanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [searchVehicleType, setSearchVehicleType] = useState('')
  const [searchAge, setSearchAge] = useState(3)
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
  const [showGuide, setShowGuide] = useState(true)
  const [showAIPanel, setShowAIPanel] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const data = await fetchPricingStandardsData('maintenance_cost_table')
      setRows(data || [])
    } catch (err) { console.error('Error:', err) }
    finally { setLoading(false) }
  }

  const addRow = async () => {
    try {
      const newRow = { vehicle_type: VEHICLE_TYPES[0], fuel_type: FUEL_TYPES[0], age_min: 0, age_max: 5, monthly_cost: 0, includes: '', notes: '' }
      await insertPricingStandardsRows('maintenance_cost_table', [newRow])
      await fetchData()
    } catch (err) { console.error('Error:', err) }
  }

  const updateField = async (id: number | undefined, field: string, value: any) => {
    if (!id) return
    try {
      await updatePricingStandardsRow('maintenance_cost_table', String(id), { [field]: value })
      setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r))
    } catch (err) { console.error('Error:', err) }
  }

  const deleteRow = async (id: number | undefined) => {
    if (!id) return
    try {
      await deletePricingStandardsRow('maintenance_cost_table', String(id))
      setRows(rows.filter(r => r.id !== id))
    } catch (err) { console.error('Error:', err) }
  }

  const handleSearch = async () => {
    if (!searchVehicleType) return
    setSearching(true)
    try {
      const response = await fetch('/api/search-pricing-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'maintenance', context: { vehicle_type: searchVehicleType, age: searchAge } })
      })
      if (!response.ok) throw new Error('검색 실패')
      const data = await response.json()
      setSearchResults(data)
    } catch (err) { console.error('Error:', err) }
    finally { setSearching(false) }
  }

  const formatCurrency = (value: number) => new Intl.NumberFormat('ko-KR').format(value)

  if (loading) {
    return <div className="bg-white rounded-2xl shadow-sm p-8 text-center"><p className="text-gray-500">로딩 중...</p></div>
  }

  return (
    <div className="space-y-4">
      {showGuide && (
        <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-2xl p-5 border border-teal-100">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔧</span>
              <h3 className="text-sm font-bold text-gray-800">정비비 기준이란?</h3>
            </div>
            <button onClick={() => setShowGuide(false)} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600 leading-relaxed">
            <div>
              <p className="font-semibold text-gray-700 mb-1">개념</p>
              <p>렌터카 운영 중 발생하는 정기 정비·소모품 교체·돌발 수리비를 월 단위로 평균한 값입니다. 차종·연식에 따라 크게 다르며, 렌트료의 10~15%를 차지합니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">산출 방식</p>
              <p>대형사는 과거 정비 이력 빅데이터로 차종·연식별 평균 정비비를 산출합니다. 소규모 업체는 업계 평균을 참고하되, 수입차·고연식 차량은 별도 관리가 필요합니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">주의사항</p>
              <p>전기차는 엔진오일·미션 정비가 없어 내연기관 대비 40~60% 저렴합니다. 다만 타이어 마모가 빠르고, 고전압 배터리 이슈 시 고비용이 발생할 수 있습니다.</p>
            </div>
          </div>
        </div>
      )}

      {/* 차종 분류 기준 + 정비 항목 참고 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">📋</span>
            <h3 className="text-xs font-bold text-gray-700">차종 분류 기준 (정비비 적용 기준)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">분류</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">해당 차종</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">비용 범위</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">특이사항</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {CLASSIFICATION_INFO.map((info) => (
                  <tr key={info.type} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 font-semibold text-gray-800">{info.type}</td>
                    <td className="px-3 py-2 text-gray-500">{info.desc}</td>
                    <td className="px-3 py-2 text-center font-medium text-steel-600">{info.costRange}</td>
                    <td className="px-3 py-2 text-gray-500">{info.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">🛠️</span>
            <h3 className="text-xs font-bold text-gray-700">주요 정비 항목 및 주기 참고</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">항목</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">교체주기</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">비용</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">참고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {MAINTENANCE_ITEMS.map((item) => (
                  <tr key={item.item} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 font-medium text-gray-800">{item.item}</td>
                    <td className="px-3 py-2 text-gray-600">{item.cycle}</td>
                    <td className="px-3 py-2 text-center text-gray-700">{item.cost}</td>
                    <td className="px-3 py-2 text-gray-500">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Full-width table section */}
      <div className="bg-white rounded-2xl shadow-sm overflow-visible border border-gray-100">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900">정비비 기준표 (편집 가능)</h3>
            <p className="text-xs text-gray-400 mt-0.5">차종별·연료별·연식별 월 정비비 기준</p>
          </div>
          <div className="flex gap-2">
            {!showGuide && <button onClick={() => setShowGuide(true)} className="px-3 py-1.5 text-xs text-steel-600 bg-steel-50 rounded-lg hover:bg-steel-100">가이드 💡</button>}
            <button onClick={() => setShowAIPanel(!showAIPanel)} 
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${showAIPanel ? 'bg-slate-900 text-white' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'}`}>
              {showAIPanel ? '🔍 AI 검증 닫기' : '🔍 AI 검증'}
            </button>
            <button onClick={addRow} className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800">+ 행 추가</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">차종</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">연료</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">연식~</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">~연식</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">월정비비</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">포함</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">비고</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">삭제</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">데이터가 없습니다.</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/30 transition">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {editingId === row.id && editingField === 'vehicle_type' ? (
                        <select value={row.vehicle_type} onChange={(e) => { updateField(row.id, 'vehicle_type', e.target.value); setEditingId(null); setEditingField(null) }} autoFocus
                          className="w-full px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none">
                          {VEHICLE_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
                        </select>
                      ) : (
                        <span onClick={() => { setEditingId(row.id || null); setEditingField('vehicle_type') }}
                          className="cursor-pointer text-gray-800 hover:text-gray-600 font-medium inline-block">{row.vehicle_type}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {editingId === row.id && editingField === 'fuel_type' ? (
                        <select value={row.fuel_type} onChange={(e) => { updateField(row.id, 'fuel_type', e.target.value); setEditingId(null); setEditingField(null) }} autoFocus
                          className="w-full px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none">
                          {FUEL_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
                        </select>
                      ) : (
                        <span onClick={() => { setEditingId(row.id || null); setEditingField('fuel_type') }}
                          className="cursor-pointer text-gray-700 hover:text-gray-600 inline-block">{row.fuel_type}</span>
                      )}
                    </td>
                    {(['age_min', 'age_max'] as const).map(field => (
                      <td key={field} className="px-3 py-2 text-center">
                        {editingId === row.id && editingField === field ? (
                          <input type="number" value={row[field]} onChange={(e) => updateField(row.id, field, parseInt(e.target.value) || 0)}
                            onBlur={() => { setEditingId(null); setEditingField(null) }} autoFocus
                            className="w-14 px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none text-center" />
                        ) : (
                          <span onClick={() => { setEditingId(row.id || null); setEditingField(field) }}
                            className="cursor-pointer text-gray-700 hover:text-gray-600 inline-block">{row[field]}년</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      {editingId === row.id && editingField === 'monthly_cost' ? (
                        <input type="number" value={row.monthly_cost} onChange={(e) => updateField(row.id, 'monthly_cost', parseInt(e.target.value) || 0)}
                          onBlur={() => { setEditingId(null); setEditingField(null) }} autoFocus
                          className="w-20 px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none text-center" />
                      ) : (
                        <span onClick={() => { setEditingId(row.id || null); setEditingField('monthly_cost') }}
                          className="cursor-pointer font-bold text-steel-600 hover:text-steel-700 inline-block">{formatCurrency(row.monthly_cost)}원</span>
                      )}
                    </td>
                    {(['includes', 'notes'] as const).map(field => (
                      <td key={field} className="px-3 py-2">
                        {editingId === row.id && editingField === field ? (
                          <input type="text" value={row[field]} onChange={(e) => updateField(row.id, field, e.target.value)}
                            onBlur={() => { setEditingId(null); setEditingField(null) }} autoFocus
                            className="w-full px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none" />
                        ) : (
                          <span onClick={() => { setEditingId(row.id || null); setEditingField(field) }}
                            className="cursor-pointer text-gray-500 hover:text-gray-600 inline-block">{row[field] || '—'}</span>
                        )}
                      </td>
                    ))}
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

      {/* AI Panel - Collapsible */}
      {showAIPanel && (
        <div className="bg-slate-900 rounded-2xl shadow-sm p-5 text-white">
          <h3 className="text-sm font-bold mb-1">실시간 정비비 검증</h3>
          <p className="text-[10px] text-slate-400 mb-4">시장 정비비 기준을 조회하여 기준표와 비교합니다</p>

          <div className="space-y-3 mb-4">
            <div>
              <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">차종</label>
              <select value={searchVehicleType} onChange={(e) => setSearchVehicleType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-steel-500">
                <option value="">선택하세요</option>
                {VEHICLE_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">차량 연식 (년차)</label>
              <input type="number" value={searchAge} onChange={(e) => setSearchAge(parseInt(e.target.value) || 1)} min="1"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-steel-500" />
            </div>
          </div>

          {/* 현재 기준표 매칭 */}
          {searchVehicleType && (() => {
            const matched = rows.find(r => r.vehicle_type === searchVehicleType && searchAge >= r.age_min && searchAge <= r.age_max)
            return matched ? (
              <div className="bg-slate-800 rounded-lg p-3 mb-3 border border-slate-700">
                <p className="text-[10px] font-semibold text-emerald-400 mb-1.5">현재 기준표 매칭</p>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-slate-400">차종</span><span className="text-white">{matched.vehicle_type}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">연식 범위</span><span className="text-white">{matched.age_min}~{matched.age_max}년</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">월 정비비</span><span className="font-bold text-steel-400">{formatCurrency(matched.monthly_cost)}원</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">연 환산</span><span className="text-slate-300">{formatCurrency(matched.monthly_cost * 12)}원</span></div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800 rounded-lg p-3 mb-3 border border-amber-600/50 text-xs text-amber-400">
                해당 조건에 맞는 기준표가 없습니다. 행을 추가해주세요.
              </div>
            )
          })()}

          <button onClick={handleSearch} disabled={searching || !searchVehicleType}
            className="w-full px-4 py-2.5 bg-steel-600 text-white font-semibold text-xs rounded-lg hover:bg-steel-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors mb-4">
            {searching ? '시장 데이터 조회 중...' : '🔍 실시간 정비비 검증'}
          </button>

          {searchResults && (
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-semibold text-slate-300">Gemini 검증 결과</h4>
                <span className="text-[9px] text-slate-500">{searchResults.searched_at}</span>
              </div>
              <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {searchResults.results}
              </div>
              {searchResults.sources?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-700">
                  <p className="text-[10px] text-slate-400 mb-1">출처:</p>
                  {searchResults.sources.map((s, i) => (
                    <a key={i} href={s} target="_blank" rel="noopener noreferrer" className="text-slate-400 text-[10px] underline block truncate">{s}</a>
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
