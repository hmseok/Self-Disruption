'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

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

interface SearchResult {
  id: string
  vehicle_type: string
  age: number
  estimated_monthly_cost: number
  market_data: string
  source: string
}

const VEHICLE_TYPES = [
  '국산 경차/소형',
  '국산 중형',
  '국산 대형/SUV',
  '수입차',
  '전기차',
  '하이브리드'
]

const FUEL_TYPES = ['내연기관', '전기', '하이브리드']

export default function MaintenanceTab() {
  const supabase = createClientComponentClient()

  const [rows, setRows] = useState<MaintenanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)

  // Search panel state
  const [searchVehicleType, setSearchVehicleType] = useState<string>('')
  const [searchAge, setSearchAge] = useState<number>(5)
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('maintenance_cost_table')
        .select('*')
        .order('vehicle_type', { ascending: true })

      if (error) throw error
      setRows(data || [])
    } catch (err) {
      console.error('Error fetching maintenance data:', err)
    } finally {
      setLoading(false)
    }
  }

  const addRow = async () => {
    const newRow: MaintenanceRecord = {
      vehicle_type: VEHICLE_TYPES[0],
      fuel_type: FUEL_TYPES[0],
      age_min: 0,
      age_max: 10,
      monthly_cost: 0,
      includes: '',
      notes: ''
    }

    try {
      const { data, error } = await supabase
        .from('maintenance_cost_table')
        .insert([newRow])
        .select()

      if (error) throw error
      if (data && data[0]) {
        setRows([...rows, data[0]])
      }
    } catch (err) {
      console.error('Error adding row:', err)
    }
  }

  const updateField = async (id: number | undefined, field: string, value: any) => {
    if (!id) return

    try {
      const { error } = await supabase
        .from('maintenance_cost_table')
        .update({ [field]: value })
        .eq('id', id)

      if (error) throw error

      setRows(rows.map(r =>
        r.id === id ? { ...r, [field]: value } : r
      ))
    } catch (err) {
      console.error('Error updating field:', err)
    }
  }

  const deleteRow = async (id: number | undefined) => {
    if (!id) return

    try {
      const { error } = await supabase
        .from('maintenance_cost_table')
        .delete()
        .eq('id', id)

      if (error) throw error
      setRows(rows.filter(r => r.id !== id))
    } catch (err) {
      console.error('Error deleting row:', err)
    }
  }

  const handleSearch = async () => {
    if (!searchVehicleType) return

    setSearching(true)
    try {
      const response = await fetch('/api/search-pricing-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'maintenance',
          vehicle_type: searchVehicleType,
          age: searchAge
        })
      })

      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.results || [])
        setShowResults(true)
      }
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setSearching(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ko-KR').format(value)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* 좌측: CRUD 테이블 */}
      <div className="lg:col-span-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          {/* 헤더 */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div>
              <h3 className="text-base font-bold text-gray-900">정비비 기준</h3>
              <p className="text-xs text-gray-500 mt-1">
                차종별 연료별 월정비비 관리
              </p>
            </div>
            <button
              onClick={addRow}
              className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition"
            >
              + 행 추가
            </button>
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">차종</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">연료</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">연식(from)</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">연식(to)</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">월 정비비</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">포함항목</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">비고</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">삭제</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                      로딩 중...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-blue-50/30 transition">
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'vehicle_type' ? (
                          <select
                            value={row.vehicle_type}
                            onChange={(e) => {
                              updateField(row.id, 'vehicle_type', e.target.value)
                              setEditingId(null)
                              setEditingField(null)
                            }}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            {VEHICLE_TYPES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            onClick={() => {
                              setEditingId(row.id || null)
                              setEditingField('vehicle_type')
                            }}
                            className="cursor-pointer text-gray-900 hover:text-blue-600 inline-block"
                          >
                            {row.vehicle_type}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'fuel_type' ? (
                          <select
                            value={row.fuel_type}
                            onChange={(e) => {
                              updateField(row.id, 'fuel_type', e.target.value)
                              setEditingId(null)
                              setEditingField(null)
                            }}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            {FUEL_TYPES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            onClick={() => {
                              setEditingId(row.id || null)
                              setEditingField('fuel_type')
                            }}
                            className="cursor-pointer text-gray-900 hover:text-blue-600 inline-block"
                          >
                            {row.fuel_type}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'age_min' ? (
                          <input
                            type="number"
                            value={row.age_min}
                            onChange={(e) => updateField(row.id, 'age_min', parseInt(e.target.value) || 0)}
                            onBlur={() => {
                              setEditingId(null)
                              setEditingField(null)
                            }}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditingId(row.id || null)
                              setEditingField('age_min')
                            }}
                            className="cursor-pointer text-gray-900 hover:text-blue-600 inline-block"
                          >
                            {row.age_min}년
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'age_max' ? (
                          <input
                            type="number"
                            value={row.age_max}
                            onChange={(e) => updateField(row.id, 'age_max', parseInt(e.target.value) || 0)}
                            onBlur={() => {
                              setEditingId(null)
                              setEditingField(null)
                            }}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditingId(row.id || null)
                              setEditingField('age_max')
                            }}
                            className="cursor-pointer text-gray-900 hover:text-blue-600 inline-block"
                          >
                            {row.age_max}년
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'monthly_cost' ? (
                          <input
                            type="number"
                            value={row.monthly_cost}
                            onChange={(e) => updateField(row.id, 'monthly_cost', parseInt(e.target.value) || 0)}
                            onBlur={() => {
                              setEditingId(null)
                              setEditingField(null)
                            }}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditingId(row.id || null)
                              setEditingField('monthly_cost')
                            }}
                            className="cursor-pointer text-gray-900 hover:text-blue-600 font-semibold inline-block"
                          >
                            {formatCurrency(row.monthly_cost)}원
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'includes' ? (
                          <input
                            type="text"
                            value={row.includes}
                            onChange={(e) => updateField(row.id, 'includes', e.target.value)}
                            onBlur={() => {
                              setEditingId(null)
                              setEditingField(null)
                            }}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditingId(row.id || null)
                              setEditingField('includes')
                            }}
                            className="cursor-pointer text-gray-600 hover:text-blue-600 inline-block"
                          >
                            {row.includes || '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'notes' ? (
                          <input
                            type="text"
                            value={row.notes}
                            onChange={(e) => updateField(row.id, 'notes', e.target.value)}
                            onBlur={() => {
                              setEditingId(null)
                              setEditingField(null)
                            }}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditingId(row.id || null)
                              setEditingField('notes')
                            }}
                            className="cursor-pointer text-gray-600 hover:text-blue-600 inline-block"
                          >
                            {row.notes || '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => deleteRow(row.id)}
                          className="text-red-500 hover:text-red-700 font-semibold transition text-xs"
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

      {/* 우측: 검색 패널 */}
      <div className="lg:col-span-4">
        <div className="bg-slate-900 rounded-2xl shadow-sm p-6 text-white">
          <h3 className="text-base font-bold mb-1">실시간 검색</h3>
          <p className="text-xs text-slate-400 mb-6">
            시장 정비비 기준 조회
          </p>

          {/* 검색 옵션 */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                차종
              </label>
              <select
                value={searchVehicleType}
                onChange={(e) => setSearchVehicleType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">차종 선택</option>
                {VEHICLE_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                차량 연식 (년)
              </label>
              <input
                type="number"
                value={searchAge}
                onChange={(e) => setSearchAge(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleSearch}
              disabled={searching || !searchVehicleType}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white font-semibold text-xs rounded-lg transition"
            >
              {searching ? '검색 중...' : '실시간 검색'}
            </button>
          </div>

          {/* 검색 결과 */}
          {showResults && (
            <div className="mt-6 pt-6 border-t border-slate-700">
              <div className="text-xs font-semibold text-slate-300 mb-3">
                검색 결과
              </div>
              {searchResults.length === 0 ? (
                <p className="text-xs text-slate-400">
                  결과가 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {searchResults.map((result, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-800 rounded-lg p-3 border border-slate-700"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-xs font-semibold text-white">
                            {result.vehicle_type}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {result.age}년식
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-blue-400 mb-2">
                        {formatCurrency(result.estimated_monthly_cost)}원/월
                      </p>
                      <p className="text-xs text-slate-400 mb-2">
                        {result.market_data}
                      </p>
                      <p className="text-xs text-slate-500">
                        출처: {result.source}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
