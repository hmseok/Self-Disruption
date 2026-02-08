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
}

// ============================================
// 메뉴 설정
// ============================================

// 동적 메뉴 → 그룹 매핑
const PATH_TO_GROUP: Record<string, string> = {
  '/cars': 'vehicle', '/insurance': 'vehicle', '/registration': 'vehicle',
  '/quotes': 'sales', '/customers': 'sales',
  '/finance': 'finance', '/loans': 'finance',
  '/invest': 'invest', '/jiip': 'invest',
  '/db/models': 'data', '/db/maintenance': 'data', '/db/codes': 'data',
  '/db/depreciation': 'data', '/db/lotte': 'data',
}

// 메뉴명 오버라이드
const NAME_OVERRIDES: Record<string, string> = {
  '/invest': '일반투자',
  '/jiip': '지입투자',
  '/db/models': '차량 시세 DB',
  '/db/maintenance': '정비/부품 DB',
  '/db/codes': '차량 코드 DB',
  '/db/depreciation': '잔가율 DB',
  '/db/lotte': '롯데렌터카 DB',
}

// 비즈니스 그룹 (표시 순서)
const BUSINESS_GROUPS = [
  { id: 'vehicle', label: '차량' },
  { id: 'sales', label: '영업' },
  { id: 'finance', label: '재무' },
  { id: 'invest', label: '투자' },
  { id: 'data', label: '데이터' },
]

// god_admin 전용: 플랫폼 관리
const PLATFORM_MENUS = [
  { name: '회사/가입 관리', path: '/admin', iconKey: 'Admin' },
  { name: '구독 관리', path: '/system-admin', iconKey: 'Setting' },
  { name: '차종 코드', path: '/admin/model', iconKey: 'Car' },
  { name: '공통 코드', path: '/admin/codes', iconKey: 'Database' },
]

// god_admin + master: 설정
const SETTINGS_MENUS = [
  { name: '조직 관리', path: '/admin/employees', iconKey: 'Users' },
  { name: '권한 설정', path: '/admin/permissions', iconKey: 'Admin' },
]

