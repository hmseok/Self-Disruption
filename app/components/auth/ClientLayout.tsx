'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { usePermission } from '../../hooks/usePermission'

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
  '/cars': 'vehicle', '/insurance': 'vehicle', '/registration': 'vehicle',
  '/operations': 'ops', '/maintenance': 'ops', '/accidents': 'ops',
  '/quotes': 'sales', '/quotes/pricing': 'sales', '/quotes/short-term': 'sales', '/customers': 'sales',
  '/finance': 'finance', '/finance/collections': 'finance', '/finance/settlement': 'finance', '/finance/upload': 'finance', '/finance/review': 'finance', '/finance/freelancers': 'finance', '/finance/cards': 'finance', '/admin/payroll': 'finance', '/report': 'finance', '/loans': 'finance',
  '/invest': 'invest', '/jiip': 'invest',
  '/db/pricing-standards': 'data', '/db/lotte': 'data',
}

// 메뉴명 오버라이드
const NAME_OVERRIDES: Record<string, string> = {
  '/invest': '일반투자',
  '/jiip': '지입투자',
  '/insurance': '보험/가입',
}

// 비즈니스 그룹 (표시 순서)
const BUSINESS_GROUPS = [
  { id: 'vehicle', label: '차량' },
  { id: 'ops', label: '차량운영' },
  { id: 'sales', label: '영업' },
  { id: 'finance', label: '재무' },
  { id: 'invest', label: '투자' },
  { id: 'data', label: '데이터 관리' },
]

// god_admin 전용: 플랫폼 관리
const PLATFORM_MENUS = [
  { name: '회사/가입 관리', path: '/admin', iconKey: 'Admin' },
  { name: '구독 관리', path: '/system-admin', iconKey: 'Setting' },
  { name: '개발자 모드', path: '/admin/developer', iconKey: 'Database' },
]

// god_admin + master: 설정
const SETTINGS_MENUS = [
  { name: '조직/권한 관리', path: '/admin/employees', iconKey: 'Users' },
  { name: '계약 약관 관리', path: '/admin/contract-terms', iconKey: 'Doc' },
  { name: '메시지 센터', path: '/admin/message-templates', iconKey: 'Clipboard' },
]

