'use client'

import { useEffect, useState, useMemo } from 'react'
import { fetchPricingStandardsData, updatePricingStandardsRow, getAuthHeader } from '@/app/utils/pricing-standards'

// ── 타입 정의 ──────────────────────────────────────────────────────────
interface InsuranceRow {
  id: number
  vehicle_type: string
  value_min: number
  value_max: number
  annual_premium: number
  coverage_desc: string
  notes: string
}

interface PolicyRecord {
  id: number
  group_id: number | null
  vehicle_name: string
  vehicle_category: string
  vehicle_number: string
  engine_cc: number
  vehicle_value: number
  fuel_type: string
  origin: string
  brand: string
  insurer: string
  policy_number: string
  contract_start: string
  contract_end: string
  premium_daein1: number
  premium_daein2: number
  premium_daemul: number
  daemul_limit: number
  premium_self_body: number
  premium_uninsured: number
  premium_own_vehicle: number
  own_vehicle_deductible_v2v: number
  own_vehicle_deductible_other: number
  premium_emergency: number
  premium_limit_surcharge: number
  total_premium: number
  discount_grade: string
  discount_rate: number
  membership_history: string
  membership_factor: number
  age_limit: string
  deductible_surcharge: number
  special_surcharges: string[]
  source_file: string
  notes: string
  is_active: boolean
  created_at: string
}

interface BasePremium {
  id: number
  vehicle_usage: string
  insurer: string
  daein1: number
  daein2: number
  daemul: number
  daemul_limit: string
  self_body: number
  uninsured: number
  emergency: number
  limit_surcharge: number
  base_total: number
}

interface OwnVehicleRate {
  id: number
  origin: string
  fuel_type: string
  vehicle_class: string
  value_min: number
  value_max: number
  own_vehicle_rate: number
  sample_count: number
  notes: string
}

interface InsuranceGroup {
  id: number
  group_name: string
  origin: string
  fuel_type: string
  brand: string
  model: string
  vehicle_class: string
  avg_own_rate: number
  avg_total_premium: number
  avg_vehicle_value: number
  policy_count: number
  color: string
  sort_order: number
  notes: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── 포맷 헬퍼 ──────────────────────────────────────────────────────────
const fmt = (n: number) => n?.toLocaleString('ko-KR') ?? '-'
const fmtMan = (n: number) => {
  if (!n) return '-'
  const man = Math.round(n / 10000)
  return man >= 100 ? `${(man / 100).toFixed(0)}억` : `${man.toLocaleString()}만`
}
const fmtWon = (n: number) => n ? `${fmt(n)}원` : '-'
const fmtPct = (n: number, d = 2) => n ? `${n.toFixed(d)}%` : '-'

// ── 서브탭 타입 ──────────────────────────────────────────────────────────
type SubTab = 'rates' | 'records' | 'groups' | 'analysis'

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'rates', label: '기준요율표', icon: '📋' },
  { id: 'groups', label: '그룹 관리', icon: '🏷️' },
  { id: 'records', label: '실데이터 기록', icon: '📄' },
  { id: 'analysis', label: '요율 분석', icon: '📊' },
]

