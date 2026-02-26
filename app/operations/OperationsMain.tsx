'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../utils/supabase'
import CalendarView from './CalendarView'
import DispatchModal from './DispatchModal'

// ============================================
// Types
// ============================================
type Operation = {
  id: string
  company_id: string
  operation_type: 'delivery' | 'return'
  contract_id: string | null
  car_id: string
  customer_id: string | null
  scheduled_date: string
  scheduled_time: string
  actual_date: string | null
  location: string
  location_address: string
  handler_name: string
  driver_name: string
  driver_phone: string
  mileage_at_op: number
  fuel_level: string
  notes: string
  damage_found: boolean
  damage_description: string
  excess_mileage: number
  settlement_amount: number
  status: 'scheduled' | 'preparing' | 'inspecting' | 'in_transit' | 'completed' | 'cancelled'
  completed_at: string | null
  created_at: string
  created_by: string | null
  // Insurance dispatch fields
  dispatch_category?: 'regular' | 'insurance_victim' | 'insurance_at_fault' | 'insurance_own' | 'maintenance'
  accident_id?: number | null
  insurance_company_billing?: string
  insurance_claim_no?: string
  insurance_daily_rate?: number
  fault_ratio?: number
  insurance_billing_status?: string
  insurance_billed_amount?: number
  insurance_paid_amount?: number
  customer_charge?: number
  damaged_car_id?: number | null
  repair_shop_name?: string
  replacement_start_date?: string
  replacement_end_date?: string
  actual_return_date?: string
}

type Schedule = {
  id: string
  company_id: string
  car_id: string
  schedule_type: string
  start_date: string
  end_date: string
  title: string
  color: string
  contract_id: string | null
  created_by: string | null
  notes?: string
}

type Contract = {
  id: string
  company_id: string
  car_id: any
  customer_id: any
  customer_name?: string
  customer_phone?: string
  contract_type?: string
  dispatch_type?: string
  status: string
  start_date: string
  end_date: string
  monthly_rent?: number
  daily_rate?: number
  deposit?: number
  memo?: string
}

type Car = {
  id: any
  number: string
  brand: string
  model: string
  trim?: string
  year?: number
  status?: string
}

// ============================================
// Constants
// ============================================
const OP_STATUS: Record<string, { label: string; color: string; icon: string }> = {
  scheduled: { label: '예정', color: 'bg-gray-100 text-gray-700', icon: '📅' },
  preparing: { label: '준비중', color: 'bg-blue-100 text-blue-700', icon: '🔧' },
  inspecting: { label: '점검중', color: 'bg-purple-100 text-purple-700', icon: '🔍' },
  in_transit: { label: '이동중', color: 'bg-amber-100 text-amber-700', icon: '🚗' },
  completed: { label: '완료', color: 'bg-green-100 text-green-700', icon: '✅' },
  cancelled: { label: '취소', color: 'bg-red-100 text-red-700', icon: '❌' },
}

const SCHEDULE_COLORS: Record<string, string> = {
  long_term: '#3b82f6',          // blue
  short_term: '#8b5cf6',         // purple
  replacement: '#f59e0b',        // amber
  insurance_replacement: '#14b8a6', // teal — 보험대차
  maintenance: '#ef4444',        // red
  rental: '#3b82f6',
  delivery: '#3b82f6',
  reserved: '#6b7280',
  accident_repair: '#ef4444',    // red — 사고수리
}

const FUEL_LABELS: Record<string, string> = {
  empty: 'E', quarter: '1/4', half: '1/2', three_quarter: '3/4', full: 'F',
}

const DISPATCH_CATEGORY: Record<string, { label: string; color: string; bg: string }> = {
  regular:           { label: '일반', color: 'text-gray-600', bg: 'bg-gray-100' },
  insurance_victim:  { label: '피해자대차', color: 'text-blue-700', bg: 'bg-blue-100' },
  insurance_at_fault:{ label: '가해자대차', color: 'text-red-700', bg: 'bg-red-100' },
  insurance_own:     { label: '자차대차', color: 'text-amber-700', bg: 'bg-amber-100' },
  maintenance:       { label: '정비대차', color: 'text-gray-700', bg: 'bg-gray-200' },
}

