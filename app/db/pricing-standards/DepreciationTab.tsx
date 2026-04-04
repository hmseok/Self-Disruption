'use client'

import { useEffect, useState, useCallback } from 'react'

// ============================================================================
// AUTH HELPER
// ============================================================================
async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

// ─── Types ────────────────────────────────────────────────
interface DepreciationRate {
  id: number
  origin: string
  vehicle_class: string
  fuel_type: string
  rate_1yr: number
  rate_2yr: number
  rate_3yr: number
  rate_4yr: number
  rate_5yr: number
  description: string
  is_active: boolean
  updated_at: string
}

interface Adjustment {
  id: number
  adjustment_type: string
  target_origin: string | null
  target_vehicle_class: string | null
  target_fuel_type: string | null
  factor: number
  label: string
  description: string
  effective_from: string
  effective_to: string | null
  is_active: boolean
}

interface HistoryEntry {
  id: number
  source_table: string
  source_id: number
  changed_field: string
  old_value: string | null
  new_value: string | null
  changed_at: string
  reason: string | null
}

// ─── Constants ────────────────────────────────────────────
const ORIGINS = ['국산', '수입'] as const
const VEHICLE_CLASSES = [
  '경차', '소형_세단', '준중형_세단', '중형_세단', '대형_세단',
  '소형_SUV', '중형_SUV', '대형_SUV', 'MPV', '프리미엄',
] as const
const FUEL_TYPES = ['내연기관', '하이브리드', '전기'] as const

const CLASS_LABELS: Record<string, string> = {
  '경차': '경차', '소형_세단': '소형 세단', '준중형_세단': '준중형 세단',
  '중형_세단': '중형 세단', '대형_세단': '대형 세단', '소형_SUV': '소형 SUV',
  '중형_SUV': '중형 SUV', '대형_SUV': '대형 SUV', 'MPV': 'MPV/미니밴', '프리미엄': '프리미엄',
}

const FUEL_LABELS: Record<string, string> = {
  '내연기관': '내연기관', '하이브리드': 'HEV', '전기': 'EV',
}

const FUEL_COLORS: Record<string, string> = {
  '내연기관': 'bg-gray-100 text-gray-700',
  '하이브리드': 'bg-emerald-50 text-emerald-700',
  '전기': 'bg-blue-50 text-blue-700',
}

const ORIGIN_COLORS: Record<string, string> = {
  '국산': 'bg-steel-50 text-steel-700',
  '수입': 'bg-amber-50 text-amber-700',
}

// 업계 비교 기준 데이터 (대형 렌터카사 참고)
const INDUSTRY_BENCHMARKS = [
  { origin: '국산', cls: '중형_세단', fuel: '내연기관', yr1: 78, yr3: 56, yr5: 36 },
  { origin: '수입', cls: '중형_세단', fuel: '내연기관', yr1: 72, yr3: 48, yr5: 33 },
  { origin: '국산', cls: '중형_SUV', fuel: '내연기관', yr1: 80, yr3: 60, yr5: 41 },
  { origin: '국산', cls: '중형_세단', fuel: '전기', yr1: 75, yr3: 50, yr5: 32 },
]