export default function InsuranceTab() {
  const [subTab, setSubTab] = useState<SubTab>('rates')
  const [loading, setLoading] = useState(true)

  // 데이터
  const [rateRows, setRateRows] = useState<InsuranceRow[]>([])
  const [policies, setPolicies] = useState<PolicyRecord[]>([])
  const [basePremiums, setBasePremiums] = useState<BasePremium[]>([])
  const [ownRates, setOwnRates] = useState<OwnVehicleRate[]>([])
  const [groups, setGroups] = useState<InsuranceGroup[]>([])

  // UI 상태
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [filterOrigin, setFilterOrigin] = useState<string>('')
  const [filterFuel, setFilterFuel] = useState<string>('')
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null)

  // ── 데이터 로드 ──────────────────────────────────────────────────────
  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [rateRows, policies, basePremiums, ownRates, groups] = await Promise.all([
        fetchPricingStandardsData('insurance_rate_table'),
        fetchPricingStandardsData('insurance_policy_record'),
        fetchPricingStandardsData('insurance_base_premium'),
        fetchPricingStandardsData('insurance_own_vehicle_rate'),
        fetchPricingStandardsData('insurance_vehicle_group'),
      ])
      setRateRows(rateRows || [])
      setPolicies(policies || [])
      setBasePremiums(basePremiums || [])
      setOwnRates(ownRates || [])
      setGroups(groups || [])
    } catch (error) { console.error('Error:', error) }
    finally { setLoading(false) }
  }

  // ── 기준요율 수정 ──────────────────────────────────────────────────
  async function saveRateCell(rowId: number, field: string, value: string) {
    const numFields = ['value_min', 'value_max', 'annual_premium']
    const parsed = numFields.includes(field) ? Number(value.replace(/,/g, '')) : value
    try {
      await updatePricingStandardsRow('insurance_rate_table', String(rowId), { [field]: parsed })
      loadAll()
    } catch (error) { console.error('Error:', error) }
    setEditingCell(null)
  }

  // ── 자차요율 수정 ──────────────────────────────────────────────────
  async function saveOwnRate(id: number, field: string, value: string) {
    const numFields = ['own_vehicle_rate', 'value_min', 'value_max', 'sample_count']
    const parsed = numFields.includes(field) ? Number(value.replace(/,/g, '')) : value
    try {
      await updatePricingStandardsRow('insurance_own_vehicle_rate', String(id), { [field]: parsed })
      loadAll()
    } catch (error) { console.error('Error:', error) }
    setEditingCell(null)
  }

  // ── 필터된 정책 ──────────────────────────────────────────────────
  const filteredPolicies = useMemo(() => {
    return policies.filter(p => {
      if (filterOrigin && p.origin !== filterOrigin) return false
      if (filterFuel && p.fuel_type !== filterFuel) return false
      return true
    })
  }, [policies, filterOrigin, filterFuel])

  // ── 분석 데이터 계산 ─────────────────────────────────────────────
  const analysisData = useMemo(() => {
    if (!policies.length) return null

    // 그룹별 통계
    const groups: Record<string, { records: PolicyRecord[]; avgRate: number; avgTotal: number; avgBase: number }> = {}
    policies.forEach(p => {
      const key = `${p.origin}_${p.fuel_type}`
      if (!groups[key]) groups[key] = { records: [], avgRate: 0, avgTotal: 0, avgBase: 0 }
      groups[key].records.push(p)
    })

    Object.entries(groups).forEach(([, g]) => {
      const recs = g.records
      g.avgRate = recs.reduce((sum, r) => sum + (r.premium_own_vehicle / r.vehicle_value * 100), 0) / recs.length
      g.avgTotal = recs.reduce((sum, r) => sum + r.total_premium, 0) / recs.length
      g.avgBase = recs.reduce((sum, r) => sum + (
        r.premium_daein1 + r.premium_daein2 + r.premium_daemul +
        r.premium_self_body + r.premium_uninsured +
        r.premium_emergency + r.premium_limit_surcharge
      ), 0) / recs.length
    })

    // 전체 통계
    const allRates = policies.map(p => p.premium_own_vehicle / p.vehicle_value * 100)
    const allTotals = policies.map(p => p.total_premium)

    return {
      groups,
      overall: {
        count: policies.length,
        avgOwnRate: allRates.reduce((a, b) => a + b, 0) / allRates.length,
        minOwnRate: Math.min(...allRates),
        maxOwnRate: Math.max(...allRates),
        avgTotal: allTotals.reduce((a, b) => a + b, 0) / allTotals.length,
        minTotal: Math.min(...allTotals),
        maxTotal: Math.max(...allTotals),
      }
    }
  }, [policies])

  if (loading) return <div className="text-center py-12 text-steel-400">보험 데이터 로딩 중...</div>

  return (
    <div className="space-y-4">
      {/* 서브탭 */}
      <div className="flex gap-1 bg-steel-900 rounded-lg p-1.5">
        {SUB_TABS.map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)}
            className={`flex-1 py-2.5 px-4 rounded-md text-sm font-bold transition-all ${
              subTab === tab.id ? 'bg-steel-700 text-white shadow-sm' : 'text-steel-300 hover:text-white'
            }`}>
            <span className="mr-1.5">{tab.icon}</span>{tab.label}
            {tab.id === 'records' && policies.length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-300 text-xs font-bold">{policies.length}</span>
            )}
            {tab.id === 'groups' && groups.length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-300 text-xs font-bold">{groups.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ━━━━━━━━━━━━ 기준요율표 탭 ━━━━━━━━━━━━ */}
      {subTab === 'rates' && (
        <div className="space-y-4">
          {/* 기본 분담금 기준 */}
          {basePremiums.length > 0 && (
            <div className="bg-steel-850 rounded-lg border border-steel-700 overflow-hidden">
              <div className="px-4 py-3 bg-steel-800 border-b border-steel-700">
                <h3 className="text-sm font-bold text-white">🏛️ KRMA 공제조합 기본 분담금 (자차 제외)</h3>
                <p className="text-sm text-steel-300 mt-0.5">실제 청약서 {policies.length}건 분석 기준 — 차량 유형별 거의 고정값</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-steel-800/50 text-steel-200">
                      <th className="px-3 py-2.5 text-left font-bold">차량유형</th>
                      <th className="px-3 py-2.5 text-right">대인I</th>
                      <th className="px-3 py-2.5 text-right">대인II</th>
                      <th className="px-3 py-2.5 text-right">대물</th>
                      <th className="px-3 py-2.5 text-right">자기신체</th>
                      <th className="px-3 py-2.5 text-right">무보험</th>
                      <th className="px-3 py-2.5 text-right">긴급출동</th>
                      <th className="px-3 py-2.5 text-right font-bold text-amber-300">기본합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {basePremiums.map(bp => (
                      <tr key={bp.id} className="border-t border-steel-700/50 hover:bg-steel-800/30">
                        <td className="px-3 py-2.5 font-bold text-white">{bp.vehicle_usage}</td>
                        <td className="px-3 py-2.5 text-right text-steel-200">{fmt(bp.daein1)}</td>
                        <td className="px-3 py-2.5 text-right text-steel-200">{fmt(bp.daein2)}</td>
                        <td className="px-3 py-2.5 text-right text-steel-200">{fmt(bp.daemul)}</td>
                        <td className="px-3 py-2.5 text-right text-steel-200">{fmt(bp.self_body)}</td>
                        <td className="px-3 py-2.5 text-right text-steel-200">{fmt(bp.uninsured)}</td>
                        <td className="px-3 py-2.5 text-right text-steel-200">{fmt(bp.emergency)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-amber-300 text-base">{fmtWon(bp.base_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 자차 요율 기준표 */}
          {ownRates.length > 0 && (
            <div className="bg-steel-850 rounded-lg border border-steel-700 overflow-hidden">
              <div className="px-4 py-3 bg-steel-800 border-b border-steel-700">
                <h3 className="text-sm font-bold text-white">🚗 자차(자기차량공제) 요율표</h3>
                <p className="text-sm text-steel-300 mt-0.5">원산지 × 연료유형 × 차량가액 구간별 — 보험료의 핵심 변수 (클릭하여 수정)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-steel-800/50 text-steel-200">
                      <th className="px-3 py-2.5 text-left font-bold">원산지</th>
                      <th className="px-3 py-2.5 text-left font-bold">연료</th>
                      <th className="px-3 py-2.5 text-left font-bold">차종</th>
                      <th className="px-3 py-2.5 text-right font-bold">차량가 하한</th>
                      <th className="px-3 py-2.5 text-right font-bold">차량가 상한</th>
                      <th className="px-3 py-2.5 text-right font-bold text-blue-300">자차요율(%)</th>
                      <th className="px-3 py-2.5 text-center font-bold">샘플수</th>
                      <th className="px-3 py-2.5 text-left font-bold">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownRates.map(r => {
                      const hasData = r.sample_count > 0
                      return (
                        <tr key={r.id} className={`border-t border-steel-700/50 hover:bg-steel-800/30 ${!hasData ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-1 rounded text-sm font-bold ${
                              r.origin === '수입' ? 'bg-purple-500/20 text-purple-300' : 'bg-green-500/20 text-green-300'
                            }`}>{r.origin}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-1 rounded text-sm font-bold ${
                              r.fuel_type === '전기' ? 'bg-blue-500/20 text-blue-300' :
                              r.fuel_type === '하이브리드' ? 'bg-teal-500/20 text-teal-300' :
                              r.fuel_type === '디젤' ? 'bg-orange-500/20 text-orange-300' :
                              'bg-steel-600/30 text-steel-200'
                            }`}>{r.fuel_type}</span>
                          </td>
                          <td className="px-3 py-2.5 text-steel-200">{r.vehicle_class}</td>
                          <td className="px-3 py-2.5 text-right text-steel-200">{fmtMan(r.value_min)}</td>
                          <td className="px-3 py-2.5 text-right text-steel-200">{r.value_max >= 900000000 ? '∞' : fmtMan(r.value_max)}</td>
                          <td className="px-3 py-2.5 text-right">
                            {editingCell?.rowId === r.id && editingCell?.field === 'own_vehicle_rate' ? (
                              <input type="number" step="0.01" value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => saveOwnRate(r.id, 'own_vehicle_rate', editValue)}
                                onKeyDown={e => e.key === 'Enter' && saveOwnRate(r.id, 'own_vehicle_rate', editValue)}
                                className="w-20 bg-steel-700 border border-blue-500 rounded px-2 py-1 text-right text-sm text-white" autoFocus />
                            ) : (
                              <span className="font-bold text-blue-300 text-base cursor-pointer hover:underline"
                                onClick={() => { setEditingCell({ rowId: r.id, field: 'own_vehicle_rate' }); setEditValue(String(r.own_vehicle_rate)) }}>
                                {fmtPct(r.own_vehicle_rate, 3)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-2 py-1 rounded text-sm font-bold ${
                              hasData ? 'bg-green-500/20 text-green-300' : 'bg-steel-700 text-steel-400'
                            }`}>{r.sample_count}</span>
                          </td>
                          <td className="px-3 py-2.5 text-steel-300 max-w-[200px] truncate">{r.notes}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 bg-steel-800/30 border-t border-steel-700">
                <p className="text-sm text-steel-200">
                  💡 총 보험료 = 기본분담금(~92만) + 차량가액 × 자차요율(%) | 샘플수 0 = 추정값 (실데이터 수집 필요)
                </p>
              </div>
            </div>
          )}

          {/* 기존 보험료 기준표 (호환용) */}
          <div className="bg-steel-850 rounded-lg border border-steel-700 overflow-hidden">
            <div className="px-4 py-3 bg-steel-800 border-b border-steel-700">
              <h3 className="text-sm font-bold text-white">📋 차종별 연간보험료 기준표</h3>
              <p className="text-sm text-steel-300 mt-0.5">실데이터 기반 보정 완료 — 클릭하여 수정 가능</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-steel-800/50 text-steel-200">
                    <th className="px-3 py-2.5 text-left font-bold">차종</th>
                    <th className="px-3 py-2.5 text-right font-bold">차량가 하한</th>
                    <th className="px-3 py-2.5 text-right font-bold">차량가 상한</th>
                    <th className="px-3 py-2.5 text-right font-bold text-amber-300">연간보험료</th>
                    <th className="px-3 py-2.5 text-left font-bold">담보</th>
                    <th className="px-3 py-2.5 text-left font-bold">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {rateRows.map(row => (
                    <tr key={row.id} className="border-t border-steel-700/50 hover:bg-steel-800/30">
                      <td className="px-3 py-2.5 font-bold text-white">{row.vehicle_type}</td>
                      <td className="px-3 py-2.5 text-right text-steel-200">{fmtMan(row.value_min)}</td>
                      <td className="px-3 py-2.5 text-right text-steel-200">{row.value_max >= 900000000 ? '∞' : fmtMan(row.value_max)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {editingCell?.rowId === row.id && editingCell?.field === 'annual_premium' ? (
                          <input type="text" value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveRateCell(row.id, 'annual_premium', editValue)}
                            onKeyDown={e => e.key === 'Enter' && saveRateCell(row.id, 'annual_premium', editValue)}
                            className="w-28 bg-steel-700 border border-amber-500 rounded px-2 py-1 text-right text-sm text-white" autoFocus />
                        ) : (
                          <span className="font-bold text-amber-300 text-base cursor-pointer hover:underline"
                            onClick={() => { setEditingCell({ rowId: row.id, field: 'annual_premium' }); setEditValue(String(row.annual_premium)) }}>
                            {fmtWon(row.annual_premium)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-steel-300">{row.coverage_desc}</td>
                      <td className="px-3 py-2.5 text-steel-300 max-w-[200px] truncate">{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━ 그룹 관리 탭 ━━━━━━━━━━━━ */}
      {subTab === 'groups' && (
        <div className="space-y-4">
          {/* 그룹 헤더 */}
          <div className="bg-steel-850 rounded-lg border border-steel-700 overflow-hidden">
            <div className="px-4 py-3 bg-steel-800 border-b border-steel-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">🏷️ 보험 차량 그룹 관리</h3>
                <p className="text-sm text-steel-300 mt-0.5">원산지 × 연료유형 × 모델별 그룹으로 보험료 통계를 관리합니다</p>
              </div>
              <span className="text-sm text-steel-200 font-bold">{groups.length}개 그룹 · {policies.length}건 정책</span>
            </div>

            {groups.length === 0 ? (
              <div className="text-center py-8 text-steel-200 text-sm">
                등록된 그룹이 없습니다. SQL 시드 데이터를 먼저 실행해주세요.
              </div>
            ) : (
              <div className="divide-y divide-steel-700/50">
                {groups.map(g => {
                  const groupPolicies = policies.filter(p => p.group_id === g.id)
                  const isExpanded = expandedGroup === g.id
                  const liveAvgRate = groupPolicies.length > 0
                    ? groupPolicies.reduce((sum, p) => sum + (p.premium_own_vehicle / p.vehicle_value * 100), 0) / groupPolicies.length
                    : g.avg_own_rate
                  const liveAvgPremium = groupPolicies.length > 0
                    ? groupPolicies.reduce((sum, p) => sum + p.total_premium, 0) / groupPolicies.length
                    : g.avg_total_premium
                  const liveAvgValue = groupPolicies.length > 0
                    ? groupPolicies.reduce((sum, p) => sum + p.vehicle_value, 0) / groupPolicies.length
                    : g.avg_vehicle_value

                  return (
                    <div key={g.id}>
                      <button
                        onClick={() => setExpandedGroup(isExpanded ? null : g.id)}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-steel-800/50 transition-colors text-left"
                      >
                        <div className="w-3 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: g.color || '#3b82f6' }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-white">{g.group_name}</span>
                            <span className="text-sm px-2 py-0.5 rounded bg-steel-700 text-steel-200">
                              {g.origin} · {g.fuel_type}
                            </span>
                            {g.brand && (
                              <span className="text-sm text-steel-300">{g.brand} {g.model}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-steel-300">
                            <span>차급: {g.vehicle_class || '승용'}</span>
                            {g.notes && <span className="truncate max-w-[300px]">{g.notes}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-5 text-right flex-shrink-0">
                          <div>
                            <p className="text-xs text-steel-300">자차요율</p>
                            <p className="text-base font-bold text-amber-300">{fmtPct(liveAvgRate)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-steel-300">평균보험료</p>
                            <p className="text-base font-bold text-white">{fmtWon(Math.round(liveAvgPremium))}</p>
                          </div>
                          <div>
                            <p className="text-xs text-steel-300">평균차량가</p>
                            <p className="text-base font-bold text-steel-100">{fmtMan(liveAvgValue)}</p>
                          </div>
                          <div className="w-10 text-center">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-steel-700 text-sm font-bold text-white">
                              {groupPolicies.length}
                            </span>
                            <p className="text-xs text-steel-300 mt-0.5">건</p>
                          </div>
                          <span className={`text-steel-200 text-sm transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="bg-steel-900/50 px-4 py-3 border-t border-steel-700/50">
                          {groupPolicies.length === 0 ? (
                            <p className="text-sm text-steel-300 text-center py-3">이 그룹에 연결된 정책 레코드가 없습니다</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-steel-200 border-b border-steel-700/50">
                                  <th className="text-left py-2 px-2 font-bold">차량명</th>
                                  <th className="text-left py-2 px-2 font-bold">차량번호</th>
                                  <th className="text-right py-2 px-2 font-bold">차량가</th>
                                  <th className="text-right py-2 px-2 font-bold">자차보험료</th>
                                  <th className="text-right py-2 px-2 font-bold">자차요율</th>
                                  <th className="text-right py-2 px-2 font-bold">총보험료</th>
                                  <th className="text-left py-2 px-2 font-bold">계약기간</th>
                                </tr>
                              </thead>
                              <tbody>
                                {groupPolicies.map(p => (
                                  <tr key={p.id} className="border-b border-steel-800/50 hover:bg-steel-800/30">
                                    <td className="py-2 px-2 font-bold text-white">{p.vehicle_name}</td>
                                    <td className="py-2 px-2 text-steel-200">{p.vehicle_number || '-'}</td>
                                    <td className="py-2 px-2 text-right text-steel-200">{fmtMan(p.vehicle_value)}</td>
                                    <td className="py-2 px-2 text-right text-amber-300">{fmtWon(p.premium_own_vehicle)}</td>
                                    <td className="py-2 px-2 text-right font-bold text-amber-300">
                                      {(p.premium_own_vehicle / p.vehicle_value * 100).toFixed(2)}%
                                    </td>
                                    <td className="py-2 px-2 text-right font-bold text-white">{fmtWon(p.total_premium)}</td>
                                    <td className="py-2 px-2 text-steel-300">
                                      {p.contract_start?.slice(0, 10)} ~ {p.contract_end?.slice(0, 10)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {groupPolicies.length > 1 && (
                            <div className="flex gap-4 mt-2 pt-2 border-t border-steel-700/30 text-sm">
                              <span className="text-steel-300">그룹 내 요율 범위:</span>
                              <span className="text-amber-300 font-bold">
                                {Math.min(...groupPolicies.map(p => p.premium_own_vehicle / p.vehicle_value * 100)).toFixed(2)}%
                                ~ {Math.max(...groupPolicies.map(p => p.premium_own_vehicle / p.vehicle_value * 100)).toFixed(2)}%
                              </span>
                              <span className="text-steel-300 ml-2">보험료 범위:</span>
                              <span className="text-white font-bold">
                                {fmtWon(Math.min(...groupPolicies.map(p => p.total_premium)))}
                                ~ {fmtWon(Math.max(...groupPolicies.map(p => p.total_premium)))}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 미배정 정책 레코드 */}
          {(() => {
            const unassigned = policies.filter(p => !p.group_id)
            if (unassigned.length === 0) return null
            return (
              <div className="bg-steel-850 rounded-lg border border-amber-500/30 overflow-hidden">
                <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20">
                  <h3 className="text-sm font-bold text-amber-300">⚠️ 미배정 정책 레코드 ({unassigned.length}건)</h3>
                  <p className="text-sm text-steel-300 mt-0.5">아래 정책 레코드는 그룹이 지정되지 않았습니다</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-steel-200 border-b border-steel-700">
                        <th className="text-left py-2 px-3 font-bold">차량명</th>
                        <th className="text-left py-2 px-3 font-bold">원산지</th>
                        <th className="text-left py-2 px-3 font-bold">연료</th>
                        <th className="text-right py-2 px-3 font-bold">차량가</th>
                        <th className="text-right py-2 px-3 font-bold">총보험료</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unassigned.map(p => (
                        <tr key={p.id} className="border-b border-steel-800/50">
                          <td className="py-2 px-3 font-bold text-white">{p.vehicle_name}</td>
                          <td className="py-2 px-3 text-steel-200">{p.origin}</td>
                          <td className="py-2 px-3 text-steel-200">{p.fuel_type}</td>
                          <td className="py-2 px-3 text-right text-steel-200">{fmtMan(p.vehicle_value)}</td>
                          <td className="py-2 px-3 text-right font-bold text-white">{fmtWon(p.total_premium)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* 그룹별 요약 비교 차트 */}
          {groups.length > 0 && (
            <div className="bg-steel-850 rounded-lg border border-steel-700 overflow-hidden">
              <div className="px-4 py-3 bg-steel-800 border-b border-steel-700">
                <h3 className="text-sm font-bold text-white">📊 그룹별 자차요율 비교</h3>
              </div>
              <div className="p-4 space-y-3">
                {groups.map(g => {
                  const groupPolicies = policies.filter(p => p.group_id === g.id)
                  const rate = groupPolicies.length > 0
                    ? groupPolicies.reduce((sum, p) => sum + (p.premium_own_vehicle / p.vehicle_value * 100), 0) / groupPolicies.length
                    : g.avg_own_rate
                  const maxRate = 3.0
                  const barW = Math.min(100, (rate / maxRate) * 100)
                  return (
                    <div key={g.id} className="flex items-center gap-3">
                      <span className="text-sm text-steel-200 w-32 truncate text-right font-medium">{g.group_name}</span>
                      <div className="flex-1 h-7 bg-steel-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full flex items-center justify-end px-3 text-sm font-bold text-white transition-all"
                          style={{ width: `${barW}%`, backgroundColor: g.color || '#3b82f6' }}
                        >
                          {rate.toFixed(2)}%
                        </div>
                      </div>
                      <span className="text-sm text-steel-200 w-8 text-right font-bold">{groupPolicies.length}건</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ━━━━━━━━━━━━ 실데이터 기록 탭 ━━━━━━━━━━━━ */}
      {subTab === 'records' && (
        <div className="space-y-4">
          {/* 필터 */}
          <div className="flex gap-3 items-center">
            <select value={filterOrigin} onChange={e => setFilterOrigin(e.target.value)}
              className="bg-steel-800 border border-steel-700 rounded-lg px-3 py-2 text-sm text-white font-medium">
              <option value="">전체 원산지</option>
              <option value="국산">국산</option>
              <option value="수입">수입</option>
            </select>
            <select value={filterFuel} onChange={e => setFilterFuel(e.target.value)}
              className="bg-steel-800 border border-steel-700 rounded-lg px-3 py-2 text-sm text-white font-medium">
              <option value="">전체 연료</option>
              <option value="전기">전기</option>
              <option value="하이브리드">하이브리드</option>
              <option value="가솔린">가솔린</option>
              <option value="디젤">디젤</option>
            </select>
            <span className="text-sm text-steel-200 ml-auto font-bold">{filteredPolicies.length}건</span>
          </div>

          {/* 실데이터 카드 목록 */}
          {filteredPolicies.length === 0 ? (
            <div className="text-center py-8 text-steel-200 text-sm">
              등록된 보험 데이터가 없습니다.<br/>
              <span className="text-sm text-steel-300">보험 등록 페이지에서 청약서를 등록하면 자동으로 누적됩니다.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPolicies.map(p => {
                const basePremium = p.premium_daein1 + p.premium_daein2 + p.premium_daemul +
                  p.premium_self_body + p.premium_uninsured + p.premium_emergency + p.premium_limit_surcharge
                const ownRate = p.vehicle_value > 0 ? (p.premium_own_vehicle / p.vehicle_value * 100) : 0
                const premiumRatio = p.vehicle_value > 0 ? (p.total_premium / p.vehicle_value * 100) : 0

                return (
                  <div key={p.id} className="bg-steel-850 rounded-lg border border-steel-700 overflow-hidden">
                    {/* 헤더 */}
                    <div className="px-4 py-2.5 bg-steel-800 flex items-center gap-3">
                      <span className="font-bold text-base text-white">{p.vehicle_name}</span>
                      <span className={`px-2 py-1 rounded text-sm font-bold ${
                        p.origin === '수입' ? 'bg-purple-500/20 text-purple-300' : 'bg-green-500/20 text-green-300'
                      }`}>{p.origin}</span>
                      <span className={`px-2 py-1 rounded text-sm font-bold ${
                        p.fuel_type === '전기' ? 'bg-blue-500/20 text-blue-300' :
                        p.fuel_type === '하이브리드' ? 'bg-teal-500/20 text-teal-300' :
                        'bg-steel-600/30 text-steel-200'
                      }`}>{p.fuel_type}</span>
                      <span className="text-sm text-steel-200">{p.vehicle_category}</span>
                      <span className="text-sm text-steel-300 ml-auto">{p.insurer} | {p.policy_number}</span>
                    </div>

                    {/* 주요 수치 */}
                    <div className="grid grid-cols-5 gap-3 px-4 py-3">
                      <div className="text-center">
                        <div className="text-sm text-steel-300">차량가액</div>
                        <div className="text-base font-bold text-white">{fmtMan(p.vehicle_value)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-steel-300">기본분담금</div>
                        <div className="text-base font-bold text-steel-100">{fmtMan(basePremium)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-steel-300">자차분담금</div>
                        <div className="text-base font-bold text-blue-300">{fmtMan(p.premium_own_vehicle)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-steel-300">자차요율</div>
                        <div className="text-base font-bold text-blue-300">{fmtPct(ownRate, 2)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-steel-300">총분담금</div>
                        <div className="text-base font-bold text-amber-300">{fmtMan(p.total_premium)}</div>
                      </div>
                    </div>

                    {/* 담보별 상세 */}
                    <div className="px-4 py-2 bg-steel-800/30 border-t border-steel-700 flex flex-wrap gap-x-5 gap-y-1 text-sm text-steel-200">
                      <span>대인I: {fmt(p.premium_daein1)}</span>
                      <span>대인II: {fmt(p.premium_daein2)}</span>
                      <span>대물: {fmt(p.premium_daemul)}</span>
                      <span>자기신체: {fmt(p.premium_self_body)}</span>
                      <span>무보험: {fmt(p.premium_uninsured)}</span>
                      <span>면책: 차대차{fmtMan(p.own_vehicle_deductible_v2v)}/기타{fmtMan(p.own_vehicle_deductible_other)}</span>
                      <span>등급: {p.discount_grade}({p.discount_rate}%)</span>
                      {p.special_surcharges?.length > 0 && (
                        <span className="text-orange-300 font-bold">{p.special_surcharges.join(', ')}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ━━━━━━━━━━━━ 요율 분석 탭 ━━━━━━━━━━━━ */}
      {subTab === 'analysis' && (
        <div className="space-y-4">
          {!analysisData ? (
            <div className="text-center py-8 text-steel-200 text-base">분석할 실데이터가 없습니다.</div>
          ) : (
            <>
              {/* 전체 통계 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-steel-850 rounded-lg border border-steel-700 p-4 text-center">
                  <div className="text-sm text-steel-300">등록 차량</div>
                  <div className="text-3xl font-black text-white">{analysisData.overall.count}대</div>
                </div>
                <div className="bg-steel-850 rounded-lg border border-steel-700 p-4 text-center">
                  <div className="text-sm text-steel-300">평균 자차요율</div>
                  <div className="text-3xl font-black text-blue-300">{fmtPct(analysisData.overall.avgOwnRate)}</div>
                  <div className="text-sm text-steel-200 mt-1">{fmtPct(analysisData.overall.minOwnRate)} ~ {fmtPct(analysisData.overall.maxOwnRate)}</div>
                </div>
                <div className="bg-steel-850 rounded-lg border border-steel-700 p-4 text-center">
                  <div className="text-sm text-steel-300">평균 총보험료</div>
                  <div className="text-3xl font-black text-amber-300">{fmtMan(analysisData.overall.avgTotal)}</div>
                  <div className="text-sm text-steel-200 mt-1">{fmtMan(analysisData.overall.minTotal)} ~ {fmtMan(analysisData.overall.maxTotal)}</div>
                </div>
              </div>

              {/* 그룹별 분석 */}
              <div className="bg-steel-850 rounded-lg border border-steel-700 overflow-hidden">
                <div className="px-4 py-3 bg-steel-800 border-b border-steel-700">
                  <h3 className="text-sm font-bold text-white">📊 원산지 × 연료유형별 분석</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-steel-800/50 text-steel-200">
                        <th className="px-3 py-2.5 text-left font-bold">원산지</th>
                        <th className="px-3 py-2.5 text-left font-bold">연료</th>
                        <th className="px-3 py-2.5 text-center font-bold">건수</th>
                        <th className="px-3 py-2.5 text-right font-bold">평균 자차요율</th>
                        <th className="px-3 py-2.5 text-right font-bold">평균 기본분담금</th>
                        <th className="px-3 py-2.5 text-right font-bold">평균 총보험료</th>
                        <th className="px-3 py-2.5 text-left font-bold">차량 목록</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(analysisData.groups).map(([key, g]) => {
                        const [origin, fuel] = key.split('_')
                        return (
                          <tr key={key} className="border-t border-steel-700/50 hover:bg-steel-800/30">
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-1 rounded text-sm font-bold ${
                                origin === '수입' ? 'bg-purple-500/20 text-purple-300' : 'bg-green-500/20 text-green-300'
                              }`}>{origin}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-1 rounded text-sm font-bold ${
                                fuel === '전기' ? 'bg-blue-500/20 text-blue-300' :
                                fuel === '하이브리드' ? 'bg-teal-500/20 text-teal-300' :
                                'bg-steel-600/30 text-steel-200'
                              }`}>{fuel}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold text-white text-base">{g.records.length}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-blue-300 text-base">{fmtPct(g.avgRate)}</td>
                            <td className="px-3 py-2.5 text-right text-steel-200">{fmtWon(Math.round(g.avgBase))}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-amber-300 text-base">{fmtWon(Math.round(g.avgTotal))}</td>
                            <td className="px-3 py-2.5 text-steel-200">
                              {g.records.map(r => r.vehicle_name).join(', ')}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 차량별 자차요율 비교 차트 */}
              <div className="bg-steel-850 rounded-lg border border-steel-700 overflow-hidden">
                <div className="px-4 py-3 bg-steel-800 border-b border-steel-700">
                  <h3 className="text-sm font-bold text-white">📈 차량별 자차요율 비교</h3>
                </div>
                <div className="p-4 space-y-3">
                  {policies.sort((a, b) => {
                    const rA = a.premium_own_vehicle / a.vehicle_value * 100
                    const rB = b.premium_own_vehicle / b.vehicle_value * 100
                    return rB - rA
                  }).map(p => {
                    const rate = p.vehicle_value > 0 ? (p.premium_own_vehicle / p.vehicle_value * 100) : 0
                    const maxRate = 2.5
                    const pct = Math.min(100, (rate / maxRate) * 100)
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <div className="w-40 text-sm text-steel-200 truncate text-right font-medium">{p.vehicle_name}</div>
                        <div className="flex-1 bg-steel-800 rounded-full h-6 relative overflow-hidden">
                          <div className={`h-full rounded-full ${
                            p.origin === '수입' ? 'bg-purple-500/60' : 'bg-blue-500/60'
                          }`} style={{ width: `${pct}%` }} />
                          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
                            {fmtPct(rate)} ({fmtMan(p.vehicle_value)})
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 인사이트 카드 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-blue-300 mb-2">🔍 핵심 발견</h4>
                  <ul className="text-sm text-steel-200 space-y-1.5">
                    <li>• 기본분담금(대인/대물 등)은 차량유형별 거의 고정 (~92만원)</li>
                    <li>• 보험료 차이의 대부분은 <b className="text-blue-300">자차요율</b>에서 발생</li>
                    <li>• 수입 전기차(테슬라) 자차요율: 2.16~2.18% (외제차 할증)</li>
                    <li>• 국산 전기차 자차요율: 1.79~1.96%</li>
                  </ul>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-amber-300 mb-2">📌 데이터 필요 영역</h4>
                  <ul className="text-sm text-steel-200 space-y-1.5">
                    {ownRates.filter(r => r.sample_count === 0).length > 0 && (
                      <li>• 추정값(샘플0) 항목: {ownRates.filter(r => r.sample_count === 0).length}개 — 실데이터 수집 필요</li>
                    )}
                    <li>• 가솔린/디젤 차량 데이터 아직 없음</li>
                    <li>• 수입 일반(비전기) 차량 데이터 필요</li>
                    <li>• 할인등급별 요율 변동 분석 필요 (현재 전부 11Z)</li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