const BILLING_STATUS: Record<string, { label: string; color: string }> = {
  none:     { label: '-', color: '' },
  pending:  { label: '청구대기', color: 'bg-yellow-100 text-yellow-700' },
  billed:   { label: '청구완료', color: 'bg-blue-100 text-blue-700' },
  approved: { label: '승인', color: 'bg-indigo-100 text-indigo-700' },
  paid:     { label: '입금완료', color: 'bg-green-100 text-green-700' },
  partial:  { label: '부분입금', color: 'bg-orange-100 text-orange-700' },
  denied:   { label: '거절', color: 'bg-red-100 text-red-700' },
}

// ============================================
// Main Component
// ============================================
export default function OperationsMainPage() {
  const { company, role, adminSelectedCompanyId, user } = useApp()
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // Data states
  const [operations, setOperations] = useState<Operation[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [cars, setCars] = useState<Car[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // UI states
  const [viewMode, setViewMode] = useState<'timeline' | 'calendar' | 'list'>('list')
  const [listFilter, setListFilter] = useState<'today' | 'week' | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  const [editingOp, setEditingOp] = useState<Operation | null>(null)
  const [dispatchFilter, setDispatchFilter] = useState<'all' | 'regular' | 'insurance' | 'maintenance'>('all')

  // Timeline states
  const [timelineStart, setTimelineStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 3)
    return d.toISOString().split('T')[0]
  })
  const [timelineDays, setTimelineDays] = useState(21)

  const timelineEnd = useMemo(() => {
    const d = new Date(timelineStart)
    d.setDate(d.getDate() + timelineDays)
    return d.toISOString().split('T')[0]
  }, [timelineStart, timelineDays])

  // ============================================
  // Data Fetchers
  // ============================================
  const fetchOperations = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data, error } = await supabase
      .from('vehicle_operations').select('*')
      .eq('company_id', effectiveCompanyId)
      .order('scheduled_date', { ascending: false })
    if (error) console.error('작업 로딩 실패:', JSON.stringify(error))
    else setOperations(data || [])
  }, [effectiveCompanyId])

  const fetchSchedules = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data, error } = await supabase
      .from('vehicle_schedules').select('*')
      .eq('company_id', effectiveCompanyId)
      .gte('end_date', timelineStart)
      .lte('start_date', timelineEnd)
    if (error) console.error('일정 로딩 실패:', JSON.stringify(error))
    else setSchedules(data || [])
  }, [effectiveCompanyId, timelineStart, timelineEnd])

  const fetchContracts = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data, error } = await supabase
      .from('contracts').select('*')
      .eq('company_id', effectiveCompanyId)
      .in('status', ['active', 'pending'])
    if (error) console.error('계약 로딩 실패:', JSON.stringify(error))
    setContracts(data || [])
  }, [effectiveCompanyId])

  const fetchCars = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data, error } = await supabase
      .from('cars').select('id,number,brand,model,trim,year,status')
      .eq('company_id', effectiveCompanyId)
    if (error) console.error('차량 로딩 실패:', error)
    else setCars(data || [])
  }, [effectiveCompanyId])

  const fetchCustomers = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data } = await supabase
      .from('customers').select('id,name,phone')
      .eq('company_id', effectiveCompanyId)
    setCustomers(data || [])
  }, [effectiveCompanyId])

  useEffect(() => {
    if (effectiveCompanyId) {
      setLoading(true)
      Promise.all([fetchOperations(), fetchSchedules(), fetchContracts(), fetchCars(), fetchCustomers()])
        .finally(() => setLoading(false))
    }
  }, [effectiveCompanyId, fetchOperations, fetchSchedules, fetchContracts, fetchCars, fetchCustomers])

  // ============================================
  // Helpers
  // ============================================
  const getCar = (id: any) => cars.find(c => String(c.id) === String(id))
  const getCustomer = (id: any) => customers.find(c => String(c.id) === String(id))

  const today = new Date().toISOString().split('T')[0]
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0] })()
  const weekEnd = (() => { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return d.toISOString().split('T')[0] })()

  // ============================================
  // KPI Stats
  // ============================================
  const stats = useMemo(() => {
    const isInsurance = (op: Operation) => op.dispatch_category && op.dispatch_category !== 'regular' && op.dispatch_category !== 'maintenance'
    return {
      todayDeliveries: operations.filter(op => op.operation_type === 'delivery' && op.scheduled_date === today && op.status !== 'cancelled').length,
      todayReturns: operations.filter(op => op.operation_type === 'return' && op.scheduled_date === today && op.status !== 'cancelled').length,
      inProgress: operations.filter(op => !['completed', 'cancelled'].includes(op.status)).length,
      weekScheduled: operations.filter(op => op.scheduled_date >= weekStart && op.scheduled_date <= weekEnd && op.status !== 'cancelled').length,
      shortTermActive: contracts.filter(c => c.dispatch_type === 'short_term' && c.status === 'active').length,
      insuranceActive: operations.filter(op => isInsurance(op) && !['completed', 'cancelled'].includes(op.status)).length,
      insurancePendingBilling: operations.filter(op => isInsurance(op) && op.insurance_billing_status === 'pending').length,
    }
  }, [operations, contracts, today, weekStart, weekEnd])

  // ============================================
  // Filtered Operations (List View)
  // ============================================
  const filteredOperations = useMemo(() => {
    return operations.filter(op => {
      // Date filter
      if (listFilter === 'today' && op.scheduled_date !== today) return false
      if (listFilter === 'week' && (op.scheduled_date < weekStart || op.scheduled_date > weekEnd)) return false
      // Status filter
      if (statusFilter !== 'all' && op.status !== statusFilter) return false
      // Dispatch category filter
      if (dispatchFilter !== 'all') {
        const cat = op.dispatch_category || 'regular'
        if (dispatchFilter === 'regular' && cat !== 'regular') return false
        if (dispatchFilter === 'insurance' && !['insurance_victim', 'insurance_at_fault', 'insurance_own'].includes(cat)) return false
        if (dispatchFilter === 'maintenance' && cat !== 'maintenance') return false
      }
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const car = getCar(op.car_id)
        const cust = getCustomer(op.customer_id)
        if (
          !(car?.number || '').toLowerCase().includes(q) &&
          !(car?.brand || '').toLowerCase().includes(q) &&
          !(car?.model || '').toLowerCase().includes(q) &&
          !(cust?.name || '').toLowerCase().includes(q) &&
          !(op.location || '').toLowerCase().includes(q) &&
          !(op.handler_name || '').toLowerCase().includes(q) &&
          !(op.insurance_company_billing || '').toLowerCase().includes(q) &&
          !(op.insurance_claim_no || '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [operations, listFilter, statusFilter, dispatchFilter, searchQuery, today, weekStart, weekEnd])

  // ============================================
  // Status Change
  // ============================================
  const handleStatusChange = async (opId: string, newStatus: string) => {
    const op = operations.find(o => o.id === opId)
    if (!op) return
    try {
      const updates: any = { status: newStatus }
      if (newStatus === 'completed') {
        updates.completed_at = new Date().toISOString()
        updates.actual_date = new Date().toISOString().split('T')[0]
      }
      await supabase.from('vehicle_operations').update(updates).eq('id', opId)
      await supabase.from('vehicle_status_log').insert({
        company_id: effectiveCompanyId,
        car_id: op.car_id,
        old_status: op.status,
        new_status: newStatus,
        related_type: 'operation',
        related_id: opId,
        changed_by: user?.id,
      })
      fetchOperations()
    } catch (error) {
      console.error('상태 변경 실패:', error)
    }
  }

  // ============================================
  // Timeline Navigation
  // ============================================
  const shiftTimeline = (direction: 'prev' | 'today' | 'next') => {
    if (direction === 'today') {
      const d = new Date(); d.setDate(d.getDate() - 3)
      setTimelineStart(d.toISOString().split('T')[0])
    } else {
      const d = new Date(timelineStart)
      d.setDate(d.getDate() + (direction === 'next' ? 7 : -7))
      setTimelineStart(d.toISOString().split('T')[0])
    }
  }

  // ============================================
  // Callbacks for modal
  // ============================================
  const handleDispatchCreated = () => {
    setShowDispatchModal(false)
    setEditingOp(null)
    fetchOperations()
    fetchSchedules()
    fetchContracts()
    fetchCars()
  }

  const openEditModal = (op: Operation) => {
    setEditingOp(op)
    setShowDispatchModal(true)
  }

  // ============================================
  // Render - god_admin check
  // ============================================
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

  // ============================================
  // Timeline View - All Cars with Gantt bars
  // ============================================
  const renderTimeline = () => {
    const dates: string[] = []
    for (let i = 0; i < timelineDays; i++) {
      const d = new Date(timelineStart)
      d.setDate(d.getDate() + i)
      dates.push(d.toISOString().split('T')[0])
    }

    // Get all cars that have schedules OR are available
    const allCarsForTimeline = cars.map(car => {
      const carSchedules = schedules.filter(s => String(s.car_id) === String(car.id))
      return { car, schedules: carSchedules, hasSchedule: carSchedules.length > 0 }
    }).sort((a, b) => (b.hasSchedule ? 1 : 0) - (a.hasSchedule ? 1 : 0))

    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Timeline Controls */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftTimeline('prev')} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold hover:bg-gray-50">← 이전</button>
            <button onClick={() => shiftTimeline('today')} className="px-3 py-1.5 bg-steel-600 text-white rounded-lg text-sm font-bold hover:bg-steel-700">오늘</button>
            <button onClick={() => shiftTimeline('next')} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold hover:bg-gray-50">다음 →</button>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500"></span> 장기</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500"></span> 단기</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-500"></span> 보험대차</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500"></span> 대차</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500"></span> 정비</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ display: 'grid', gridTemplateColumns: `160px repeat(${timelineDays}, minmax(36px, 1fr))`, minWidth: `${160 + timelineDays * 36}px` }}>
            {/* Header - date labels */}
            <div className="sticky left-0 z-20 bg-gray-50 border-r border-b border-gray-200 p-2 text-xs font-bold text-gray-500">차량</div>
            {dates.map((date, i) => {
              const d = new Date(date)
              const isToday = date === today
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div key={date} className={`border-b border-r border-gray-200 text-center py-1 text-[10px] font-bold ${isToday ? 'bg-blue-50 text-blue-700' : isWeekend ? 'bg-red-50 text-red-400' : 'bg-gray-50 text-gray-500'}`}>
                  <div>{d.getMonth() + 1}/{d.getDate()}</div>
                  <div className="text-[9px] font-normal">{['일','월','화','수','목','금','토'][d.getDay()]}</div>
                </div>
              )
            })}

            {/* Car rows */}
            {allCarsForTimeline.map(({ car, schedules: carSchedules }) => {
              const hasNoSchedule = carSchedules.length === 0
              return (
                <div key={car.id} className="contents">
                  {/* Car label */}
                  <div className={`sticky left-0 z-10 border-r border-b border-gray-200 p-2 text-xs truncate ${hasNoSchedule ? 'bg-green-50' : 'bg-white'}`}>
                    <div className="font-bold text-gray-800">{car.number}</div>
                    <div className="text-[10px] text-gray-400 truncate">{car.brand} {car.model}</div>
                  </div>
                  {/* Day cells */}
                  {dates.map((date) => {
                    const isToday = date === today
                    const cellSchedules = carSchedules.filter(s => date >= s.start_date && date <= s.end_date)
                    return (
                      <div key={`${car.id}-${date}`} className={`border-r border-b border-gray-100 relative min-h-[40px] ${isToday ? 'bg-blue-50/30' : hasNoSchedule ? 'bg-green-50/30' : ''}`}>
                        {cellSchedules.map(sched => {
                          const isStart = date === sched.start_date
                          const isEnd = date === sched.end_date
                          const color = sched.color || SCHEDULE_COLORS[sched.schedule_type] || '#3b82f6'
                          return (
                            <div
                              key={sched.id}
                              className={`absolute inset-x-0 top-1 bottom-1 flex items-center text-white text-[9px] font-bold overflow-hidden ${isStart ? 'rounded-l ml-0.5' : ''} ${isEnd ? 'rounded-r mr-0.5' : ''}`}
                              style={{ backgroundColor: color }}
                              title={sched.title || ''}
                            >
                              {isStart && <span className="px-1 truncate">{sched.title}</span>}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {allCarsForTimeline.length === 0 && (
          <div className="p-12 text-center text-gray-400 text-sm">등록된 차량이 없습니다.</div>
        )}
      </div>
    )
  }

  // ============================================
  // List View
  // ============================================
  const renderListView = () => (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* List Filters */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-100 overflow-x-auto">
        {[
          { key: 'today', label: '오늘' },
          { key: 'week', label: '이번주' },
          { key: 'all', label: '전체' },
        ].map(f => (
          <button key={f.key} onClick={() => setListFilter(f.key as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${listFilter === f.key ? 'bg-steel-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.label}
          </button>
        ))}
        <div className="w-px h-5 bg-gray-200 mx-1" />
        {['all', 'scheduled', 'preparing', 'inspecting', 'in_transit', 'completed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${statusFilter === s ? 'bg-gray-800 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
            {s === 'all' ? '전체' : OP_STATUS[s]?.label}
          </button>
        ))}
        <div className="w-px h-5 bg-gray-200 mx-1" />
        {[
          { key: 'all', label: '전체배차' },
          { key: 'regular', label: '일반' },
          { key: 'insurance', label: '보험배차' },
          { key: 'maintenance', label: '정비대차' },
        ].map(f => (
          <button key={f.key} onClick={() => setDispatchFilter(f.key as any)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${dispatchFilter === f.key ? 'bg-teal-600 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-20 text-center text-gray-400 flex flex-col items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600 mb-2"></div>
          데이터를 불러오는 중...
        </div>
      ) : filteredOperations.length === 0 ? (
        <div className="p-12 text-center text-gray-400 text-sm">
          {searchQuery ? '검색 결과가 없습니다.' : '해당 조건에 맞는 배차가 없습니다.'}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 text-gray-500 font-bold text-xs uppercase tracking-wider border-b border-gray-100">
                <tr>
                  <th className="p-3">일정</th>
                  <th className="p-3">유형</th>
                  <th className="p-3">배차구분</th>
                  <th className="p-3">차량</th>
                  <th className="p-3">고객</th>
                  <th className="p-3">장소</th>
                  <th className="p-3">상태</th>
                  <th className="p-3">보험/정산</th>
                  <th className="p-3 text-center">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOperations.map(op => {
                  const car = getCar(op.car_id)
                  const cust = getCustomer(op.customer_id)
                  const cat = op.dispatch_category || 'regular'
                  const catInfo = DISPATCH_CATEGORY[cat] || DISPATCH_CATEGORY.regular
                  const isInsuranceOp = ['insurance_victim', 'insurance_at_fault', 'insurance_own'].includes(cat)
                  const billingInfo = op.insurance_billing_status ? BILLING_STATUS[op.insurance_billing_status] : null
                  return (
                    <tr key={op.id} className="hover:bg-steel-50/50 transition-colors">
                      <td className="p-3 text-sm">
                        <div className="font-bold text-gray-900">{op.scheduled_date}</div>
                        <div className="text-xs text-gray-400">{op.scheduled_time}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${op.operation_type === 'delivery' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {op.operation_type === 'delivery' ? '출고' : '반납'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${catInfo.bg} ${catInfo.color}`}>
                          {catInfo.label}
                        </span>
                        {isInsuranceOp && op.fault_ratio != null && (
                          <div className="text-[10px] text-gray-400 mt-0.5">과실 {op.fault_ratio}%</div>
                        )}
                      </td>
                      <td className="p-3 text-sm">
                        <div className="font-bold text-gray-800">{car?.number || '-'}</div>
                        <div className="text-xs text-gray-400">{car?.brand} {car?.model}</div>
                      </td>
                      <td className="p-3 text-sm">
                        <div className="font-bold text-gray-800">{cust?.name || '-'}</div>
                        <div className="text-xs text-gray-400">{cust?.phone || ''}</div>
                      </td>
                      <td className="p-3 text-sm">
                        <div className="text-gray-700">{op.location || '-'}</div>
                        <div className="text-xs text-gray-400 truncate max-w-[150px]">{op.location_address}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${OP_STATUS[op.status]?.color}`}>
                          {OP_STATUS[op.status]?.icon} {OP_STATUS[op.status]?.label}
                        </span>
                      </td>
                      <td className="p-3 text-sm">
                        {isInsuranceOp ? (
                          <div>
                            {billingInfo && billingInfo.label !== '-' && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${billingInfo.color}`}>
                                {billingInfo.label}
                              </span>
                            )}
                            {op.insurance_company_billing && (
                              <div className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[100px]">{op.insurance_company_billing}</div>
                            )}
                            {(op.insurance_billed_amount || 0) > 0 && (
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {Number(op.insurance_billed_amount).toLocaleString()}원
                              </div>
                            )}
                          </div>
                        ) : cat === 'maintenance' ? (
                          <span className="text-[10px] text-gray-400">{op.repair_shop_name || '-'}</span>
                        ) : (
                          <span className="text-[10px] text-gray-400">{op.handler_name || '-'}</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1.5 justify-center flex-wrap">
                          <button onClick={() => openEditModal(op)} className="px-2 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200">수정</button>
                          {renderStatusButtons(op)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-gray-100">
            {filteredOperations.map(op => {
              const car = getCar(op.car_id)
              const cust = getCustomer(op.customer_id)
              const cat = op.dispatch_category || 'regular'
              const catInfo = DISPATCH_CATEGORY[cat] || DISPATCH_CATEGORY.regular
              const isInsuranceOp = ['insurance_victim', 'insurance_at_fault', 'insurance_own'].includes(cat)
              return (
                <div key={op.id} className="p-4 active:bg-steel-50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-black text-gray-900 text-sm">{op.scheduled_date} {op.scheduled_time}</div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${op.operation_type === 'delivery' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {op.operation_type === 'delivery' ? '출고' : '반납'}
                        </span>
                        {cat !== 'regular' && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${catInfo.bg} ${catInfo.color}`}>
                            {catInfo.label}
                          </span>
                        )}
                        <span>{car?.number || '-'}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${OP_STATUS[op.status]?.color}`}>
                      {OP_STATUS[op.status]?.label}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    {car?.brand} {car?.model} {cust?.name ? `· ${cust.name}` : ''} {op.location ? `· ${op.location}` : ''}
                  </div>
                  {isInsuranceOp && (
                    <div className="text-[10px] text-gray-400 mb-2 flex items-center gap-2 flex-wrap">
                      {op.insurance_company_billing && <span>{op.insurance_company_billing}</span>}
                      {op.fault_ratio != null && <span>과실 {op.fault_ratio}%</span>}
                      {op.insurance_billing_status && op.insurance_billing_status !== 'none' && (
                        <span className={`px-1.5 py-0.5 rounded font-bold ${BILLING_STATUS[op.insurance_billing_status]?.color}`}>
                          {BILLING_STATUS[op.insurance_billing_status]?.label}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-1.5 overflow-x-auto">
                    <button onClick={() => openEditModal(op)} className="px-2 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 flex-shrink-0">수정</button>
                    {renderStatusButtons(op)}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  // Status action buttons
  const renderStatusButtons = (op: Operation) => {
    const buttons: React.ReactNode[] = []
    if (op.status === 'scheduled') {
      buttons.push(
        <button key="prep" onClick={() => handleStatusChange(op.id, 'preparing')} className="px-2 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 flex-shrink-0">준비</button>
      )
    }
    if (op.status === 'preparing') {
      buttons.push(
        <button key="insp" onClick={() => handleStatusChange(op.id, 'inspecting')} className="px-2 py-1 rounded-lg text-xs font-bold bg-purple-100 text-purple-700 hover:bg-purple-200 flex-shrink-0">점검</button>
      )
    }
    if (op.status === 'inspecting') {
      if (op.operation_type === 'delivery') {
        buttons.push(
          <button key="transit" onClick={() => handleStatusChange(op.id, 'in_transit')} className="px-2 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 flex-shrink-0">출발</button>
        )
      } else {
        buttons.push(
          <button key="done" onClick={() => handleStatusChange(op.id, 'completed')} className="px-2 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 flex-shrink-0">완료</button>
        )
      }
    }
    if (op.status === 'in_transit') {
      buttons.push(
        <button key="done2" onClick={() => handleStatusChange(op.id, 'completed')} className="px-2 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 flex-shrink-0">완료</button>
      )
    }
    return buttons
  }

  // ============================================
  // Main Render
  // ============================================
  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-8 md:px-6 min-h-screen bg-gray-50/50">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
        <div style={{ textAlign: 'left' }}>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">🚚 출고/반납 관리</h1>
          <p className="text-gray-500 mt-1 text-sm">
            배차 스케줄 관리 · 출고/반납 처리 · 단기대차 계약
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="text" placeholder="🔍 차량번호, 고객명 검색..."
            className="px-3 py-2.5 border border-gray-300 rounded-xl flex-1 md:flex-none md:min-w-[220px] focus:outline-none focus:border-steel-500 shadow-sm text-sm"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          <button onClick={() => { setEditingOp(null); setShowDispatchModal(true) }}
            className="px-4 py-2.5 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-all flex items-center gap-1.5 shadow-lg shadow-steel-600/10 whitespace-nowrap">
            + 새 배차
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-[11px] text-gray-400 font-bold">오늘 출고</p>
          <p className="text-xl font-black text-blue-600 mt-1">{stats.todayDeliveries}<span className="text-sm text-gray-400 ml-0.5">건</span></p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-[11px] text-gray-400 font-bold">오늘 반납</p>
          <p className="text-xl font-black text-amber-600 mt-1">{stats.todayReturns}<span className="text-sm text-gray-400 ml-0.5">건</span></p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-[11px] text-gray-400 font-bold">현재 진행중</p>
          <p className="text-xl font-black text-gray-900 mt-1">{stats.inProgress}<span className="text-sm text-gray-400 ml-0.5">건</span></p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-[11px] text-gray-400 font-bold">이번주 예정</p>
          <p className="text-xl font-black text-gray-900 mt-1">{stats.weekScheduled}<span className="text-sm text-gray-400 ml-0.5">건</span></p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-purple-200 shadow-sm">
          <p className="text-[11px] text-purple-500 font-bold">단기대차 진행</p>
          <p className="text-xl font-black text-purple-600 mt-1">{stats.shortTermActive}<span className="text-sm text-gray-400 ml-0.5">건</span></p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-teal-200 shadow-sm">
          <p className="text-[11px] text-teal-600 font-bold">보험배차 진행</p>
          <p className="text-xl font-black text-teal-600 mt-1">{stats.insuranceActive}<span className="text-sm text-gray-400 ml-0.5">건</span></p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-yellow-200 shadow-sm">
          <p className="text-[11px] text-yellow-600 font-bold">보험청구 대기</p>
          <p className="text-xl font-black text-yellow-600 mt-1">{stats.insurancePendingBilling}<span className="text-sm text-gray-400 ml-0.5">건</span></p>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'list', label: '📋 리스트', },
          { key: 'timeline', label: '📊 타임라인', },
          { key: 'calendar', label: '📅 캘린더', },
        ].map(v => (
          <button key={v.key} onClick={() => setViewMode(v.key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === v.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* View Content */}
      {viewMode === 'list' && renderListView()}
      {viewMode === 'timeline' && renderTimeline()}
      {viewMode === 'calendar' && (
        <CalendarView
          operations={operations}
          schedules={schedules}
          cars={cars}
          getCar={getCar}
          getCustomer={getCustomer}
          onOperationClick={openEditModal}
        />
      )}

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <DispatchModal
          editingOp={editingOp}
          cars={cars}
          contracts={contracts}
          customers={customers}
          effectiveCompanyId={effectiveCompanyId}
          userId={user?.id}
          companyData={company}
          onClose={() => { setShowDispatchModal(false); setEditingOp(null) }}
          onCreated={handleDispatchCreated}
        />
      )}
    </div>
  )
}
