'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../utils/supabase'

// ============================================
// Types — 실제 accident_records DB 컬럼에 맞춤
// ============================================
type AccidentRecord = {
  id: number
  company_id: string
  car_id: number | null
  contract_id: string | null
  customer_id: number | null
  accident_date: string
  accident_time: string | null
  accident_location: string
  accident_type: string
  fault_ratio: number
  description: string
  status: string
  driver_name: string
  driver_phone: string
  driver_relation: string
  counterpart_name: string
  counterpart_phone: string
  counterpart_vehicle: string
  counterpart_insurance: string
  insurance_company: string
  insurance_claim_no: string
  insurance_filed_at: string | null
  insurance_status: string | null
  police_reported: boolean
  police_report_no: string | null
  repair_shop_name: string
  repair_start_date: string | null
  repair_end_date: string | null
  mileage_at_accident: number | null
  estimated_repair_cost: number
  actual_repair_cost: number
  insurance_payout: number
  customer_deductible: number
  company_cost: number
  replacement_car_id: number | null
  replacement_start: string | null
  replacement_end: string | null
  replacement_cost: number | null
  vehicle_condition: string | null
  photos: string[] | null
  documents: string[] | null
  notes: string
  handler_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  source: string | null
  jandi_raw: string | null
  jandi_topic: string | null
}

type Car = {
  id: number
  number: string
  brand: string
  model: string
}

// ============================================
// Constants
// ============================================
const ACC_STATUS: Record<string, { label: string; color: string }> = {
  reported:        { label: '신규접수', color: 'bg-blue-100 text-blue-700' },
  insurance_filed: { label: '보험접수', color: 'bg-amber-100 text-amber-700' },
  repairing:       { label: '수리중',   color: 'bg-purple-100 text-purple-700' },
  settled:         { label: '정산완료', color: 'bg-cyan-100 text-cyan-700' },
  closed:          { label: '종결',     color: 'bg-green-100 text-green-700' },
  cancelled:       { label: '취소',     color: 'bg-gray-100 text-gray-500' },
}

const ACC_TYPE: Record<string, string> = {
  collision:        '충돌사고',
  self_damage:      '자손사고',
  hit_and_run:      '뺑소니',
  theft:            '도난',
  natural_disaster: '자연재해',
  vandalism:        '파손',
  fire:             '화재',
  other:            '기타',
}

const VEHICLE_COND: Record<string, string> = {
  minor: '경미',
  repairable: '수리가능',
  total_loss: '전손',
}

const INS_STATUS: Record<string, string> = {
  none: '미접수',
  filed: '접수',
  processing: '심사중',
  approved: '승인',
  denied: '거절',
  partial: '일부승인',
}

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  jandi_accident:     { label: '잔디 사고',   color: 'bg-teal-100 text-teal-700' },
  jandi_replacement:  { label: '잔디 대차',   color: 'bg-indigo-100 text-indigo-700' },
  manual:             { label: '수동등록',     color: 'bg-gray-100 text-gray-600' },
}

// ============================================
// Form default
// ============================================
const defaultFormData = {
  car_id: '',
  accident_date: new Date().toISOString().split('T')[0],
  accident_time: '12:00',
  accident_location: '',
  accident_type: 'collision',
  fault_ratio: 50,
  description: '',
  driver_name: '',
  driver_phone: '',
  driver_relation: '',
  counterpart_name: '',
  counterpart_phone: '',
  counterpart_vehicle: '',
  counterpart_insurance: '',
  insurance_company: '',
  insurance_claim_no: '',
  police_reported: false,
  police_report_no: '',
  vehicle_condition: '',
  repair_shop_name: '',
  repair_start_date: '',
  repair_end_date: '',
  estimated_repair_cost: 0,
  actual_repair_cost: 0,
  insurance_payout: 0,
  customer_deductible: 0,
  company_cost: 0,
  replacement_car_id: '',
  replacement_start: '',
  replacement_end: '',
  replacement_cost: 0,
  notes: '',
}

