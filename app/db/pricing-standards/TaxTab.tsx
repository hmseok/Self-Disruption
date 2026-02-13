'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface TaxRecord {
  id?: number
  tax_type: string
  fuel_category: string
  cc_min: number
  cc_max: number
  rate_per_cc: number
  fixed_annual: number
  education_tax_rate: number
  notes: string
}

interface SearchResult {
  id: string
  tax_type: string
  fuel_category: string
  current_rate: number
  legal_rate: number
  status: string
  source: string
}

const TAX_TYPES = ['영업용', '비영업용']
const FUEL_CATEGORIES = ['내연기관', '전기']

export default function TaxTab() {
  const supabase = createClientComponentClient()

  const [rows, setRows] = useState<TaxRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)

  // Search panel state
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)

  // Example calculation state
  const [exampleCc, setExampleCc] = useState(2000)
  const [exampleTaxType, setExampleTaxType] = useState('비영업용')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('vehicle_tax_table')
        .select('*')
        .order('tax_type', { ascending: true })

      if (error) throw error
      setRows(data || [])
    } catch (err) {
      console.error('Error fetching tax data:', err)
    } finally {
      setLoading(false)
    }
  }

  const addRow = async () => {
    const newRow: TaxRecord = {
      tax_type: TAX_TYPES[0],
      fuel_category: FUEL_CATEGORIES[0],
      cc_min: 0,
      cc_max: 2000,
      rate_per_cc: 80,
      fixed_annual: 0,
      education_tax_rate: 30,
      notes: ''
    }

    try {
      const { data, error } = await supabase
        .from('vehicle_tax_table')
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
        .from('vehicle_tax_table')
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
        .from('vehicle_tax_table')
        .delete()
        .eq('id', id)

      if (error) throw error
      setRows(rows.filter(r => r.id !== id))
    } catch (err) {
      console.error('Error deleting row:', err)
    }
  }

  const handleSearch = async () => {
    setSearching(true)
    try {
      const response = await fetch('/api/search-pricing-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'tax'
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

  const calculateExampleTax = () => {
    // 예제 계산: 선택한 차량 등급에 해당하는 세율 적용
    const matchingRow = rows.find(r =>
      r.tax_type === exampleTaxType &&
      r.fuel_category === '내연기관' &&
      exampleCc >= r.cc_min &&
      exampleCc <= r.cc_max
    )

    if (!matchingRow) return null

    const taxBeforeEducation = exampleCc * matchingRow.rate_per_cc
    const educationTax = taxBeforeEducation * (matchingRow.education_tax_rate / 100)
    const totalAnnual = taxBeforeEducation + educationTax

    return {
      taxBeforeEducation,
      educationTax,
      totalAnnual
    }
  }

  const exampleTax = calculateExampleTax()

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
              <h3 className="text-base font-bold text-gray-900">자동차세 기준</h3>
              <p className="text-xs text-gray-500 mt-1">
                구분별 연료별 세율 관리
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
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">구분</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">연료</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">배기량(cc) 하한</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">배기량(cc) 상한</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">cc당 세율</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">연 고정세</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">교육세율(%)</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">비고</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">삭제</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                      로딩 중...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-blue-50/30 transition">
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'tax_type' ? (
                          <select
                            value={row.tax_type}
                            onChange={(e) => {
                              updateField(row.id, 'tax_type', e.target.value)
                              setEditingId(null)
                              setEditingField(null)
                            }}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            {TAX_TYPES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            onClick={() => {
                              setEditingId(row.id || null)
                              setEditingField('tax_type')
                            }}
                            className={`cursor-pointer inline-block font-semibold ${
                              row.tax_type === '영업용'
                                ? 'text-amber-600'
                                : 'text-gray-900'
                            }`}
                          >
                            {row.tax_type}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'fuel_category' ? (
                          <select
                            value={row.fuel_category}
                            onChange={(e) => {
                              updateField(row.id, 'fuel_category', e.target.value)
                              setEditingId(null)
                              setEditingField(null)
                            }}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            {FUEL_CATEGORIES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            onClick={() => {
                              setEditingId(row.id || null)
                              setEditingField('fuel_category')
                            }}
                            className="cursor-pointer text-gray-900 hover:text-blue-600 inline-block"
                          >
                            {row.fuel_category}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'cc_min' ? (
                          <input
                            type="number"
                            value={row.cc_min}
                            onChange={(e) => updateField(row.id, 'cc_min', parseInt(e.target.value) || 0)}
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
                              setEditingField('cc_min')
                            }}
                            className="cursor-pointer text-gray-900 hover:text-blue-600 inline-block"
                          >
                            {formatCurrency(row.cc_min)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'cc_max' ? (
                          <input
                            type="number"
                            value={row.cc_max}
                            onChange={(e) => updateField(row.id, 'cc_max', parseInt(e.target.value) || 0)}
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
                              setEditingField('cc_max')
                            }}
                            className="cursor-pointer text-gray-900 hover:text-blue-600 inline-block"
                          >
                            {formatCurrency(row.cc_max)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'rate_per_cc' ? (
                          <input
                            type="number"
                            value={row.rate_per_cc}
                            onChange={(e) => updateField(row.id, 'rate_per_cc', parseInt(e.target.value) || 0)}
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
                              setEditingField('rate_per_cc')
                            }}
                            className="cursor-pointer text-gray-900 hover:text-blue-600 font-semibold inline-block"
                          >
                            {formatCurrency(row.rate_per_cc)}원/cc
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'fixed_annual' ? (
                          <input
                            type="number"
                            value={row.fixed_annual}
                            onChange={(e) => updateField(row.id, 'fixed_annual', parseInt(e.target.value) || 0)}
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
                              setEditingField('fixed_annual')
                            }}
                            className="cursor-pointer text-gray-900 hover:text-blue-600 inline-block"
                          >
                            {row.fixed_annual > 0 ? formatCurrency(row.fixed_annual) + '원' : '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id && editingField === 'education_tax_rate' ? (
                          <input
                            type="number"
                            value={row.education_tax_rate}
                            onChange={(e) => updateField(row.id, 'education_tax_rate', parseInt(e.target.value) || 0)}
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
                              setEditingField('education_tax_rate')
                            }}
                            className="cursor-pointer text-gray-900 hover:text-blue-600 inline-block"
                          >
                            {row.education_tax_rate}%
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

      {/* 우측: 검증 패널 */}
      <div className="lg:col-span-4">
        <div className="bg-slate-900 rounded-2xl shadow-sm p-6 text-white">
          <h3 className="text-base font-bold mb-1">실시간 검증</h3>
          <p className="text-xs text-slate-400 mb-6">
            법정 세율 검증
          </p>

          {/* 예제 계산 */}
          <div className="bg-slate-800 rounded-lg p-4 mb-6 border border-slate-700">
            <p className="text-xs font-semibold text-slate-300 mb-3">
              예) 차량 세율 시뮬레이션
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-2">
                  구분
                </label>
                <select
                  value={exampleTaxType}
                  onChange={(e) => setExampleTaxType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TAX_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-2">
                  배기량 (cc)
                </label>
                <input
                  type="number"
                  value={exampleCc}
                  onChange={(e) => setExampleCc(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {exampleTax && (
                <div className="bg-slate-900 rounded border border-slate-600 p-3 mt-3">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">기본세</span>
                      <span className="font-semibold text-slate-200">
                        {formatCurrency(exampleTax.taxBeforeEducation)}원
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">교육세</span>
                      <span className="font-semibold text-slate-200">
                        {formatCurrency(exampleTax.educationTax)}원
                      </span>
                    </div>
                    <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between">
                      <span className="text-xs font-semibold text-slate-300">연 세액</span>
                      <span className="font-bold text-blue-400 text-sm">
                        {formatCurrency(exampleTax.totalAnnual)}원
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 검증 버튼 */}
          <button
            onClick={handleSearch}
            disabled={searching}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white font-semibold text-xs rounded-lg transition"
          >
            {searching ? '검증 중...' : '실시간 검증'}
          </button>

          {/* 검증 결과 */}
          {showResults && (
            <div className="mt-6 pt-6 border-t border-slate-700">
              <div className="text-xs font-semibold text-slate-300 mb-3">
                검증 결과
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
                      className={`rounded-lg p-3 border ${
                        result.status === 'compliant'
                          ? 'bg-emerald-900/30 border-emerald-600'
                          : 'bg-red-900/30 border-red-600'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-xs font-semibold text-white">
                            {result.tax_type}
                          </p>
                          <p className="text-xs text-slate-300 mt-1">
                            {result.fuel_category}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded ${
                            result.status === 'compliant'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-red-600 text-white'
                          }`}
                        >
                          {result.status === 'compliant' ? '적정' : '부적정'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-slate-300">
                          현재: <span className="font-semibold text-white">{formatCurrency(result.current_rate)}원/cc</span>
                        </p>
                        <p className="text-xs text-slate-300">
                          법정: <span className="font-semibold text-white">{formatCurrency(result.legal_rate)}원/cc</span>
                        </p>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
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