// ============================================
// 메뉴 아이템 렌더링 헬퍼
// ============================================
function MenuItem({ item, pathname, accent }: { item: { name: string; path: string; iconKey: string }; pathname: string; accent?: boolean }) {
  const Icon = Icons[item.iconKey] || Icons.Doc
  // 하위 경로가 별도 메뉴로 존재하는 상위 경로는 정확 매칭만 적용
  const exactMatchOnly = ['/admin', '/quotes', '/finance']
  const isActive = pathname === item.path ||
    (!exactMatchOnly.includes(item.path) && pathname.startsWith(item.path + '/'))

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
  const router = useRouter()
  const pathname = usePathname()
  const { user, company, role, position, permissions, loading, allCompanies, adminSelectedCompanyId, setAdminSelectedCompanyId, menuRefreshKey } = useApp()
  const { hasPageAccess } = usePermission()

  const [dynamicMenus, setDynamicMenus] = useState<any[]>([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // 데스크톱에서는 사이드바 기본 열림
  useEffect(() => {
    const isDesktop = window.innerWidth >= 1024
    setIsSidebarOpen(isDesktop)
  }, [])

  // ★ 앱 셸 활성화 시 body에 클래스 추가 (로그인 페이지 제외)
  const isGuestPage = pathname.endsWith('/sign')
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

  // 동적 메뉴 로드
  useEffect(() => {
    const fetchMenus = async () => {
      if (role === 'god_admin') {
        if (adminSelectedCompanyId) {
          // god_admin이 특정 회사 선택 → 해당 회사의 활성 모듈만 표시
          const { data, error } = await supabase
            .from('company_modules')
            .select(`is_active, module:system_modules ( id, name, path, icon_key )`)
            .eq('company_id', adminSelectedCompanyId)
            .eq('is_active', true)

          if (!error && data) {
            const seen = new Set<string>()
            setDynamicMenus(
              data
                .filter((item: any) => {
                  if (seen.has(item.module.path)) return false
                  seen.add(item.module.path)
                  return true
                })
                .map((item: any) => ({
                  id: item.module.id,
                  name: NAME_OVERRIDES[item.module.path] || item.module.name,
                  path: item.module.path,
                  iconKey: item.module.icon_key,
                }))
            )
          }
        } else {
          // god_admin 전체 보기 → 모든 모듈 표시
          const { data, error } = await supabase
            .from('system_modules').select('*').order('path')
          if (!error && data) {
            const seen = new Set<string>()
            const unique = data.filter((item: any) => {
              if (seen.has(item.path)) return false
              seen.add(item.path)
              return true
            })
            setDynamicMenus(unique.map((item: any) => ({
              id: item.id,
              name: NAME_OVERRIDES[item.path] || item.name,
              path: item.path,
              iconKey: item.icon_key,
            })))
          }
        }
        return
      }

      if (!company) return
      const { data, error } = await supabase
        .from('company_modules')
        .select(`is_active, module:system_modules ( id, name, path, icon_key )`)
        .eq('company_id', company.id)
        .eq('is_active', true)

      if (!error && data) {
        const seen = new Set<string>()
        const allMenus = data
          .filter((item: any) => {
            if (seen.has(item.module.path)) return false
            seen.add(item.module.path)
            return true
          })
          .map((item: any) => ({
            id: item.module.id,
            name: NAME_OVERRIDES[item.module.path] || item.module.name,
            path: item.module.path,
            iconKey: item.module.icon_key,
          }))
        setDynamicMenus(
          allMenus.filter((m: any) => role === 'master' || hasPageAccess(m.path))
        )
      }
    }
    if (!loading && (company || role === 'god_admin')) {
      // 승인 대기 중인 회사는 메뉴 로드하지 않음
      if (company && company.is_active === false && role !== 'god_admin') {
        setDynamicMenus([])
        return
      }
      fetchMenus()
    }
  }, [company, loading, role, adminSelectedCompanyId, menuRefreshKey, permissions])

  // 로그아웃 상태 → 로그인 페이지로 즉시 이동 (useEffect로 감싸서 렌더링 중 setState 방지)
  useEffect(() => {
    if (!loading && !user && pathname !== '/' && !pathname.startsWith('/auth') && !pathname.startsWith('/public') && !pathname.startsWith('/invite') && !pathname.endsWith('/sign')) {
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

  const isPendingApproval = company && company.is_active === false && role !== 'god_admin'
  const showPlatform = role === 'god_admin'
  const showSettings = !isPendingApproval && (role === 'god_admin' || role === 'master')

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden print:!h-auto print:!overflow-visible print:!block" style={{ height: '100dvh' }}>
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
            <span className="text-sm font-bold text-white tracking-tight flex-shrink-0">Self-Disruption</span>

            {/* god_admin 업체 선택 */}
            {role === 'god_admin' && allCompanies.length > 0 && (
              <select
                value={adminSelectedCompanyId || ''}
                onChange={(e) => setAdminSelectedCompanyId(e.target.value || null)}
                className="ml-auto flex-1 min-w-0 max-w-48 bg-steel-800/80 text-white text-xs font-medium rounded-md px-2 py-1.5 border border-steel-800 focus:outline-none focus:border-sky-500 cursor-pointer truncate"
              >
                <option value="">전체 보기</option>
                {allCompanies.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}

            {/* 일반 사용자: 회사명 표시 */}
            {role !== 'god_admin' && company?.name && (
              <span className="ml-auto text-xs text-steel-300 truncate">{company.name}</span>
            )}
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
              Self-Disruption
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
                <div className="text-white font-bold text-sm truncate">
                  {company?.is_platform ? 'Platform Admin' : (company?.name || '회사 미배정')}
                </div>
                {!company?.is_platform && company?.plan && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0 ${
                    company.plan === 'max' ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white' :
                    company.plan === 'pro' ? 'bg-blue-500 text-white' :
                    company.plan === 'basic' ? 'bg-green-500 text-white' :
                    'bg-steel-700 text-steel-200'
                  }`}>
                    {company.plan === 'max' ? 'MAX' : company.plan === 'pro' ? 'PRO' : company.plan === 'basic' ? 'BASIC' : 'FREE'}
                  </span>
                )}
                {company?.is_platform && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-sky-600 text-white flex-shrink-0">
                    ADMIN
                  </span>
                )}
              </div>
              {/* 역할 + 직급 */}
              <div className="mt-2 flex gap-1 flex-wrap">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  role === 'god_admin' ? 'bg-sky-900/80 text-sky-300' :
                  role === 'master' ? 'bg-blue-900/80 text-blue-300' :
                  'bg-steel-800 text-steel-300'
                }`}>
                  {role === 'god_admin' ? 'GOD ADMIN' : role === 'master' ? '관리자' : '직원'}
                </span>
                {position && (
                  <span className="text-[9px] bg-green-900/80 text-green-300 px-1.5 py-0.5 rounded font-bold">
                    {position.name}
                  </span>
                )}
              </div>
              {/* 승인 대기 상태 */}
              {company && company.is_active === false && role !== 'god_admin' && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
                  <span className="text-[10px] font-bold text-yellow-400">승인 대기중</span>
                </div>
              )}
              {/* 회사 미배정 안내 (god_admin은 플랫폼 회사가 있으므로 해당 없음) */}
              {!company && role !== 'god_admin' && !loading && (
                <p className="mt-2 text-[10px] text-yellow-400">관리자에게 회사 배정을 요청하세요</p>
              )}
            </div>
          </div>

          {/* god_admin 회사 선택 */}
          {role === 'god_admin' && allCompanies.length > 0 && (
            <div className="px-3 pb-3">
              <div className="bg-sky-900/30 rounded-lg px-3 py-2.5 border border-sky-700/30">
                <label className="text-[9px] font-bold text-sky-400 uppercase tracking-wider block mb-1.5">회사 선택</label>
                <select
                  value={adminSelectedCompanyId || ''}
                  onChange={(e) => setAdminSelectedCompanyId(e.target.value || null)}
                  className="w-full bg-steel-800 text-white text-xs font-bold rounded-md px-2 py-1.5 border border-steel-700 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="">전체 보기</option>
                  {allCompanies.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 메뉴 영역 */}
          <nav className="flex-1 px-3 overflow-y-auto">

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
                    <MenuItem key={item.path} item={item} pathname={pathname} />
                  ))}
                </div>
              </div>
            ))}

            {/* 구분선 + 관리 영역 */}
            {(showPlatform || showSettings) && (
              <div className="border-t border-steel-800 mt-3 pt-3">

                {/* 플랫폼 관리 (god_admin) */}
                {showPlatform && (
                  <div className="mb-3">
                    <div className="px-3 mb-1">
                      <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">플랫폼</span>
                    </div>
                    <div className="space-y-0.5">
                      {PLATFORM_MENUS.map(item => (
                        <MenuItem key={item.path} item={item} pathname={pathname} accent />
                      ))}
                    </div>
                  </div>
                )}

                {/* 설정 (god_admin + master) */}
                {showSettings && (
                  <div className="mb-3">
                    <div className="px-3 mb-1">
                      <span className="text-[10px] font-bold text-steel-400 uppercase tracking-wider">설정</span>
                    </div>
                    <div className="space-y-0.5">
                      {SETTINGS_MENUS.map(item => (
                        <MenuItem key={item.path} item={item} pathname={pathname} />
                      ))}
                    </div>
                  </div>
                )}
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
      <main className="flex-1 transition-all duration-300 ml-0 lg:ml-60 overflow-hidden w-full min-w-0 h-screen print:!ml-0 print:!h-auto print:!overflow-visible print:!block" style={{ height: '100dvh' }}>
        <div className="h-full pt-12 lg:pt-0 overflow-y-auto overflow-x-hidden overscroll-none max-w-full print:!pt-0 print:!h-auto print:!overflow-visible print:!block">
          {children}
        </div>
      </main>
    </div>
  )
}
