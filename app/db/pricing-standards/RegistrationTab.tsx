'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface RegistrationCost {
  id: string
  cost_type: string
  vehicle_category: string
  region: string
  rate: number
  fixed_amount: number
  description: string
  notes: string
}

interface SearchResult { results: string; sources: string[]; searched_at: string }

const COST_TYPES = ['취득세', '공채매입', '공채할인', '탁송료', '번호판', '인지세', '대행료', '검사비'] as const
const VEHICLE_CATEGORIES = ['승용', '승합', '화물', '전기차'] as const
const REGIONS = ['서울', '경기', '기타', '전국'] as const

const COST_TYPE_COLORS: Record<string, string> = {
  '취득세': 'bg-blue-50 border-blue-200', '공채매입': 'bg-indigo-50 border-indigo-200',
  '공채할인': 'bg-purple-50 border-purple-200', '탁송료': 'bg-pink-50 border-pink-200',
  '번호판': 'bg-rose-50 border-rose-200', '인지세': 'bg-orange-50 border-orange-200',
  '대행료': 'bg-amber-50 border-amber-200', '검사비': 'bg-yellow-50 border-yellow-200',
}

// 등록비 분류 기준 상세 (사용자 검수용)
const REGISTRATION_GUIDE = [
  { type: '취득세', legalBasis: '지방세법 제12조', desc: '차량 취득 시 부과되는 지방세', rate: '승용 7%, 승합/화물 5%, 전기차 4% (감면)', example: '3천만원 승용차 → 210만원' },
  { type: '공채매입', legalBasis: '지방재정법', desc: '지역 공채(지역개발공채) 의무 매입', rate: '서울 12~20%, 경기 4~10%, 기타 2~5%', example: '서울 3천만원 → 공채 360~600만원 매입' },
  { type: '공채할인', legalBasis: '관행', desc: '공채 즉시 매도 시 할인율', rate: '약 3~7% 할인매도', example: '공채 500만원 → 할인매도 15~35만원 비용' },
  { type: '탁송료', legalBasis: '계약', desc: '출고지→등록지 차량 운송비', rate: '거리에 따라 다름', example: '서울~부산 약 30~50만원' },
  { type: '번호판', legalBasis: '자동차관리법', desc: '자동차 등록번호판 제작·부착', rate: '고정비', example: '약 1.5~3만원' },
  { type: '인지세', legalBasis: '인지세법', desc: '등록 문서 인지세', rate: '고정비', example: '약 3천원' },
  { type: '대행료', legalBasis: '계약', desc: '등록 대행업체 수수료', rate: '고정비', example: '약 3~10만원' },
  { type: '검사비', legalBasis: '자동차관리법', desc: '신규검사·이전등록검사 비용', rate: '고정비', example: '약 3~5만원' },
]

// 지역별 공채매입률 비교
const BOND_RATES_BY_REGION = [
  { region: '서울', nonBiz: '12~20%', biz: '6~10%', note: '전국 최고, 차량가에 비례' },
  { region: '경기', nonBiz: '4~10%', biz: '3~5%', note: '서울 대비 절반 수준' },
  { region: '기타 광역시', nonBiz: '3~8%', biz: '2~4%', note: '부산·대구·인천 등' },
  { region: '그 외 지역', nonBiz: '2~5%', biz: '1~3%', note: '소규모 지자체' },
]

