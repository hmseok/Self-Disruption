'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface FinanceRate {
  id: string
  finance_type: string
  term_months_min: number
  term_months_max: number
  annual_rate: number
  description: string
  effective_date: string
  notes: string
}

interface SearchResult { results: string; sources: string[]; searched_at: string }

const FINANCE_TYPES = ['캐피탈대출', '리스', '자체자금'] as const

// 금융상품 분류 기준 (사용자 검수용)
const CLASSIFICATION_INFO = [
  { type: '캐피탈대출', desc: '캐피탈사(현대캐피탈, KB캐피탈, 하나캐피탈 등)에서 차량 담보 대출', rateRange: '5.5~9.0%', term: '12~60개월', note: '차량 소유권은 렌터카사, 담보 설정' },
  { type: '리스', desc: '금융사가 차량을 구입해 렌터카사에 임대하는 구조', rateRange: '4.5~7.5%', term: '24~60개월', note: '소유권은 금융사, 만기 시 반환/인수 선택' },
  { type: '자체자금', desc: '자기 자본으로 차량 구매, 기회비용만 산출', rateRange: '3.0~5.0%', term: '해당없음', note: '실제 이자 없음, 기회비용(투자수익률) 반영' },
]

// 시장 금리 참고 (한국은행 기준금리 + 가산금리)
const MARKET_REFERENCE = [
  { item: '한국은행 기준금리', value: '3.00%', note: '2024년 10월 기준, 변동 가능' },
  { item: '캐피탈 차량대출 평균', value: '6.5~8.5%', note: '신용등급·LTV에 따라 차등' },
  { item: '오토리스 평균', value: '5.0~7.0%', note: '금융사·기간에 따라 차등' },
  { item: '정기예금 금리(1년)', value: '3.0~3.5%', note: '자체자금 기회비용 참고' },
]

