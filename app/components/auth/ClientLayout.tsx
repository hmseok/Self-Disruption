'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { usePermission } from '../../hooks/usePermission'
import { UploadProvider, useUpload } from '@/app/context/UploadContext'
import PageTitle from '../PageTitle'

// ============================================
// 아이콘
// ============================================
const Icons: any = {
  Menu: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  Home: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  Car: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10H8s-1.5-.1-3.5 1.5S2 15 2 15v1c0 .6.4 1 1 1h1" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 17a2 2 0 104 0 2 2 0 00-4 0zM14 17a2 2 0 104 0 2 2 0 00-4 0z" /></svg>,
  Truck: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
  Doc: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Setting: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Admin: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>,
  Users: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  Shield: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Database: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>,
  Money: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Clipboard: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  Building: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  Chart: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  Wrench: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  WrenchScrewdriver: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" /></svg>,
  ExclamationTriangle: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
}

// ============================================
// 메뉴 설정
// ============================================

// 동적 메뉴 → 그룹 매핑
const PATH_TO_GROUP: Record<string, string> = {
  '/cars': 'vehicle', '/insurance': 'vehicle', '/registration': 'vehicle', '/fleet/vehicle-lookup': 'vehicle',
  '/operations': 'ops', '/operations/intake': 'ops', '/maintenance': 'ops', '/accidents': 'ops', '/rental': 'ops',
  '/claims/accident-mgmt': 'claims', '/claims/billing-mgmt': 'claims',
  '/claims/intake': 'claims', '/claims/investigation': 'claims', '/claims/assessment': 'claims', '/claims/billing': 'claims', '/claims/rental': 'claims',
  '/quotes': 'sales', '/quotes/pricing': 'sales', '/quotes/short-term': 'sales', '/contracts': 'sales', '/customers': 'sales', '/e-contract': 'sales',
  '/finance': 'finance', '/finance/collections': 'finance', '/finance/settlement': 'finance', '/finance/fleet': 'finance', '/finance/tax': 'finance', '/finance/upload': 'finance', '/finance/review': 'finance', '/finance/freelancers': 'finance', '/finance/cards': 'finance', '/admin/payroll': 'finance', '/report': 'finance', '/loans': 'finance',
  '/jiip': 'finance',
  '/db/pricing-standards': 'data', '/db/lotte': 'data',
  '/admin/code-master': 'admin',
  '/fleet/factory-mgmt': 'ops',
}

// 메뉴명 오버라이드
const NAME_OVERRIDES: Record<string, string> = {
  '/cars': '차량 관리',
  '/registration': '차량 등록증',
  '/insurance': '보험/가입',
  '/fleet/vehicle-lookup': '거래처 차량조회',
  '/admin/code-master': '기초코드 관리',
  '/fleet/factory-mgmt': '공장/협력업체 관리',
  '/finance/upload': '카드/통장 관리',
  '/finance/settlement': '정산/계약 관리',
  '/finance/fleet': '차량 수익',
  '/finance/tax': '세금 관리',
  '/admin/payroll': '급여 관리',
  '/quotes': '견적 관리',
  '/quotes/pricing': '견적 작성',
  '/quotes/short-term': '단기 견적',
  '/operations/intake': '접수/오더',
  '/rental': '대차관리',
  '/claims/accident-mgmt': '사고관리',
  '/claims/billing-mgmt': '청구관리',
  '/claims/intake': '사고 접수',
  '/claims/investigation': '사고 조사',
  '/claims/assessment': '손해 사정',
  '/claims/billing': '보험 청구',
  '/claims/rental': '대차 관리',
}

// 숨길 메뉴 경로 (FMI 단일회사 — 불필요한 플랫폼/구독 메뉴 제거)
const HIDDEN_PATHS = new Set([
  '/finance/review', '/finance/freelancers', '/admin/freelancers',
  '/jiip', '/invest', '/quotes/pricing', '/quotes/short-term',
  '/accidents', '/rental', '/claims/intake', '/claims/investigation',
  '/claims/assessment', '/claims/billing', '/claims/rental',
  // ★ FMI 단일회사 — 플랫폼 관리 메뉴 숨김
  '/system-admin',           // 모듈 구독관리
  '/admin/developer',        // 개발자 도구
  '/admin/contracts',        // 회사/가입 관리 (플랫폼)
])

