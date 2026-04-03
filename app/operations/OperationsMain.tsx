'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import CalendarView from './CalendarView'
import DispatchModal from './DispatchModal'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/firebase')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

// ============================================
// Types
// ============================================
type Operation = {
  id: string
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
  const { company, role, user } = useApp()
  const effectiveCompanyId = company?.id

  // Data states
  const [operations, setOperations] = useState<Operation[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [cars, setCars] = useState<Car[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // UI states
  const [viewMode, setViewMode] = useState<'dashboard' | 'timeline' | 'calendar' | 'list'>('dashboard')
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
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/vehicle-operations', { headers })
      const json = await res.json()
      const data = json.data ?? json ?? []
      setOperations(data || [])
    } catch (error) {
      console.error('작업 로딩 실패:', JSON.stringify(error))
    }
  }, [effectiveCompanyId])

  const fetchSchedules = useCallback(async () => {
    if (!effectiveCompanyId) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/vehicle-schedules?start=${timelineStart}&end=${timelineEnd}`, { headers })
      const json = await res.json()
      const data = json.data ?? json ?? []
      setSchedules(data || [])
    } catch (error) {
      console.error('일정 로딩 실패:', JSON.stringify(error))
    }
  }, [effectiveCompanyId, timelineStart, timelineEnd])

  const fetchContracts = useCallback(async () => {
    if (!effectiveCompanyId) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/contracts?status=active,pending', { headers })
      const json = await res.json()
      const data = json.data ?? json ?? []
      setContracts(data || [])
    } catch (error) {
      console.error('계약 로딩 실패:', JSON.stringify(error))
    }
  }, [effectiveCompanyId])

  const fetchCars = useCallback(async () => {
    if (!effectiveCompanyId) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/cars', { headers })
      const json = await res.json()
      const data = json.data ?? json ?? []
      setCars(data || [])
    } catch (error) {
      console.error('차량 로딩 실패:', error)
    }
  }, [effectiveCompanyId])

  const fetchCustomers = useCallback(async () => {
    if (!effectiveCompanyId) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/customers', { headers })
      const json = await res.json()
      const data = json.data ?? json ?? []
      setCustomers(data || [])
    } catch (error) {
      console.error('고객 로딩 실패:', error)
    }
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

  const toLocalDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const today = toLocalDate(new Date())
  const tomorrowDate = (() => { const d = new Date(); d.setDate(d.getDate()+1); return toLocalDate(d) })()
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return toLocalDate(d) })()
  const weekEnd = (() => { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return toLocalDate(d) })()

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
  // Dashboard Data
  // ============================================
  const dashboardData = useMemo(() => {
    const active = operations.filter(op => op.status !== 'cancelled')
    const todayOps = active.filter(op => op.scheduled_date === today).sort((a,b) => (a.scheduled_time||'').localeCompare(b.scheduled_time||''))
    const tomorrowOps = active.filter(op => op.scheduled_date === tomorrowDate).sort((a,b) => (a.scheduled_time||'').localeCompare(b.scheduled_time||''))
    // 이번주 (오늘/내일 제외) 예정
    const weekOps = active.filter(op => op.scheduled_date > tomorrowDate && op.scheduled_date <= weekEnd && op.status !== 'completed')
      .sort((a,b) => a.scheduled_date.localeCompare(b.scheduled_date) || (a.scheduled_time||'').localeCompare(b.scheduled_time||''))
    // 주의 필요: 과거 일정인데 완료 안 된 것들
    const overdueOps = active.filter(op => op.scheduled_date < today && !['completed', 'cancelled'].includes(op.status))
      .sort((a,b) => a.scheduled_date.localeCompare(b.scheduled_date))
    // 진행 중 (예정이 아닌 것들)
    const inProgressOps = active.filter(op => ['preparing', 'inspecting', 'in_transit'].includes(op.status))
    // 이번주 완료된 것들 (최근 순)
    const weekCompleted = active.filter(op => op.scheduled_date >= weekStart && op.scheduled_date <= weekEnd && op.status === 'completed')
      .sort((a,b) => b.scheduled_date.localeCompare(a.scheduled_date) || (b.scheduled_time||'').localeCompare(a.scheduled_time||''))
    // 다음주 예정
    const nextWeekStart = (() => { const d = new Date(); d.setDate(d.getDate() + (7 - d.getDay())); return toLocalDate(d) })()
    const nextWeekEnd = (() => { const d = new Date(); d.setDate(d.getDate() + (13 - d.getDay())); return toLocalDate(d) })()
    const nextWeekOps = active.filter(op => op.scheduled_date >= nextWeekStart && op.scheduled_date <= nextWeekEnd && op.status !== 'completed')
      .sort((a,b) => a.scheduled_date.localeCompare(b.scheduled_date))
    return { todayOps, tomorrowOps, weekOps, overdueOps, inProgressOps, weekCompleted, nextWeekOps }
  }, [operations, today, tomorrowDate, weekEnd])

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
      // Update operation status via API
      const updateRes = await fetch(`/api/vehicle-operations/${opId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(updates)
      })
      if (!updateRes.ok) throw new Error('작업 상태 업데이트 실패')

      // Log status change via API
      const logRes = await fetch('/api/vehicle-status-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({
          car_id: op.car_id,
          old_status: op.status,
          new_status: newStatus,
          related_type: 'operation',
          related_id: opId,
          changed_by: user?.id,
        })
      })
      if (!logRes.ok) throw new Error('상태 로그 기록 실패')

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
  // Render - admin check
  // ============================================
  if (!company) {
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
          <div style={{ overflowX: 'auto' }} className="hidden md:block">
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
          <div className="md:hidden space-y-3">
            {filteredOperations.map(op => {
              const car = getCar(op.car_id)
              const cust = getCustomer(op.customer_id)
              const cat = op.dispatch_category || 'regular'
              const catInfo = DISPATCH_CATEGORY[cat] || DISPATCH_CATEGORY.regular
              const isInsuranceOp = ['insurance_victim', 'insurance_at_fault', 'insurance_own'].includes(cat)
              const billingInfo = op.insurance_billing_status ? BILLING_STATUS[op.insurance_billing_status] : null
              return (
                <div
                  key={op.id}
                  onClick={() => openEditModal(op)}
                  className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 hover:shadow-md transition-shadow cursor-pointer"
                >
                  {/* Date and Type */}
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                      <div className="font-bold text-gray-900 text-sm">{op.scheduled_date}</div>
                      <div className="text-xs text-gray-400">{op.scheduled_time}</div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${op.operation_type === 'delivery' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {op.operation_type === 'delivery' ? '출고' : '반납'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${catInfo.bg} ${catInfo.color}`}>
                        {catInfo.label}
                      </span>
                    </div>
                  </div>

                  {/* Car Info */}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="font-bold text-gray-800 text-sm">{car?.number || '-'}</div>
                    <div className="text-xs text-gray-400">{car?.brand} {car?.model}</div>
                  </div>

                  {/* Customer and Driver */}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="text-xs text-gray-500 font-semibold mb-1">고객</div>
                    <div className="font-bold text-gray-800 text-sm">{cust?.name || '-'}</div>
                    <div className="text-xs text-gray-400">{cust?.phone || ''}</div>
                  </div>

                  {/* Location */}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="text-xs text-gray-500 font-semibold mb-1">장소</div>
                    <div className="text-gray-700 text-sm">{op.location || '-'}</div>
                    <div className="text-xs text-gray-400 truncate">{op.location_address}</div>
                  </div>

                  {/* Status and Billing */}
                  <div className="border-t border-gray-100 pt-3 flex justify-between items-start">
                    <div className="flex-1">
                      <div className="text-xs text-gray-500 font-semibold mb-1">상태</div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold inline-block ${OP_STATUS[op.status]?.color}`}>
                        {OP_STATUS[op.status]?.icon} {OP_STATUS[op.status]?.label}
                      </span>
                    </div>
                    {isInsuranceOp && (
                      <div className="flex-1 text-right">
                        <div className="text-xs text-gray-500 font-semibold mb-1">보험/정산</div>
                        {billingInfo && billingInfo.label !== '-' && (
                          <div className={`text-[10px] font-bold inline-block ${billingInfo.color}`}>
                            {billingInfo.label}
                          </div>
                        )}
                        {op.insurance_company_billing && (
                          <div className="text-[10px] text-gray-500 truncate">{op.insurance_company_billing}</div>
                        )}
                        {(op.insurance_billed_amount || 0) > 0 && (
                          <div className="text-[10px] text-gray-400">
                            {Number(op.insurance_billed_amount).toLocaleString()}원
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="border-t border-gray-100 pt-3 flex gap-2 flex-wrap">
                    <button onClick={(e) => { e.stopPropagation(); openEditModal(op); }} className="flex-1 px-2 py-2 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200">수정</button>
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

  // ============================================
  // Dashboard View
  // ============================================
  const renderDashboardCard = (op: Operation, size: 'large' | 'compact' = 'large') => {
    const car = getCar(op.car_id)
    const cust = getCustomer(op.customer_id)
    const cat = op.dispatch_category || 'regular'
    const catInfo = DISPATCH_CATEGORY[cat] || DISPATCH_CATEGORY.regular
    const isDelivery = op.operation_type === 'delivery'
    const statusInfo = OP_STATUS[op.status]

    // 다음 상태 버튼 정보
    const nextAction = (() => {
      if (op.status === 'scheduled') return { label: '준비 시작', next: 'preparing', color: 'bg-blue-500 hover:bg-blue-600', icon: '🔧' }
      if (op.status === 'preparing') return { label: '점검 시작', next: 'inspecting', color: 'bg-purple-500 hover:bg-purple-600', icon: '🔍' }
      if (op.status === 'inspecting' && isDelivery) return { label: '출발', next: 'in_transit', color: 'bg-amber-500 hover:bg-amber-600', icon: '🚗' }
      if (op.status === 'inspecting' && !isDelivery) return { label: '반납 완료', next: 'completed', color: 'bg-green-500 hover:bg-green-600', icon: '✅' }
      if (op.status === 'in_transit') return { label: '인도 완료', next: 'completed', color: 'bg-green-500 hover:bg-green-600', icon: '✅' }
      return null
    })()

    if (size === 'compact') {
      return (
        <div key={op.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => openEditModal(op)}>
          {/* 유형 아이콘 */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${isDelivery ? 'bg-blue-100' : 'bg-amber-100'}`}>
            {isDelivery ? '🚚' : '🔙'}
          </div>
          {/* 정보 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-black text-sm text-gray-900">{car?.number || '-'}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${catInfo.bg} ${catInfo.color}`}>{catInfo.label}</span>
            </div>
            <div className="text-xs text-gray-500 truncate">{car?.brand} {car?.model} · {cust?.name || '고객 미지정'}</div>
          </div>
          {/* 시간 */}
          <div className="text-right flex-shrink-0">
            <div className="text-xs font-bold text-gray-700">{op.scheduled_time || '-'}</div>
            <div className="text-[10px] text-gray-400 truncate max-w-[80px]">{op.location || ''}</div>
          </div>
        </div>
      )
    }

    return (
      <div key={op.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden">
        {/* 상단: 유형 + 상태 */}
        <div className={`px-4 py-2.5 flex items-center justify-between ${isDelivery ? 'bg-blue-50 border-b border-blue-100' : 'bg-amber-50 border-b border-amber-100'}`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{isDelivery ? '🚚' : '🔙'}</span>
            <span className={`font-black text-sm ${isDelivery ? 'text-blue-700' : 'text-amber-700'}`}>
              {isDelivery ? '출고' : '반납'}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${catInfo.bg} ${catInfo.color}`}>{catInfo.label}</span>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusInfo?.color}`}>
            {statusInfo?.icon} {statusInfo?.label}
          </span>
        </div>

        {/* 중단: 차량 + 고객 정보 */}
        <div className="p-4 cursor-pointer" onClick={() => openEditModal(op)}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-lg font-black text-gray-900">{car?.number || '-'}</div>
              <div className="text-sm text-gray-500">{car?.brand} {car?.model}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-black text-gray-900">{op.scheduled_time || '-'}</div>
              <div className="text-xs text-gray-400">{op.scheduled_date}</div>
            </div>
          </div>

          {/* 세부 정보 - 큰 글씨로 */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {cust?.name && (
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-[10px] text-gray-400 font-bold">고객</div>
                <div className="font-bold text-gray-800">{cust.name}</div>
                {cust.phone && <div className="text-xs text-gray-500">{cust.phone}</div>}
              </div>
            )}
            {op.location && (
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-[10px] text-gray-400 font-bold">장소</div>
                <div className="font-bold text-gray-800 truncate">{op.location}</div>
              </div>
            )}
          </div>
        </div>

        {/* 하단: 액션 버튼 - 크고 눈에 띄게 */}
        {op.status !== 'completed' && nextAction && (
          <div className="px-4 pb-4">
            <button
              onClick={(e) => { e.stopPropagation(); handleStatusChange(op.id, nextAction.next) }}
              className={`w-full py-3 rounded-xl text-white font-black text-sm ${nextAction.color} transition-all active:scale-[0.98] shadow-sm`}>
              {nextAction.icon} {nextAction.label}
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderDashboard = () => {
    const { todayOps, tomorrowOps, weekOps, overdueOps, inProgressOps, weekCompleted, nextWeekOps } = dashboardData
    const todayDeliveries = todayOps.filter(op => op.operation_type === 'delivery' && op.status !== 'completed')
    const todayReturns = todayOps.filter(op => op.operation_type === 'return' && op.status !== 'completed')
    const todayCompleted = todayOps.filter(op => op.status === 'completed')

    // 요일 이름
    const dayNames = ['일', '월', '화', '수', '목', '금', '토']
    const todayDayName = dayNames[new Date().getDay()]
    const tomorrowDayName = dayNames[new Date(tomorrowDate).getDay()]

    return (
      <div className="space-y-6">
        {/* 주의 필요 - 가장 위에 */}
        {overdueOps.length > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4">
            <h2 className="text-base font-black text-red-700 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 bg-red-500 text-white rounded-lg flex items-center justify-center text-sm">!</span>
              지연 주의 — 미처리 {overdueOps.length}건
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {overdueOps.map(op => renderDashboardCard(op))}
            </div>
          </div>
        )}

        {/* 진행 중인 작업 */}
        {inProgressOps.length > 0 && (
          <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-4">
            <h2 className="text-base font-black text-blue-800 mb-3 flex items-center gap-2">
              <span className="text-lg">⚡</span>
              지금 진행 중 — {inProgressOps.length}건
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {inProgressOps.map(op => renderDashboardCard(op))}
            </div>
          </div>
        )}

        {/* 오늘 할 일 */}
        <div>
          <h2 className="text-lg font-black text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-gray-900 text-white rounded-xl flex items-center justify-center text-sm">
              {new Date().getDate()}
            </span>
            오늘 ({todayDayName})
            {todayOps.length === 0 && <span className="text-sm font-normal text-gray-400 ml-1">— 예정 없음</span>}
          </h2>

          {(todayDeliveries.length > 0 || todayReturns.length > 0) ? (
            <div className="space-y-4">
              {/* 출고 */}
              {todayDeliveries.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-black">🚚 출고 {todayDeliveries.length}건</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {todayDeliveries.map(op => renderDashboardCard(op))}
                  </div>
                </div>
              )}
              {/* 반납 */}
              {todayReturns.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-black">🔙 반납 {todayReturns.length}건</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {todayReturns.map(op => renderDashboardCard(op))}
                  </div>
                </div>
              )}
              {/* 오늘 완료 */}
              {todayCompleted.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-black">✅ 완료 {todayCompleted.length}건</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {todayCompleted.map(op => renderDashboardCard(op, 'compact'))}
                  </div>
                </div>
              )}
            </div>
          ) : todayOps.length > 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
              <div className="text-3xl mb-2">🎉</div>
              <div className="font-bold text-green-700">오늘 모든 작업 완료!</div>
              <div className="text-sm text-green-600">총 {todayCompleted.length}건 처리 완료</div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center">
              <div className="text-3xl mb-2">📋</div>
              <div className="font-bold text-gray-500">오늘 예정된 배차가 없습니다</div>
            </div>
          )}
        </div>

        {/* 내일 예정 */}
        {tomorrowOps.length > 0 && (
          <div>
            <h2 className="text-base font-black text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 bg-gray-200 text-gray-600 rounded-lg flex items-center justify-center text-xs font-black">
                {new Date(tomorrowDate).getDate()}
              </span>
              내일 ({tomorrowDayName}) — {tomorrowOps.length}건
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tomorrowOps.filter(op => op.status !== 'completed').map(op => renderDashboardCard(op, 'compact'))}
            </div>
          </div>
        )}

        {/* 이번 주 나머지 예정 */}
        {weekOps.length > 0 && (
          <div>
            <h2 className="text-base font-black text-gray-600 mb-3 flex items-center gap-2">
              <span className="text-lg">📅</span>
              이번 주 예정 — {weekOps.length}건
            </h2>
            <div className="space-y-2">
              {Object.entries(
                weekOps.reduce((acc, op) => {
                  const d = op.scheduled_date
                  if (!acc[d]) acc[d] = []
                  acc[d].push(op)
                  return acc
                }, {} as Record<string, Operation[]>)
              ).map(([date, ops]) => (
                <div key={date} className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs font-bold text-gray-500 mb-2">
                    {date} ({dayNames[new Date(date).getDay()]})
                  </div>
                  <div className="space-y-2">
                    {ops.map(op => renderDashboardCard(op, 'compact'))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 다음 주 예정 */}
        {nextWeekOps.length > 0 && (
          <div>
            <h2 className="text-base font-black text-gray-600 mb-3 flex items-center gap-2">
              <span className="text-lg">📆</span>
              다음 주 예정 — {nextWeekOps.length}건
            </h2>
            <div className="space-y-2">
              {Object.entries(
                nextWeekOps.reduce((acc, op) => {
                  const d = op.scheduled_date
                  if (!acc[d]) acc[d] = []
                  acc[d].push(op)
                  return acc
                }, {} as Record<string, Operation[]>)
              ).map(([date, ops]) => (
                <div key={date} className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs font-bold text-gray-500 mb-2">
                    {date} ({dayNames[new Date(date).getDay()]})
                  </div>
                  <div className="space-y-2">
                    {ops.map(op => renderDashboardCard(op, 'compact'))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 이번 주 완료 요약 */}
        {weekCompleted.length > 0 && (
          <div className="border-t border-gray-200 pt-4">
            <h2 className="text-sm font-black text-gray-400 mb-3 flex items-center gap-2">
              <span className="text-base">✅</span>
              이번 주 처리 완료 — {weekCompleted.length}건
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {weekCompleted.slice(0, 6).map(op => {
                const car = getCar(op.car_id)
                const isDelivery = op.operation_type === 'delivery'
                return (
                  <div key={op.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm opacity-70 cursor-pointer hover:opacity-100 transition-opacity"
                    onClick={() => openEditModal(op)}>
                    <span className={`w-6 h-6 rounded flex items-center justify-center text-xs ${isDelivery ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                      {isDelivery ? '출' : '반'}
                    </span>
                    <span className="font-bold text-gray-600">{car?.number || '-'}</span>
                    <span className="text-gray-400 text-xs">{op.scheduled_date}</span>
                    <span className="ml-auto text-green-500 text-xs">✓</span>
                  </div>
                )
              })}
              {weekCompleted.length > 6 && (
                <div className="flex items-center justify-center p-2 text-xs text-gray-400">
                  외 {weekCompleted.length - 6}건 더...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

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

      {/* KPI Cards - 대시보드 외 뷰에서만 표시 */}
      <div className={`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5 ${viewMode === 'dashboard' ? 'hidden' : ''}`}>
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
          { key: 'dashboard', label: '🏠 대시보드', },
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
      {viewMode === 'dashboard' && renderDashboard()}
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
