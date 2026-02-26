'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../utils/supabase'
import Link from 'next/link'

type MaintenanceRecord = {
  id: string
  company_id: string
  car_id: string
  contract_id: string | null
  requested_date: string
  scheduled_date: string
  maintenance_type: 'scheduled' | 'unscheduled' | 'recall' | 'warranty' | 'consumable' | 'body_repair' | 'pre_delivery' | 'post_return'
  shop_name: string
  shop_phone: string
  shop_address: string
  mileage: number
  maintenance_items: Array<{
    item: string
    quantity: number
    unit_price: number
    parts_cost: number
    labor_cost: number
  }>
  estimated_cost: number
  actual_cost: number | null
  cost_responsibility: 'company' | 'customer' | 'insurance' | 'warranty' | 'shared'
  customer_share_amount: number | null
  replacement_car_id: string | null
  replacement_start_date: string | null
  replacement_end_date: string | null
  notes: string
  status: 'requested' | 'approved' | 'in_shop' | 'completed' | 'cancelled'
  completed_at: string | null
  created_at: string
  created_by: string | null
  car?: {
    id: string
    number: string
    brand: string
    model: string
    trim?: string
    year?: string
  }
  contract?: {
    id: string
  }
}

type InspectionRecord = {
  id: string
  company_id: string
  car_id: string
  inspection_type: 'periodic' | 'comprehensive' | 'new_registration' | 'structure_change' | 'tuning' | 'emission'
  due_date: string
  scheduled_date: string
  center_name: string
  center_address: string
  inspection_cost: number
  agency_fee: number | null
  fine: number | null
  result: 'passed' | 'failed' | null
  fail_items: Array<{ item: string; description: string }> | null
  next_due_date: string | null
  notes: string
  status: 'scheduled' | 'in_progress' | 'passed' | 'failed' | 'overdue' | 'cancelled'
  completed_at: string | null
  created_at: string
  created_by: string | null
  car?: {
    id: string
    number: string
    brand: string
    model: string
    trim?: string
    year?: string
  }
}

const MAINT_STATUS: Record<string, { label: string; color: string }> = {
  requested: { label: '접수', color: 'bg-gray-100 text-gray-700' },
  approved: { label: '승인', color: 'bg-blue-100 text-blue-700' },
  in_shop: { label: '정비중', color: 'bg-amber-100 text-amber-700' },
  completed: { label: '완료', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '취소', color: 'bg-red-100 text-red-700' },
}

const MAINT_TYPE: Record<string, string> = {
  scheduled: '정기정비',
  unscheduled: '비정기',
  recall: '리콜',
  warranty: '보증수리',
  consumable: '소모품',
  body_repair: '외관수리',
  pre_delivery: '출고전점검',
  post_return: '반납후점검',
}

const INSP_STATUS: Record<string, { label: string; color: string }> = {
  scheduled: { label: '예정', color: 'bg-gray-100 text-gray-700' },
  in_progress: { label: '진행중', color: 'bg-blue-100 text-blue-700' },
  passed: { label: '합격', color: 'bg-green-100 text-green-700' },
  failed: { label: '불합격', color: 'bg-red-100 text-red-700' },
  overdue: { label: '만기초과', color: 'bg-red-500 text-white' },
  cancelled: { label: '취소', color: 'bg-gray-400 text-white' },
}

const INSP_TYPE: Record<string, string> = {
  periodic: '정기검사',
  comprehensive: '종합검사',
  new_registration: '신규등록',
  structure_change: '구조변경',
  tuning: '튜닝',
  emission: '배출가스',
}