// ─── Component ────────────────────────────────────────────
export default function DepreciationTab() {
  // 데이터
  const [rates, setRates] = useState<DepreciationRate[]>([])
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  // 필터
  const [filterOrigin, setFilterOrigin] = useState<string>('전체')
  const [filterFuel, setFilterFuel] = useState<string>('전체')

  // UI 상태
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showGuide, setShowGuide] = useState(true)
  const [showAdjustments, setShowAdjustments] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<{ results: string; sources: string[]; searched_at: string } | null>(null)

  // ─── 데이터 로드 ──────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const headers = await getAuthHeader()
      const [ratesRes, adjRes, histRes] = await Promise.all([
        fetch('/api/pricing-standards?table=depreciation_rates', { headers }),
        fetch('/api/pricing-standards?table=depreciation_adjustments', { headers }),
        fetch('/api/pricing-standards?table=depreciation_history', { headers }),
      ])
      const [ratesData, adjData, histData] = await Promise.all([
        ratesRes.json(), adjRes.json(), histRes.json()
      ])
      setRates(ratesData.data || [])
      setAdjustments(adjData.data || [])
      setHistory(histData.data || [])
    } catch (error) {
      console.error('데이터 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── 필터 로직 ────────────────────────────────────────
  const filteredRates = rates.filter(r => {
    if (filterOrigin !== '전체' && r.origin !== filterOrigin) return false
    if (filterFuel !== '전체' && r.fuel_type !== filterFuel) return false
    return true
  })

  // ─── 셀 편집 ─────────────────────────────────────────
  const handleCellClick = (rowId: number, field: string, value: any) => {
    setEditingCell({ rowId, field })
    setEditValue(String(value ?? ''))
  }

  const handleCellBlur = async () => {
    if (!editingCell) return
    const { rowId, field } = editingCell
    const row = rates.find(r => r.id === rowId)
    if (!row) { setEditingCell(null); return }

    const isRate = field.startsWith('rate_')
    const newValue = isRate ? parseFloat(editValue) || 0 : editValue
    const oldValue = row[field as keyof DepreciationRate]
    if (String(oldValue) === String(newValue)) { setEditingCell(null); return }

    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/pricing-standards/depreciation_rates/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ [field]: newValue })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '업데이트 실패')
      setRates(rates.map(r => r.id === rowId ? { ...r, [field]: newValue } : r))

      // 이력 기록
      const histRes = await fetch('/api/pricing-standards/depreciation_history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          source_table: 'depreciation_rates',
          source_id: rowId,
          changed_field: field,
          old_value: String(oldValue),
          new_value: String(newValue),
        })
      })
      if (!histRes.ok) console.error('이력 기록 실패')
    } catch (error) {
      console.error('업데이트 실패:', error)
    } finally {
      setEditingCell(null)
    }
  }

  // ─── 행 추가/삭제 ────────────────────────────────────
  const handleAddRow = async () => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/pricing-standards/depreciation_rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          origin: '국산', vehicle_class: '중형_세단', fuel_type: '내연기관',
          rate_1yr: 0, rate_2yr: 0, rate_3yr: 0, rate_4yr: 0, rate_5yr: 0,
          description: '', is_active: true,
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '행 추가 실패')
      if (json.data?.[0]) setRates([...rates, json.data[0]])
    } catch (error) {
      console.error('행 추가 실패:', error)
    }
  }

  const handleDeleteRow = async (rowId: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/pricing-standards/depreciation_rates/${rowId}`, {
        method: 'DELETE',
        headers
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '삭제 실패')
      setRates(rates.filter(r => r.id !== rowId))
    } catch (error) {
      console.error('삭제 실패:', error)
    }
  }

  // ─── 보정 계수 토글 ──────────────────────────────────
  const handleToggleAdjustment = async (adj: Adjustment) => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/pricing-standards/depreciation_adjustments/${adj.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ is_active: !adj.is_active })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '변경 실패')
      setAdjustments(adjustments.map(a => a.id === adj.id ? { ...a, is_active: !a.is_active } : a))

      const histRes = await fetch('/api/pricing-standards/depreciation_history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          source_table: 'depreciation_adjustments',
          source_id: adj.id,
          changed_field: 'is_active',
          old_value: String(adj.is_active),
          new_value: String(!adj.is_active),
        })
      })
      if (!histRes.ok) console.error('이력 기록 실패')
    } catch (error) {
      console.error('보정 계수 변경 실패:', error)
    }
  }

  const handleUpdateAdjustmentFactor = async (adj: Adjustment, newFactor: number) => {
    if (adj.factor === newFactor) return
    try {
      const authHeaders = await getAuthHeader();
      const updateRes = await fetch(`/api/pricing-standards?table=depreciation_adjustments&id=${adj.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ factor: newFactor })
      })
      const updateData = await updateRes.json()
      if (updateData.error) throw new Error(updateData.error)
      setAdjustments(adjustments.map(a => a.id === adj.id ? { ...a, factor: newFactor } : a))

      const histRes = await fetch('/api/pricing-standards?table=depreciation_history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          source_table: 'depreciation_adjustments',
          source_id: adj.id,
          changed_field: 'factor',
          old_value: String(adj.factor),
          new_value: String(newFactor),
        })
      })
      if (!histRes.ok) console.error('이력 기록 실패')
    } catch (error) {
      console.error('계수 업데이트 실패:', error)
    }
  }

  // ─── AI 검색 ─────────────────────────────────────────
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
      setSearchResults(await response.json())
    } catch (error) {
      console.error('검색 실패:', error)
    } finally {
      setSearching(false)
    }
  }

  // ─── 유틸 ────────────────────────────────────────────
  const getRateColor = (rate: number) => {
    if (rate >= 70) return 'text-emerald-600 bg-emerald-50'
    if (rate >= 50) return 'text-amber-600 bg-amber-50'
    if (rate > 0) return 'text-red-600 bg-red-50'
    return 'text-gray-400 bg-gray-50'
  }

  const getActiveAdjustments = (type: string) => adjustments.filter(a => a.adjustment_type === type && a.is_active)
  const formatDate = (d: string) => new Date(d).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  // ─── 보정 적용 미리보기 ───────────────────────────────
  const getAdjustedRate = (row: DepreciationRate, field: string) => {
    const baseRate = row[field as keyof DepreciationRate] as number
    if (!baseRate) return baseRate

    let factor = 1.0
    for (const adj of adjustments.filter(a => a.is_active)) {
      // 범위 체크
      if (adj.target_origin && adj.target_origin !== row.origin) continue
      if (adj.target_vehicle_class && adj.target_vehicle_class !== row.vehicle_class) continue
      if (adj.target_fuel_type && adj.target_fuel_type !== row.fuel_type) continue
      factor *= adj.factor
    }
    return Math.round(baseRate * factor * 10) / 10
  }

  const hasActiveAdjustments = adjustments.some(a => a.is_active && a.factor !== 1.0)

  if (loading) {
    return <div className="bg-white rounded-2xl shadow-sm p-8 text-center"><p className="text-gray-500">로딩 중...</p></div>
  }

  return (
    <div className="space-y-4">
      {/* 가이드 섹션 */}
      {showGuide && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-5 border border-emerald-100">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📉</span>
              <h3 className="text-sm font-bold text-gray-800">감가상각 기준 (3축 분류)</h3>
            </div>
            <button onClick={() => setShowGuide(false)} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600 leading-relaxed">
            <div>
              <p className="font-semibold text-gray-700 mb-1">3축 분류 체계</p>
              <p><strong>원산지</strong>(국산/수입) × <strong>차급</strong>(경차~프리미엄) × <strong>연료</strong>(내연기관/HEV/EV)로 분류합니다. 조합별로 잔존율이 다르며, 없는 조합은 상위 그룹 값을 참조합니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">보정 계수</p>
              <p>기본 감가율에 3가지 보정을 곱합니다: <strong>주행거리 약정</strong>(연 2만km 기준), <strong>시장 상황</strong>(특이 이벤트 시), <strong>인기도</strong>(A/B/C 등급). 보정 계수 패널에서 관리합니다.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">산출 공식</p>
              <p>최종 잔존율 = 기본 잔존율 × 주행거리 보정 × 시장 보정 × 인기도 보정. 이 값으로 렌트료의 감가 비용(40~60% 비중)을 산출합니다.</p>
            </div>
          </div>
        </div>
      )}

      {/* 메인 테이블 영역 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-visible border border-gray-100">
        {/* 헤더 */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900">감가 기준표</h3>
            <div className="flex gap-2">
              {!showGuide && (
                <button onClick={() => setShowGuide(true)} className="px-3 py-1.5 text-xs text-steel-600 bg-steel-50 rounded-lg hover:bg-steel-100 transition-colors">
                  가이드 💡
                </button>
              )}
              <button onClick={() => setShowAdjustments(!showAdjustments)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${showAdjustments ? 'bg-amber-500 text-white' : 'text-amber-600 bg-amber-50 hover:bg-amber-100'}`}>
                {showAdjustments ? '⚙️ 보정 계수 닫기' : '⚙️ 보정 계수'}
                {hasActiveAdjustments && !showAdjustments && <span className="ml-1 w-1.5 h-1.5 bg-amber-500 rounded-full inline-block" />}
              </button>
              <button onClick={() => setShowHistory(!showHistory)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${showHistory ? 'bg-slate-700 text-white' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'}`}>
                {showHistory ? '📋 이력 닫기' : '📋 이력'}
              </button>
              <button onClick={() => setShowAIPanel(!showAIPanel)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${showAIPanel ? 'bg-slate-900 text-white' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'}`}>
                {showAIPanel ? '🔍 AI 닫기' : '🔍 AI 검증'}
              </button>
              <button onClick={handleAddRow} className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-colors">
                + 행 추가
              </button>
            </div>
          </div>

          {/* 필터 */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400 font-semibold">필터</span>
            <div className="flex gap-1">
              {['전체', ...ORIGINS].map(o => (
                <button key={o} onClick={() => setFilterOrigin(o)}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition ${filterOrigin === o ? 'bg-gray-900 text-white font-semibold' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {o}
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex gap-1">
              {['전체', ...FUEL_TYPES].map(f => (
                <button key={f} onClick={() => setFilterFuel(f)}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition ${filterFuel === f ? 'bg-gray-900 text-white font-semibold' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {f === '전체' ? f : FUEL_LABELS[f] || f}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-gray-400 ml-auto">{filteredRates.length}건</span>
          </div>
        </div>

        {/* 테이블 */}
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">원산지</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">차급</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">연료</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">1년차</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">2년차</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">3년차</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">4년차</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">5년차</th>
                {hasActiveAdjustments && <th className="px-3 py-2 text-center font-semibold text-amber-600 whitespace-nowrap">보정 3년</th>}
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">설명</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">삭제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredRates.length === 0 ? (
                <tr><td colSpan={hasActiveAdjustments ? 11 : 10} className="px-4 py-10 text-center text-gray-400">
                  {rates.length === 0 ? '데이터가 없습니다. 행을 추가해주세요.' : '필터 조건에 맞는 데이터가 없습니다.'}
                </td></tr>
              ) : (
                filteredRates.map((row) => (
                  <tr key={row.id} className={`hover:bg-gray-50/30 transition-colors ${!row.is_active ? 'opacity-40' : ''}`}>
                    {/* 원산지 */}
                    <td className="px-3 py-2">
                      {editingCell?.rowId === row.id && editingCell?.field === 'origin' ? (
                        <select value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none">
                          {ORIGINS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'origin', row.origin)}
                          className={`cursor-pointer px-2 py-0.5 rounded text-[11px] font-bold ${ORIGIN_COLORS[row.origin] || ''}`}>
                          {row.origin}
                        </span>
                      )}
                    </td>
                    {/* 차급 */}
                    <td className="px-3 py-2">
                      {editingCell?.rowId === row.id && editingCell?.field === 'vehicle_class' ? (
                        <select value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none">
                          {VEHICLE_CLASSES.map(c => <option key={c} value={c}>{CLASS_LABELS[c]}</option>)}
                        </select>
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'vehicle_class', row.vehicle_class)}
                          className="cursor-pointer font-medium text-gray-800 hover:bg-gray-50 px-2 py-0.5 rounded inline-block">
                          {CLASS_LABELS[row.vehicle_class] || row.vehicle_class}
                        </span>
                      )}
                    </td>
                    {/* 연료 */}
                    <td className="px-3 py-2">
                      {editingCell?.rowId === row.id && editingCell?.field === 'fuel_type' ? (
                        <select value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none">
                          {FUEL_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'fuel_type', row.fuel_type)}
                          className={`cursor-pointer px-2 py-0.5 rounded text-[11px] font-semibold ${FUEL_COLORS[row.fuel_type] || ''}`}>
                          {FUEL_LABELS[row.fuel_type] || row.fuel_type}
                        </span>
                      )}
                    </td>
                    {/* 잔존율 */}
                    {(['rate_1yr', 'rate_2yr', 'rate_3yr', 'rate_4yr', 'rate_5yr'] as const).map((field) => (
                      <td key={field} className="px-3 py-2 text-center">
                        {editingCell?.rowId === row.id && editingCell?.field === field ? (
                          <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                            className="w-16 px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none mx-auto text-center" step="0.1" min="0" max="100" />
                        ) : (
                          <span onClick={() => handleCellClick(row.id, field, row[field])}
                            className={`cursor-pointer px-2 py-0.5 rounded inline-block font-bold text-xs ${getRateColor(row[field])}`}>
                            {row[field] > 0 ? `${Number(row[field]).toFixed(1)}%` : '—'}
                          </span>
                        )}
                      </td>
                    ))}
                    {/* 보정 적용 미리보기 */}
                    {hasActiveAdjustments && (
                      <td className="px-3 py-2 text-center">
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700">
                          {getAdjustedRate(row, 'rate_3yr').toFixed(1)}%
                        </span>
                      </td>
                    )}
                    {/* 설명 */}
                    <td className="px-3 py-2">
                      {editingCell?.rowId === row.id && editingCell?.field === 'description' ? (
                        <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} autoFocus
                          className="w-full px-2 py-1 border border-steel-400 rounded text-xs focus:outline-none" />
                      ) : (
                        <span onClick={() => handleCellClick(row.id, 'description', row.description)}
                          className="cursor-pointer text-gray-500 hover:text-gray-700 inline-block max-w-[200px] truncate">
                          {row.description || '—'}
                        </span>
                      )}
                    </td>
                    {/* 삭제 */}
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => handleDeleteRow(row.id)} className="text-red-400 hover:text-red-600 text-xs transition-colors">삭제</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 업계 비교 */}
        <div className="p-5 border-t border-gray-100 bg-gray-50/50">
          <p className="text-xs font-semibold text-gray-500 mb-3">📊 업계 평균 참고값 (대형 렌터카사 기반)</p>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left py-1.5 px-3 font-medium whitespace-nowrap">원산지</th>
                  <th className="text-left py-1.5 px-3 font-medium whitespace-nowrap">차급</th>
                  <th className="text-left py-1.5 px-3 font-medium whitespace-nowrap">연료</th>
                  <th className="text-center py-1.5 px-3 font-medium whitespace-nowrap">1년</th>
                  <th className="text-center py-1.5 px-3 font-medium whitespace-nowrap">3년</th>
                  <th className="text-center py-1.5 px-3 font-medium whitespace-nowrap">5년</th>
                </tr>
              </thead>
              <tbody>
                {INDUSTRY_BENCHMARKS.map((b, i) => (
                  <tr key={i} className="text-gray-500 border-t border-gray-100">
                    <td className="py-1.5 px-3">{b.origin}</td>
                    <td className="py-1.5 px-3">{CLASS_LABELS[b.cls] || b.cls}</td>
                    <td className="py-1.5 px-3">{FUEL_LABELS[b.fuel] || b.fuel}</td>
                    <td className="text-center py-1.5 px-3">{b.yr1}%</td>
                    <td className="text-center py-1.5 px-3">{b.yr3}%</td>
                    <td className="text-center py-1.5 px-3">{b.yr5}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── 보정 계수 패널 ─────────────────────────────── */}
      {showAdjustments && (
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">보정 계수 관리</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">활성화된 보정 계수는 기본 잔존율에 곱하여 최종 잔존율을 산출합니다</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 주행거리 약정 보정 */}
            <div>
              <p className="text-xs font-bold text-gray-700 mb-2">🛣️ 주행거리 약정 보정</p>
              <p className="text-[10px] text-gray-400 mb-3">기본 감가율은 연 2만km 기준입니다</p>
              <div className="space-y-2">
                {adjustments.filter(a => a.adjustment_type === 'mileage').map(adj => (
                  <div key={adj.id} className={`p-3 rounded-lg border transition ${adj.is_active ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-800">{adj.label}</span>
                      <button onClick={() => handleToggleAdjustment(adj)}
                        className={`w-8 h-4 rounded-full transition-colors relative ${adj.is_active ? 'bg-amber-500' : 'bg-gray-300'}`}>
                        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${adj.is_active ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500">{adj.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-gray-400">계수:</span>
                      <input type="number" step="0.01" value={adj.factor}
                        onChange={(e) => handleUpdateAdjustmentFactor(adj, parseFloat(e.target.value) || 1)}
                        className="w-16 px-1.5 py-0.5 text-xs border rounded text-center font-mono focus:outline-none focus:border-amber-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 시장 상황 보정 */}
            <div>
              <p className="text-xs font-bold text-gray-700 mb-2">📈 시장 상황 보정</p>
              <p className="text-[10px] text-gray-400 mb-3">특수 상황 시에만 활성화하세요</p>
              <div className="space-y-2">
                {adjustments.filter(a => a.adjustment_type === 'market_condition').map(adj => (
                  <div key={adj.id} className={`p-3 rounded-lg border transition ${adj.is_active ? (adj.factor > 1 ? 'bg-emerald-50 border-emerald-200' : adj.factor < 1 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200') : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-800">{adj.label}</span>
                      <button onClick={() => handleToggleAdjustment(adj)}
                        className={`w-8 h-4 rounded-full transition-colors relative ${adj.is_active ? 'bg-amber-500' : 'bg-gray-300'}`}>
                        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${adj.is_active ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500">{adj.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-gray-400">계수:</span>
                      <input type="number" step="0.01" value={adj.factor}
                        onChange={(e) => handleUpdateAdjustmentFactor(adj, parseFloat(e.target.value) || 1)}
                        className="w-16 px-1.5 py-0.5 text-xs border rounded text-center font-mono focus:outline-none focus:border-amber-400" />
                      <span className={`text-[10px] font-semibold ${adj.factor > 1 ? 'text-emerald-600' : adj.factor < 1 ? 'text-red-600' : 'text-gray-400'}`}>
                        {adj.factor > 1 ? `+${((adj.factor - 1) * 100).toFixed(0)}%` : adj.factor < 1 ? `${((adj.factor - 1) * 100).toFixed(0)}%` : '±0'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 인기도 보정 */}
            <div>
              <p className="text-xs font-bold text-gray-700 mb-2">⭐ 인기도 보정</p>
              <p className="text-[10px] text-gray-400 mb-3">견적 시 차량 인기도에 따라 선택합니다</p>
              <div className="space-y-2">
                {adjustments.filter(a => a.adjustment_type === 'popularity').map(adj => (
                  <div key={adj.id} className={`p-3 rounded-lg border transition ${adj.is_active ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-800">{adj.label}</span>
                      <button onClick={() => handleToggleAdjustment(adj)}
                        className={`w-8 h-4 rounded-full transition-colors relative ${adj.is_active ? 'bg-amber-500' : 'bg-gray-300'}`}>
                        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${adj.is_active ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500">{adj.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-gray-400">계수:</span>
                      <input type="number" step="0.01" value={adj.factor}
                        onChange={(e) => handleUpdateAdjustmentFactor(adj, parseFloat(e.target.value) || 1)}
                        className="w-16 px-1.5 py-0.5 text-xs border rounded text-center font-mono focus:outline-none focus:border-amber-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 보정 요약 */}
          {hasActiveAdjustments && (
            <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs font-semibold text-amber-800 mb-1">현재 활성 보정</p>
              <div className="flex flex-wrap gap-2">
                {adjustments.filter(a => a.is_active && a.factor !== 1.0).map(a => (
                  <span key={a.id} className="px-2 py-0.5 bg-white rounded border border-amber-300 text-[10px] text-amber-700">
                    {a.label}: <strong>×{a.factor}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 변경 이력 ──────────────────────────────────── */}
      {showHistory && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">변경 이력</h3>
          {history.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">아직 변경 이력이 없습니다</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {history.map(h => (
                <div key={h.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-gray-50">
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDate(h.changed_at)}</span>
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-mono">{h.changed_field}</span>
                  <span className="text-red-400 line-through">{h.old_value}</span>
                  <span className="text-gray-300">→</span>
                  <span className="text-emerald-600 font-semibold">{h.new_value}</span>
                  {h.reason && <span className="text-gray-400 text-[10px]">({h.reason})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AI 검증 패널 ───────────────────────────────── */}
      {showAIPanel && (
        <div className="bg-slate-900 rounded-2xl shadow-sm p-5 text-white border border-slate-800">
          <h3 className="text-sm font-bold mb-1">실시간 시장 검증</h3>
          <p className="text-[10px] text-slate-400 mb-4">Gemini AI로 현재 중고차 시세를 조회하여 잔존율 적정성을 검증합니다</p>

          <div className="mb-3">
            <label className="text-[10px] font-semibold text-slate-300 block mb-1.5">검증할 차종</label>
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-steel-500">
              <option value="">선택하세요</option>
              {rates.map((row) => (
                <option key={row.id} value={`${row.origin} ${CLASS_LABELS[row.vehicle_class]} ${FUEL_LABELS[row.fuel_type]}`}>
                  {row.origin} {CLASS_LABELS[row.vehicle_class]} ({FUEL_LABELS[row.fuel_type]})
                </option>
              ))}
            </select>
          </div>

          <button onClick={handleSearch} disabled={searching || !selectedCategory}
            className="w-full px-4 py-2.5 bg-steel-600 text-white font-semibold text-xs rounded-lg hover:bg-steel-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors mb-4">
            {searching ? '시장 데이터 조회 중...' : '🔍 실시간 시장 검증'}
          </button>

          {searchResults && (
            <div className="space-y-3">
              <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] font-semibold text-slate-300">Gemini 검증 결과</h4>
                  <span className="text-[9px] text-slate-500">{searchResults.searched_at}</span>
                </div>
                <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {searchResults.results}
                </div>
              </div>
              {searchResults.sources?.length > 0 && (
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <h4 className="text-[10px] font-semibold text-slate-300 mb-2">참고 출처</h4>
                  <div className="space-y-1">
                    {searchResults.sources.map((source, idx) => (
                      <a key={idx} href={source} target="_blank" rel="noopener noreferrer"
                        className="text-slate-400 hover:text-slate-300 text-[10px] break-all underline block leading-snug">
                        {source.length > 60 ? source.substring(0, 60) + '...' : source}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!searchResults && !searching && (
            <div className="text-center text-slate-500 text-xs py-3">
              차종을 선택하고 검증을 시작하세요.<br />
              <span className="text-slate-600 text-[10px]">중고차 시세·매각 데이터를 실시간으로 조회합니다</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
