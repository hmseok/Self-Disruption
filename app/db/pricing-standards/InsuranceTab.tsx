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

  // 데이터 로드
  const fetchData = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('insurance_rate_table')
        .select('*')
        .order('id', { ascending: true })

      if (error) throw error
      setRows(data || [])
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

    // 차량가 필드는 만원 단위로 표시
    if (field === 'value_min' || field === 'value_max') {
      setEditValue(String((value / 10000) || ''))
    } else {
      setEditValue(String(value || ''))
    }
  }

  // 셀 편집 완료 (blur)
  const handleCellBlur = async () => {
    if (!editingCell) return

    const { rowId, field } = editingCell
    const row = rows.find(r => r.id === rowId)
    if (!row) return

    let newValue: any = editValue

    // 필드별 데이터 변환
    if (field === 'vehicle_type') {
      newValue = editValue
    } else if (field === 'value_min' || field === 'value_max') {
      newValue = Math.round(parseFloat(editValue) * 10000) || 0
    } else if (field === 'annual_premium') {
      newValue = Math.round(parseFloat(editValue)) || 0
    } else {
      newValue = editValue
    }

    const oldValue = row[field as keyof InsuranceRow]
    if (oldValue === newValue) {
      setEditingCell(null)
      return
    }

    try {
      const updateData = { [field]: newValue }
      const { error } = await supabase
        .from('insurance_rate_table')
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
      const newRow: Partial<InsuranceRow> = {
        vehicle_type: '국산 승용',
        value_min: 10000000,
        value_max: 20000000,
        annual_premium: 500000,
        coverage_desc: '종합보험',
        notes: '',
      }

      const { data, error } = await supabase
        .from('insurance_rate_table')
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
        .from('insurance_rate_table')
        .delete()
        .eq('id', rowId)

      if (error) throw error
      setRows(rows.filter(r => r.id !== rowId))
    } catch (error) {
      console.error('삭제 실패:', error)
      alert('삭제에 실패했습니다.')
    }
  }

  // 금액 포맷팅
  const formatAmount = (amount: number): string => {
    return (amount / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + '만'
  }

  const formatPremium = (amount: number): string => {
    return amount.toLocaleString('ko-KR')
  }

  // 실시간 검색 API 호출
  const handleSearch = async () => {
    if (!selectedVehicleType) {
      alert('차종을 선택해주세요.')
      return
    }

    if (!vehicleValue) {
      alert('차량가를 입력해주세요.')
      return
    }

    try {
      setSearching(true)
      const vehicleValueWon = Math.round(parseFloat(vehicleValue) * 10000)

      const response = await fetch('/api/search-pricing-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'insurance',
          context: {
            vehicle_type: selectedVehicleType,
            vehicle_value: vehicleValueWon
          },
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
              <h3 className="text-lg font-bold text-gray-900">보험료 기준표</h3>
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
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">차종</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">차량가 하한</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">차량가 상한</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">연 보험료</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">보장내용</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">비고</th>
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
                      {/* 차종 (select) */}
                      <td className="px-6 py-4">
                        {editingCell?.rowId === row.id && editingCell?.field === 'vehicle_type' ? (
                          <select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellBlur}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none"
                          >
                            {VEHICLE_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            onClick={() => handleCellClick(row.id, 'vehicle_type', row.vehicle_type)}
                            className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block"
                          >
                            {row.vehicle_type}
                          </span>
                        )}
                      </td>

                      {/* 차량가 하한 */}
                      <td className="px-6 py-4 text-center">
                        {editingCell?.rowId === row.id && editingCell?.field === 'value_min' ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellBlur}
                            autoFocus
                            className="w-24 px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none mx-auto text-center"
                            placeholder="만원"
                            step="100"
                            min="0"
                          />
                        ) : (
                          <span
                            onClick={() => handleCellClick(row.id, 'value_min', row.value_min)}
                            className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block font-medium text-gray-900"
                          >
                            {formatAmount(row.value_min)}
                          </span>
                        )}
                      </td>

                      {/* 차량가 상한 */}
                      <td className="px-6 py-4 text-center">
                        {editingCell?.rowId === row.id && editingCell?.field === 'value_max' ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellBlur}
                            autoFocus
                            className="w-24 px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none mx-auto text-center"
                            placeholder="만원"
                            step="100"
                            min="0"
                          />
                        ) : (
                          <span
                            onClick={() => handleCellClick(row.id, 'value_max', row.value_max)}
                            className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block font-medium text-gray-900"
                          >
                            {formatAmount(row.value_max)}
                          </span>
                        )}
                      </td>

                      {/* 연 보험료 */}
                      <td className="px-6 py-4 text-center">
                        {editingCell?.rowId === row.id && editingCell?.field === 'annual_premium' ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellBlur}
                            autoFocus
                            className="w-28 px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none mx-auto text-center"
                            placeholder="원"
                            step="10000"
                            min="0"
                          />
                        ) : (
                          <span
                            onClick={() => handleCellClick(row.id, 'annual_premium', row.annual_premium)}
                            className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block font-semibold text-blue-600"
                          >
                            {formatPremium(row.annual_premium)}
                          </span>
                        )}
                      </td>

                      {/* 보장내용 */}
                      <td className="px-6 py-4">
                        {editingCell?.rowId === row.id && editingCell?.field === 'coverage_desc' ? (
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
                            onClick={() => handleCellClick(row.id, 'coverage_desc', row.coverage_desc)}
                            className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block text-gray-700"
                          >
                            {row.coverage_desc || '—'}
                          </span>
                        )}
                      </td>

                      {/* 비고 */}
                      <td className="px-6 py-4">
                        {editingCell?.rowId === row.id && editingCell?.field === 'notes' ? (
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
                            onClick={() => handleCellClick(row.id, 'notes', row.notes)}
                            className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded inline-block text-gray-600 text-xs"
                          >
                            {row.notes || '—'}
                          </span>
                        )}
                      </td>

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

      {/* 오른쪽: 실시간 검색 패널 (4/12) */}
      <div className="lg:col-span-4">
        <div className="bg-slate-900 rounded-2xl shadow-sm p-6 text-white">
          <h3 className="text-lg font-bold mb-4">실시간 검색</h3>

          {/* 차종 선택 */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-300 block mb-2">
              차종
            </label>
            <select
              value={selectedVehicleType}
              onChange={(e) => setSelectedVehicleType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="">선택하세요</option>
              {VEHICLE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* 차량가 입력 */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-300 block mb-2">
              차량가 (만원)
            </label>
            <input
              type="number"
              value={vehicleValue}
              onChange={(e) => setVehicleValue(e.target.value)}
              placeholder="예: 2000"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-500"
              step="100"
              min="0"
            />
          </div>

          {/* 검색 버튼 */}
          <button
            onClick={handleSearch}
            disabled={searching || !selectedVehicleType || !vehicleValue}
            className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors mb-4"
          >
            {searching ? '검색 중...' : '실시간 검색'}
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
            </div>
          )}

          {!searchResults && !searching && (
            <div className="text-center text-gray-400 text-sm py-4">
              차종과 차량가를 입력하고 검색하세요.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
