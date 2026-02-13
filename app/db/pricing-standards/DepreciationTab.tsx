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

export default function DepreciationTab() {
  const supabase = createClientComponentClient()

  const [rows, setRows] = useState<DepreciationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
  const [searching, setSearching] = useState(false)

  // 데이터 로드
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
      alert('데이터를 불러올 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // 셀 클릭 시 편집 시작
  const handleCellClick = (rowId: number, field: string, value: any) => {
    setEditingCell({ rowId, field })
    setEditValue(String(value || ''))
  }

  // 셀 편집 완료 (blur)
  const handleCellBlur = async () => {
    if (!editingCell) return

    const { rowId, field } = editingCell
    const row = rows.find(r => r.id === rowId)
    if (!row) return

    const oldValue = row[field as keyof DepreciationRow]
    const newValue = field.startsWith('rate_') ? parseFloat(editValue) || 0 : editValue

    if (oldValue === newValue) {
      setEditingCell(null)
      return
    }

    try {
      const updateData = { [field]: newValue }
      const { error } = await supabase
        .from('depreciation_db')
        .update(updateData)
        .eq('id', rowId)

      if (error) throw error

      setRows(rows.map(r => r.id === rowId ? { ...r, [field]: newValue } : r))
    } catch (error) {
      console.error('업데이트 실패:', error)
      alert('저장에 실패했습니다.')
    } finally {
      setEditingCell(null)
    }
  }

  // 행 추가
  const handleAddRow = async () => {
    try {
      const newRow: Partial<DepreciationRow> = {
        category: '새 카테고리',
        rate_1yr: 0,
        rate_2yr: 0,
        rate_3yr: 0,
        rate_4yr: 0,
        rate_5yr: 0,
      }

      const { data, error } = await supabase
        .from('depreciation_db')
        .insert([newRow])
        .select()

      if (error) throw error
      if (data && data.length > 0) {
        setRows([...rows, data[0]])
      }
    } catch (error) {
      console.error('행 추가 실패:', error)
      alert('행을 추가할 수 없습니다.')
    }
  }

  // 행 삭제
  const handleDeleteRow = async (rowId: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      const { error } = await supabase
        .from('depreciation_db')
        .delete()
        .eq('id', rowId)

      if (error) throw error
      setRows(rows.filter(r => r.id !== rowId))
    } catch (error) {
      console.error('삭제 실패:', error)
      alert('삭제에 실패했습니다.')
    }
  }

  // 색상 코딩 함수
  const getRateColor = (rate: number): string => {
    if (rate >= 70) return 'text-green-600'
    if (rate >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  // 실시간 검증 API 호출
  const handleSearch = async () => {
    if (!selectedCategory) {
      alert('차량 카테고리를 선택해주세요.')
      return
    }

    try {
      setSearching(true)
      const response = await fetch('/api/search-pricing-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'depreciation',
          context: { vehicle_type: selectedCategory },
        }),
      })

      if (!response.ok) throw new Error('검색 실패')
      const data: SearchResult = await response.json()
      setSearchResults(data)
    } catch (error) {
      console.error('검색 실패:', error)
      alert('검색 중 오류가 발생했습니다.')
    } finally {
      setSearching(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* 왼쪽: CRUD 테이블 (8/12) */}
      <div className="lg:col-span-8">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* 헤더 */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">감가 기준표</h3>
              <button
                onClick={handleAddRow}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                + 행 추가
              </button>
            </div>
            <p className="text-sm text-gray-500">
              셀을 클릭하여 직접 편집합니다. 수정 후 다른 곳을 클릭하면 자동 저장됩니다.
            </p>
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">차종 카테고리</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">1년 잔존율</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">2년 잔존율</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">3년 잔존율</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">4년 잔존율</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">5년 잔존율</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      {/* 카테고리 */}
                      <td className="px-6 py-4">
                        {editingCell?.rowId === row.id && editingCell?.field === 'category' ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellBlur}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none"
                          />
                        ) : (
                          <span
                            onClick={() => handleCellClick(row.id, 'category', row.category)}
                            className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block"
                          >
                            {row.category}
                          </span>
                        )}
                      </td>

                      {/* 각 잔존율 필드 */}
                      {(['rate_1yr', 'rate_2yr', 'rate_3yr', 'rate_4yr', 'rate_5yr'] as const).map((field) => (
                        <td key={field} className="px-6 py-4 text-center">
                          {editingCell?.rowId === row.id && editingCell?.field === field ? (
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleCellBlur}
                              autoFocus
                              className="w-16 px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none mx-auto text-center"
                              step="0.1"
                              min="0"
                              max="100"
                            />
                          ) : (
                            <span
                              onClick={() => handleCellClick(row.id, field, row[field])}
                              className={`cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block font-semibold ${getRateColor(row[field])}`}
                            >
                              {row[field].toFixed(1)}%
                            </span>
                          )}
                        </td>
                      ))}

                      {/* 삭제 버튼 */}
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleDeleteRow(row.id)}
                          className="text-red-600 hover:text-red-700 font-semibold text-sm hover:underline transition-colors"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 오른쪽: 실시간 검증 패널 (4/12) */}
      <div className="lg:col-span-4">
        <div className="bg-slate-900 rounded-2xl shadow-sm p-6 text-white">
          <h3 className="text-lg font-bold mb-4">실시간 검증</h3>

          {/* 카테고리 선택 */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-300 block mb-2">
              차량 카테고리
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="">선택하세요</option>
              {rows.map((row) => (
                <option key={row.id} value={row.category}>
                  {row.category}
                </option>
              ))}
            </select>
          </div>

          {/* 검색 버튼 */}
          <button
            onClick={handleSearch}
            disabled={searching || !selectedCategory}
            className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors mb-4"
          >
            {searching ? '검색 중...' : '실시간 검증'}
          </button>

          {/* 검색 결과 */}
          {searchResults && (
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <h4 className="text-sm font-semibold text-blue-300 mb-3">검색 결과</h4>
                <div className="text-sm text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {searchResults.results}
                </div>
              </div>

              {/* 출처 */}
              {searchResults.sources.length > 0 && (
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <h4 className="text-sm font-semibold text-blue-300 mb-3">참고 출처</h4>
                  <ul className="space-y-2">
                    {searchResults.sources.map((source, idx) => (
                      <li key={idx}>
                        <a
                          href={source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 text-xs break-all underline"
                        >
                          {source}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 기준표 반영 버튼 (비활성) */}
              <button
                disabled
                className="w-full px-4 py-2 bg-gray-600 text-gray-400 font-semibold rounded-lg cursor-not-allowed text-sm"
              >
                기준표 반영 (준비 중)
              </button>
            </div>
          )}

          {!searchResults && !searching && (
            <div className="text-center text-gray-400 text-sm py-4">
              차종을 선택하고 검증을 시작하세요.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
