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
const VEHICLE_CATEGORIES = ['영업용', '영업용 승합', '영업용 화물', '영업용 전기', '영업용 중형', '영업용 소형'] as const
const REGIONS = ['서울', '부산', '대구', '인천', '경기', '기타', '전국'] as const

const COST_TYPE_COLORS: Record<string, string> = {
  '취득세': 'bg-steel-50 border-steel-200', '공채매입': 'bg-steel-50 border-steel-200',
  '공채할인': 'bg-purple-50 border-purple-200', '탁송료': 'bg-pink-50 border-pink-200',
  '번호판': 'bg-rose-50 border-rose-200', '인지세': 'bg-orange-50 border-orange-200',
  '대행료': 'bg-amber-50 border-amber-200', '검사비': 'bg-yellow-50 border-yellow-200',
}

// 영업용(렌터카) vs 비영업용(일반) 비교 가이드
const BUSINESS_VS_GENERAL = [
  {
    item: '취득세',
    biz: '4% (승용)',
    general: '7% (승용)',
    diff: '3%p 절감',
    note: '렌터카=자동차대여업, 영업용 등록 시 4% 적용 (지방세법 §12①②)',
  },
  {
    item: '공채매입 (서울)',
    biz: '2000cc↑ 8%, 1600~2000cc 5%',
    general: '2000cc↑ 20%, 1600~2000cc 12%',
    diff: '절반 이하',
    note: '도시철도채권, 비영업 대비 대폭 감면',
  },
  {
    item: '공채매입 (부산/대구)',
    biz: '2000cc↑ 4%, 1600~2000cc 2%',
    general: '2000cc↑ 8~12%, 1600~2000cc 5~8%',
    diff: '절반 이하',
    note: '도시철도채권, 영업용 감면',
  },
  {
    item: '공채매입 (기타지역)',
    biz: '면제 (0%)',
    general: '2~5%',
    diff: '전액 면제',
    note: '지역개발채권 지역은 영업용 전차종 공채 면제!',
  },
  {
    item: '자동차세',
    biz: '18~19원/cc',
    general: '80~200원/cc',
    diff: '1/4~1/10',
    note: '영업용 자동차세 = 비영업용의 약 10~25% 수준',
  },
  {
    item: '경차 취득세',
    biz: '75만원까지 면제',
    general: '75만원까지 면제',
    diff: '동일',
    note: '지방세특례제한법 §75, 영업·비영업 동일 적용',
  },
]

// 등록비 항목 상세 (영업용 기준)
const REGISTRATION_GUIDE = [
  { type: '취득세', legalBasis: '지방세법 §12①②', desc: '영업용 승용 4%, 승합/화물 5%', rate: '4~5%', example: '3천만원 → 120만원 (비영업이면 210만원)' },
  { type: '공채매입', legalBasis: '지방재정법/도시철도법', desc: '서울·부산·대구만 의무 매입, 기타 지역 면제', rate: '0~8%', example: '서울 2000cc↑ 3천만원 → 공채 240만원' },
  { type: '공채할인', legalBasis: '관행', desc: '매입 즉시 매도(할인매도), 실비용은 액면의 4~8%', rate: '할인율 ~6%', example: '공채 240만원 → 실부담 약 14만원' },
  { type: '탁송료', legalBasis: '계약', desc: '출고지→등록지 운송비, 인근은 0원', rate: '고정비', example: '서울~부산 약 30~50만원' },
  { type: '번호판', legalBasis: '자동차관리법', desc: '영업용 "허" 번호판 교부', rate: '고정비', example: '약 1.2만원' },
  { type: '인지세', legalBasis: '인지세법', desc: '등록 문서 인지세', rate: '고정비', example: '약 1.5만원' },
  { type: '대행료', legalBasis: '계약', desc: '등록 대행 수수료, 직접 등록 시 불필요', rate: '고정비', example: '약 3~10만원, 대량 등록 시 할인' },
  { type: '검사비', legalBasis: '자동차관리법', desc: '신규검사 비용', rate: '고정비', example: '약 4만원' },
]