export default function FinanceTab() {
  const supabase = createClientComponentClient()
  const [rows, setRows] = useState<FinanceRate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [showGuide, setShowGuide] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.from('finance_rate_table').select('*').order('effective_date', { ascending: false })
      if (error) throw error
      setRows(data || [])
    } catch (error) { console.error('Error:', error) }
    finally { setLoading(false) }
  }

  const handleAddRow = async () => {
    try {
      const newRow = { finance_type: '캐피탈대출', term_months_min: 12, term_months_max: 60, annual_rate: 0, description: '', effective_date: new Date().toISOString().split('T')[0], notes: '' }
      const { data, error } = await supabase.from('finance_rate_table').insert([newRow]).select()
      if (error) throw error
      if (data) setRows([...rows, data[0]])
    } catch (error) { console.error('Error:', error) }
  }

  const handleDeleteRow = async (id: string) => {
    try {
      const { error } = await supabase.from('finance_rate_table').delete().eq('id', id)
      if (error) throw error
      setRows(rows.filter(r => r.id !== id))
    } catch (error) { console.error('Error:', error) }
  }

  const handleUpdateField = async (id: string, field: keyof FinanceRate, value: any) => {
    try {
      const { error } = await supabase.from('finance_rate_table').update({ [field]: value }).eq('id', id)
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
        body: JSON.stringify({ category: 'finance', query: searchQuery, context: { current_data: rows } }),
      })
      if (!response.ok) throw new Error('검색 실패')
      const data = await response.json()
      setSearchResults(data)
    } catch (error) { console.error('Error:', error) }
    finally { setSearchLoading(false) }
  }

  // 월 이자 시뮬레이션
  const simulateMonthlyInterest = (rate: number, principal: number = 30000000) => {
    return Math.round(principal * (rate / 100) / 12)
  }

  if (loading) {
    return <div className="bg-white rounded-2xl shadow-sm p-8 text-center"><p className="text-gray-500">로딩 중...</p></div>
  }

  return (
    <div className="space-y-4">
      {showGuide && (
        <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-2xl p-5 border border-indigo-100">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏦</span>
              <h3 className="text-sm font-bold text-gray-800">금융금리 기준이란?</h3>
            </div>
            <button onClick={() => setShowGuide(false)} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600 leading-relaxed">
            <div>
              <p className="font-semibold text-gray-700 mb-1">개념</p>
              <p>차량 구매 자금의 금융 비용(이자)입니다. 캐피탈 대출, 리스, 자체자금 중 어떤 방식으로 조달하느냐에 따라 비용이 달라집니다. 렌트료의 15~25%를 차지합니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">대형사 기준</p>
              <p>롯데렌탈·SK렌터카는 캐피탈사와 특별금리(우대금리)로 대량 조달합니다. 소규모 업체는 개별 금리가 1~2%p 높을 수 있으므로, 실제 적용 금리를 정확히 반영해야 합니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">자체자금의 기회비용</p>
              <p>자체자금은 실제 이자가 없지만, 그 돈을 투자했을 때의 수익(기회비용)을 산출에 반영합니다. 보통 정기예금 금리(3~4%) 수준을 적용합니다.</p>
            </div>
          </div>
        </div>
      )}

      {/* 금융상품 분류 기준 + 시장금리 참고 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">📋</span>
            <h3 className="text-xs font-bold text-gray-700">금융상품 분류 기준</h3>
          </div>
          <div className="space-y-3">
            {CLASSIFICATION_INFO.map((info) => (
              <div key={info.type} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-gray-800">{info.type}</span>
                  <span className="text-xs font-semibold text-blue-600">{info.rateRange}</span>
                </div>
                <p className="text-[11px] text-gray-600 mb-1">{info.desc}</p>
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>기간: {info.term}</span>
                  <span>{info.note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">📊</span>
            <h3 className="text-xs font-bold text-gray-700">시장 금리 참고 (검수용)</h3>
          </div>
          <div className="space-y-2">
            {MARKET_REFERENCE.map((ref) => (
              <div key={ref.item} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div>
                  <p className="text-xs font-medium text-gray-800">{ref.item}</p>
                  <p className="text-[10px] text-gray-500">{ref.note}</p>
                </div>
                <span className="text-xs font-bold text-indigo-600">{ref.value}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">* 시장 금리는 수시 변동됩니다. 실시간 검증으로 최신 정보를 확인하세요.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">금융상품 요율표 (편집 가능)</h3>
                <p className="text-xs text-gray-400 mt-0.5">위 분류기준·시장금리를 참고하여 검수한 후 사용하세요</p>
              </div>
              <div className="flex gap-2">
                {!showGuide && <button onClick={() => setShowGuide(true)} className="px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">가이드 💡</button>}
                <button onClick={handleAddRow} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">+ 행 추가</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 min-w-[90px]">금융유형</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 min-w-[70px]">최소기간</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 min-w-[70px]">최대기간</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 min-w-[70px]">연이율</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 min-w-[90px]">월이자(3천만)</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 min-w-[100px]">설명</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 min-w-[80px]">적용일</th>
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
                          <select value={row.finance_type} onChange={(e) => handleUpdateField(row.id, 'finance_type', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-200 rounded text-gray-900 focus:border-blue-400 focus:outline-none">
                            {FINANCE_TYPES.map(type => (<option key={type} value={type}>{type}</option>))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" value={row.term_months_min} onChange={(e) => handleUpdateField(row.id, 'term_months_min', parseInt(e.target.value))}
                            className="w-full px-2 py-1 text-xs border border-gray-200 rounded text-gray-900 text-center focus:border-blue-400 focus:outline-none" />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" value={row.term_months_max} onChange={(e) => handleUpdateField(row.id, 'term_months_max', parseInt(e.target.value))}
                            className="w-full px-2 py-1 text-xs border border-gray-200 rounded text-gray-900 text-center focus:border-blue-400 focus:outline-none" />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" step="0.01" value={row.annual_rate} onChange={(e) => handleUpdateField(row.id, 'annual_rate', parseFloat(e.target.value))}
                            className="w-full px-2 py-1 text-xs border border-gray-200 rounded text-gray-900 text-center font-bold focus:border-blue-400 focus:outline-none" />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-blue-600 font-semibold">{simulateMonthlyInterest(row.annual_rate).toLocaleString()}원</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="text" value={row.description} onChange={(e) => handleUpdateField(row.id, 'description', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-200 rounded text-gray-900 focus:border-blue-400 focus:outline-none" />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="date" value={row.effective_date} onChange={(e) => handleUpdateField(row.id, 'effective_date', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-200 rounded text-gray-900 focus:border-blue-400 focus:outline-none" />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="text" value={row.notes} onChange={(e) => handleUpdateField(row.id, 'notes', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-200 rounded text-gray-900 focus:border-blue-400 focus:outline-none" />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => handleDeleteRow(row.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="bg-slate-900 rounded-2xl shadow-sm p-5 text-white sticky top-32">
            <h3 className="text-sm font-bold mb-1">실시간 금리 검증</h3>
            <p className="text-[10px] text-slate-400 mb-4">Gemini AI로 현재 금리 시세를 검색합니다</p>

            <textarea value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="예: 현대캐피탈 렌터카 대출금리 2025, 오토리스 최저금리..."
              className="w-full px-3 py-2.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none h-16 mb-3" />

            <button onClick={handleSearch} disabled={searchLoading || !searchQuery.trim()}
              className="w-full px-4 py-2.5 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors mb-4">
              {searchLoading ? '금리 조회 중...' : '🔍 실시간 금리 검증'}
            </button>

            {/* 금리별 월이자 비교 */}
            <div className="bg-slate-800 rounded-lg p-3 mb-3 border border-slate-700">
              <p className="text-[10px] font-semibold text-blue-300 mb-2">금리별 월이자 비교 (3천만원 기준)</p>
              <div className="space-y-1.5 text-[11px]">
                {[4, 5, 6, 7, 8, 9].map(rate => (
                  <div key={rate} className="flex justify-between items-center">
                    <span className="text-slate-400">{rate}.0%</span>
                    <div className="flex-1 mx-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(rate / 10) * 100}%` }} />
                    </div>
                    <span className="text-white font-semibold w-16 text-right">{simulateMonthlyInterest(rate).toLocaleString()}원</span>
                  </div>
                ))}
              </div>
            </div>

            {searchResults && (
              <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] font-semibold text-blue-300">Gemini 검증 결과</h4>
                  <span className="text-[9px] text-slate-500">{searchResults.searched_at}</span>
                </div>
                <div className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {searchResults.results}
                </div>
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