// ============================================
// Component
// ============================================
export default function AccidentsMainPage() {
  const { company, role, adminSelectedCompanyId, user } = useApp()
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // Data
  const [accidents, setAccidents] = useState<AccidentRecord[]>([])
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null)

  // Tab & Filters
  const [activeTab, setActiveTab] = useState<'all' | 'replacement' | 'accident'>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editingAccident, setEditingAccident] = useState<AccidentRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalSection, setModalSection] = useState(1)
  const [formData, setFormData] = useState({ ...defaultFormData })

  // Jandi raw message toggle
  const [showJandiRaw, setShowJandiRaw] = useState(false)

  const getCar = useCallback((id: any) => cars.find(c => Number(c.id) === Number(id)), [cars])

  // ── Fetch
  const fetchAccidents = useCallback(async () => {
    if (!effectiveCompanyId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('accident_records')
      .select('*')
      .eq('company_id', effectiveCompanyId)
      .order('accident_date', { ascending: false })

    if (error) console.error('사고 로딩 실패:', error.message)
    setAccidents(data || [])
    setLoading(false)
  }, [effectiveCompanyId])

  const fetchCars = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data } = await supabase
      .from('cars')
      .select('id,number,brand,model')
      .eq('company_id', effectiveCompanyId)
    setCars(data || [])
  }, [effectiveCompanyId])

  useEffect(() => {
    if (effectiveCompanyId) {
      fetchAccidents()
      fetchCars()
    }
  }, [effectiveCompanyId, fetchAccidents, fetchCars])

  // ── KPI
  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    return {
      total: accidents.length,
      reported: accidents.filter(a => a.status === 'reported').length,
      insuranceFiled: accidents.filter(a => a.status === 'insurance_filed').length,
      repairing: accidents.filter(a => a.status === 'repairing').length,
      settledMonth: accidents.filter(a =>
        (a.status === 'settled' || a.status === 'closed') && a.updated_at >= monthStart
      ).length,
      replacementPending: accidents.filter(a =>
        a.source === 'jandi_replacement' && a.status === 'reported'
      ).length,
      totalRepairCost: accidents.reduce((s, a) => s + (a.actual_repair_cost || 0), 0),
      totalInsurancePayout: accidents.reduce((s, a) => s + (a.insurance_payout || 0), 0),
    }
  }, [accidents])

  // ── Tab filter
  const tabFiltered = useMemo(() => {
    if (activeTab === 'replacement') {
      return accidents.filter(a => a.source === 'jandi_replacement' || a.replacement_car_id)
    }
    if (activeTab === 'accident') {
      return accidents.filter(a => a.source !== 'jandi_replacement' || !a.source)
    }
    return accidents
  }, [accidents, activeTab])

  // ── Filter
  const filteredAccidents = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return tabFiltered.filter(acc => {
      if (statusFilter !== 'all' && acc.status !== statusFilter) return false
      if (typeFilter !== 'all' && acc.accident_type !== typeFilter) return false
      if (q) {
        const car = getCar(acc.car_id)
        const searchable = [
          car?.number, car?.brand, car?.model,
          acc.driver_name, acc.accident_location,
          acc.counterpart_name, acc.insurance_company,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!searchable.includes(q)) return false
      }
      return true
    })
  }, [tabFiltered, statusFilter, typeFilter, searchQuery, getCar])

  // ── Status change
  const handleStatusChange = async (accId: number, newStatus: string) => {
    const acc = accidents.find(a => a.id === accId)
    if (!acc) return
    if (!confirm(`상태를 "${ACC_STATUS[newStatus]?.label || newStatus}"(으)로 변경하시겠습니까?`)) return

    try {
      await supabase.from('accident_records').update({ status: newStatus }).eq('id', accId)

      if (acc.car_id) {
        await supabase.from('vehicle_status_log').insert({
          company_id: effectiveCompanyId,
          car_id: acc.car_id,
          old_status: acc.status,
          new_status: newStatus,
          related_type: 'accident',
          related_id: String(accId),
          changed_by: user?.id,
        })
      }
      fetchAccidents()
    } catch (error) {
      console.error('상태 변경 실패:', error)
    }
  }

  // ── Modal
  const resetForm = () => {
    setFormData({ ...defaultFormData })
    setEditingAccident(null)
    setModalSection(1)
    setShowJandiRaw(false)
  }

  const openCreateModal = () => {
    resetForm()
    setShowModal(true)
  }

  const openEditModal = (acc: AccidentRecord) => {
    setEditingAccident(acc)
    setFormData({
      car_id: acc.car_id ? String(acc.car_id) : '',
      accident_date: acc.accident_date || defaultFormData.accident_date,
      accident_time: acc.accident_time || '12:00',
      accident_location: acc.accident_location || '',
      accident_type: acc.accident_type || 'collision',
      fault_ratio: acc.fault_ratio ?? 50,
      description: acc.description || '',
      driver_name: acc.driver_name || '',
      driver_phone: acc.driver_phone || '',
      driver_relation: acc.driver_relation || '',
      counterpart_name: acc.counterpart_name || '',
      counterpart_phone: acc.counterpart_phone || '',
      counterpart_vehicle: acc.counterpart_vehicle || '',
      counterpart_insurance: acc.counterpart_insurance || '',
      insurance_company: acc.insurance_company || '',
      insurance_claim_no: acc.insurance_claim_no || '',
      police_reported: acc.police_reported || false,
      police_report_no: acc.police_report_no || '',
      vehicle_condition: acc.vehicle_condition || '',
      repair_shop_name: acc.repair_shop_name || '',
      repair_start_date: acc.repair_start_date || '',
      repair_end_date: acc.repair_end_date || '',
      estimated_repair_cost: acc.estimated_repair_cost || 0,
      actual_repair_cost: acc.actual_repair_cost || 0,
      insurance_payout: acc.insurance_payout || 0,
      customer_deductible: acc.customer_deductible || 0,
      company_cost: acc.company_cost || 0,
      replacement_car_id: acc.replacement_car_id ? String(acc.replacement_car_id) : '',
      replacement_start: acc.replacement_start || '',
      replacement_end: acc.replacement_end || '',
      replacement_cost: acc.replacement_cost || 0,
      notes: acc.notes || '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!effectiveCompanyId || !user) return
    setSaving(true)
    try {
      const payload: Record<string, any> = {
        company_id: effectiveCompanyId,
        car_id: formData.car_id ? Number(formData.car_id) : null,
        accident_date: formData.accident_date,
        accident_time: formData.accident_time || null,
        accident_location: formData.accident_location,
        accident_type: formData.accident_type,
        fault_ratio: formData.fault_ratio,
        description: formData.description,
        driver_name: formData.driver_name,
        driver_phone: formData.driver_phone,
        driver_relation: formData.driver_relation,
        counterpart_name: formData.counterpart_name,
        counterpart_phone: formData.counterpart_phone,
        counterpart_vehicle: formData.counterpart_vehicle,
        counterpart_insurance: formData.counterpart_insurance,
        insurance_company: formData.insurance_company,
        insurance_claim_no: formData.insurance_claim_no,
        police_reported: formData.police_reported,
        police_report_no: formData.police_report_no || null,
        vehicle_condition: formData.vehicle_condition || null,
        repair_shop_name: formData.repair_shop_name,
        repair_start_date: formData.repair_start_date || null,
        repair_end_date: formData.repair_end_date || null,
        estimated_repair_cost: formData.estimated_repair_cost,
        actual_repair_cost: formData.actual_repair_cost,
        insurance_payout: formData.insurance_payout,
        customer_deductible: formData.customer_deductible,
        company_cost: formData.company_cost,
        replacement_car_id: formData.replacement_car_id ? Number(formData.replacement_car_id) : null,
        replacement_start: formData.replacement_start || null,
        replacement_end: formData.replacement_end || null,
        replacement_cost: formData.replacement_cost || null,
        notes: formData.notes,
      }

      if (editingAccident) {
        await supabase.from('accident_records').update(payload).eq('id', editingAccident.id)
      } else {
        payload.status = 'reported'
        payload.source = 'manual'
        payload.created_by = user.id
        await supabase.from('accident_records').insert([payload])
      }

      setShowModal(false)
      resetForm()
      fetchAccidents()
    } catch (error) {
      console.error('저장 실패:', error)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // ── Status action buttons
  const StatusActions = ({ acc, small }: { acc: AccidentRecord; small?: boolean }) => {
    const cls = small
      ? 'px-2 py-1 rounded-md text-[10px] font-bold flex-shrink-0'
      : 'px-2.5 py-1 rounded-lg text-xs font-bold flex-shrink-0'

    const nextStatusMap: Record<string, { status: string; label: string; color: string }[]> = {
      reported:        [{ status: 'insurance_filed', label: '보험접수', color: 'bg-amber-100 text-amber-700 hover:bg-amber-200' }],
      insurance_filed: [{ status: 'repairing', label: '수리시작', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' }],
      repairing:       [{ status: 'settled', label: '정산완료', color: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200' }],
      settled:         [{ status: 'closed', label: '종결', color: 'bg-green-100 text-green-700 hover:bg-green-200' }],
    }

    const actions = nextStatusMap[acc.status] || []

    return (
      <div className="flex gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); openEditModal(acc) }}
          className={`${cls} bg-blue-100 text-blue-700 hover:bg-blue-200`}
        >
          수정
        </button>
        {actions.map(a => (
          <button
            key={a.status}
            onClick={(e) => { e.stopPropagation(); handleStatusChange(acc.id, a.status) }}
            className={`${cls} ${a.color}`}
          >
            {a.label}
          </button>
        ))}
      </div>
    )
  }

  // ── god_admin guard
  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="p-12 md:p-20 text-center text-gray-400 text-sm bg-white rounded-2xl">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  // ── Input helper
  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500 text-sm'
  const labelCls = 'block font-bold text-gray-700 mb-1.5 text-sm'

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50/50 animate-fade-in">
      {/* ── Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
        <div style={{ textAlign: 'left' }}>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">🚨 사고 관리</h1>
          <p className="text-gray-500 mt-1 text-sm">
            전체 <span className="font-bold text-steel-600">{accidents.length}</span>건
            {filteredAccidents.length !== accidents.length && ` / 검색 ${filteredAccidents.length}건`}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-all flex items-center gap-1.5 shadow-lg shadow-steel-600/10 whitespace-nowrap"
        >
          + 사고 등록
        </button>
      </div>

      {/* ── KPI Cards */}
      {accidents.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: '신규접수', value: stats.reported, unit: '건', accent: 'text-blue-600' },
            { label: '보험접수', value: stats.insuranceFiled, unit: '건', accent: 'text-amber-600' },
            { label: '수리중', value: stats.repairing, unit: '건', accent: 'text-purple-600' },
            { label: '이달 정산', value: stats.settledMonth, unit: '건', accent: 'text-green-600' },
            { label: '대차요청 대기', value: stats.replacementPending, unit: '건', accent: 'text-indigo-600' },
            { label: '전체 사고', value: stats.total, unit: '건', accent: 'text-gray-700' },
            { label: '총 수리비', value: stats.totalRepairCost, unit: '원', format: true, accent: 'text-red-600' },
            { label: '보험금 수령', value: stats.totalInsurancePayout, unit: '원', format: true, accent: 'text-teal-600' },
          ].map((kpi, i) => (
            <div key={i} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-400 font-bold">{kpi.label}</p>
              <p className={`text-lg md:text-xl font-black mt-0.5 ${kpi.accent}`}>
                {(kpi as any).format ? kpi.value.toLocaleString() : kpi.value}
                <span className="text-xs text-gray-400 ml-0.5 font-normal">{kpi.unit}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs: 전체 / 대차요청 / 사고접수 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: 'all', label: '전체' },
          { key: 'replacement', label: '대차요청' },
          { key: 'accident', label: '사고접수' },
        ] as { key: typeof activeTab; label: string }[]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-steel-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.key === 'replacement' && stats.replacementPending > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-indigo-500 text-white text-[10px]">
                {stats.replacementPending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Filters: 1줄 통합 */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {/* 상태 칩 */}
        <div className="flex gap-1.5 overflow-x-auto">
          {['all', 'reported', 'insurance_filed', 'repairing', 'settled', 'closed'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                statusFilter === s
                  ? 'bg-steel-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? '전체상태' : ACC_STATUS[s]?.label}
            </button>
          ))}
        </div>

        {/* 사고유형 드롭다운 */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 bg-white text-gray-600 focus:outline-none focus:border-steel-500"
        >
          <option value="all">전체유형</option>
          {Object.entries(ACC_TYPE).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* 검색 */}
        <input
          type="text"
          placeholder="차량/운전자/장소 검색..."
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs flex-1 min-w-[180px] focus:outline-none focus:border-steel-500"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* ── Table / Cards */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-20 text-center text-gray-400 flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600 mb-2" />
            사고 데이터 로딩 중...
          </div>
        ) : filteredAccidents.length === 0 ? (
          <div className="p-12 md:p-20 text-center text-gray-400 text-sm">
            {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
              ? '검색 조건에 맞는 사고가 없습니다.'
              : '등록된 사고가 없습니다.'}
          </div>
        ) : (
          <>
            {/* ── Desktop Table */}
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-500 font-bold text-xs uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="p-4">사고일</th>
                    <th className="p-4">차량</th>
                    <th className="p-4">유형/과실</th>
                    <th className="p-4">상태</th>
                    <th className="p-4">운전자</th>
                    <th className="p-4">보험사</th>
                    <th className="p-4 text-right">수리비</th>
                    <th className="p-4">접수경로</th>
                    <th className="p-4 text-center">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAccidents.map(acc => {
                    const car = getCar(acc.car_id)
                    const isExpanded = expandedRowId === acc.id
                    return (
                      <DesktopRow
                        key={acc.id}
                        acc={acc}
                        car={car}
                        isExpanded={isExpanded}
                        getCar={getCar}
                        onToggle={() => setExpandedRowId(isExpanded ? null : acc.id)}
                        StatusActions={StatusActions}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 md:p-5 flex justify-between items-center z-10">
              <h2 className="text-lg md:text-xl font-bold text-gray-900">
                {editingAccident ? '사고 수정' : '새 사고 등록'}
                {editingAccident?.source && SOURCE_BADGE[editingAccident.source] && (
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${SOURCE_BADGE[editingAccident.source].color}`}>
                    {SOURCE_BADGE[editingAccident.source].label}
                  </span>
                )}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>

            {/* Section tabs */}
            <div className="sticky top-[60px] md:top-[68px] bg-white border-b border-gray-200 flex gap-1 overflow-x-auto px-4 md:px-5 z-10">
              {[
                { num: 1, label: '사고 정보' },
                { num: 2, label: '당사자/보험' },
                { num: 3, label: '수리/비용/대차' },
                { num: 4, label: '메모' },
              ].map(s => (
                <button
                  key={s.num}
                  onClick={() => setModalSection(s.num)}
                  className={`px-4 py-3 font-bold text-xs border-b-2 transition-colors whitespace-nowrap ${
                    modalSection === s.num
                      ? 'border-steel-600 text-steel-600'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="p-4 md:p-5 space-y-4">
              {/* ── Section 1: 사고 정보 */}
              {modalSection === 1 && (
                <>
                  <div>
                    <label className={labelCls}>차량</label>
                    <select value={formData.car_id} onChange={e => setFormData({ ...formData, car_id: e.target.value })} className={inputCls}>
                      <option value="">차량 선택</option>
                      {cars.map(c => <option key={c.id} value={c.id}>{c.number} - {c.brand} {c.model}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>사고일</label>
                      <input type="date" value={formData.accident_date} onChange={e => setFormData({ ...formData, accident_date: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>시간</label>
                      <input type="time" value={formData.accident_time} onChange={e => setFormData({ ...formData, accident_time: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>장소</label>
                    <input type="text" value={formData.accident_location} onChange={e => setFormData({ ...formData, accident_location: e.target.value })} placeholder="사고 장소" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>사고유형</label>
                      <select value={formData.accident_type} onChange={e => setFormData({ ...formData, accident_type: e.target.value })} className={inputCls}>
                        {Object.entries(ACC_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>과실비율: {formData.fault_ratio}%</label>
                      <input type="range" min="0" max="100" value={formData.fault_ratio} onChange={e => setFormData({ ...formData, fault_ratio: parseInt(e.target.value) })} className="w-full mt-1" />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>차량 상태</label>
                    <select value={formData.vehicle_condition} onChange={e => setFormData({ ...formData, vehicle_condition: e.target.value })} className={inputCls}>
                      <option value="">선택</option>
                      <option value="minor">경미</option>
                      <option value="repairable">수리가능</option>
                      <option value="total_loss">전손</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>사고내용</label>
                    <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="사고 상세 설명" className={`${inputCls} resize-none`} rows={3} />
                  </div>
                </>
              )}

              {/* ── Section 2: 당사자/보험 */}
              {modalSection === 2 && (
                <>
                  <h4 className="font-bold text-gray-900 text-sm border-b pb-2">운전자 정보</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>이름</label>
                      <input type="text" value={formData.driver_name} onChange={e => setFormData({ ...formData, driver_name: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>연락처</label>
                      <input type="tel" value={formData.driver_phone} onChange={e => setFormData({ ...formData, driver_phone: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>관계</label>
                    <input type="text" value={formData.driver_relation} onChange={e => setFormData({ ...formData, driver_relation: e.target.value })} placeholder="본인, 직원, 대표 등" className={inputCls} />
                  </div>

                  <h4 className="font-bold text-gray-900 text-sm border-b pb-2 mt-4">상대방 정보</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>이름</label>
                      <input type="text" value={formData.counterpart_name} onChange={e => setFormData({ ...formData, counterpart_name: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>연락처</label>
                      <input type="tel" value={formData.counterpart_phone} onChange={e => setFormData({ ...formData, counterpart_phone: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>차량</label>
                      <input type="text" value={formData.counterpart_vehicle} onChange={e => setFormData({ ...formData, counterpart_vehicle: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>상대 보험사</label>
                      <input type="text" value={formData.counterpart_insurance} onChange={e => setFormData({ ...formData, counterpart_insurance: e.target.value })} className={inputCls} />
                    </div>
                  </div>

                  <h4 className="font-bold text-gray-900 text-sm border-b pb-2 mt-4">보험/경찰</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>자차 보험사</label>
                      <input type="text" value={formData.insurance_company} onChange={e => setFormData({ ...formData, insurance_company: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>보험 접수번호</label>
                      <input type="text" value={formData.insurance_claim_no} onChange={e => setFormData({ ...formData, insurance_claim_no: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={formData.police_reported} onChange={e => setFormData({ ...formData, police_reported: e.target.checked })} className="w-4 h-4" id="police_reported" />
                    <label htmlFor="police_reported" className="font-bold text-gray-700 text-sm cursor-pointer">경찰 신고됨</label>
                  </div>
                  <div>
                    <label className={labelCls}>경찰 접수번호</label>
                    <input type="text" value={formData.police_report_no} onChange={e => setFormData({ ...formData, police_report_no: e.target.value })} placeholder="없으면 비워두세요" className={inputCls} />
                  </div>
                </>
              )}

              {/* ── Section 3: 수리/비용/대차 */}
              {modalSection === 3 && (
                <>
                  <h4 className="font-bold text-gray-900 text-sm border-b pb-2">수리 정보</h4>
                  <div>
                    <label className={labelCls}>정비소명</label>
                    <input type="text" value={formData.repair_shop_name} onChange={e => setFormData({ ...formData, repair_shop_name: e.target.value })} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>수리 시작일</label>
                      <input type="date" value={formData.repair_start_date} onChange={e => setFormData({ ...formData, repair_start_date: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>수리 종료일</label>
                      <input type="date" value={formData.repair_end_date} onChange={e => setFormData({ ...formData, repair_end_date: e.target.value })} className={inputCls} />
                    </div>
                  </div>

                  <h4 className="font-bold text-gray-900 text-sm border-b pb-2 mt-4">비용</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>예상 수리비</label>
                      <input type="number" value={formData.estimated_repair_cost} onChange={e => setFormData({ ...formData, estimated_repair_cost: parseInt(e.target.value) || 0 })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>실제 수리비</label>
                      <input type="number" value={formData.actual_repair_cost} onChange={e => setFormData({ ...formData, actual_repair_cost: parseInt(e.target.value) || 0 })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>보험금 수령</label>
                      <input type="number" value={formData.insurance_payout} onChange={e => setFormData({ ...formData, insurance_payout: parseInt(e.target.value) || 0 })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>자기부담금 (면책금)</label>
                      <input type="number" value={formData.customer_deductible} onChange={e => setFormData({ ...formData, customer_deductible: parseInt(e.target.value) || 0 })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>회사 부담금</label>
                      <input type="number" value={formData.company_cost} onChange={e => setFormData({ ...formData, company_cost: parseInt(e.target.value) || 0 })} className={inputCls} />
                    </div>
                  </div>

                  <h4 className="font-bold text-gray-900 text-sm border-b pb-2 mt-4">대차 차량</h4>
                  <div>
                    <label className={labelCls}>대차 차량</label>
                    <select value={formData.replacement_car_id} onChange={e => setFormData({ ...formData, replacement_car_id: e.target.value })} className={inputCls}>
                      <option value="">없음</option>
                      {cars.map(c => <option key={c.id} value={c.id}>{c.number} - {c.brand} {c.model}</option>)}
                    </select>
                  </div>
                  {formData.replacement_car_id && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>대차 시작일</label>
                        <input type="date" value={formData.replacement_start} onChange={e => setFormData({ ...formData, replacement_start: e.target.value })} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>대차 종료일</label>
                        <input type="date" value={formData.replacement_end} onChange={e => setFormData({ ...formData, replacement_end: e.target.value })} className={inputCls} />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── Section 4: 메모 */}
              {modalSection === 4 && (
                <>
                  <div>
                    <label className={labelCls}>메모</label>
                    <textarea
                      value={formData.notes}
                      onChange={e => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="사고 처리 관련 추가 메모"
                      className={`${inputCls} resize-none`}
                      rows={6}
                    />
                  </div>
                  {editingAccident?.jandi_raw && (
                    <div className="border-t pt-4">
                      <button
                        onClick={() => setShowJandiRaw(!showJandiRaw)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                      >
                        {showJandiRaw ? '잔디 원본 접기 ▲' : '잔디 원본 메시지 보기 ▼'}
                      </button>
                      {showJandiRaw && (
                        <div className="mt-2 p-3 bg-gray-50 rounded-lg border text-xs text-gray-600 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
                          {editingAccident.jandi_topic && (
                            <div className="mb-2 font-bold text-indigo-700">토픽: {editingAccident.jandi_topic}</div>
                          )}
                          {editingAccident.jandi_raw}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 md:p-5 flex gap-3 justify-between">
              <div className="flex gap-2">
                {modalSection > 1 && (
                  <button onClick={() => setModalSection(modalSection - 1)} className="px-5 py-2 rounded-lg font-bold border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm">이전</button>
                )}
                {modalSection < 4 && (
                  <button onClick={() => setModalSection(modalSection + 1)} className="px-5 py-2 rounded-lg font-bold border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm">다음</button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowModal(false)} className="px-5 py-2 rounded-lg font-bold border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm">취소</button>
                <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-lg font-bold bg-steel-600 text-white hover:bg-steel-700 disabled:bg-gray-400 text-sm">
                  {saving ? '저장중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// Sub-components
// ============================================

function DesktopRow({ acc, car, isExpanded, getCar, onToggle, StatusActions }: {
  acc: AccidentRecord
  car: Car | undefined
  isExpanded: boolean
  getCar: (id: any) => Car | undefined
  onToggle: () => void
  StatusActions: React.FC<{ acc: AccidentRecord; small?: boolean }>
}) {
  return (
    <>
      <tr className="hover:bg-steel-50 transition-colors group cursor-pointer" onClick={onToggle}>
        <td className="p-4 text-sm">
          <div className="font-bold text-gray-900">{acc.accident_date}</div>
          {acc.accident_time && <div className="text-xs text-gray-400 mt-0.5">{acc.accident_time}</div>}
        </td>
        <td className="p-4 text-sm">
          <div className="font-bold text-gray-800">{car?.number || '-'}</div>
          {car && <div className="text-xs text-gray-500">{car.brand} {car.model}</div>}
        </td>
        <td className="p-4 text-sm">
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {ACC_TYPE[acc.accident_type] || acc.accident_type}
          </span>
          <span className="ml-1.5 text-xs text-gray-500">{acc.fault_ratio}%</span>
        </td>
        <td className="p-4 text-sm">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${ACC_STATUS[acc.status]?.color || 'bg-gray-100 text-gray-600'}`}>
            {ACC_STATUS[acc.status]?.label || acc.status}
          </span>
        </td>
        <td className="p-4 text-sm text-gray-800">{acc.driver_name || '-'}</td>
        <td className="p-4 text-sm text-gray-800">
          {acc.insurance_company || '-'}
          {acc.insurance_claim_no && <div className="text-xs text-gray-400">{acc.insurance_claim_no}</div>}
        </td>
        <td className="p-4 text-sm text-right font-bold text-gray-800">
          {(acc.actual_repair_cost || acc.estimated_repair_cost || 0).toLocaleString()}
          <span className="text-xs text-gray-400 font-normal">원</span>
        </td>
        <td className="p-4 text-sm">
          {acc.source && SOURCE_BADGE[acc.source] ? (
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${SOURCE_BADGE[acc.source].color}`}>
              {SOURCE_BADGE[acc.source].label}
            </span>
          ) : (
            <span className="text-xs text-gray-400">수동</span>
          )}
        </td>
        <td className="p-4 text-center">
          <StatusActions acc={acc} />
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-gray-50 border-t-2 border-steel-200">
          <td colSpan={9} className="p-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <DetailCard title="사고 정보" items={[
                ['장소', acc.accident_location],
                ['차량상태', VEHICLE_COND[acc.vehicle_condition || ''] || acc.vehicle_condition],
                ['내용', acc.description],
              ]} />
              <DetailCard title="운전자" items={[
                ['이름', acc.driver_name],
                ['연락처', acc.driver_phone],
                ['관계', acc.driver_relation],
              ]} />
              <DetailCard title="상대방" items={[
                ['이름', acc.counterpart_name],
                ['연락처', acc.counterpart_phone],
                ['차량', acc.counterpart_vehicle],
                ['보험사', acc.counterpart_insurance],
              ]} />
              <DetailCard title="보험 처리" items={[
                ['자차보험', acc.insurance_company],
                ['접수번호', acc.insurance_claim_no],
                ['경찰접수', acc.police_report_no],
              ]} />
              <DetailCard title="비용 내역" items={[
                ['예상수리비', `${(acc.estimated_repair_cost || 0).toLocaleString()}원`],
                ['실제수리비', `${(acc.actual_repair_cost || 0).toLocaleString()}원`],
                ['보험금', `${(acc.insurance_payout || 0).toLocaleString()}원`],
                ['자기부담', `${(acc.customer_deductible || 0).toLocaleString()}원`],
                ['회사부담', `${(acc.company_cost || 0).toLocaleString()}원`],
              ]} />
              <DetailCard title="수리/대차" items={[
                ['정비소', acc.repair_shop_name],
                ['수리기간', acc.repair_start_date ? `${acc.repair_start_date} ~ ${acc.repair_end_date || '진행중'}` : '-'],
                ['대차', acc.replacement_car_id ? (getCar(acc.replacement_car_id)?.number || String(acc.replacement_car_id)) : '-'],
                ['대차기간', acc.replacement_start ? `${acc.replacement_start} ~ ${acc.replacement_end || '진행중'}` : '-'],
              ]} />
            </div>
            {acc.notes && (
              <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200">
                <p className="font-bold text-gray-900 text-xs mb-1">메모</p>
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{acc.notes}</p>
              </div>
            )}
            {acc.jandi_topic && (
              <div className="mt-2 text-xs text-indigo-500">잔디 토픽: {acc.jandi_topic}</div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function DetailCard({ title, items }: { title: string; items: [string, string | undefined | null][] }) {
  return (
    <div className="bg-white p-3 rounded-lg border border-gray-200">
      <p className="font-bold text-gray-900 text-xs mb-2">{title}</p>
      <div className="space-y-1.5 text-xs">
        {items.map(([label, value], i) => (
          <div key={i} className="flex justify-between gap-2">
            <span className="text-gray-400 flex-shrink-0">{label}</span>
            <span className="font-bold text-gray-800 text-right break-all">{value || '-'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
