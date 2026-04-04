'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
import { useApp } from '../context/AppContext'
import { usePermission } from '../hooks/usePermission'

// ============================================
// 대시보드 - FMI ERP 비즈니스 KPI
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

export default function DashboardPage() {
  const router = useRouter()
  const { user, role, position, loading: appLoading } = useApp()
  const { hasPageAccess } = usePermission()
  const [stats, setStats] = useState<DashboardStats>({
    totalCars: 0, availableCars: 0, rentedCars: 0, maintenanceCars: 0,
    totalCustomers: 0, activeInvestments: 0, totalInvestAmount: 0, jiipContracts: 0,
    monthlyRevenue: 0, monthlyExpense: 0, netProfit: 0,
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
  }, [appLoading, user, role])

  // 모듈 활성화 + 권한 체크 헬퍼
  // admin → 항상 true, user → 페이지 접근 권한 체크
  const hasModule = (path: string) => {
    if (role === 'admin') return true
    if (!activeModules.has(path)) return false
    return hasPageAccess(path)
  }

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/dashboard', { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const { modules, stats: s, opsStats: ops, collectionStats: col } = json.data

      setActiveModules(new Set(modules || []))
      setStats(s)
      setOpsStats(ops)
      setCollectionStats(col)
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

  // ============================================
  // FMI 비즈니스 대시보드
  // ============================================
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
            {getGreeting()}, <span className="text-sky-600">주식회사 에프엠아이</span>
          </h1>
          <p className="text-gray-400 mt-1 text-sm">오늘의 업무 현황을 확인하세요</p>
        </div>
        <div className="flex gap-2 items-center">
            <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-sky-100 text-sky-700">FMI</span>
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