export default function RegistrationTab() {
  const supabase = createClientComponentClient()
  const [rows, setRows] = useState<RegistrationCost[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [vehiclePrice, setVehiclePrice] = useState(30000000)
  const [showGuide, setShowGuide] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.from('registration_cost_table').select('*').order('cost_type')
      if (error) throw error
      setRows(data || [])
    } catch (error) { console.error('Error:', error) }
    finally { setLoading(false) }
  }

  const handleAddRow = async () => {
    try {
      const newRow = { cost_type: '취득세', vehicle_category: '승용', region: '서울', rate: 0, fixed_amount: 0, description: '', notes: '' }
      const { data, error } = await supabase.from('registration_cost_table').insert([newRow]).select()
      if (error) throw error
      if (data) setRows([...rows, data[0]])
    } catch (error) { console.error('Error:', error) }
  }

  const handleDeleteRow = async (id: string) => {
    try {
      const { error } = await supabase.from('registration_cost_table').delete().eq('id', id)
      if (error) throw error
      setRows(rows.filter(r => r.id !== id))
    } catch (error) { console.error('Error:', error) }
  }

  const handleUpdateField = async (id: string, field: keyof RegistrationCost, value: any) => {
    try {
      const { error } = await supabase.from('registration_cost_table').update({ [field]: value }).eq('id', id)
      if (error) throw error
      setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r))
    } catch (error) { console.error('Error:', error) }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    try {
      setSearchLoading(true)
      const response = await fetch('/api/search-pricing-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'registration', query: searchQuery, context: { current_data: rows } }),
      })
      if (!response.ok) throw new Error('검색 실패')
      const data = await response.json()
      setSearchResults(data)
    } catch (error) { console.error('Error:', error) }
    finally { setSearchLoading(false) }
  }

  const calculateTotal = () => {
    let total = 0
    rows.forEach(r => {
      if (r.vehicle_category === '승용' && r.region === '서울') {
        total += Math.round(vehiclePrice * (r.rate / 100)) + r.fixed_amount
      }
    })
    return total
  }

  const groupedByCostType = COST_TYPES.reduce((acc, ct) => {
    acc[ct] = rows.filter(r => r.cost_type === ct)
    return acc
  }, {} as Record<string, RegistrationCost[]>)

  if (loading) {
    return <div className="bg-white rounded-2xl shadow-sm p-8 text-center"><p className="text-gray-500">로딩 중...</p></div>
  }

  return (
    <div className="space-y-4">
      {showGuide && (
        <div className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-2xl p-5 border border-pink-100">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <h3 className="text-sm font-bold text-gray-800">등록비용 기준이란?</h3>
            </div>
            <button onClick={() => setShowGuide(false)} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600 leading-relaxed">
            <div>
              <p className="font-semibold text-gray-700 mb-1">개념</p>
              <p>차량 등록 시 1회성으로 발생하는 비용입니다. 취득세·공채매입이 가장 크며, 이 비용을 계약월수로 나눠 월 렌트료에 포함합니다. 렌트료의 5~10%를 차지합니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">핵심: 지역별 공채 차이</p>
              <p><strong className="text-red-600">서울은 공채 매입률이 전국 최고</strong>입니다. 같은 차량이라도 서울 등록 시 수백만원 더 발생합니다. 등록 지역 선택이 렌트료에 직접 영향을 줍니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">대형사 비교</p>
              <p>롯데렌탈·SK렌터카는 공채할인 특별조건(할인율 낮음)으로 비용을 절감합니다. 소규모 업체는 할인율이 더 높아(5~7%) 실질 비용이 큽니다.</p>
            </div>
          </div>
        </div>
      )}

      {/* 등록비 항목별 상세 기준 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚖️</span>
            <h3 className="text-xs font-bold text-gray-700">등록비 항목별 법적 근거 (검수용)</h3>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {REGISTRATION_GUIDE.map((item) => (
            <div key={item.type} className={`rounded-lg p-3 border ${COST_TYPE_COLORS[item.type] || 'bg-gray-50 border-gray-200'}`}>
              <p className="text-xs font-bold text-gray-800 mb-0.5">{item.type}</p>
              <p className="text-[10px] text-gray-500 mb-1.5">{item.legalBasis}</p>
              <p className="text-[11px] text-gray-600 mb-1">{item.desc}</p>
              <p className="text-[11px] font-semibold text-gray-700">{item.rate}</p>
              <p className="text-[10px] text-gray-400 mt-1">{item.example}</p>
            </div>
          ))}
        </div>

        {/* 지역별 공채 비교 */}
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-3">지역별 공채매입률 비교</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-semibold text-gray-600 min-w-[80px]">지역</th>
                  <th className="text-center py-2 px-3 font-semibold text-gray-600 min-w-[90px]">비영업용</th>
                  <th className="text-center py-2 px-3 font-semibold text-gray-600 min-w-[90px]">영업용(렌터카)</th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-600 min-w-[120px]">참고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {BOND_RATES_BY_REGION.map((b) => (
                  <tr key={b.region} className="hover:bg-white/50">
                    <td className="py-2 px-3 font-medium text-gray-800">{b.region}</td>
                    <td className="py-2 px-3 text-center text-orange-600 font-semibold">{b.nonBiz}</td>
                    <td className="py-2 px-3 text-center text-blue-600 font-semibold">{b.biz}</td>
                    <td className="py-2 px-3 text-gray-500">{b.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">등록비용 기준표 (편집 가능)</h3>
                <p className="text-xs text-gray-400 mt-0.5">비용유형·차종·지역별 요율 및 고정금액 관리</p>
              </div>
              <div className="flex gap-2">
                {!showGuide && <button onClick={() => setShowGuide(true)} className="px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">가이드</button>}
                <button onClick={handleAddRow} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">+ 행 추가</button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {Object.entries(groupedByCostType).map(([costType, typeRows]) => (
                typeRows.length > 0 && (
                  <div key={costType} className={`rounded-xl p-4 border ${COST_TYPE_COLORS[costType] || 'bg-gray-50 border-gray-200'}`}>
                    <div className="text-xs font-bold text-gray-700 mb-3">{costType}</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200/50">
                            <th className="text-left py-2 px-2 text-gray-600 font-medium min-w-[60px]">차종</th>
                            <th className="text-left py-2 px-2 text-gray-600 font-medium min-w-[60px]">지역</th>
                            <th className="text-center py-2 px-2 text-gray-600 font-medium min-w-[60px]">요율(%)</th>
                            <th className="text-center py-2 px-2 text-gray-600 font-medium min-w-[80px]">고정금액</th>
                            <th className="text-left py-2 px-2 text-gray-600 font-medium min-w-[80px]">설명</th>
                            <th className="text-left py-2 px-2 text-gray-600 font-medium min-w-[70px]">비고</th>
                            <th className="text-center py-2 px-2 text-gray-600 font-medium w-[40px]">삭제</th>
                          </tr>
                        </thead>
                        <tbody>
                          {typeRows.map((row) => (
                            <tr key={row.id} className="border-b border-gray-200/30 hover:bg-white/50">
                              <td className="py-2 px-2">
                                <select value={row.vehicle_category} onChange={(e) => handleUpdateField(row.id, 'vehicle_category', e.target.value)}
                                  className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:border-blue-400 focus:outline-none">{VEHICLE_CATEGORIES.map(c => (<option key={c} value={c}>{c}</option>))}</select>
                              </td>
                              <td className="py-2 px-2">
                                <select value={row.region} onChange={(e) => handleUpdateField(row.id, 'region', e.target.value)}
                                  className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:border-blue-400 focus:outline-none">{REGIONS.map(r => (<option key={r} value={r}>{r}</option>))}</select>
                              </td>
                              <td className="py-2 px-2">
                                <input type="number" step="0.01" value={row.rate} onChange={(e) => handleUpdateField(row.id, 'rate', parseFloat(e.target.value))}
                                  className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded text-center font-semibold focus:border-blue-400 focus:outline-none" />
                              </td>
                              <td className="py-2 px-2">
                                <input type="number" value={row.fixed_amount} onChange={(e) => handleUpdateField(row.id, 'fixed_amount', parseInt(e.target.value))}
                                  className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded text-center focus:border-blue-400 focus:outline-none" />
                              </td>
                              <td className="py-2 px-2">
                                <input type="text" value={row.description} onChange={(e) => handleUpdateField(row.id, 'description', e.target.value)}
                                  className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:border-blue-400 focus:outline-none" />
                              </td>
                              <td className="py-2 px-2">
                                <input type="text" value={row.notes} onChange={(e) => handleUpdateField(row.id, 'notes', e.target.value)}
                                  className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:border-blue-400 focus:outline-none" />
                              </td>
                              <td className="py-2 px-2 text-center">
                                <button onClick={() => handleDeleteRow(row.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              ))}
            </div>

            {/* 총 등록비 시뮬레이션 */}
            <div className="p-5 border-t border-gray-100 bg-blue-50">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-blue-900">총 등록비 시뮬레이션 (서울 · 승용 기준)</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">차량가:</span>
                  <input type="number" value={vehiclePrice} onChange={(e) => setVehiclePrice(parseInt(e.target.value) || 0)}
                    className="px-2 py-1 text-xs border border-blue-200 rounded w-28" />
                  <span className="text-xs text-gray-600">원</span>
                </div>
              </div>
              <div className="text-xs text-gray-700">
                {(vehiclePrice / 10000).toLocaleString()}만원 차량 → 예상 등록비 합계:
                <span className="font-bold text-blue-700 text-sm ml-2">{calculateTotal().toLocaleString()}원</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="bg-slate-900 rounded-2xl shadow-sm p-5 text-white sticky top-32">
            <h3 className="text-sm font-bold mb-1">실시간 등록비 검증</h3>
            <p className="text-[10px] text-slate-400 mb-4">최신 취득세율·공채율·수수료를 검색합니다</p>

            <textarea value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="예: 서울 승용차 취득세율 2025, 경기도 공채매입률..."
              className="w-full px-3 py-2.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none h-16 mb-3" />

            <button onClick={handleSearch} disabled={searchLoading || !searchQuery.trim()}
              className="w-full px-4 py-2.5 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors mb-4">
              {searchLoading ? '조회 중...' : '실시간 등록비 검증'}
            </button>

            {searchResults && (
              <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] font-semibold text-blue-300">Gemini 검증 결과</h4>
                  <span className="text-[9px] text-slate-500">{searchResults.searched_at}</span>
                </div>
                <div className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{searchResults.results}</div>
                {searchResults.sources?.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-700">
                    <p className="text-[10px] text-slate-400 mb-1">출처:</p>
                    {searchResults.sources.map((s, i) => (
                      <a key={i} href={s} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-[10px] underline block truncate">{s}</a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