export default function MaintenanceMainPage() {
  const { company, role, adminSelectedCompanyId, user } = useApp()

  // Data
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([])
  const [inspectionRecords, setInspectionRecords] = useState<InspectionRecord[]>([])
  const [cars, setCars] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [mainTab, setMainTab] = useState<'maintenance' | 'inspection'>('maintenance')
  const [maintStatusFilter, setMaintStatusFilter] = useState('all')
  const [maintTypeFilter, setMaintTypeFilter] = useState('all')
  const [maintVehicleFilter, setMaintVehicleFilter] = useState('all')
  const [maintSearchQuery, setMaintSearchQuery] = useState('')
  const [inspStatusFilter, setInspStatusFilter] = useState('all')

  // Modal
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false)
  const [showInspectionModal, setShowInspectionModal] = useState(false)
  const [editingMaintenance, setEditingMaintenance] = useState<any>(null)
  const [editingInspection, setEditingInspection] = useState<any>(null)
  const [savingMaintenance, setSavingMaintenance] = useState(false)
  const [savingInspection, setSavingInspection] = useState(false)

  // Form states
  const [maintenanceFormData, setMaintenanceFormData] = useState({
    car_id: '',
    contract_id: '',
    requested_date: new Date().toISOString().split('T')[0],
    scheduled_date: new Date().toISOString().split('T')[0],
    maintenance_type: 'scheduled' as string,
    shop_name: '',
    shop_phone: '',
    shop_address: '',
    mileage: 0,
    maintenance_items: [{ item: '', quantity: 1, unit_price: 0, parts_cost: 0, labor_cost: 0 }],
    estimated_cost: 0,
    actual_cost: null as number | null,
    cost_responsibility: 'company' as string,
    customer_share_amount: null as number | null,
    replacement_car_id: '',
    replacement_start_date: '',
    replacement_end_date: '',
    notes: '',
  })

  const [inspectionFormData, setInspectionFormData] = useState({
    car_id: '',
    inspection_type: 'periodic' as string,
    due_date: new Date().toISOString().split('T')[0],
    scheduled_date: new Date().toISOString().split('T')[0],
    center_name: '',
    center_address: '',
    inspection_cost: 0,
    agency_fee: null as number | null,
    fine: null as number | null,
    result: null as 'passed' | 'failed' | null,
    fail_items: [] as Array<{ item: string; description: string }>,
    next_due_date: '',
    notes: '',
  })

  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // Helper functions for lookups
  const getCar = (id: any) => cars.find(c => c.id === Number(id) || c.id === id)

  // Fetch maintenance records
  const fetchMaintenanceRecords = useCallback(async () => {
    if (!effectiveCompanyId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('maintenance_records')
      .select('*')
      .eq('company_id', effectiveCompanyId)
      .order('requested_date', { ascending: false })

    if (error) {
      console.error('정비 기록 로딩 실패:', JSON.stringify(error))
    } else {
      setMaintenanceRecords(data || [])
    }
    setLoading(false)
  }, [effectiveCompanyId])

  // Fetch inspection records
  const fetchInspectionRecords = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data, error } = await supabase
      .from('inspection_records')
      .select('*')
      .eq('company_id', effectiveCompanyId)
      .order('due_date', { ascending: true })

    if (error) {
      console.error('검사 기록 로딩 실패:', JSON.stringify(error))
    } else {
      setInspectionRecords(data || [])
    }
  }, [effectiveCompanyId])

  // Fetch cars
  const fetchCars = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data, error } = await supabase
      .from('cars')
      .select('id,number,brand,model,trim,year')
      .eq('company_id', effectiveCompanyId)

    if (error) {
      console.error('차량 로딩 실패:', error)
    } else {
      setCars(data || [])
    }
  }, [effectiveCompanyId])

  useEffect(() => {
    if (effectiveCompanyId) {
      fetchMaintenanceRecords()
      fetchInspectionRecords()
      fetchCars()
    }
  }, [effectiveCompanyId, fetchMaintenanceRecords, fetchInspectionRecords, fetchCars])

  // KPI Cards
  const today = new Date().toISOString().split('T')[0]

  const stats = useMemo(() => {
    const maintPending = maintenanceRecords.filter(m => ['requested', 'approved'].includes(m.status)).length
    const maintInProgress = maintenanceRecords.filter(m => m.status === 'in_shop').length
    const inspUpcoming = inspectionRecords.filter(m => m.status === 'scheduled').length
    const inspOverdue = inspectionRecords.filter(m => m.status === 'overdue').length

    return {
      maintPending,
      maintInProgress,
      inspUpcoming,
      inspOverdue,
    }
  }, [maintenanceRecords, inspectionRecords])

  // Filtered maintenance records
  const filteredMaintenanceRecords = useMemo(() => {
    return maintenanceRecords.filter(m => {
      const statusMatch = maintStatusFilter === 'all' || m.status === maintStatusFilter
      const typeMatch = maintTypeFilter === 'all' || m.maintenance_type === maintTypeFilter
      const vehicleMatch = maintVehicleFilter === 'all' || m.car_id === maintVehicleFilter
      const searchLower = maintSearchQuery.toLowerCase()
      const carInfo = getCar(m.car_id)
      const searchMatch =
        (carInfo?.number || '').toLowerCase().includes(searchLower) ||
        (m.shop_name || '').toLowerCase().includes(searchLower) ||
        (m.notes || '').toLowerCase().includes(searchLower)

      return statusMatch && typeMatch && vehicleMatch && searchMatch
    })
  }, [maintenanceRecords, maintStatusFilter, maintTypeFilter, maintVehicleFilter, maintSearchQuery])

  // Filtered inspection records
  const filteredInspectionRecords = useMemo(() => {
    return inspectionRecords.filter(i => {
      const statusMatch = inspStatusFilter === 'all' || i.status === inspStatusFilter
      return statusMatch
    })
  }, [inspectionRecords, inspStatusFilter])

  // Status transition for maintenance
  const handleMaintenanceStatusChange = async (maintId: string, newStatus: string) => {
    const maint = maintenanceRecords.find(m => m.id === maintId)
    if (!maint) return

    try {
      const updates: any = {
        status: newStatus,
      }
      if (newStatus === 'completed') {
        updates.completed_at = new Date().toISOString()
      }

      await supabase.from('maintenance_records').update(updates).eq('id', maintId)

      await supabase.from('vehicle_status_log').insert({
        company_id: effectiveCompanyId,
        car_id: maint.car_id,
        old_status: maint.status,
        new_status: newStatus,
        related_type: 'maintenance',
        related_id: maintId,
        changed_by: user?.id,
      })

      fetchMaintenanceRecords()
    } catch (error) {
      console.error('상태 변경 실패:', error)
    }
  }

  // Status transition for inspection
  const handleInspectionStatusChange = async (inspId: string, newStatus: string) => {
    const insp = inspectionRecords.find(i => i.id === inspId)
    if (!insp) return

    try {
      const updates: any = {
        status: newStatus,
      }
      if (newStatus === 'passed' || newStatus === 'failed') {
        updates.completed_at = new Date().toISOString()
      }

      await supabase.from('inspection_records').update(updates).eq('id', inspId)

      await supabase.from('vehicle_status_log').insert({
        company_id: effectiveCompanyId,
        car_id: insp.car_id,
        old_status: insp.status,
        new_status: newStatus,
        related_type: 'inspection',
        related_id: inspId,
        changed_by: user?.id,
      })

      fetchInspectionRecords()
    } catch (error) {
      console.error('상태 변경 실패:', error)
    }
  }

  // Modal handlers - Maintenance
  const resetMaintenanceForm = () => {
    setMaintenanceFormData({
      car_id: '',
      contract_id: '',
      requested_date: new Date().toISOString().split('T')[0],
      scheduled_date: new Date().toISOString().split('T')[0],
      maintenance_type: 'scheduled',
      shop_name: '',
      shop_phone: '',
      shop_address: '',
      mileage: 0,
      maintenance_items: [{ item: '', quantity: 1, unit_price: 0, parts_cost: 0, labor_cost: 0 }],
      estimated_cost: 0,
      actual_cost: null,
      cost_responsibility: 'company',
      customer_share_amount: null,
      replacement_car_id: '',
      replacement_start_date: '',
      replacement_end_date: '',
      notes: '',
    })
    setEditingMaintenance(null)
  }

  const openCreateMaintenanceModal = () => {
    resetMaintenanceForm()
    setShowMaintenanceModal(true)
  }

  const openEditMaintenanceModal = (maint: MaintenanceRecord) => {
    setEditingMaintenance(maint)
    setMaintenanceFormData({
      car_id: maint.car_id || '',
      contract_id: maint.contract_id || '',
      requested_date: maint.requested_date || '',
      scheduled_date: maint.scheduled_date || '',
      maintenance_type: maint.maintenance_type || 'scheduled',
      shop_name: maint.shop_name || '',
      shop_phone: maint.shop_phone || '',
      shop_address: maint.shop_address || '',
      mileage: maint.mileage || 0,
      maintenance_items: maint.maintenance_items || [{ item: '', quantity: 1, unit_price: 0, parts_cost: 0, labor_cost: 0 }],
      estimated_cost: maint.estimated_cost || 0,
      actual_cost: maint.actual_cost || null,
      cost_responsibility: maint.cost_responsibility || 'company',
      customer_share_amount: maint.customer_share_amount || null,
      replacement_car_id: maint.replacement_car_id || '',
      replacement_start_date: maint.replacement_start_date || '',
      replacement_end_date: maint.replacement_end_date || '',
      notes: maint.notes || '',
    })
    setShowMaintenanceModal(true)
  }

  const handleSaveMaintenance = async () => {
    if (!effectiveCompanyId || !user) return
    setSavingMaintenance(true)

    try {
      const payload = {
        ...maintenanceFormData,
        company_id: effectiveCompanyId,
        status: editingMaintenance ? editingMaintenance.status : 'requested',
        created_by: editingMaintenance ? editingMaintenance.created_by : user.id,
      }

      if (editingMaintenance) {
        await supabase.from('maintenance_records').update(payload).eq('id', editingMaintenance.id)
      } else {
        await supabase.from('maintenance_records').insert([payload])
      }

      setShowMaintenanceModal(false)
      resetMaintenanceForm()
      fetchMaintenanceRecords()
    } catch (error) {
      console.error('저장 실패:', error)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSavingMaintenance(false)
    }
  }

  // Modal handlers - Inspection
  const resetInspectionForm = () => {
    setInspectionFormData({
      car_id: '',
      inspection_type: 'periodic',
      due_date: new Date().toISOString().split('T')[0],
      scheduled_date: new Date().toISOString().split('T')[0],
      center_name: '',
      center_address: '',
      inspection_cost: 0,
      agency_fee: null,
      fine: null,
      result: null,
      fail_items: [],
      next_due_date: '',
      notes: '',
    })
    setEditingInspection(null)
  }

  const openCreateInspectionModal = () => {
    resetInspectionForm()
    setShowInspectionModal(true)
  }

  const openEditInspectionModal = (insp: InspectionRecord) => {
    setEditingInspection(insp)
    setInspectionFormData({
      car_id: insp.car_id || '',
      inspection_type: insp.inspection_type || 'periodic',
      due_date: insp.due_date || '',
      scheduled_date: insp.scheduled_date || '',
      center_name: insp.center_name || '',
      center_address: insp.center_address || '',
      inspection_cost: insp.inspection_cost || 0,
      agency_fee: insp.agency_fee || null,
      fine: insp.fine || null,
      result: insp.result || null,
      fail_items: insp.fail_items || [],
      next_due_date: insp.next_due_date || '',
      notes: insp.notes || '',
    })
    setShowInspectionModal(true)
  }

  const handleSaveInspection = async () => {
    if (!effectiveCompanyId || !user) return
    setSavingInspection(true)

    try {
      const payload = {
        ...inspectionFormData,
        company_id: effectiveCompanyId,
        status: editingInspection ? editingInspection.status : 'scheduled',
        created_by: editingInspection ? editingInspection.created_by : user.id,
      }

      if (editingInspection) {
        await supabase.from('inspection_records').update(payload).eq('id', editingInspection.id)
      } else {
        await supabase.from('inspection_records').insert([payload])
      }

      setShowInspectionModal(false)
      resetInspectionForm()
      fetchInspectionRecords()
    } catch (error) {
      console.error('저장 실패:', error)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSavingInspection(false)
    }
  }

  // Calculate D-day for inspection
  const getDDay = (dueDate: string) => {
    const due = new Date(dueDate)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    due.setHours(0, 0, 0, 0)
    const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysLeft
  }

  const getDDayColor = (daysLeft: number) => {
    if (daysLeft < 0) return 'text-red-600 font-bold'
    if (daysLeft <= 7) return 'text-amber-600 font-bold'
    return 'text-gray-500'
  }

  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="p-12 md:p-20 text-center text-gray-400 text-sm bg-white rounded-2xl">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p className="text-xs mt-1">슈퍼어드민은 회사를 선택한 후 데이터를 조회/등록할 수 있습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50/50 animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
        <div style={{ textAlign: 'left' }}>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">🔧 정비/검사 관리</h1>
          <p className="text-gray-500 mt-1 md:mt-2 text-sm">
            정비 기록: <span className="font-bold text-steel-600">{maintenanceRecords.length}</span>건 /
            검사 기록: <span className="font-bold text-steel-600">{inspectionRecords.length}</span>건
          </p>
        </div>

        <Link
          href="/cars"
          className="px-4 md:px-6 py-2.5 md:py-3 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50 text-center text-sm"
        >
          목록으로
        </Link>
      </div>

      {/* KPI Cards */}
      {(maintenanceRecords.length > 0 || inspectionRecords.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-400 font-bold">정비 대기</p>
            <p className="text-xl font-black text-gray-900 mt-1">
              {stats.maintPending}
              <span className="text-sm text-gray-400 ml-0.5">건</span>
            </p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-400 font-bold">정비 진행</p>
            <p className="text-xl font-black text-gray-900 mt-1">
              {stats.maintInProgress}
              <span className="text-sm text-gray-400 ml-0.5">건</span>
            </p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-400 font-bold">검사 예정</p>
            <p className="text-xl font-black text-gray-900 mt-1">
              {stats.inspUpcoming}
              <span className="text-sm text-gray-400 ml-0.5">건</span>
            </p>
          </div>
          <div className={`${stats.inspOverdue > 0 ? 'bg-red-50' : 'bg-white'} p-3 rounded-xl border ${stats.inspOverdue > 0 ? 'border-red-200' : 'border-gray-200'} shadow-sm`}>
            <p className={`text-xs font-bold ${stats.inspOverdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>만기 초과</p>
            <p className={`text-xl font-black mt-1 ${stats.inspOverdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {stats.inspOverdue}
              <span className="text-sm ml-0.5">건</span>
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4 overflow-x-auto gap-2">
        {[
          { key: 'maintenance', label: '정비 이력' },
          { key: 'inspection', label: '법정 검사' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key as any)}
            className={`px-3 md:px-6 py-2.5 md:py-3 font-bold text-xs md:text-sm border-b-2 transition-colors whitespace-nowrap ${
              mainTab === t.key
                ? 'border-steel-600 text-steel-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Maintenance Tab */}
      {mainTab === 'maintenance' && (
        <>
          {/* Search and Create */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-4 gap-3 md:gap-4">
            <input
              type="text"
              placeholder="🔍 차량번호, 정비소, 메모로 검색..."
              className="px-3 md:px-4 py-2.5 md:py-3 border border-gray-300 rounded-xl flex-1 focus:outline-none focus:border-steel-500 shadow-sm text-sm"
              value={maintSearchQuery}
              onChange={e => setMaintSearchQuery(e.target.value)}
            />
            <button
              onClick={openCreateMaintenanceModal}
              className="bg-steel-600 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold hover:bg-steel-700 shadow-lg text-center whitespace-nowrap text-sm flex-shrink-0"
            >
              + 신규 정비
            </button>
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-col md:flex-row gap-3">
            <select
              value={maintStatusFilter}
              onChange={e => setMaintStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold focus:outline-none focus:border-steel-500 flex-1 md:flex-none"
            >
              <option value="all">상태: 전체</option>
              {Object.entries(MAINT_STATUS).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
            <select
              value={maintTypeFilter}
              onChange={e => setMaintTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold focus:outline-none focus:border-steel-500 flex-1 md:flex-none"
            >
              <option value="all">유형: 전체</option>
              {Object.entries(MAINT_TYPE).map(([key, val]) => (
                <option key={key} value={key}>
                  {val}
                </option>
              ))}
            </select>
            <select
              value={maintVehicleFilter}
              onChange={e => setMaintVehicleFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold focus:outline-none focus:border-steel-500 flex-1 md:flex-none"
            >
              <option value="all">차량: 전체</option>
              {cars.map(car => (
                <option key={car.id} value={car.id}>
                  {car.number}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-20 text-center text-gray-400 flex flex-col items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600 mb-2"></div>
                정비 데이터를 불러오는 중...
              </div>
            ) : filteredMaintenanceRecords.length === 0 ? (
              <div className="p-12 md:p-20 text-center text-gray-400 text-sm">
                {maintSearchQuery || maintStatusFilter !== 'all' || maintTypeFilter !== 'all' ? '검색 결과가 없습니다.' : '등록된 정비 기록이 없습니다.'}
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 font-bold text-xs uppercase tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="p-4">요청일</th>
                        <th className="p-4">차량</th>
                        <th className="p-4">유형</th>
                        <th className="p-4">정비소</th>
                        <th className="p-4">예상비용</th>
                        <th className="p-4">상태</th>
                        <th className="p-4 text-center">액션</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredMaintenanceRecords.map(maint => (
                        <tr key={maint.id} className="hover:bg-steel-50 transition-colors group">
                          <td className="p-4 font-bold text-gray-900 text-sm">{maint.requested_date}</td>
                          <td className="p-4 text-sm">
                            <div className="font-bold text-gray-800">{getCar(maint.car_id)?.number}</div>
                            <div className="text-xs text-gray-500">
                              {getCar(maint.car_id)?.brand} {getCar(maint.car_id)?.model}
                            </div>
                          </td>
                          <td className="p-4 text-sm">
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                              {MAINT_TYPE[maint.maintenance_type] || maint.maintenance_type}
                            </span>
                          </td>
                          <td className="p-4 text-sm">
                            <div className="font-bold text-gray-800">{maint.shop_name}</div>
                            <div className="text-xs text-gray-500">{maint.shop_phone}</div>
                          </td>
                          <td className="p-4 text-sm font-bold text-gray-900">
                            {maint.estimated_cost?.toLocaleString()}원
                          </td>
                          <td className="p-4 text-sm">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${MAINT_STATUS[maint.status]?.color}`}>
                              {MAINT_STATUS[maint.status]?.label}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex gap-2 justify-center flex-wrap">
                              <button
                                onClick={() => openEditMaintenanceModal(maint)}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200"
                              >
                                수정
                              </button>
                              {maint.status === 'requested' && (
                                <button
                                  onClick={() => handleMaintenanceStatusChange(maint.id, 'approved')}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200"
                                >
                                  승인
                                </button>
                              )}
                              {maint.status === 'approved' && (
                                <button
                                  onClick={() => handleMaintenanceStatusChange(maint.id, 'in_shop')}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200"
                                >
                                  입고
                                </button>
                              )}
                              {maint.status === 'in_shop' && (
                                <button
                                  onClick={() => handleMaintenanceStatusChange(maint.id, 'completed')}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200"
                                >
                                  출고완료
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-gray-100">
                  {filteredMaintenanceRecords.map(maint => (
                    <div key={maint.id} className="p-4 active:bg-steel-50">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-black text-gray-900">{maint.requested_date}</div>
                          <div className="text-sm text-gray-500 mt-1">{getCar(maint.car_id)?.number}</div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${MAINT_STATUS[maint.status]?.color}`}>
                          {MAINT_STATUS[maint.status]?.label}
                        </span>
                      </div>
                      <div className="text-sm mb-3">
                        <div className="font-bold text-gray-800">
                          {getCar(maint.car_id)?.brand} {getCar(maint.car_id)?.model}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {MAINT_TYPE[maint.maintenance_type]}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{maint.shop_name}</div>
                        <div className="text-sm font-bold text-gray-900 mt-2">{maint.estimated_cost?.toLocaleString()}원</div>
                      </div>
                      <div className="flex gap-2 overflow-x-auto">
                        <button
                          onClick={() => openEditMaintenanceModal(maint)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 flex-shrink-0"
                        >
                          수정
                        </button>
                        {maint.status === 'requested' && (
                          <button
                            onClick={() => handleMaintenanceStatusChange(maint.id, 'approved')}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 flex-shrink-0"
                          >
                            승인
                          </button>
                        )}
                        {maint.status === 'approved' && (
                          <button
                            onClick={() => handleMaintenanceStatusChange(maint.id, 'in_shop')}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 flex-shrink-0"
                          >
                            입고
                          </button>
                        )}
                        {maint.status === 'in_shop' && (
                          <button
                            onClick={() => handleMaintenanceStatusChange(maint.id, 'completed')}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 flex-shrink-0"
                          >
                            출고완료
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Inspection Tab */}
      {mainTab === 'inspection' && (
        <>
          {/* Create Button */}
          <div className="mb-4 flex justify-end">
            <button
              onClick={openCreateInspectionModal}
              className="bg-steel-600 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold hover:bg-steel-700 shadow-lg text-center whitespace-nowrap text-sm"
            >
              + 신규 검사
            </button>
          </div>

          {/* Status Filter */}
          <div className="mb-4">
            <select
              value={inspStatusFilter}
              onChange={e => setInspStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold focus:outline-none focus:border-steel-500"
            >
              <option value="all">상태: 전체</option>
              {Object.entries(INSP_STATUS).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-20 text-center text-gray-400 flex flex-col items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600 mb-2"></div>
                검사 데이터를 불러오는 중...
              </div>
            ) : filteredInspectionRecords.length === 0 ? (
              <div className="p-12 md:p-20 text-center text-gray-400 text-sm">
                {inspStatusFilter !== 'all' ? '검색 결과가 없습니다.' : '등록된 검사 기록이 없습니다.'}
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 font-bold text-xs uppercase tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="p-4">만기일</th>
                        <th className="p-4">차량</th>
                        <th className="p-4">검사유형</th>
                        <th className="p-4">상태</th>
                        <th className="p-4">D-day</th>
                        <th className="p-4">검사소</th>
                        <th className="p-4 text-center">액션</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredInspectionRecords.map(insp => {
                        const daysLeft = getDDay(insp.due_date)
                        return (
                          <tr key={insp.id} className="hover:bg-steel-50 transition-colors group">
                            <td className="p-4 font-bold text-gray-900 text-sm">{insp.due_date}</td>
                            <td className="p-4 text-sm">
                              <div className="font-bold text-gray-800">{getCar(insp.car_id)?.number}</div>
                              <div className="text-xs text-gray-500">
                                {getCar(insp.car_id)?.brand} {getCar(insp.car_id)?.model}
                              </div>
                            </td>
                            <td className="p-4 text-sm">
                              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                                {INSP_TYPE[insp.inspection_type] || insp.inspection_type}
                              </span>
                            </td>
                            <td className="p-4 text-sm">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${INSP_STATUS[insp.status]?.color}`}>
                                {INSP_STATUS[insp.status]?.label}
                              </span>
                            </td>
                            <td className={`p-4 text-sm ${getDDayColor(daysLeft)}`}>
                              {daysLeft < 0 ? `D+${Math.abs(daysLeft)}` : `D-${daysLeft}`}
                            </td>
                            <td className="p-4 text-sm">
                              <div className="font-bold text-gray-800">{insp.center_name}</div>
                              <div className="text-xs text-gray-500">{insp.center_address}</div>
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex gap-2 justify-center flex-wrap">
                                <button
                                  onClick={() => openEditInspectionModal(insp)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200"
                                >
                                  수정
                                </button>
                                {insp.status === 'scheduled' && (
                                  <button
                                    onClick={() => handleInspectionStatusChange(insp.id, 'in_progress')}
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200"
                                  >
                                    진행
                                  </button>
                                )}
                                {insp.status === 'in_progress' && (
                                  <>
                                    <button
                                      onClick={() => handleInspectionStatusChange(insp.id, 'passed')}
                                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200"
                                    >
                                      합격
                                    </button>
                                    <button
                                      onClick={() => handleInspectionStatusChange(insp.id, 'failed')}
                                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200"
                                    >
                                      불합격
                                    </button>
                                  </>
                                )}
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
                  {filteredInspectionRecords.map(insp => {
                    const daysLeft = getDDay(insp.due_date)
                    return (
                      <div key={insp.id} className="p-4 active:bg-steel-50">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="font-black text-gray-900">{insp.due_date}</div>
                            <div className="text-sm text-gray-500 mt-1">{getCar(insp.car_id)?.number}</div>
                          </div>
                          <div className="text-right">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${INSP_STATUS[insp.status]?.color}`}>
                              {INSP_STATUS[insp.status]?.label}
                            </span>
                            <div className={`text-sm mt-2 ${getDDayColor(daysLeft)}`}>
                              {daysLeft < 0 ? `D+${Math.abs(daysLeft)}` : `D-${daysLeft}`}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm mb-3">
                          <div className="font-bold text-gray-800">
                            {getCar(insp.car_id)?.brand} {getCar(insp.car_id)?.model}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {INSP_TYPE[insp.inspection_type]}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{insp.center_name}</div>
                        </div>
                        <div className="flex gap-2 overflow-x-auto">
                          <button
                            onClick={() => openEditInspectionModal(insp)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 flex-shrink-0"
                          >
                            수정
                          </button>
                          {insp.status === 'scheduled' && (
                            <button
                              onClick={() => handleInspectionStatusChange(insp.id, 'in_progress')}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 flex-shrink-0"
                            >
                              진행
                            </button>
                          )}
                          {insp.status === 'in_progress' && (
                            <>
                              <button
                                onClick={() => handleInspectionStatusChange(insp.id, 'passed')}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 flex-shrink-0"
                              >
                                합격
                              </button>
                              <button
                                onClick={() => handleInspectionStatusChange(insp.id, 'failed')}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 flex-shrink-0"
                              >
                                불합격
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Maintenance Modal */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 md:p-6 flex justify-between items-center">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">
                {editingMaintenance ? '정비 기록 수정' : '새 정비 기록 생성'}
              </h2>
              <button
                onClick={() => setShowMaintenanceModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-4 md:p-6 space-y-4">
              {/* Car */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">차량 선택</label>
                <select
                  value={maintenanceFormData.car_id}
                  onChange={e => setMaintenanceFormData({ ...maintenanceFormData, car_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                >
                  <option value="">차량 선택</option>
                  {cars.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.number} - {c.brand} {c.model}
                    </option>
                  ))}
                </select>
              </div>

              {/* Maintenance Type */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">정비 유형</label>
                <select
                  value={maintenanceFormData.maintenance_type}
                  onChange={e => setMaintenanceFormData({ ...maintenanceFormData, maintenance_type: e.target.value as any })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                >
                  {Object.entries(MAINT_TYPE).map(([key, val]) => (
                    <option key={key} value={key}>
                      {val}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-2">요청일</label>
                  <input
                    type="date"
                    value={maintenanceFormData.requested_date}
                    onChange={e => setMaintenanceFormData({ ...maintenanceFormData, requested_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-2">예정일</label>
                  <input
                    type="date"
                    value={maintenanceFormData.scheduled_date}
                    onChange={e => setMaintenanceFormData({ ...maintenanceFormData, scheduled_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                  />
                </div>
              </div>

              {/* Shop Info */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">정비소 정보</label>
                <input
                  type="text"
                  placeholder="정비소 이름"
                  value={maintenanceFormData.shop_name}
                  onChange={e => setMaintenanceFormData({ ...maintenanceFormData, shop_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500 mb-2"
                />
                <input
                  type="tel"
                  placeholder="전화번호"
                  value={maintenanceFormData.shop_phone}
                  onChange={e => setMaintenanceFormData({ ...maintenanceFormData, shop_phone: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500 mb-2"
                />
                <input
                  type="text"
                  placeholder="주소"
                  value={maintenanceFormData.shop_address}
                  onChange={e => setMaintenanceFormData({ ...maintenanceFormData, shop_address: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                />
              </div>

              {/* Mileage */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">주행거리 (km)</label>
                <input
                  type="number"
                  value={maintenanceFormData.mileage}
                  onChange={e => setMaintenanceFormData({ ...maintenanceFormData, mileage: parseInt(e.target.value) || 0 })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                />
              </div>

              {/* Maintenance Items */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">정비 항목</label>
                <div className="space-y-3">
                  {maintenanceFormData.maintenance_items.map((item, idx) => (
                    <div key={idx} className="border border-gray-300 rounded-lg p-3 space-y-2">
                      <input
                        type="text"
                        placeholder="항목명"
                        value={item.item}
                        onChange={e => {
                          const newItems = [...maintenanceFormData.maintenance_items]
                          newItems[idx].item = e.target.value
                          setMaintenanceFormData({ ...maintenanceFormData, maintenance_items: newItems })
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-steel-500 text-sm"
                      />
                      <div className="grid grid-cols-5 gap-2">
                        <input
                          type="number"
                          placeholder="수량"
                          value={item.quantity}
                          onChange={e => {
                            const newItems = [...maintenanceFormData.maintenance_items]
                            newItems[idx].quantity = parseInt(e.target.value) || 1
                            setMaintenanceFormData({ ...maintenanceFormData, maintenance_items: newItems })
                          }}
                          className="border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-steel-500 text-xs"
                        />
                        <input
                          type="number"
                          placeholder="단가"
                          value={item.unit_price}
                          onChange={e => {
                            const newItems = [...maintenanceFormData.maintenance_items]
                            newItems[idx].unit_price = parseInt(e.target.value) || 0
                            setMaintenanceFormData({ ...maintenanceFormData, maintenance_items: newItems })
                          }}
                          className="border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-steel-500 text-xs"
                        />
                        <input
                          type="number"
                          placeholder="부품비"
                          value={item.parts_cost}
                          onChange={e => {
                            const newItems = [...maintenanceFormData.maintenance_items]
                            newItems[idx].parts_cost = parseInt(e.target.value) || 0
                            setMaintenanceFormData({ ...maintenanceFormData, maintenance_items: newItems })
                          }}
                          className="border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-steel-500 text-xs"
                        />
                        <input
                          type="number"
                          placeholder="공임비"
                          value={item.labor_cost}
                          onChange={e => {
                            const newItems = [...maintenanceFormData.maintenance_items]
                            newItems[idx].labor_cost = parseInt(e.target.value) || 0
                            setMaintenanceFormData({ ...maintenanceFormData, maintenance_items: newItems })
                          }}
                          className="border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-steel-500 text-xs"
                        />
                        <button
                          onClick={() => {
                            const newItems = maintenanceFormData.maintenance_items.filter((_, i) => i !== idx)
                            setMaintenanceFormData({ ...maintenanceFormData, maintenance_items: newItems })
                          }}
                          className="text-red-600 font-bold text-sm hover:text-red-700"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newItems = [...maintenanceFormData.maintenance_items, { item: '', quantity: 1, unit_price: 0, parts_cost: 0, labor_cost: 0 }]
                      setMaintenanceFormData({ ...maintenanceFormData, maintenance_items: newItems })
                    }}
                    className="text-steel-600 font-bold text-sm hover:text-steel-700"
                  >
                    + 항목 추가
                  </button>
                </div>
              </div>

              {/* Costs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-2">예상 비용</label>
                  <input
                    type="number"
                    value={maintenanceFormData.estimated_cost}
                    onChange={e => setMaintenanceFormData({ ...maintenanceFormData, estimated_cost: parseInt(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-2">실제 비용</label>
                  <input
                    type="number"
                    value={maintenanceFormData.actual_cost || ''}
                    onChange={e => setMaintenanceFormData({ ...maintenanceFormData, actual_cost: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                  />
                </div>
              </div>

              {/* Cost Responsibility */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">비용 부담</label>
                <div className="space-y-2">
                  {(['company', 'customer', 'insurance', 'warranty', 'shared'] as const).map(option => (
                    <label key={option} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="cost_responsibility"
                        value={option}
                        checked={maintenanceFormData.cost_responsibility === option}
                        onChange={() => setMaintenanceFormData({ ...maintenanceFormData, cost_responsibility: option })}
                        className="w-4 h-4 cursor-pointer"
                      />
                      <span className="text-gray-700">
                        {option === 'company' ? '회사' : option === 'customer' ? '고객' : option === 'insurance' ? '보험' : option === 'warranty' ? '보증' : '공동'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Customer Share Amount */}
              {maintenanceFormData.cost_responsibility === 'shared' && (
                <div>
                  <label className="block font-bold text-gray-700 mb-2">고객 부담금</label>
                  <input
                    type="number"
                    value={maintenanceFormData.customer_share_amount || ''}
                    onChange={e => setMaintenanceFormData({ ...maintenanceFormData, customer_share_amount: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                  />
                </div>
              )}

              {/* Replacement Car */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">대차 차량 (선택)</label>
                <select
                  value={maintenanceFormData.replacement_car_id}
                  onChange={e => setMaintenanceFormData({ ...maintenanceFormData, replacement_car_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                >
                  <option value="">대차 차량 없음</option>
                  {cars.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.number} - {c.brand} {c.model}
                    </option>
                  ))}
                </select>
              </div>

              {/* Replacement Dates */}
              {maintenanceFormData.replacement_car_id && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-gray-700 mb-2">대차 시작일</label>
                    <input
                      type="date"
                      value={maintenanceFormData.replacement_start_date}
                      onChange={e => setMaintenanceFormData({ ...maintenanceFormData, replacement_start_date: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-2">대차 종료일</label>
                    <input
                      type="date"
                      value={maintenanceFormData.replacement_end_date}
                      onChange={e => setMaintenanceFormData({ ...maintenanceFormData, replacement_end_date: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">메모</label>
                <textarea
                  value={maintenanceFormData.notes}
                  onChange={e => setMaintenanceFormData({ ...maintenanceFormData, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500 resize-none"
                  rows={3}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 md:p-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowMaintenanceModal(false)}
                className="px-6 py-2.5 rounded-lg font-bold border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSaveMaintenance}
                disabled={savingMaintenance}
                className="px-6 py-2.5 rounded-lg font-bold bg-steel-600 text-white hover:bg-steel-700 disabled:bg-gray-400"
              >
                {savingMaintenance ? '저장중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspection Modal */}
      {showInspectionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 md:p-6 flex justify-between items-center">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">
                {editingInspection ? '검사 기록 수정' : '새 검사 기록 생성'}
              </h2>
              <button
                onClick={() => setShowInspectionModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-4 md:p-6 space-y-4">
              {/* Car */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">차량 선택</label>
                <select
                  value={inspectionFormData.car_id}
                  onChange={e => setInspectionFormData({ ...inspectionFormData, car_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                >
                  <option value="">차량 선택</option>
                  {cars.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.number} - {c.brand} {c.model}
                    </option>
                  ))}
                </select>
              </div>

              {/* Inspection Type */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">검사 유형</label>
                <select
                  value={inspectionFormData.inspection_type}
                  onChange={e => setInspectionFormData({ ...inspectionFormData, inspection_type: e.target.value as any })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                >
                  {Object.entries(INSP_TYPE).map(([key, val]) => (
                    <option key={key} value={key}>
                      {val}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-2">만기일</label>
                  <input
                    type="date"
                    value={inspectionFormData.due_date}
                    onChange={e => setInspectionFormData({ ...inspectionFormData, due_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-2">예정일</label>
                  <input
                    type="date"
                    value={inspectionFormData.scheduled_date}
                    onChange={e => setInspectionFormData({ ...inspectionFormData, scheduled_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                  />
                </div>
              </div>

              {/* Center Info */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">검사소</label>
                <input
                  type="text"
                  placeholder="검사소명"
                  value={inspectionFormData.center_name}
                  onChange={e => setInspectionFormData({ ...inspectionFormData, center_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500 mb-2"
                />
                <input
                  type="text"
                  placeholder="주소"
                  value={inspectionFormData.center_address}
                  onChange={e => setInspectionFormData({ ...inspectionFormData, center_address: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                />
              </div>

              {/* Costs */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-2">검사비</label>
                  <input
                    type="number"
                    value={inspectionFormData.inspection_cost}
                    onChange={e => setInspectionFormData({ ...inspectionFormData, inspection_cost: parseInt(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-2">대행비</label>
                  <input
                    type="number"
                    value={inspectionFormData.agency_fee || ''}
                    onChange={e => setInspectionFormData({ ...inspectionFormData, agency_fee: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-2">과태료</label>
                  <input
                    type="number"
                    value={inspectionFormData.fine || ''}
                    onChange={e => setInspectionFormData({ ...inspectionFormData, fine: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                  />
                </div>
              </div>

              {/* Result */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">검사 결과</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="result"
                      value="passed"
                      checked={inspectionFormData.result === 'passed'}
                      onChange={() => setInspectionFormData({ ...inspectionFormData, result: 'passed' })}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-gray-700">합격</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="result"
                      value="failed"
                      checked={inspectionFormData.result === 'failed'}
                      onChange={() => setInspectionFormData({ ...inspectionFormData, result: 'failed' })}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-gray-700">불합격</span>
                  </label>
                </div>
              </div>

              {/* Fail Items */}
              {inspectionFormData.result === 'failed' && (
                <div>
                  <label className="block font-bold text-gray-700 mb-2">불합격 항목</label>
                  <div className="space-y-3">
                    {inspectionFormData.fail_items.map((item, idx) => (
                      <div key={idx} className="border border-gray-300 rounded-lg p-3 space-y-2">
                        <input
                          type="text"
                          placeholder="항목"
                          value={item.item}
                          onChange={e => {
                            const newItems = [...inspectionFormData.fail_items]
                            newItems[idx].item = e.target.value
                            setInspectionFormData({ ...inspectionFormData, fail_items: newItems })
                          }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-steel-500 text-sm"
                        />
                        <textarea
                          placeholder="설명"
                          value={item.description}
                          onChange={e => {
                            const newItems = [...inspectionFormData.fail_items]
                            newItems[idx].description = e.target.value
                            setInspectionFormData({ ...inspectionFormData, fail_items: newItems })
                          }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-steel-500 text-sm resize-none"
                          rows={2}
                        />
                        <button
                          onClick={() => {
                            const newItems = inspectionFormData.fail_items.filter((_, i) => i !== idx)
                            setInspectionFormData({ ...inspectionFormData, fail_items: newItems })
                          }}
                          className="text-red-600 font-bold text-sm hover:text-red-700"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const newItems = [...inspectionFormData.fail_items, { item: '', description: '' }]
                        setInspectionFormData({ ...inspectionFormData, fail_items: newItems })
                      }}
                      className="text-steel-600 font-bold text-sm hover:text-steel-700"
                    >
                      + 항목 추가
                    </button>
                  </div>
                </div>
              )}

              {/* Next Due Date */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">다음 만기일</label>
                <input
                  type="date"
                  value={inspectionFormData.next_due_date}
                  onChange={e => setInspectionFormData({ ...inspectionFormData, next_due_date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">메모</label>
                <textarea
                  value={inspectionFormData.notes}
                  onChange={e => setInspectionFormData({ ...inspectionFormData, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-steel-500 resize-none"
                  rows={3}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 md:p-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowInspectionModal(false)}
                className="px-6 py-2.5 rounded-lg font-bold border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSaveInspection}
                disabled={savingInspection}
                className="px-6 py-2.5 rounded-lg font-bold bg-steel-600 text-white hover:bg-steel-700 disabled:bg-gray-400"
              >
                {savingInspection ? '저장중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
