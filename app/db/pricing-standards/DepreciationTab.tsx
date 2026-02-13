'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface DepreciationRow {
  id: number
  category: string
  rate_1yr: number
  rate_2yr: number
  rate_3yr: number
  rate_4yr: number
  rate_5yr: number
}

interface SearchResult {
  results: string
  sources: string[]
  searched_at: string
}

// 업계 비교 기준 데이터 (대형 렌터카사 참고)
const INDUSTRY_BENCHMARKS = [
  { company: '업계 평균', type: '국산 중형', yr1: 82, yr2: 68, yr3: 57, yr4: 48, yr5: 40 },
  { company: '업계 평균', type: '수입 중형', yr1: 75, yr2: 60, yr3: 48, yr4: 38, yr5: 30 },
  { company: '업계 평균', type: '국산 SUV', yr1: 85, yr2: 73, yr3: 63, yr4: 54, yr5: 46 },
]

export default function DepreciationTab() {
  const supabase = createClientComponentClient()

  const [rows, setRows] = useState<DepreciationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [showGuide, setShowGuide] = useState(true)

  const fetchData = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('depreciation_db')
        .select('*')
        .order('id', { ascending: true })

      if (error) throw error
      setRows(data || [])
      if (data && data.length > 0 && !selectedCategory) {
        setSelectedCategory(data[0].category)
      }
    } catch (error) {
      console.error('데이터 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleCellClick = (rowId: number, field: string, value: any) => {
    setEditingCell({ rowId, field })
    setEditValue(String(value || ''))
  }

  const handleCellBlur = async () => {
    if (!editingCell) return
    const { rowId, field } = editingCell
    const row = rows.find(r => r.id === rowId)
    if (!row) return

    const newValue = field.startsWith('rate_') ? parseFloat(editValue) || 0 : editValue
    const oldValue = row[field as keyof DepreciationRow]
    if (oldValue === newValue) { setEditingCell(null); return }

    try {
      const { error } = await supabase.from('depreciation_db').update({ [field]: newValue }).eq('id', rowId)
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
      const newRow = { category: '새 카테고리', rate_1yr: 0, rate_2yr: 0, rate_3yr: 0, rate_4yr: 0, rate_5yr: 0 }
      const { data, error } = await supabase.from('depreciation_db').insert([newRow]).select()
      if (error) throw error
      if (data && data[0]) setRows([...rows, data[0]])
    } catch (error) {
      console.error('행 추가 실패:', error)
    }
  }

  const handleDeleteRow = async (rowId: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      const { error } = await supabase.from('depreciation_db').delete().eq('id', rowId)
      if (error) throw error
      setRows(rows.filter(r => r.id !== rowId))
    } catch (error) {
      console.error('삭제 실패:', error)
    }
  }

  const getRateColor = (rate: number) => {
    if (rate >= 70) return 'text-emerald-600 bg-emerald-50'
    if (rate >= 50) return 'text-amber-600 bg-amber-50'
    return 'text-red-600 bg-red-50'
  }

  const handleSearch = async () => {
    if (!selectedCategory) return
    try {
      setSearching(true)
      const response = await fetch('/api/search-pricing-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'depreciation', context: { vehicle_type: selectedCategory } }),
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

  // 현재값과 업계 비교
  const getComparison = () => {
    const currentRow = rows.find(r => r.category === selectedCategory)
    if (!currentRow) return null
    const benchmark = INDUSTRY_BENCHMARKS.find(b => 
      selectedCategory.includes(b.type.replace('업계 평균 ', ''))
    ) || INDUSTRY_BENCHMARKS[0]
    
    return {
      current: currentRow,
      benchmark,
      diffs: {
        yr1: currentRow.rate_1yr - benchmark.yr1,
        yr3: currentRow.rate_3yr - benchmark.yr3,
        yr5: currentRow.rate_5yr - benchmark.yr5,
      }
    }
  }

  if (loading) {
    return <div className="bg-white rounded-2xl shadow-sm p-8 text-center"><p className="text-gray-500">로딩 중...</p></div>
  }

  const comparison = getComparison()

  return (
    <div className="space-y-4">
      {/* 가이드 섹션 */}
      {showGuide && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-5 border border-emerald-100">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📉</span>
              <h3 className="text-sm font-bold text-gray-800">감가상각 기준이란?</h3>
            </div>
            <button onClick={() => setShowGuide(false)} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600 leading-relaxed">
            <div>
              <p className="font-semibold text-gray-700 mb-1">개념</p>
              <p>차량의 잔존가치율(%)을 연차별로 관리합니다. 신차 가격 대비 1~5년 후 남은 가치 비율입니다. 예를 들어 3년 잔존율 57%면, 3천만원 차량이 3년 후 1,710만원의 가치입니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">산출 영향</p>
              <p>렌트료 = (신차가 - 잔존가) ÷ 계약월수 + 기타비용. 잔존율이 높을수록 감가 비용이 줄어 렌트료가 낮아집니다. 이 값이 렌트료의 40~60%를 차지하는 핵심 요소입니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">대형사 기준 참고</p>
              <p>롯데렌탈·SK렌터카 등은 자체 중고차 매각 데이터 + 시장 시세를 반영합니다. 국산차는 잔존율이 높고, 수입차·전기차는 변동폭이 큽니다. 실시간 검증으로 시장가를 확인하세요.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 왼쪽: CRUD 테이블 (8/12) */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-900">감가 기준표</h3>
                <div className="flex gap-2">
                  {!showGuide && (
                    <button onClick={() => setShowGuide(true)} className="px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                      가이드 💡
                    </button>
                  )}
                  <button onClick={handleAddRow} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                    + 행 추가
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400">셀을 클릭하여 편집 → 다른 곳 클릭 시 자동 저장 · 잔존율은 신차가 대비 잔존가치(%)</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 min-w-[120px]">차종 카테고리</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-600 min-w-[80px]">1년차</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-600 min-w-[80px]">2년차</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-600 min-w-[80px]">3년차</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-600 min-w-[80px]">4년차</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-600 min-w-[80px]">5년차</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-600 w-[50px]">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">데이터가 없습니다. 행을 추가해주세요.</td></tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3">
                          {editingCell?.rowId === row.id && editingCell?.field === 'category' ? (
                            <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                              className="w-full px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none" />
                          ) : (
                            <span onClick={() => handleCellClick(row.id, 'category', row.category)}
                              className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block font-medium text-gray-800">
                              {row.category}
                            </span>
                          )}
                        </td>
                        {(['rate_1yr', 'rate_2yr', 'rate_3yr', 'rate_4yr', 'rate_5yr'] as const).map((field) => (
                          <td key={field} className="px-3 py-3 text-center">
                            {editingCell?.rowId === row.id && editingCell?.field === field ? (
                              <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                                className="w-16 px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none mx-auto text-center" step="0.1" min="0" max="100" />
                            ) : (
                              <span onClick={() => handleCellClick(row.id, field, row[field])}
                                className={`cursor-pointer px-2 py-0.5 rounded inline-block font-bold text-xs ${getRateColor(row[field])}`}>
                                {row[field]?.toFixed(1)}%
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-3 text-center">
                          <button onClick={() => handleDeleteRow(row.id)} className="text-red-400 hover:text-red-600 text-xs transition-colors">삭제</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 업계 비교 테이블 */}
            <div className="p-5 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs font-semibold text-gray-500 mb-3">📊 업계 평균 참고값 (대형 렌터카사 기반)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left py-1.5 px-3 font-medium min-w-[100px]">차종</th>
                      <th className="text-center py-1.5 px-2 font-medium">1년</th>
                      <th className="text-center py-1.5 px-2 font-medium">2년</th>
                      <th className="text-center py-1.5 px-2 font-medium">3년</th>
                      <th className="text-center py-1.5 px-2 font-medium">4년</th>
                      <th className="text-center py-1.5 px-2 font-medium">5년</th>
                    </tr>
                  </thead>
                  <tbody>
                    {INDUSTRY_BENCHMARKS.map((b, i) => (
                      <tr key={i} className="text-gray-500 border-t border-gray-100">
                        <td className="py-1.5 px-3">{b.type}</td>
                        <td className="text-center py-1.5 px-2">{b.yr1}%</td>
                        <td className="text-center py-1.5 px-2">{b.yr2}%</td>
                        <td className="text-center py-1.5 px-2">{b.yr3}%</td>
                        <td className="text-center py-1.5 px-2">{b.yr4}%</td>
                        <td className="text-center py-1.5 px-2">{b.yr5}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* 오른쪽: 실시간 검증 패널 */}
        <div className="lg:col-span-4">
          <div className="bg-slate-900 rounded-2xl shadow-sm p-5 text-white sticky top-32">
            <h3 className="text-sm font-bold mb-1">실시간 시장 검증</h3>
            <p className="text-[10px] text-slate-400 mb-4">Gemini AI로 현재 중고차 시세를 조회하여 잔존율 적정성을 검증합니다</p>

            <div className="mb-3">
              <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">검증할 차종</label>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500">
                <option value="">선택하세요</option>
                {rows.map((row) => (<option key={row.id} value={row.category}>{row.category}</option>))}
              </select>
            </div>

            <button onClick={handleSearch} disabled={searching || !selectedCategory}
              className="w-full px-4 py-2.5 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors mb-4">
              {searching ? '시장 데이터 조회 중...' : '🔍 실시간 시장 검증'}
            </button>

            {/* 현재값 vs 업계 비교 */}
            {comparison && (
              <div className="bg-slate-800 rounded-lg p-3 mb-3 border border-slate-700">
                <p className="text-[10px] font-semibold text-slate-300 mb-2">📊 현재값 vs 업계 평균</p>
                <div className="space-y-1.5 text-[11px]">
                  {[
                    { label: '1년차', diff: comparison.diffs.yr1 },
                    { label: '3년차', diff: comparison.diffs.yr3 },
                    { label: '5년차', diff: comparison.diffs.yr5 },
                  ].map(({ label, diff }) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-slate-400">{label}</span>
                      <span className={`font-semibold ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}%p
                        {diff > 2 && ' (보수적)'}
                        {diff < -2 && ' (공격적)'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  +는 업계보다 보수적(잔존율 높음), -는 공격적(잔존율 낮음)
                </p>
              </div>
            )}

            {/* 검색 결과 */}
            {searchResults && (
              <div className="space-y-3">
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-semibold text-blue-300">Gemini 검증 결과</h4>
                    <span className="text-[9px] text-slate-500">{searchResults.searched_at}</span>
                  </div>
                  <div className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
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

            {!searchResults && !searching && (
              <div className="text-center text-slate-500 text-[11px] py-3">
                차종을 선택하고 검증을 시작하세요.<br/>
                <span className="text-slate-600 text-[10px]">중고차 시세·매각 데이터를 실시간으로 조회합니다</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