export default function RegistrationTab() {
  const supabase = createClientComponentClient()
  const [rows, setRows] = useState<RegistrationCost[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [vehiclePrice, setVehiclePrice] = useState(30000000)
  const [simCC, setSimCC] = useState(2000)
  const [simRegion, setSimRegion] = useState('서울')
  const [showGuide, setShowGuide] = useState(true)
  const [showComparison, setShowComparison] = useState(false)
  const [showAIPanel, setShowAIPanel] = useState(false)

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
      const newRow = { cost_type: '취득세', vehicle_category: '영업용', region: '서울', rate: 0, fixed_amount: 0, description: '', notes: '' }
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

  // 영업용 시뮬레이션 계산 (지역 + 배기량 기반)
  const calculateTotal = () => {
    let total = 0

    // 취득세
    const taxRecord = rows.find(r => r.cost_type === '취득세' && r.vehicle_category === '영업용')
    const taxRate = taxRecord ? Number(taxRecord.rate) : 4
    total += Math.round(vehiclePrice * taxRate / 100)

    // 공채매입 (배기량 기반 카테고리)
    const bondCategory = simCC >= 2000 ? '영업용' : simCC >= 1600 ? '영업용 중형' : '영업용 소형'
    let bondRecord = rows.find(r => r.cost_type === '공채매입' && r.region === simRegion && r.vehicle_category === bondCategory)
    if (!bondRecord) bondRecord = rows.find(r => r.cost_type === '공채매입' && r.region === simRegion && r.vehicle_category === '영업용')
    if (!bondRecord) bondRecord = rows.find(r => r.cost_type === '공채매입' && r.region === '기타' && r.vehicle_category === '영업용')
    const bondRate = bondRecord ? Number(bondRecord.rate) : 0
    const bondGross = Math.round(vehiclePrice * bondRate / 100)
    // 공채할인
    const discountRecord = rows.find(r => r.cost_type === '공채할인')
    const discountRate = discountRecord ? Number(discountRecord.rate) / 100 : 0.06
    const bondNet = bondRate > 0 ? Math.round(bondGross * (1 - discountRate)) : 0
    total += bondNet

    // 고정비용
    const fixedTypes = ['탁송료', '번호판', '인지세', '대행료', '검사비']
    fixedTypes.forEach(ft => {
      const rec = rows.find(r => r.cost_type === ft)
      if (rec) total += rec.fixed_amount || 0
    })

    return { total, taxAmt: Math.round(vehiclePrice * taxRate / 100), bondGross, bondNet, bondRate }
  }

  const groupedByCostType = COST_TYPES.reduce((acc, ct) => {
    acc[ct] = rows.filter(r => r.cost_type === ct)
    return acc
  }, {} as Record<string, RegistrationCost[]>)

  if (loading) {
    return <div className="bg-white rounded-2xl shadow-sm p-8 text-center"><p className="text-gray-500">로딩 중...</p></div>
  }

  const sim = calculateTotal()

  return (
    <div className="space-y-4">
      {/* 영업용 전용 안내 배너 */}
      <div className="bg-gradient-to-r from-steel-600 to-steel-800 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🚗</span>
          <h3 className="text-sm font-bold">렌터카 영업용 등록비 관리</h3>
          <span className="ml-auto px-2 py-0.5 bg-white/20 rounded text-[10px] font-semibold">영업용 전용</span>
        </div>
        <p className="text-xs text-white/80 leading-relaxed">
          이 데이터는 렌트가 산출(RentPricingBuilder)에 직접 연동됩니다.
          취득세·공채매입·부대비용 수정 시 견적 산출에 즉시 반영됩니다.
        </p>
      </div>

      {/* 영업용 vs 비영업용 비교 가이드 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <button
          onClick={() => setShowComparison(!showComparison)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition rounded-2xl"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">📊</span>
            <span className="text-xs font-bold text-gray-800">영업용(렌터카) vs 비영업용(일반) 비교 가이드</span>
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
                    <th className="text-center py-2 px-3 font-bold text-steel-700">영업용 (렌터카)</th>
                    <th className="text-center py-2 px-3 font-bold text-gray-500">비영업용 (일반)</th>
                    <th className="text-center py-2 px-3 font-bold text-green-700">차이</th>
                    <th className="text-left py-2 px-3 font-bold text-gray-500">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {BUSINESS_VS_GENERAL.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2 px-3 font-semibold text-gray-800">{row.item}</td>
                      <td className="py-2 px-3 text-center text-steel-700 font-bold">{row.biz}</td>
                      <td className="py-2 px-3 text-center text-gray-400 line-through">{row.general}</td>
                      <td className="py-2 px-3 text-center text-green-600 font-bold">{row.diff}</td>
                      <td className="py-2 px-3 text-gray-500">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800">
                <strong>핵심 요약:</strong> 렌터카(자동차대여업)는 영업용으로 등록하므로 취득세 4% (일반 7%), 공채 대폭 감면, 자동차세 1/4~1/10 수준입니다.
                서울·부산·대구 외 지역은 공채매입 자체가 면제되어 등록비가 크게 절감됩니다.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 항목별 상세 기준 (영업용) */}
      {showGuide && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">⚖️</span>
              <h3 className="text-xs font-bold text-gray-700">등록비 항목별 기준 (영업용)</h3>
            </div>
            <button onClick={() => setShowGuide(false)} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {REGISTRATION_GUIDE.map((item) => (
              <div key={item.type} className={`rounded-lg p-3 border ${COST_TYPE_COLORS[item.type] || 'bg-gray-50 border-gray-200'}`}>
                <p className="text-xs font-bold text-gray-800 mb-0.5">{item.type}</p>
                <p className="text-[10px] text-gray-500 mb-1.5">{item.legalBasis}</p>
                <p className="text-xs text-gray-600 mb-1">{item.desc}</p>
                <p className="text-xs font-semibold text-gray-700">{item.rate}</p>
                <p className="text-[10px] text-gray-400 mt-1">{item.example}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 편집 가능한 기준표 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-visible border border-gray-100">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900">영업용 등록비용 기준표 (편집 가능)</h3>
            <p className="text-xs text-gray-400 mt-0.5">이 데이터가 렌트가 산출에 직접 반영됩니다 — 수정 시 즉시 적용</p>
          </div>
          <div className="flex gap-2">
            {!showGuide && <button onClick={() => setShowGuide(true)} className="px-3 py-1.5 text-xs text-steel-600 bg-steel-50 rounded-lg hover:bg-steel-100">가이드</button>}
            <button onClick={() => setShowAIPanel(!showAIPanel)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${showAIPanel ? 'bg-steel-900 text-white' : 'text-steel-600 bg-steel-100 hover:bg-steel-200'}`}>
              {showAIPanel ? '🔍 AI 검증 닫기' : '🔍 AI 검증'}
            </button>
            <button onClick={handleAddRow} className="px-3 py-1.5 bg-steel-600 text-white text-xs font-semibold rounded-lg hover:bg-steel-700">+ 행 추가</button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {Object.entries(groupedByCostType).map(([costType, typeRows]) => (
            typeRows.length > 0 && (
              <div key={costType} className={`rounded-xl p-4 border ${COST_TYPE_COLORS[costType] || 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-xs font-bold text-gray-700">{costType}</div>
                  <span className="text-[10px] text-gray-400">({typeRows.length}건)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="text-xs">
                    <thead>
                      <tr className="border-b border-gray-200/50">
                        <th className="text-left py-1.5 px-2 text-gray-600 font-medium whitespace-nowrap">차종 카테고리</th>
                        <th className="text-left py-1.5 px-2 text-gray-600 font-medium whitespace-nowrap">지역</th>
                        <th className="text-center py-1.5 px-2 text-gray-600 font-medium whitespace-nowrap">요율(%)</th>
                        <th className="text-center py-1.5 px-2 text-gray-600 font-medium whitespace-nowrap">고정액</th>
                        <th className="text-left py-1.5 px-2 text-gray-600 font-medium whitespace-nowrap">설명</th>
                        <th className="text-left py-1.5 px-2 text-gray-600 font-medium whitespace-nowrap">비고</th>
                        <th className="text-center py-1.5 px-2 text-gray-600 font-medium whitespace-nowrap">삭제</th>
                      </tr>
                    </thead>
                    <tbody>
                      {typeRows.map((row) => (
                        <tr key={row.id} className="border-b border-gray-200/30 hover:bg-white/50">
                          <td className="py-1.5 px-2 whitespace-nowrap">
                            <select value={row.vehicle_category} onChange={(e) => handleUpdateField(row.id, 'vehicle_category', e.target.value)}
                              className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:border-steel-400 focus:outline-none">{VEHICLE_CATEGORIES.map(c => (<option key={c} value={c}>{c}</option>))}</select>
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap">
                            <select value={row.region} onChange={(e) => handleUpdateField(row.id, 'region', e.target.value)}
                              className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:border-steel-400 focus:outline-none">{REGIONS.map(r => (<option key={r} value={r}>{r}</option>))}</select>
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" step="0.01" value={row.rate} onChange={(e) => handleUpdateField(row.id, 'rate', parseFloat(e.target.value))}
                              className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded text-center font-semibold focus:border-steel-400 focus:outline-none" />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" value={row.fixed_amount} onChange={(e) => handleUpdateField(row.id, 'fixed_amount', parseInt(e.target.value))}
                              className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded text-center focus:border-steel-400 focus:outline-none" />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="text" value={row.description} onChange={(e) => handleUpdateField(row.id, 'description', e.target.value)}
                              className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:border-steel-400 focus:outline-none" />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="text" value={row.notes} onChange={(e) => handleUpdateField(row.id, 'notes', e.target.value)}
                              className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:border-steel-400 focus:outline-none" />
                          </td>
                          <td className="py-1.5 px-2 text-center">
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

        {/* 영업용 시뮬레이션 */}
        <div className="p-5 border-t border-gray-100 bg-steel-50">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">🧮</span>
            <span className="text-xs font-bold text-steel-900">영업용 등록비 시뮬레이션</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-600">차량가:</span>
              <input type="number" value={vehiclePrice} onChange={(e) => setVehiclePrice(parseInt(e.target.value) || 0)}
                className="px-2 py-1 text-xs border border-steel-200 rounded w-28" />
              <span className="text-xs text-gray-500">원</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-600">배기량:</span>
              <select value={simCC} onChange={(e) => setSimCC(parseInt(e.target.value))}
                className="px-2 py-1 text-xs border border-steel-200 rounded">
                <option value={800}>800cc (경차)</option>
                <option value={1400}>1,400cc (소형)</option>
                <option value={1600}>1,600cc (준중형)</option>
                <option value={2000}>2,000cc (중형)</option>
                <option value={2500}>2,500cc (대형)</option>
                <option value={3000}>3,000cc (대형+)</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-600">등록지:</span>
              <select value={simRegion} onChange={(e) => setSimRegion(e.target.value)}
                className="px-2 py-1 text-xs border border-steel-200 rounded">
                {['서울', '부산', '대구', '인천', '경기', '기타'].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-white rounded-lg p-3 border border-steel-100">
              <p className="text-gray-500 mb-1">취득세 (4%)</p>
              <p className="font-bold text-steel-800">{sim.taxAmt.toLocaleString()}원</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-steel-100">
              <p className="text-gray-500 mb-1">공채매입 ({sim.bondRate}%)</p>
              <p className="font-bold text-steel-800">{sim.bondNet.toLocaleString()}원</p>
              {sim.bondGross > 0 && <p className="text-[10px] text-gray-400">액면 {sim.bondGross.toLocaleString()}원, 할인매도 후</p>}
              {sim.bondRate === 0 && <p className="text-[10px] text-green-600 font-semibold">영업용 면제 지역</p>}
            </div>
            <div className="bg-white rounded-lg p-3 border border-steel-100">
              <p className="text-gray-500 mb-1">부대비용 (고정)</p>
              <p className="font-bold text-steel-800">{(sim.total - sim.taxAmt - sim.bondNet).toLocaleString()}원</p>
            </div>
            <div className="bg-steel-700 text-white rounded-lg p-3">
              <p className="text-white/70 mb-1">총 등록비</p>
              <p className="font-bold text-lg">{sim.total.toLocaleString()}원</p>
              <p className="text-[10px] text-white/60">{(vehiclePrice / 10000).toLocaleString()}만원 차량 기준</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI 검증 패널 */}
      {showAIPanel && (
        <div className="bg-steel-900 rounded-2xl shadow-sm p-5 text-white">
          <h3 className="text-sm font-bold mb-1">실시간 등록비 검증</h3>
          <p className="text-[10px] text-steel-400 mb-4">영업용 취득세율·공채율·수수료 최신 데이터를 검색합니다</p>

          <textarea value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="예: 영업용 승용차 취득세율 2025, 서울 도시철도채권 영업용 매입비율..."
            className="w-full px-3 py-2.5 text-xs bg-steel-800 border border-steel-700 rounded-lg text-white placeholder-steel-500 focus:outline-none focus:border-steel-500 resize-none h-16 mb-3" />

          <button onClick={handleSearch} disabled={searchLoading || !searchQuery.trim()}
            className="w-full px-4 py-2.5 bg-steel-600 text-white font-semibold text-xs rounded-lg hover:bg-steel-500 disabled:bg-steel-800 disabled:cursor-not-allowed transition-colors mb-4">
            {searchLoading ? '조회 중...' : '실시간 등록비 검증'}
          </button>

          {searchResults && (
            <div className="bg-steel-800 rounded-lg p-3 border border-steel-700">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-semibold text-steel-300">검증 결과</h4>
                <span className="text-[9px] text-steel-500">{searchResults.searched_at}</span>
              </div>
              <div className="text-xs text-steel-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{searchResults.results}</div>
              {searchResults.sources?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-steel-700">
                  <p className="text-[10px] text-steel-400 mb-1">출처:</p>
                  {searchResults.sources.map((s, i) => (
                    <a key={i} href={s} target="_blank" rel="noopener noreferrer" className="text-steel-400 text-[10px] underline block truncate">{s}</a>
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