// 비즈니스 그룹 (표시 순서)
const BUSINESS_GROUPS = [
  { id: 'vehicle', label: '차량' },
  { id: 'claims', label: '사고/보상' },
  { id: 'ops', label: '차량운영' },
  { id: 'sales', label: '영업' },
  { id: 'finance', label: '재무' },
  { id: 'data', label: '데이터 관리' },
]

// 직장인필수 메뉴 (모든 로그인 사용자에게 표시)
const WORK_ESSENTIALS_MENUS = [
  { name: '내 정보', path: '/work-essentials/my-info', iconKey: 'Users' },
  { name: '영수증제출', path: '/work-essentials/receipts', iconKey: 'Clipboard' },
]

// admin 전용 설정 메뉴
const SETTINGS_MENUS_BASE = [
  { name: '조직/권한 관리', path: '/admin/employees', iconKey: 'Users' },
  { name: '계약 약관 관리', path: '/admin/contract-terms', iconKey: 'Doc' },
  { name: '메시지 센터', path: '/admin/message-templates', iconKey: 'Clipboard' },
]
const COMPANY_INFO_MENU = { name: '회사 정보', path: '/db/codes', iconKey: 'Setting' }

// ============================================
// 메뉴 아이템 렌더링 헬퍼
// ============================================
function MenuItem({ item, pathname, accent, allPaths }: { item: { name: string; path: string; iconKey: string }; pathname: string; accent?: boolean; allPaths?: string[] }) {
  const Icon = Icons[item.iconKey] || Icons.Doc
  // "longest match wins" — 더 긴 경로의 메뉴가 있으면 상위 경로는 비활성
  const hasMoreSpecificMatch = allPaths?.some(p => p !== item.path && p.length > item.path.length && pathname.startsWith(p) && p.startsWith(item.path))
  const isActive = pathname === item.path ||
    (!hasMoreSpecificMatch && pathname.startsWith(item.path + '/'))

  return (
    <Link
      href={item.path}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px] font-medium ${
        isActive
          ? accent
            ? 'bg-sky-600/20 text-sky-200'
            : 'bg-steel-600 text-white shadow-sm shadow-steel-900/30'
          : accent
            ? 'text-sky-300/60 hover:bg-sky-900/10 hover:text-sky-200'
            : 'text-steel-300 hover:bg-steel-800 hover:text-white'
      }`}
    >
      <Icon />
      <span>{item.name}</span>
    </Link>
  )
}

// ============================================
// ClientLayout
// ============================================
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <UploadProvider>
      <ClientLayoutInner>{children}</ClientLayoutInner>
    </UploadProvider>
  )
}

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, role, position, permissions, loading, menuRefreshKey } = useApp()
  const { hasPageAccess } = usePermission()

  const [dynamicMenus, setDynamicMenus] = useState<any[]>([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // 데스크톱에서는 사이드바 기본 열림
  useEffect(() => {
    const isDesktop = window.innerWidth >= 1024
    setIsSidebarOpen(isDesktop)
  }, [])

  // ★ 앱 셸 활성화 시 body에 클래스 추가 (로그인 페이지 제외)
  const isGuestPage = pathname.startsWith('/sign')
  const isAuthPage = pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/public') || pathname.startsWith('/invite') || isGuestPage
  useEffect(() => {
    if (!isAuthPage) {
      document.body.classList.add('app-shell')
    }
    return () => {
      document.body.classList.remove('app-shell')
    }
  }, [isAuthPage])

  // 모바일에서 메뉴 클릭 시 사이드바 닫기
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false)
    }
  }, [pathname])

  // ★ 메뉴 로드 (단일회사 — system_modules 직접 + 직원별 권한 필터)
  useEffect(() => {
    const fetchMenus = async () => {
      // system_modules에서 전체 모듈 로드
      const { data, error } = await supabase
        .from('system_modules')
        .select('*')
        .order('path')

      if (!error && data) {
        const seen = new Set<string>()
        const allMenus = data
          .filter((item: any) => {
            if (seen.has(item.path)) return false
            if (HIDDEN_PATHS.has(item.path)) return false
            seen.add(item.path)
            return true
          })
          .map((item: any) => ({
            id: item.id,
            name: NAME_OVERRIDES[item.path] || item.name,
            path: item.path,
            iconKey: item.icon_key,
          }))

        // admin → 전체 메뉴, user → 권한 있는 메뉴만
        setDynamicMenus(
          role === 'admin'
            ? allMenus
            : allMenus.filter((m: any) => hasPageAccess(m.path))
        )
      }
    }
    if (!loading) {
      fetchMenus()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, role, menuRefreshKey])

  // 로그아웃 상태 → 로그인 페이지로 즉시 이동 (useEffect로 감싸서 렌더링 중 setState 방지)
  useEffect(() => {
    if (!loading && !user && pathname !== '/' && !pathname.startsWith('/auth') && !pathname.startsWith('/public') && !pathname.startsWith('/invite') && !pathname.startsWith('/sign')) {
      router.replace('/')
    }
  }, [loading, user, pathname, router])

  // 로그인/인증 페이지 제외
  if (isAuthPage) return <>{children}</>

  // 로딩 중 → 깔끔한 스플래시 (빈 레이아웃 깨짐 방지)
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50" style={{ height: '100dvh' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-steel-300 border-t-steel-600 rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-steel-400 font-medium">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 로그아웃 상태 → 빈 화면 (useEffect에서 리디렉트 처리)
  if (!user) {
    return null
  }

  // 비즈니스 그룹별 메뉴 빌드
  const businessGroups = BUSINESS_GROUPS
    .map(group => ({
      ...group,
      items: dynamicMenus
        .filter(m => PATH_TO_GROUP[m.path] === group.id)
        .map(m => ({ name: m.name, path: m.path, iconKey: m.iconKey })),
    }))
    .filter(g => g.items.length > 0)

  // 모든 메뉴 경로 (longest match 계산용)
  const allMenuPaths = dynamicMenus.map(m => m.path)

  const showSettings = role === 'admin'

  return (
    <div className="print:!h-auto print:!overflow-visible print:!block" style={{ display: 'flex', height: '100dvh', background: '#f9fafb', overflowX: 'hidden', overflowY: 'hidden' }}>
      {/* 모바일 상단 고정 바 — 햄버거 + 업체선택 */}
      {!isSidebarOpen && (
        <div className="fixed top-0 left-0 right-0 z-30 lg:hidden bg-steel-900/95 backdrop-blur-sm border-b border-steel-700/50 safe-top">
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
            {/* 햄버거 */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="text-white p-1.5 rounded-lg hover:bg-steel-800 transition-colors flex-shrink-0"
            >
              <Icons.Menu />
            </button>

            {/* 로고 */}
            <span className="text-sm font-bold text-white tracking-tight flex-shrink-0">FMI ERP</span>

            {/* FMI 단일회사 표시 */}
            <span className="ml-auto text-xs text-sky-300 font-medium truncate">주식회사 에프엠아이</span>
          </div>
        </div>
      )}

      {/* 모바일 오버레이 (사이드바 열릴 때) */}
      <div
        className={`sidebar-overlay lg:hidden ${isSidebarOpen ? 'active' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* 사이드바 */}
      <aside className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-60 bg-steel-900 text-white transition-transform duration-300 overflow-hidden flex flex-col fixed h-full z-20 lg:translate-x-0`}>
        <div className="w-60 flex flex-col h-full">

          {/* 로고 */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-steel-800">
            <span className="text-lg font-black text-white tracking-tight cursor-pointer" onClick={() => router.push('/dashboard')}>
              FMI ERP
            </span>
            <button onClick={() => setIsSidebarOpen(false)} className="text-steel-400 hover:text-white lg:hidden">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* 워크스페이스 */}
          <div className="px-3 py-3">
            <div className="bg-steel-800/50 rounded-lg px-3 py-3 border border-steel-700/30">
              {/* 회사명 + 플랜 뱃지 */}
              <div className="flex items-center justify-between gap-2">
                <div className="text-white font-bold text-sm truncate">주식회사 에프엠아이</div>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-sky-600 text-white flex-shrink-0">FMI</span>
              </div>
              {/* 역할 + 직급 */}
              <div className="mt-2 flex gap-1 flex-wrap">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  role === 'admin' ? 'bg-blue-900/80 text-blue-300' :
                  'bg-steel-800 text-steel-300'
                }`}>
                  {role === 'admin' ? '관리자' : '직원'}
                </span>
                {position && (
                  <span className="text-[9px] bg-green-900/80 text-green-300 px-1.5 py-0.5 rounded font-bold">
                    {position.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* FMI 단일회사 */}

          {/* 메뉴 영역 */}
          <nav className="flex-1 px-3 pb-4 overflow-y-auto">

            {/* 대시보드 */}
            <div className="mb-4">
              <Link
                href="/dashboard"
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px] font-medium ${
                  pathname === '/dashboard'
                    ? 'bg-steel-600 text-white shadow-sm shadow-steel-900/30'
                    : 'text-steel-300 hover:bg-steel-800 hover:text-white'
                }`}
              >
                <Icons.Home />
                대시보드
              </Link>
            </div>

            {/* 비즈니스 메뉴 그룹 */}
            {businessGroups.map(group => (
              <div key={group.id} className="mb-3">
                <div className="px-3 mb-1">
                  <span className="text-[10px] font-bold text-steel-400 uppercase tracking-wider">{group.label}</span>
                </div>
                <div className="space-y-0.5">
                  {group.items.map(item => (
                    <MenuItem key={item.path} item={item} pathname={pathname} allPaths={allMenuPaths} />
                  ))}
                </div>
              </div>
            ))}

            {/* 직장인필수 */}
            <div className="mb-3">
              <div className="px-3 mb-1">
                <span className="text-[10px] font-bold text-steel-400 uppercase tracking-wider">직장인필수</span>
              </div>
              <div className="space-y-0.5">
                {WORK_ESSENTIALS_MENUS.map(item => (
                  <MenuItem key={item.path} item={item} pathname={pathname} allPaths={allMenuPaths} />
                ))}
              </div>
            </div>

            {/* 구분선 + 관리 영역 */}
            {showSettings && (
              <div className="border-t border-steel-800 mt-3 pt-3">
                <div className="mb-3">
                  <div className="px-3 mb-1">
                    <span className="text-[10px] font-bold text-steel-400 uppercase tracking-wider">설정</span>
                  </div>
                  <div className="space-y-0.5">
                    <MenuItem item={COMPANY_INFO_MENU} pathname={pathname} allPaths={allMenuPaths} />
                    {SETTINGS_MENUS_BASE.map(item => (
                      <MenuItem key={item.path} item={item} pathname={pathname} allPaths={allMenuPaths} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </nav>

          {/* 유저 정보 */}
          <div className="p-3 border-t border-steel-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-steel-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="overflow-hidden flex-1 min-w-0">
                <p className="text-xs font-medium truncate text-steel-300">{user?.email}</p>
                <button
                  onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
                  className="text-[10px] text-steel-400 hover:text-red-400 transition-colors"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>

        </div>
      </aside>

      {/* 메인 콘텐츠 — 앱 셸: 내부 스크롤 */}
      <main
        className="flex-1 transition-all duration-300 print:!ml-0 print:!h-auto print:!overflow-visible print:!block"
        style={{
          height: '100dvh',
          overflow: 'hidden',
          width: isSidebarOpen ? 'calc(100% - 240px)' : '100%',
          minWidth: 0,
          marginLeft: isSidebarOpen ? 240 : 0,
        }}
      >
        <div
          className="print:!pt-0 print:!h-auto print:!overflow-visible print:!block"
          style={{
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            overscrollBehavior: 'none',
            maxWidth: '100%',
            paddingTop: isSidebarOpen ? 0 : 48,
            paddingBottom: 24,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <PageTitle />
          {children}
        </div>
      </main>

      {/* 플로팅 업로드 진행률 위젯 */}
      <UploadProgressWidget />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 플로팅 업로드 진행률 위젯 (페이지 이동 시에도 유지)
// ═══════════════════════════════════════════════════════════════
function UploadProgressWidget() {
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [pos, setPos] = useState({ x: 210, y: -1 }) // y=-1 → bottom 기반 초기 위치
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const widgetRef = useRef<HTMLDivElement>(null)

  let uploadContext: ReturnType<typeof useUpload> | null = null
  try { uploadContext = useUpload() } catch { return null }
  if (!uploadContext) return null

  const { status, progress, currentFileIndex, totalFiles, currentFileName, logs } = uploadContext

  if (pathname === '/finance/upload') return null

  const hasResults = uploadContext.results && uploadContext.results.length > 0
  const totalResultCount = hasResults ? uploadContext.results.length : 0
  const isProcessing = status === 'processing' || status === 'paused'

  if (!isProcessing && !hasResults) return null
  if (pathname === '/finance/review' || pathname === '/finance/upload') return null
  if (dismissed && !isProcessing) return null

  // 드래그 핸들러
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    const rect = widgetRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy })
    }
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // 초기 위치 설정 (bottom: 24 → top 좌표로 변환)
  const posStyle = pos.y === -1
    ? { position: 'fixed' as const, bottom: 24, left: pos.x, zIndex: 9999 }
    : { position: 'fixed' as const, top: pos.y, left: pos.x, zIndex: 9999 }

  // 최소화 상태
  if (minimized) {
    return (
      <div ref={widgetRef} style={{ ...posStyle, cursor: 'default' }}>
        <div
          onMouseDown={onDragStart}
          onClick={() => setMinimized(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: isProcessing ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'linear-gradient(135deg, #d97706, #f59e0b)',
            padding: '8px 14px', borderRadius: 24, cursor: 'grab',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)', color: '#fff', userSelect: 'none',
          }}
        >
          {isProcessing ? (
            <>
              <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{progress}%</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 13 }}>📋</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{totalResultCount}건 대기</span>
            </>
          )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div ref={widgetRef} style={{
      ...posStyle, width: 300, borderRadius: 14, overflow: 'hidden',
      background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)',
    }}>
      {/* 헤더 (드래그 핸들) */}
      <div
        onMouseDown={onDragStart}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px',
          background: isProcessing ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'linear-gradient(135deg, #d97706, #f59e0b)',
          cursor: 'grab', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isProcessing ? (
            <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          ) : (
            <span style={{ fontSize: 14 }}>📋</span>
          )}
          <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>
            {isProcessing ? (status === 'processing' ? '파일 분석 중' : '일시정지') : '분류 확정 대기'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {isProcessing && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 10, marginRight: 4 }}>
              {totalFiles > 0 ? `${currentFileIndex + 1}/${totalFiles}` : `${progress}%`}
            </span>
          )}
          {!isProcessing && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', padding: '2px 8px', borderRadius: 10, marginRight: 4 }}>
              {totalResultCount}건
            </span>
          )}
          <button onClick={(e) => { e.stopPropagation(); setMinimized(true) }}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '2px 6px', color: '#fff', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center' }}
            title="최소화">
            ─
          </button>
          {!isProcessing && (
            <button onClick={(e) => { e.stopPropagation(); setDismissed(true) }}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '2px 6px', color: '#fff', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center' }}
              title="닫기">
              ×
            </button>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div style={{ padding: '12px 14px' }}>
        {isProcessing && (
          <>
            <div style={{ background: '#f1f5f9', borderRadius: 6, height: 5, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, #1e40af, #60a5fa)', borderRadius: 6, transition: 'width 0.5s', width: `${progress}%` }} />
            </div>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {logs || currentFileName || '처리 중...'}
            </p>
          </>
        )}
        {!isProcessing && hasResults && (
          <a href="/finance/upload" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, color: '#475569', margin: 0, lineHeight: 1.5 }}>
                분류 완료된 <strong style={{ color: '#d97706' }}>{totalResultCount}건</strong>이 확정을 기다리고 있습니다
              </p>
            </div>
            <div style={{ flexShrink: 0, background: '#f59e0b', color: '#fff', fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 8 }}>
              확인 →
            </div>
          </a>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