// ============================================
// 메뉴 아이템 렌더링 헬퍼
// ============================================
function MenuItem({ item, pathname, purple }: { item: { name: string; path: string; iconKey: string }; pathname: string; purple?: boolean }) {
  const Icon = Icons[item.iconKey] || Icons.Doc
  const isActive = pathname === item.path ||
    (item.path !== '/admin' && pathname.startsWith(item.path + '/')) ||
    (item.path === '/admin' && pathname === '/admin')

  return (
    <Link
      href={item.path}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px] font-medium ${
        isActive
          ? purple
            ? 'bg-purple-600/20 text-purple-200'
            : 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/30'
          : purple
            ? 'text-purple-300/60 hover:bg-purple-900/10 hover:text-purple-200'
            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
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
  const { user, company, role, position, loading } = useApp()
  const { hasPageAccess } = usePermission()

  const [dynamicMenus, setDynamicMenus] = useState<any[]>([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  // 동적 메뉴 로드
  useEffect(() => {
    const fetchMenus = async () => {
      if (role === 'god_admin') {
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
    if (!loading && (company || role === 'god_admin')) fetchMenus()
  }, [company, loading, role])

  // 로그인/인증 페이지 제외
  if (pathname === '/' || pathname.startsWith('/auth')) return <>{children}</>

  // 비즈니스 그룹별 메뉴 빌드
  const businessGroups = BUSINESS_GROUPS
    .map(group => ({
      ...group,
      items: dynamicMenus
        .filter(m => PATH_TO_GROUP[m.path] === group.id)
        .map(m => ({ name: m.name, path: m.path, iconKey: m.iconKey })),
    }))
    .filter(g => g.items.length > 0)

  const showPlatform = role === 'god_admin'
  const showSettings = role === 'god_admin' || role === 'master'

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 모바일 토글 */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed top-4 left-4 z-30 lg:hidden bg-gray-900 text-white p-2 rounded-lg shadow-lg"
      >
        <Icons.Menu />
      </button>

      {/* 사이드바 */}
      <aside className={`${isSidebarOpen ? 'w-60' : 'w-0 -translate-x-full lg:translate-x-0 lg:w-0'} bg-gray-900 text-white transition-all duration-300 overflow-hidden flex flex-col fixed h-full z-20`}>
        <div className="w-60 flex flex-col h-full">

          {/* 로고 */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-800">
            <span className="text-lg font-black text-white tracking-tight cursor-pointer" onClick={() => router.push('/dashboard')}>
              Sideline
            </span>
            <button onClick={() => setIsSidebarOpen(false)} className="text-gray-500 hover:text-white lg:hidden">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* 워크스페이스 */}
          <div className="px-3 py-3">
            <div className="bg-gray-800/60 rounded-lg px-3 py-3 border border-gray-700/40">
              {/* 회사명 + 플랜 뱃지 */}
              <div className="flex items-center justify-between gap-2">
                <div className="text-white font-bold text-sm truncate">
                  {role === 'god_admin' ? 'Platform Admin' : (company?.name || '회사 미배정')}
                </div>
                {role !== 'god_admin' && company?.plan && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0 ${
                    company.plan === 'master' ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white' :
                    company.plan === 'pro' ? 'bg-blue-500 text-white' :
                    'bg-gray-600 text-gray-300'
                  }`}>
                    {company.plan === 'master' ? 'MASTER' : company.plan === 'pro' ? 'PRO' : 'FREE'}
                  </span>
                )}
                {role === 'god_admin' && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-600 text-white flex-shrink-0">
                    ADMIN
                  </span>
                )}
              </div>
              {/* 역할 + 직급 */}
              <div className="mt-2 flex gap-1 flex-wrap">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  role === 'god_admin' ? 'bg-purple-900/80 text-purple-300' :
                  role === 'master' ? 'bg-blue-900/80 text-blue-300' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {role === 'god_admin' ? 'GOD ADMIN' : role === 'master' ? '관리자' : '직원'}
                </span>
                {position && (
                  <span className="text-[9px] bg-green-900/80 text-green-300 px-1.5 py-0.5 rounded font-bold">
                    {position.name}
                  </span>
                )}
              </div>
              {/* 회사 미배정 안내 */}
              {!company && role !== 'god_admin' && !loading && (
                <p className="mt-2 text-[10px] text-yellow-400">관리자에게 회사 배정을 요청하세요</p>
              )}
            </div>
          </div>

          {/* 메뉴 영역 */}
          <nav className="flex-1 px-3 overflow-y-auto">

            {/* 대시보드 */}
            <div className="mb-4">
              <Link
                href="/dashboard"
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px] font-medium ${
                  pathname === '/dashboard'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/30'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
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
                  <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">{group.label}</span>
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
              <div className="border-t border-gray-800 mt-3 pt-3">

                {/* 플랫폼 관리 (god_admin) */}
                {showPlatform && (
                  <div className="mb-3">
                    <div className="px-3 mb-1">
                      <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">플랫폼</span>
                    </div>
                    <div className="space-y-0.5">
                      {PLATFORM_MENUS.map(item => (
                        <MenuItem key={item.path} item={item} pathname={pathname} purple />
                      ))}
                    </div>
                  </div>
                )}

                {/* 설정 (god_admin + master) */}
                {showSettings && (
                  <div className="mb-3">
                    <div className="px-3 mb-1">
                      <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">설정</span>
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
          <div className="p-3 border-t border-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="overflow-hidden flex-1 min-w-0">
                <p className="text-xs font-medium truncate text-gray-300">{user?.email}</p>
                <button
                  onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
                  className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>

        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-60' : 'ml-0'}`}>
        <div className="min-h-screen">
          {children}
        </div>
      </main>
    </div>
  )
}
