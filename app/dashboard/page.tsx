'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DcStatStrip, { StatItem } from '../components/DcStatStrip'

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
  // ★ Decimal 안전 캐스팅
  const formatMoney = (raw: any) => {
    const n = Number(raw) || 0
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
      <div className="page-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-slate-400 font-medium">로딩 중...</p>
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

  // ── 가동률 계산 ──
  const utilRate = stats.totalCars > 0 ? Math.round((stats.rentedCars / stats.totalCars) * 100) : 0

  // ── 주의 항목 수집 ──
  const alerts: { label: string; count: number; color: string; href: string }[] = []
  if (opsStats.inspectionsOverdue > 0) alerts.push({ label: '검사 만기초과', count: opsStats.inspectionsOverdue, color: 'text-red-400', href: '/maintenance' })
  if (opsStats.inspectionsDueSoon > 0) alerts.push({ label: '검사 7일내', count: opsStats.inspectionsDueSoon, color: 'text-orange-400', href: '/maintenance' })
  if (collectionStats.overdueCount > 0) alerts.push({ label: '수금 연체', count: collectionStats.overdueCount, color: 'text-red-400', href: '/finance/collections' })
  if (opsStats.activeAccidents > 0) alerts.push({ label: '사고 처리중', count: opsStats.activeAccidents, color: 'text-purple-400', href: '/claims/accident-mgmt' })
  if (opsStats.maintenanceWaiting > 0) alerts.push({ label: '정비 대기', count: opsStats.maintenanceWaiting, color: 'text-amber-400', href: '/maintenance' })

  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">

      {/* ═══ 상단 인사 헤더 ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
        <div style={{ textAlign: 'left' }}>
          <p className="text-slate-400 text-xs sm:text-sm font-medium">
            {currentTime.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight mt-1">
            {getGreeting()}, <span className="text-blue-600">주식회사 에프엠아이</span>
          </h1>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600">FMI</span>
          {position && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600">{position.name}</span>
          )}
        </div>
      </div>

      {/* ═══ B-스타일 2컬럼 레이아웃 ═══ */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* ── 좌측: 종합 요약 카드 (고정 폭) ── */}
        <div className="w-full lg:w-[340px] flex-shrink-0 space-y-4">

          {/* 차량 현황 요약 카드 */}
          {showCars && (
            <div className="si-card rounded-2xl p-5 border border-black/[0.06]" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(241,245,249,0.98) 100%)' }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">차량 현황</span>
                <Link href="/cars" className="text-[10px] font-bold text-blue-600 hover:text-blue-500 transition-colors">상세 →</Link>
              </div>

              {/* 큰 숫자 */}
              <div className="text-center mb-5">
                <p className="text-5xl font-black text-slate-800">{loading ? '-' : stats.totalCars}</p>
                <p className="text-xs text-slate-400 font-medium mt-1">보유 차량 (대)</p>
              </div>

              {/* 상태 분류 */}
              <div className="space-y-2.5 mb-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.4)' }} />
                    <span className="text-xs text-slate-600 font-medium">대기 가능</span>
                  </div>
                  <span className="text-sm font-black text-slate-800">{stats.availableCars}<span className="text-slate-500 text-xs ml-0.5">대</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-400" style={{ boxShadow: '0 0 6px rgba(96,165,250,0.4)' }} />
                    <span className="text-xs text-slate-600 font-medium">대여 중</span>
                  </div>
                  <span className="text-sm font-black text-slate-800">{stats.rentedCars}<span className="text-slate-500 text-xs ml-0.5">대</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" style={{ boxShadow: '0 0 6px rgba(251,191,36,0.4)' }} />
                    <span className="text-xs text-slate-600 font-medium">정비 중</span>
                  </div>
                  <span className="text-sm font-black text-slate-800">{stats.maintenanceCars}<span className="text-slate-500 text-xs ml-0.5">대</span></span>
                </div>
              </div>

              {/* 가동률 프로그레스 바 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">가동률</span>
                  <span className={`text-sm font-black ${utilRate >= 70 ? 'text-emerald-400' : utilRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                    {loading ? '-' : utilRate}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${loading ? 0 : utilRate}%`,
                      background: utilRate >= 70 ? 'linear-gradient(90deg, #34d399, #10b981)' : utilRate >= 40 ? 'linear-gradient(90deg, #fbbf24, #f59e0b)' : 'linear-gradient(90deg, #f87171, #ef4444)',
                      boxShadow: utilRate >= 70 ? '0 0 10px rgba(52,211,153,0.4)' : utilRate >= 40 ? '0 0 10px rgba(251,191,36,0.4)' : '0 0 10px rgba(248,113,113,0.4)',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 경영 요약 카드 */}
          {showFinance && (
            <div className="si-card rounded-2xl p-5 border border-black/[0.06]" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(241,245,249,0.98) 100%)' }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">이번달 경영</span>
                <Link href="/finance" className="text-[10px] font-bold text-blue-600 hover:text-blue-500 transition-colors">상세 →</Link>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">매출</span>
                  <span className="text-sm font-black text-slate-800">{loading ? '-' : formatMoney(stats.monthlyRevenue)}<span className="text-slate-500 text-[10px] ml-0.5">원</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">지출</span>
                  <span className="text-sm font-black text-red-400">{loading ? '-' : formatMoney(stats.monthlyExpense)}<span className="text-slate-500 text-[10px] ml-0.5">원</span></span>
                </div>
                <div className="h-px bg-gray-100" />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600">순수익</span>
                  <span className={`text-base font-black ${stats.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {loading ? '-' : formatMoney(stats.netProfit)}<span className="text-slate-500 text-xs ml-0.5">원</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 수금 현황 카드 */}
          {showFinance && !loading && (collectionStats.pendingCount > 0 || collectionStats.overdueCount > 0 || collectionStats.completedCount > 0) && (
            <div className="si-card rounded-2xl p-5 border border-black/[0.06]" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(241,245,249,0.98) 100%)' }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">수금 현황</span>
                <Link href="/finance/collections" className="text-[10px] font-bold text-blue-600 hover:text-blue-500 transition-colors">상세 →</Link>
              </div>
              {/* 수금율 프로그레스 */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-400">수금율</span>
                  <span className={`text-sm font-black ${collectionStats.collectionRate >= 80 ? 'text-emerald-400' : collectionStats.collectionRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {collectionStats.collectionRate}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${collectionStats.collectionRate}%`,
                      background: collectionStats.collectionRate >= 80 ? 'linear-gradient(90deg, #34d399, #10b981)' : collectionStats.collectionRate >= 50 ? 'linear-gradient(90deg, #fbbf24, #f59e0b)' : 'linear-gradient(90deg, #f87171, #ef4444)',
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-emerald-400">완료</span>
                  <span className="text-xs font-bold text-slate-700">{formatMoney(collectionStats.completedAmount)}원 <span className="text-slate-500">({collectionStats.completedCount}건)</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-amber-400">미수금</span>
                  <span className="text-xs font-bold text-slate-700">{formatMoney(collectionStats.pendingAmount)}원 <span className="text-slate-500">({collectionStats.pendingCount}건)</span></span>
                </div>
                {collectionStats.overdueCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-red-400">연체</span>
                    <span className="text-xs font-bold text-red-400">{formatMoney(collectionStats.overdueAmount)}원 <span className="text-red-400/60">({collectionStats.overdueCount}건)</span></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 알림/주의 사항 */}
          {!loading && alerts.length > 0 && (
            <div className="si-card rounded-2xl p-5 border border-red-500/20" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(241,245,249,0.98) 100%)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">주의 항목</span>
                <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-full font-bold ml-auto">{alerts.length}</span>
              </div>
              <div className="space-y-2">
                {alerts.map((a, i) => (
                  <Link key={i} href={a.href} className="flex items-center justify-between hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors">
                    <span className={`text-xs font-medium ${a.color}`}>{a.label}</span>
                    <span className={`text-sm font-black ${a.color}`}>{a.count}<span className="text-slate-500 text-[10px] ml-0.5">건</span></span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 알림 없을 때 */}
          {!loading && alerts.length === 0 && (
            <div className="si-card rounded-2xl p-5 border border-emerald-500/20" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(241,245,249,0.98) 100%)' }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-bold text-emerald-400">모든 항목 정상</span>
              </div>
            </div>
          )}

          {/* 모듈 없음 */}
          {!showCars && !showCustomers && !showInvest && !showFinance && (
            <div className="si-card rounded-2xl p-6 border border-black/[0.06] text-center" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(241,245,249,0.98) 100%)' }}>
              <p className="text-lg font-black text-slate-600">활성화된 모듈이 없습니다</p>
              <p className="text-slate-500 text-sm mt-1">관리자에게 모듈 활성화를 요청해주세요</p>
            </div>
          )}
        </div>

        {/* ── 우측: 상세 정보 영역 ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* 핵심 KPI 4개 미니카드 */}
          {(() => {
            const items: StatItem[] = []
            if (showCars) items.push({ label: '보유', value: loading ? '-' : stats.totalCars, unit: '대' })
            if (showCustomers) items.push({ label: '고객', value: loading ? '-' : stats.totalCustomers, unit: '명' })
            if (showInvest) items.push({ label: '투자', value: loading ? '-' : formatMoney(stats.totalInvestAmount), unit: '원' })
            if (showFinance) items.push({ label: '순수익', value: loading ? '-' : formatMoney(stats.netProfit), unit: '원' })
            return <DcStatStrip stats={items} fullWidth={true} />
          })()}

          {/* 오늘의 운영 현황 */}
          {showCars && !loading && (opsStats.todayDeliveries.length > 0 || opsStats.todayReturns.length > 0) && (
            <div className="si-card rounded-2xl border border-black/[0.06] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-black/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400" style={{ boxShadow: '0 0 6px rgba(96,165,250,0.5)' }} />
                  <span className="text-sm font-black text-slate-800">오늘의 출고/반납</span>
                  <span className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">{opsStats.todayDeliveries.length + opsStats.todayReturns.length}건</span>
                </div>
                <Link href="/operations" className="text-[10px] font-bold text-blue-600 hover:text-blue-500 transition-colors">전체 보기 →</Link>
              </div>
              <div className="divide-y divide-gray-200">
                {[...opsStats.todayDeliveries, ...opsStats.todayReturns].slice(0, 6).map((op: any) => {
                  const isDelivery = op.operation_type === 'delivery'
                  const statusColors: Record<string, string> = {
                    scheduled: 'bg-gray-100 text-slate-600', preparing: 'bg-blue-500/10 text-blue-600',
                    inspecting: 'bg-purple-500/20 text-purple-300', in_transit: 'bg-amber-500/20 text-amber-300',
                    completed: 'bg-emerald-500/20 text-emerald-300',
                  }
                  const statusLabels: Record<string, string> = {
                    scheduled: '예정', preparing: '준비중', inspecting: '점검중', in_transit: '이동중', completed: '완료',
                  }
                  return (
                    <Link key={op.id} href="/operations" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${isDelivery ? 'bg-blue-500/15' : 'bg-amber-500/15'}`}>
                        {isDelivery ? '🚚' : '📥'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800 text-sm truncate">{op.car?.brand} {op.car?.model}</span>
                          {op.car?.number && <span className="text-[10px] text-blue-600 font-bold flex-shrink-0">[{op.car.number}]</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-500">{op.scheduled_time?.substring(0, 5) || ''}</span>
                          <span className="text-[10px] text-slate-500">{op.customer?.name || ''}</span>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${statusColors[op.status] || 'bg-gray-100 text-slate-600'}`}>
                        {statusLabels[op.status] || op.status}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* 운영 KPI 미니카드 행 */}
          {showCars && !loading && (opsStats.maintenanceWaiting > 0 || opsStats.inspectionsOverdue > 0 || opsStats.todayDeliveries.length > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link href="/operations" className="glass-3 rounded-xl p-3.5 border border-black/[0.06] hover:border-blue-400/30 transition-colors">
                <span className="text-[10px] font-bold text-slate-500 uppercase">금일 출고</span>
                <p className="text-lg font-black text-slate-800 mt-0.5">{opsStats.todayDeliveries.length}<span className="text-slate-500 text-xs ml-0.5">건</span></p>
              </Link>
              <Link href="/operations" className="glass-3 rounded-xl p-3.5 border border-black/[0.06] hover:border-blue-400/30 transition-colors">
                <span className="text-[10px] font-bold text-slate-500 uppercase">금일 반납</span>
                <p className="text-lg font-black text-slate-800 mt-0.5">{opsStats.todayReturns.length}<span className="text-slate-500 text-xs ml-0.5">건</span></p>
              </Link>
              <Link href="/maintenance" className="glass-3 rounded-xl p-3.5 border border-black/[0.06] hover:border-amber-400/30 transition-colors">
                <span className="text-[10px] font-bold text-slate-500 uppercase">정비 대기</span>
                <p className="text-lg font-black text-slate-800 mt-0.5">{opsStats.maintenanceWaiting}<span className="text-slate-500 text-xs ml-0.5">건</span></p>
                {opsStats.maintenanceInShop > 0 && <p className="text-[10px] text-amber-400 font-bold">정비중 {opsStats.maintenanceInShop}건</p>}
              </Link>
              <div className="glass-3 rounded-xl p-3.5 border border-black/[0.06]">
                <span className="text-[10px] font-bold text-slate-500 uppercase">사고</span>
                <p className="text-lg font-black text-slate-800 mt-0.5">{opsStats.activeAccidents}<span className="text-slate-500 text-xs ml-0.5">건</span></p>
                {opsStats.accidentsThisMonth.length > 0 && <p className="text-[10px] text-purple-400 font-bold">이번달 {opsStats.accidentsThisMonth.length}건</p>}
              </div>
            </div>
          )}

          {/* 업무 바로가기 */}
          {quickActions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">업무 바로가기</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {quickActions.map(action => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group glass-3 rounded-xl p-4 hover:bg-gray-100 transition-all hover:scale-[1.02] border border-black/[0.06] hover:border-blue-500/20"
                  >
                    <span className="text-xl">{action.icon}</span>
                    <p className="text-slate-800 font-bold text-sm mt-1.5">{action.label}</p>
                    <p className="text-slate-500 text-[11px] mt-0.5">{action.desc}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
    </div>
  )
}
