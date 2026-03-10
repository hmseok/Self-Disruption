'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import { usePermission } from '../hooks/usePermission'

// ============================================
// 대시보드 - 로그인 후 첫 화면
// god_admin → 플랫폼 관리 대시보드
// 회사 사용자 → 비즈니스 KPI 대시보드
// ============================================

type DashboardStats = {
  totalCars: number
  availableCars: number
  rentedCars: number
  maintenanceCars: number
  totalCustomers: number
  activeInvestments: number
  totalInvestAmount: number
  jiipContracts: number
  monthlyRevenue: number
  monthlyExpense: number
  netProfit: number
}

type OpsStats = {
  todayDeliveries: any[]
  todayReturns: any[]
  maintenanceWaiting: number
  maintenanceInShop: number
  inspectionsDueSoon: number
  inspectionsOverdue: number
  activeAccidents: number
  accidentsThisMonth: any[]
}

type PlatformStats = {
  totalCompanies: number
  activeCompanies: number
  pendingCompanies: number
  totalUsers: number
  totalActiveModules: number
  pendingList: { id: string; name: string; business_number: string; business_registration_url: string | null; plan: string; created_at: string }[]
  companyList: { id: string; name: string; plan: string; is_active: boolean; created_at: string; moduleCount: number; business_registration_url: string | null }[]
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, company, role, position, loading: appLoading, adminSelectedCompanyId, allCompanies } = useApp()
  const { hasPageAccess } = usePermission()
  const [stats, setStats] = useState<DashboardStats>({
    totalCars: 0, availableCars: 0, rentedCars: 0, maintenanceCars: 0,
    totalCustomers: 0, activeInvestments: 0, totalInvestAmount: 0, jiipContracts: 0,
    monthlyRevenue: 0, monthlyExpense: 0, netProfit: 0,
  })
  const [platformStats, setPlatformStats] = useState<PlatformStats>({
    totalCompanies: 0, activeCompanies: 0, pendingCompanies: 0,
    totalUsers: 0, totalActiveModules: 0,
    pendingList: [], companyList: [],
  })
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set())
  const [opsStats, setOpsStats] = useState<OpsStats>({
    todayDeliveries: [], todayReturns: [],
    maintenanceWaiting: 0, maintenanceInShop: 0,
    inspectionsDueSoon: 0, inspectionsOverdue: 0,
    activeAccidents: 0, accidentsThisMonth: [],
  })
  const [collectionStats, setCollectionStats] = useState({
    pendingAmount: 0, pendingCount: 0,
    completedAmount: 0, completedCount: 0,
    overdueAmount: 0, overdueCount: 0,
    collectionRate: 0,
  })
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())

  // 시계 업데이트
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  // 데이터 로드
  useEffect(() => {
    if (appLoading) return
    if (!user) return
    fetchDashboardData()
  }, [appLoading, user, company, role, adminSelectedCompanyId])

  // 모듈 활성화 + 권한 체크 헬퍼
  // god_admin → 항상 true (회사 미선택 시), 또는 모듈 활성화만 체크
  // master → 모듈 활성화만 체크 (전체 권한)
  // 일반 직원 → 모듈 활성화 + 페이지 접근 권한 체크
  const hasModule = (path: string) => {
    if (role === 'god_admin' && !adminSelectedCompanyId) return true
    if (!activeModules.has(path)) return false
    // god_admin / master는 모듈만 활성이면 OK
    if (role === 'god_admin' || role === 'master') return true
    // 일반 직원은 페이지 접근 권한도 필요
    return hasPageAccess(path)
  }

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      const isGodAdmin = role === 'god_admin'
      // god_admin이 특정 회사를 선택하면 해당 회사의 비즈니스 데이터 표시
      const companyId = isGodAdmin ? adminSelectedCompanyId : company?.id
      const showPlatformView = isGodAdmin && !adminSelectedCompanyId

      if (showPlatformView) {
        // ========================================
        // god_admin: 플랫폼 통계 — 전부 병렬 로드
        // ========================================
        const [
          { count: companyCount },
          { count: activeCount },
          { count: pendingCount },
          { count: userCount },
          { data: moduleData },
          { data: pendingData },
          { data: allCompanies },
        ] = await Promise.all([
          supabase.from('companies').select('id', { count: 'exact', head: true }).neq('is_platform', true),
          supabase.from('companies').select('id', { count: 'exact', head: true }).eq('is_active', true).neq('is_platform', true),
          supabase.from('companies').select('id', { count: 'exact', head: true }).eq('is_active', false),
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.rpc('get_all_company_modules'),
          supabase.from('companies').select('id, name, business_number, business_registration_url, plan, created_at').eq('is_active', false).order('created_at', { ascending: false }),
          supabase.from('companies').select('id, name, plan, is_active, created_at, business_registration_url, is_platform').eq('is_active', true).order('created_at', { ascending: false }),
        ])

        const activeModuleCount = moduleData?.filter((m: any) => m.is_active).length || 0
        const companyModuleCounts: Record<string, number> = {}
        if (moduleData) {
          moduleData.forEach((m: any) => {
            if (m.is_active) {
              companyModuleCounts[m.company_id] = (companyModuleCounts[m.company_id] || 0) + 1
            }
          })
        }

        setPlatformStats({
          totalCompanies: companyCount || 0,
          activeCompanies: activeCount || 0,
          pendingCompanies: pendingCount || 0,
          totalUsers: userCount || 0,
          totalActiveModules: activeModuleCount,
          pendingList: pendingData || [],
          companyList: ((allCompanies || []) as any[]).filter((c: any) => !c.is_platform).map(c => ({
            ...c,
            moduleCount: companyModuleCounts[c.id] || 0,
          })),
        })

      } else {
        // ========================================
        // 회사 사용자: 비즈니스 통계 — 전부 병렬 로드
        // ========================================
        const eq = (q: any) => companyId ? q.eq('company_id', companyId) : q

        // ★ 1차 병렬: 핵심 KPI 8개 + 모듈 동시 로드
        const [
          { data: compModules },
          { data: carData },
          { count: custCount },
          { data: investData },
          { count: jiipCount },
          { data: revenueData },
          { data: financeData },
          { data: insuranceData },
        ] = await Promise.all([
          companyId
            ? supabase.from('company_modules').select('module:system_modules(path)').eq('company_id', companyId).eq('is_active', true)
            : Promise.resolve({ data: [] }),
          eq(supabase.from('cars').select('id, status', { count: 'exact' })),
          eq(supabase.from('customers').select('id', { count: 'exact', head: true })),
          eq(supabase.from('general_investments').select('invest_amount')),
          eq(supabase.from('jiip_contracts').select('id', { count: 'exact', head: true })),
          eq(supabase.from('quotes').select('rent_fee').eq('status', 'active')),
          eq(supabase.from('financial_products').select('monthly_payment')),
          eq(supabase.from('insurance_contracts').select('total_premium')),
        ])

        // 모듈 설정
        if (compModules) {
          setActiveModules(new Set(compModules.map((m: any) => m.module?.path).filter(Boolean)))
        } else {
          setActiveModules(new Set())
        }

        const cars = carData || []
        const totalInvest = (investData || []).reduce((sum: number, i: any) => sum + (i.invest_amount || 0), 0)
        const monthlyRevenue = (revenueData || []).reduce((sum: number, q: any) => sum + (q.rent_fee || 0), 0)
        const totalFinance = (financeData || []).reduce((sum: number, f: any) => sum + (f.monthly_payment || 0), 0)
        const totalInsurance = (insuranceData || []).reduce((sum: number, i: any) => sum + Math.round((i.total_premium || 0) / 12), 0)

        setStats({
          totalCars: cars.length,
          availableCars: cars.filter((c: any) => c.status === 'available').length,
          rentedCars: cars.filter((c: any) => c.status === 'rented').length,
          maintenanceCars: cars.filter((c: any) => c.status === 'maintenance').length,
          totalCustomers: custCount || 0,
          activeInvestments: (investData || []).length,
          totalInvestAmount: totalInvest,
          jiipContracts: jiipCount || 0,
          monthlyRevenue,
          monthlyExpense: totalFinance + totalInsurance,
          netProfit: monthlyRevenue - (totalFinance + totalInsurance),
        })

        // ★ 2차 병렬: 차량운영 + 수금 (companyId 필요)
        if (companyId) {
          const today = new Date().toISOString().split('T')[0]
          const weekAgo = new Date()
          weekAgo.setDate(weekAgo.getDate() + 7)
          const weekLater = weekAgo.toISOString().split('T')[0]
          const monthStart = today.substring(0, 7) + '-01'
          const nowMonth = new Date().toISOString().slice(0, 7)
          const [yr, mo] = nowMonth.split('-').map(Number)
          const lastDayOfMonth = new Date(yr, mo, 0).getDate()

          const [delivRes, retRes, maintRes, maintShopRes, inspDueRes, inspOverRes, accActiveRes, accMonthRes, { data: schedData }] = await Promise.all([
            supabase.from('vehicle_operations').select('id, scheduled_date, scheduled_time, status, operation_type, car:cars(number,brand,model), customer:customers(name)').eq('company_id', companyId).eq('operation_type', 'delivery').eq('scheduled_date', today).order('scheduled_time'),
            supabase.from('vehicle_operations').select('id, scheduled_date, scheduled_time, status, operation_type, car:cars(number,brand,model), customer:customers(name)').eq('company_id', companyId).eq('operation_type', 'return').eq('scheduled_date', today).order('scheduled_time'),
            supabase.from('maintenance_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['requested', 'approved']),
            supabase.from('maintenance_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'in_shop'),
            supabase.from('inspection_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId).lte('due_date', weekLater).gte('due_date', today).in('status', ['scheduled', 'in_progress']),
            supabase.from('inspection_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId).lt('due_date', today).in('status', ['scheduled', 'in_progress', 'overdue']),
            supabase.from('accident_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['reported', 'insurance_filed', 'repairing']),
            supabase.from('accident_records').select('id, accident_date, accident_type, status, car:cars(number,brand,model)').eq('company_id', companyId).gte('accident_date', monthStart).order('accident_date', { ascending: false }).limit(3),
            supabase.from('expected_payment_schedules').select('status, expected_amount, actual_amount, payment_date').eq('company_id', companyId).gte('payment_date', `${nowMonth}-01`).lte('payment_date', `${nowMonth}-${String(lastDayOfMonth).padStart(2, '0')}`),
          ])

          setOpsStats({
            todayDeliveries: delivRes.data || [],
            todayReturns: retRes.data || [],
            maintenanceWaiting: maintRes.count || 0,
            maintenanceInShop: maintShopRes.count || 0,
            inspectionsDueSoon: inspDueRes.count || 0,
            inspectionsOverdue: inspOverRes.count || 0,
            activeAccidents: accActiveRes.count || 0,
            accidentsThisMonth: accMonthRes.data || [],
          })

          if (schedData) {
            const pending = schedData.filter((s: any) => s.status === 'pending' && s.payment_date >= today)
            const overdue = schedData.filter((s: any) => s.status === 'pending' && s.payment_date < today)
            const completed = schedData.filter((s: any) => s.status === 'completed' || s.status === 'partial')
            const totalExpected = schedData.reduce((a: number, s: any) => a + Number(s.expected_amount || 0), 0)
            const totalActual = completed.reduce((a: number, s: any) => a + Number(s.actual_amount || s.expected_amount || 0), 0)
            setCollectionStats({
              pendingAmount: pending.reduce((a: number, s: any) => a + Number(s.expected_amount || 0), 0),
              pendingCount: pending.length,
              completedAmount: totalActual,
              completedCount: completed.length,
              overdueAmount: overdue.reduce((a: number, s: any) => a + Number(s.expected_amount || 0), 0),
              overdueCount: overdue.length,
              collectionRate: totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : 0,
            })
          }
        }
      }

    } catch (err) {
      console.error('대시보드 로딩 에러:', err)
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // 공통 헬퍼
  // ============================================
  const formatMoney = (n: number) => {
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '억'
    if (n >= 10000) return (n / 10000).toFixed(0) + '만'
    return n.toLocaleString()
  }

  const getGreeting = () => {
    const h = currentTime.getHours()
    if (h < 6) return '늦은 밤이에요'
    if (h < 12) return '좋은 아침이에요'
    if (h < 18) return '좋은 오후에요'
    return '좋은 저녁이에요'
  }

  // ============================================
  // god_admin 승인/거부 액션
  // ============================================
  const approveCompany = async (companyId: string) => {
    const { data, error } = await supabase.rpc('approve_company', { target_company_id: companyId })
    if (error) alert('승인 실패: ' + error.message)
    else if (data && !data.success) alert('승인 실패: ' + data.error)
    else fetchDashboardData()
  }

  const rejectCompany = async (companyId: string) => {
    if (!confirm('이 회사 가입 요청을 거부하시겠습니까? 관련 데이터가 삭제됩니다.')) return
    const { data, error } = await supabase.rpc('reject_company', { target_company_id: companyId })
    if (error) alert('거부 실패: ' + error.message)
    else if (data && !data.success) alert('거부 실패: ' + data.error)
    else fetchDashboardData()
  }

  // ============================================
  // 로딩 상태
  // ============================================
  if (appLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-steel-600 mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 회사 미배정 상태
  if (!company && role !== 'god_admin') {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="mb-8">
          <p className="text-gray-500 text-sm font-medium">
            {currentTime.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 mt-1">
            {getGreeting()}, <span className="text-steel-600">{user?.email?.split('@')[0]}</span>
          </h1>
        </div>
        <div className="bg-white rounded-2xl p-8 border border-yellow-200 shadow-sm text-center">
          <p className="text-5xl mb-4">🏢</p>
          <h2 className="text-xl font-black text-gray-800 mb-2">회사가 배정되지 않았습니다</h2>
          <p className="text-gray-500 mb-1">아직 소속 회사가 설정되지 않았어요.</p>
          <p className="text-gray-400 text-sm">관리자에게 회사 배정을 요청해주세요.</p>
        </div>
      </div>
    )
  }

  // 회사 승인 대기 상태
  if (company && company.is_active === false && role !== 'god_admin') {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="mb-8">
          <p className="text-gray-500 text-sm font-medium">
            {currentTime.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 mt-1">
            {getGreeting()}, <span className="text-steel-600">{company.name}</span>
          </h1>
        </div>
        <div className="bg-white rounded-2xl p-10 border border-yellow-200 shadow-sm text-center">
          <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-gray-800 mb-3">가입 승인 대기중</h2>
          <p className="text-gray-500 mb-1">회사 가입 신청이 접수되었습니다.</p>
          <p className="text-gray-500 mb-4">플랫폼 관리자의 승인 후 서비스를 이용하실 수 있습니다.</p>
          <div className="inline-flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
            <span className="text-sm font-bold text-yellow-700">승인 대기중</span>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // GOD ADMIN 대시보드
  // ============================================
  if (role === 'god_admin' && !adminSelectedCompanyId) {
    const adminActions = [
      { label: '회사/가입 관리', desc: '가입 승인 및 회사 관리', href: '/admin', icon: '🏢', color: 'from-steel-600 to-steel-800' },
      { label: '모듈 구독관리', desc: '회사별 기능 ON/OFF', href: '/system-admin', icon: '⚡', color: 'from-yellow-500 to-orange-500' },
      { label: '조직/권한 관리', desc: '직원 및 권한 설정', href: '/admin/employees', icon: '👥', color: 'from-teal-500 to-cyan-500' },
    ]

    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'left' }}>
            <p className="text-gray-500 text-xs sm:text-sm font-medium">
              {currentTime.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mt-1">
              {getGreeting()}, <span className="text-sky-600">Platform Admin</span>
            </h1>
            <p className="text-gray-400 mt-1 text-sm">플랫폼 전체 현황을 확인하세요</p>
          </div>
          <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-sky-100 text-sky-700">
            GOD ADMIN
          </span>
        </div>

        {/* 플랫폼 KPI 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
          <div className="bg-gradient-to-br from-steel-600 to-steel-800 rounded-2xl p-4 md:p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-[10px] md:text-xs font-bold text-steel-200 uppercase">등록 회사</span>
              <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm">🏢</span>
            </div>
            <p className="text-2xl md:text-3xl font-black">{loading ? '-' : platformStats.totalCompanies}<span className="text-sm md:text-base font-bold text-steel-200 ml-1">개</span></p>
            <p className="mt-1 md:mt-2 text-[10px] md:text-[11px] text-steel-200">활성 {platformStats.activeCompanies}개</p>
          </div>

          <div className="bg-gradient-to-br from-steel-700 to-steel-900 rounded-2xl p-4 md:p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-[10px] md:text-xs font-bold text-steel-200 uppercase">전체 사용자</span>
              <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm">👤</span>
            </div>
            <p className="text-2xl md:text-3xl font-black">{loading ? '-' : platformStats.totalUsers}<span className="text-sm md:text-base font-bold text-steel-200 ml-1">명</span></p>
            <p className="mt-1 md:mt-2 text-[10px] md:text-[11px] text-steel-200">가입된 전체 사용자</p>
          </div>

          <div className={`rounded-2xl p-4 md:p-5 shadow-lg ${
            platformStats.pendingCompanies > 0
              ? 'bg-gradient-to-br from-yellow-500 to-orange-500 text-white'
              : 'bg-white border border-gray-100 text-gray-900'
          }`}>
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className={`text-[10px] md:text-xs font-bold uppercase ${platformStats.pendingCompanies > 0 ? 'text-yellow-100' : 'text-gray-400'}`}>승인 대기</span>
              <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm">⏳</span>
            </div>
            <p className="text-2xl md:text-3xl font-black">{loading ? '-' : platformStats.pendingCompanies}<span className={`text-sm md:text-base font-bold ml-1 ${platformStats.pendingCompanies > 0 ? 'text-yellow-100' : 'text-gray-400'}`}>건</span></p>
            <p className={`mt-1 md:mt-2 text-[10px] md:text-[11px] ${platformStats.pendingCompanies > 0 ? 'text-yellow-100' : 'text-gray-400'}`}>
              {platformStats.pendingCompanies > 0 ? '처리가 필요합니다' : '대기 없음'}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 md:p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase">활성 모듈</span>
              <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-green-50 flex items-center justify-center text-sm">📦</span>
            </div>
            <p className="text-2xl md:text-3xl font-black text-gray-900">{loading ? '-' : platformStats.totalActiveModules}<span className="text-sm md:text-base font-bold text-gray-400 ml-1">개</span></p>
            <p className="mt-1 md:mt-2 text-[10px] md:text-[11px] text-gray-400">전체 회사 활성 모듈</p>
          </div>
        </div>

        {/* 승인 대기 목록 */}
        {platformStats.pendingList.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-orange-500 uppercase tracking-wider mb-3">승인 대기 ({platformStats.pendingList.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {platformStats.pendingList.map(c => (
                <div key={c.id} className="bg-white rounded-xl p-4 border-2 border-yellow-200 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-black text-gray-900">{c.name}</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                          c.plan === 'master' ? 'bg-yellow-100 text-yellow-700' :
                          c.plan === 'pro' ? 'bg-steel-100 text-steel-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{c.plan?.toUpperCase() || 'FREE'}</span>
                      </div>
                      {c.business_number && <p className="text-xs text-gray-400">사업자번호: {c.business_number}</p>}
                      <p className="text-xs text-gray-400">신청일: {new Date(c.created_at).toLocaleDateString('ko-KR')}</p>
                      {c.business_registration_url && (
                        <a
                          href={c.business_registration_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded bg-steel-50 text-steel-600 hover:bg-steel-100 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                          </svg>
                          사업자등록증 보기
                        </a>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => approveCompany(c.id)}
                        className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => rejectCompany(c.id)}
                        className="px-3 py-1.5 text-xs font-bold bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                      >
                        거부
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 플랫폼 관리 바로가기 */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-sky-500 uppercase tracking-wider mb-3">플랫폼 관리</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {adminActions.map(action => (
              <Link
                key={action.href}
                href={action.href}
                className="group bg-steel-900 rounded-xl p-4 md:p-5 hover:bg-steel-800 transition-all hover:scale-[1.02] border border-gray-800"
              >
                <span className="text-2xl">{action.icon}</span>
                <p className="text-white font-bold text-sm mt-2">{action.label}</p>
                <p className="text-gray-500 text-xs mt-0.5">{action.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* 회사별 현황 테이블 */}
        {platformStats.companyList.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">활성 회사 현황</h2>
              <Link href="/admin" className="text-xs text-steel-600 hover:text-steel-800 font-bold">
                전체 관리 →
              </Link>
            </div>
            <div className="bg-white rounded-xl border border-steel-100 shadow-sm overflow-x-auto">
              <table className="w-full text-left min-w-[560px]">
                <thead className="bg-steel-50 text-steel-800 text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-3 md:p-4">회사명</th>
                    <th className="p-3 md:p-4 text-center">플랜</th>
                    <th className="p-3 md:p-4 text-center">활성 모듈</th>
                    <th className="p-3 md:p-4 text-center">등록증</th>
                    <th className="p-3 md:p-4 text-right">가입일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {platformStats.companyList.map(c => (
                    <tr key={c.id} className="hover:bg-steel-50 cursor-pointer transition-colors" onClick={() => router.push('/system-admin')}>
                      <td className="p-3 md:p-4">
                        <span className="font-bold text-gray-900 text-sm">{c.name}</span>
                      </td>
                      <td className="p-3 md:p-4 text-center">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          c.plan === 'master' ? 'bg-yellow-100 text-yellow-700' :
                          c.plan === 'pro' ? 'bg-steel-100 text-steel-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{c.plan?.toUpperCase() || 'FREE'}</span>
                      </td>
                      <td className="p-3 md:p-4 text-center">
                        <span className="text-sm font-bold text-gray-700">{c.moduleCount}</span>
                        <span className="text-xs text-gray-400">/9</span>
                      </td>
                      <td className="p-3 md:p-4 text-center">
                        {c.business_registration_url ? (
                          <a
                            href={c.business_registration_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-steel-50 text-steel-600 hover:bg-steel-100 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                            </svg>
                            보기
                          </a>
                        ) : (
                          <span className="text-[10px] text-gray-300">-</span>
                        )}
                      </td>
                      <td className="p-3 md:p-4 text-right text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString('ko-KR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    )
  }

  // ============================================
  // 회사 사용자 대시보드 (기존)
  // ============================================
  // god_admin이 선택한 회사명 찾기
  const selectedCompanyName = adminSelectedCompanyId
    ? allCompanies.find((c: any) => c.id === adminSelectedCompanyId)?.name
    : null

  const allQuickActions = [
    { label: '차량 등록증', desc: '등록증 및 제원 관리', href: '/registration', icon: '📄', color: 'from-steel-500 to-steel-600', modulePath: '/registration' },
    { label: '보험/가입', desc: '보험 계약 관리', href: '/insurance', icon: '🛡️', color: 'from-teal-500 to-teal-600', modulePath: '/insurance' },
    { label: '고객 관리', desc: '고객 정보 관리', href: '/customers', icon: '👥', color: 'from-emerald-500 to-emerald-600', modulePath: '/customers' },
    { label: '견적/계약', desc: '견적서 작성', href: '/quotes', icon: '📋', color: 'from-amber-500 to-amber-600', modulePath: '/quotes' },
    { label: '일반투자', desc: '투자 현황 관리', href: '/invest', icon: '💰', color: 'from-sky-500 to-sky-600', modulePath: '/invest' },
    { label: '지입투자', desc: '지입 계약 관리', href: '/jiip', icon: '🚛', color: 'from-rose-500 to-rose-600', modulePath: '/jiip' },
    { label: '재무관리', desc: '수입/지출 관리', href: '/finance', icon: '📊', color: 'from-cyan-500 to-cyan-600', modulePath: '/finance' },
  ]
  const quickActions = allQuickActions.filter(a => hasModule(a.modulePath))

  const showCars = hasModule('/registration') || hasModule('/insurance')
  const showCustomers = hasModule('/customers')
  const showInvest = hasModule('/invest') || hasModule('/jiip')
  const showFinance = hasModule('/finance') || hasModule('/quotes')

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">

      {/* 상단 인사 영역 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
        <div style={{ textAlign: 'left' }}>
          <p className="text-gray-500 text-xs sm:text-sm font-medium">
            {currentTime.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mt-1">
            {getGreeting()}, <span className="text-steel-600">{selectedCompanyName || company?.name || user?.email?.split('@')[0] || '사용자'}</span>
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            {role === 'god_admin' && adminSelectedCompanyId ? '선택된 회사의 업무 현황입니다' : '오늘의 업무 현황을 확인하세요'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
            {role === 'god_admin' && (
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-sky-100 text-sky-700">GOD ADMIN</span>
            )}
            {company?.plan && role !== 'god_admin' && (
              <span className={`text-xs font-black px-2.5 py-1 rounded-full ${
                company.plan === 'master' ? 'bg-yellow-100 text-yellow-700' :
                company.plan === 'pro' ? 'bg-steel-100 text-steel-700' :
                'bg-gray-100 text-gray-500'
              }`}>{company.plan.toUpperCase()}</span>
            )}
            {role !== 'god_admin' && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                role === 'master' ? 'bg-steel-100 text-steel-700' : 'bg-gray-100 text-gray-600'
              }`}>{role === 'master' ? '관리자' : '직원'}</span>
            )}
            {position && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">{position.name}</span>
            )}
          </div>
      </div>

      {/* KPI 카드 — god admin 스타일 다크 그라데이션 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        {showCars && (
          <div className="bg-gradient-to-br from-steel-600 to-steel-800 rounded-2xl p-4 md:p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-[10px] md:text-xs font-bold text-steel-200 uppercase">보유 차량</span>
              <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm">🚗</span>
            </div>
            <p className="text-2xl md:text-3xl font-black">{loading ? '-' : stats.totalCars}<span className="text-sm md:text-base font-bold text-steel-200 ml-1">대</span></p>
            <div className="mt-1 md:mt-2 flex flex-wrap gap-1.5 md:gap-2 text-[10px] md:text-[11px] font-medium text-steel-200">
              <span>대기 {stats.availableCars}</span>
              <span>·</span>
              <span>대여 {stats.rentedCars}</span>
              <span>·</span>
              <span>정비 {stats.maintenanceCars}</span>
            </div>
          </div>
        )}
        {showCustomers && (
          <div className="bg-gradient-to-br from-steel-700 to-steel-900 rounded-2xl p-4 md:p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-[10px] md:text-xs font-bold text-steel-200 uppercase">고객 수</span>
              <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm">👥</span>
            </div>
            <p className="text-2xl md:text-3xl font-black">{loading ? '-' : stats.totalCustomers}<span className="text-sm md:text-base font-bold text-steel-200 ml-1">명</span></p>
            <p className="mt-1 md:mt-2 text-[10px] md:text-[11px] text-steel-200">등록된 전체 고객</p>
          </div>
        )}
        {showInvest && (
          <div className="bg-gradient-to-br from-steel-600 to-steel-800 rounded-2xl p-4 md:p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-[10px] md:text-xs font-bold text-sky-200 uppercase">투자 유치</span>
              <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm">💰</span>
            </div>
            <p className="text-2xl md:text-3xl font-black">{loading ? '-' : formatMoney(stats.totalInvestAmount)}<span className="text-sm md:text-base font-bold text-sky-200 ml-1">원</span></p>
            <p className="mt-1 md:mt-2 text-[10px] md:text-[11px] text-sky-200">일반 {stats.activeInvestments}건 · 지입 {stats.jiipContracts}건</p>
          </div>
        )}
        {showCars && (
          <div className="bg-white rounded-2xl p-4 md:p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase">가동률</span>
              <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-green-50 flex items-center justify-center text-sm">📊</span>
            </div>
            <p className="text-2xl md:text-3xl font-black text-gray-900">
              {loading || stats.totalCars === 0 ? '-' : Math.round((stats.rentedCars / stats.totalCars) * 100)}
              <span className="text-sm md:text-base font-bold text-gray-400 ml-1">%</span>
            </p>
            <p className="mt-1 md:mt-2 text-[10px] md:text-[11px] text-gray-400">대여 중 / 전체 비율</p>
          </div>
        )}
        {!showCars && !showCustomers && !showInvest && (
          <div className="col-span-2 md:col-span-4 bg-gradient-to-br from-steel-600 to-steel-800 rounded-2xl p-6 text-white shadow-lg text-center">
            <p className="text-lg font-black">활성화된 모듈이 없습니다</p>
            <p className="text-steel-200 text-sm mt-1">관리자에게 모듈 활성화를 요청해주세요</p>
          </div>
        )}
      </div>

      {/* 경영 현황판 — 다크 스타일 */}
      {showFinance && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-8">
          <div className="bg-gradient-to-br from-steel-600 to-steel-800 rounded-2xl p-4 md:p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-[10px] md:text-xs font-bold text-steel-200 uppercase">월 예상 매출</span>
              <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm">💵</span>
            </div>
            <p className="text-xl md:text-2xl font-black">{loading ? '-' : formatMoney(stats.monthlyRevenue)}<span className="text-sm font-bold text-steel-200 ml-1">원</span></p>
            <p className="mt-1 md:mt-2 text-[10px] md:text-[11px] text-steel-200">활성 렌트 계약 기준</p>
          </div>
          <div className="bg-gradient-to-br from-red-500 to-rose-700 rounded-2xl p-4 md:p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-[10px] md:text-xs font-bold text-red-200 uppercase">월 고정 지출</span>
              <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm">💸</span>
            </div>
            <p className="text-xl md:text-2xl font-black">{loading ? '-' : formatMoney(stats.monthlyExpense)}<span className="text-sm font-bold text-red-200 ml-1">원</span></p>
            <p className="mt-1 md:mt-2 text-[10px] md:text-[11px] text-red-200">할부금 + 보험료 (월 환산)</p>
          </div>
          <div className="bg-steel-900 rounded-2xl p-4 md:p-5 shadow-lg ring-2 ring-gray-100">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-[10px] md:text-xs font-bold text-yellow-400 uppercase">월 순수익</span>
              <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-yellow-900/30 flex items-center justify-center text-sm">🏆</span>
            </div>
            <p className={`text-xl md:text-2xl font-black ${stats.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {loading ? '-' : formatMoney(stats.netProfit)}<span className="text-sm font-bold text-gray-500 ml-1">원</span>
            </p>
            <p className="mt-1 md:mt-2 text-[10px] md:text-[11px] text-gray-500">매출 - 고정지출</p>
          </div>
        </div>
      )}

      {/* ── 수금 현황 ── */}
      {showFinance && !loading && (collectionStats.pendingCount > 0 || collectionStats.overdueCount > 0 || collectionStats.completedCount > 0) && (
        <div className="mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-steel-500 uppercase tracking-wider">이번달 수금 현황</h2>
            <Link href="/finance/collections" className="text-xs font-bold text-steel-400 hover:text-steel-600 transition-colors">
              자세히 보기 →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase">수금율</span>
                <span className="text-base">{collectionStats.collectionRate >= 80 ? '✅' : collectionStats.collectionRate >= 50 ? '⚠️' : '🔴'}</span>
              </div>
              <p className={`text-xl font-black ${collectionStats.collectionRate >= 80 ? 'text-green-600' : collectionStats.collectionRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                {collectionStats.collectionRate}%
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase">수금 완료</span>
                <span className="text-base">💰</span>
              </div>
              <p className="text-xl font-black text-green-600">{formatMoney(collectionStats.completedAmount)}<span className="text-xs font-bold text-gray-400 ml-1">원</span></p>
              <p className="text-[10px] text-gray-400 mt-0.5">{collectionStats.completedCount}건</p>
            </div>
            <Link href="/finance/collections" className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:border-amber-300 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase">미수금</span>
                <span className="text-base">⏳</span>
              </div>
              <p className="text-xl font-black text-amber-600">{formatMoney(collectionStats.pendingAmount)}<span className="text-xs font-bold text-gray-400 ml-1">원</span></p>
              <p className="text-[10px] text-gray-400 mt-0.5">{collectionStats.pendingCount}건</p>
            </Link>
            {collectionStats.overdueCount > 0 && (
              <Link href="/finance/collections" className="bg-white rounded-xl p-4 border border-red-200 shadow-sm hover:border-red-400 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-red-400 uppercase">연체</span>
                  <span className="text-base">🚨</span>
                </div>
                <p className="text-xl font-black text-red-600">{formatMoney(collectionStats.overdueAmount)}<span className="text-xs font-bold text-gray-400 ml-1">원</span></p>
                <p className="text-[10px] text-red-400 mt-0.5">{collectionStats.overdueCount}건</p>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── 차량운영 현황 ── */}
      {showCars && !loading && (opsStats.todayDeliveries.length > 0 || opsStats.todayReturns.length > 0 || opsStats.maintenanceWaiting > 0 || opsStats.inspectionsOverdue > 0 || opsStats.activeAccidents > 0) && (
        <div className="mb-8 space-y-4">
          <h2 className="text-sm font-bold text-steel-500 uppercase tracking-wider">차량운영 현황</h2>

          {/* 운영 KPI 미니카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link href="/operations" className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:border-steel-300 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase">금일 출고</span>
                <span className="text-base">🚚</span>
              </div>
              <p className="text-xl font-black text-gray-900">{opsStats.todayDeliveries.length}<span className="text-xs font-bold text-gray-400 ml-1">건</span></p>
            </Link>
            <Link href="/operations" className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:border-steel-300 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase">금일 반납</span>
                <span className="text-base">📥</span>
              </div>
              <p className="text-xl font-black text-gray-900">{opsStats.todayReturns.length}<span className="text-xs font-bold text-gray-400 ml-1">건</span></p>
            </Link>
            <Link href="/maintenance" className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:border-amber-300 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase">정비 대기</span>
                <span className="text-base">🔧</span>
              </div>
              <p className="text-xl font-black text-gray-900">{opsStats.maintenanceWaiting}<span className="text-xs font-bold text-gray-400 ml-1">건</span></p>
              {opsStats.maintenanceInShop > 0 && <p className="text-[10px] text-amber-600 font-bold mt-0.5">정비중 {opsStats.maintenanceInShop}건</p>}
            </Link>
            <div className="bg-white rounded-xl p-4 border shadow-sm flex flex-col" style={{ borderColor: opsStats.inspectionsOverdue > 0 ? '#fca5a5' : opsStats.activeAccidents > 0 ? '#fcd34d' : '#f3f4f6' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase">주의 항목</span>
                <span className="text-base">⚠️</span>
              </div>
              <div className="flex flex-col gap-0.5">
                {opsStats.inspectionsOverdue > 0 && (
                  <Link href="/maintenance" className="text-[11px] font-bold text-red-600 hover:underline">검사 만기초과 {opsStats.inspectionsOverdue}건</Link>
                )}
                {opsStats.inspectionsDueSoon > 0 && (
                  <Link href="/maintenance" className="text-[11px] font-bold text-orange-600 hover:underline">검사 7일내 {opsStats.inspectionsDueSoon}건</Link>
                )}
                {opsStats.activeAccidents > 0 && (
                  <Link href="/accidents" className="text-[11px] font-bold text-purple-600 hover:underline">사고 처리중 {opsStats.activeAccidents}건</Link>
                )}
                {opsStats.inspectionsOverdue === 0 && opsStats.inspectionsDueSoon === 0 && opsStats.activeAccidents === 0 && (
                  <p className="text-[11px] text-green-600 font-bold">이상 없음 ✓</p>
                )}
              </div>
            </div>
          </div>

          {/* 오늘의 출고/반납 상세 리스트 */}
          {(opsStats.todayDeliveries.length > 0 || opsStats.todayReturns.length > 0) && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-steel-500" />
                <span className="text-sm font-black text-gray-800">오늘의 출고/반납</span>
                <span className="text-[10px] bg-steel-100 text-steel-600 px-1.5 py-0.5 rounded-full font-bold">{opsStats.todayDeliveries.length + opsStats.todayReturns.length}건</span>
              </div>
              <div className="divide-y divide-gray-50">
                {[...opsStats.todayDeliveries, ...opsStats.todayReturns].map((op: any) => {
                  const isDelivery = op.operation_type === 'delivery'
                  const statusColors: Record<string, string> = {
                    scheduled: 'bg-gray-100 text-gray-700', preparing: 'bg-blue-100 text-blue-700',
                    inspecting: 'bg-purple-100 text-purple-700', in_transit: 'bg-amber-100 text-amber-700',
                    completed: 'bg-green-100 text-green-700',
                  }
                  const statusLabels: Record<string, string> = {
                    scheduled: '예정', preparing: '준비중', inspecting: '점검중', in_transit: '이동중', completed: '완료',
                  }
                  return (
                    <Link key={op.id} href="/operations" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${isDelivery ? 'bg-blue-50' : 'bg-amber-50'}`}>
                        {isDelivery ? '🚚' : '📥'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-gray-800 text-sm">{op.car?.brand} {op.car?.model}</span>
                          {op.car?.number && <span className="text-[10px] text-steel-600 font-bold">[{op.car.number}]</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-400">{op.scheduled_time?.substring(0, 5) || ''}</span>
                          <span className="text-[10px] text-gray-400">{op.customer?.name || ''}</span>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColors[op.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabels[op.status] || op.status}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 업무 바로가기 — 다크 카드 스타일 */}
      {quickActions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-steel-500 uppercase tracking-wider mb-3">업무 바로가기</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {quickActions.map(action => (
              <Link
                key={action.href}
                href={action.href}
                className="group bg-steel-900 rounded-xl p-4 md:p-5 hover:bg-steel-800 transition-all hover:scale-[1.02] border border-gray-800"
              >
                <span className="text-2xl">{action.icon}</span>
                <p className="text-white font-bold text-sm mt-2">{action.label}</p>
                <p className="text-gray-500 text-xs mt-0.5">{action.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
