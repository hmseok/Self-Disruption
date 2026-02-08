'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { usePermission } from '../../hooks/usePermission'

// ============================================
// 아이콘 컴포넌트
// ============================================
const Icons: any = {
  Menu: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  ChevronDown: () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>,
  ChevronRight: () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>,
  Truck: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
  Doc: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Car: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10H8s-1.5-.1-3.5 1.5S2 15 2 15v1c0 .6.4 1 1 1h1" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 17a2 2 0 104 0 2 2 0 00-4 0zM14 17a2 2 0 104 0 2 2 0 00-4 0z" /></svg>,
  Setting: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Admin: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>,
  Users: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  Shield: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Database: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>,
  Money: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Clipboard: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  Building: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
}

// ============================================
// 메뉴 그룹 설정
// ============================================

// 동적 메뉴(system_modules)의 경로 → 그룹 매핑
const PATH_TO_GROUP: Record<string, string> = {
  '/cars': 'vehicle',
  '/insurance': 'vehicle',
  '/registration': 'vehicle',
  '/quotes': 'sales',
  '/customers': 'sales',
  '/finance': 'finance',
  '/loans': 'finance',
  '/invest': 'invest',
  '/jiip': 'invest',
}

// 그룹별 메뉴명 오버라이드 (system_modules 이름 대신 사용)
const NAME_OVERRIDES: Record<string, string> = {
  '/invest': '일반투자',
  '/jiip': '지입투자',
}

// 그룹 정의 (표시 순서)
interface MenuGroup {
  id: string
  label: string
  iconKey: string
  labelColor?: string
  borderColor?: string
}

const MENU_GROUP_ORDER: MenuGroup[] = [
  { id: 'platform', label: '플랫폼 관리', iconKey: 'Shield', labelColor: 'text-purple-400', borderColor: 'border-purple-500/20' },
  { id: 'company', label: '회사 관리', iconKey: 'Building', labelColor: 'text-blue-400', borderColor: 'border-blue-500/20' },
  { id: 'vehicle', label: '차량 운영', iconKey: 'Car', labelColor: 'text-gray-500', borderColor: 'border-gray-700' },
  { id: 'sales', label: '영업/계약', iconKey: 'Clipboard', labelColor: 'text-gray-500', borderColor: 'border-gray-700' },
  { id: 'finance', label: '재무/금융', iconKey: 'Money', labelColor: 'text-gray-500', borderColor: 'border-gray-700' },
  { id: 'invest', label: '지입/투자', iconKey: 'Truck', labelColor: 'text-gray-500', borderColor: 'border-gray-700' },
]

// god_admin 전용 정적 메뉴
const PLATFORM_MENUS = [
  { name: '회사/가입 관리', path: '/admin', iconKey: 'Admin' },
  { name: '모듈 구독관리', path: '/system-admin', iconKey: 'Setting' },
  { name: '차종 코드관리', path: '/admin/model', iconKey: 'Car' },
  { name: '공통 코드관리', path: '/admin/codes', iconKey: 'Database' },
]

// god_admin + master 정적 메뉴
const COMPANY_MENUS = [
  { name: '직원 관리', path: '/admin/employees', iconKey: 'Users' },
  { name: '권한 설정', path: '/admin/permissions', iconKey: 'Admin' },
]

// ============================================
// ClientLayout 컴포넌트
// ============================================
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, company, role, position, loading } = useApp()
  const { hasPageAccess } = usePermission()

  const [dynamicMenus, setDynamicMenus] = useState<any[]>([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  // 동적 메뉴 로드 (system_modules / company_modules)
  useEffect(() => {
    const fetchMenus = async () => {
      if (role === 'god_admin') {
        const { data, error } = await supabase
          .from('system_modules')
          .select('*')
          .order('path')

        if (!error && data) {
          setDynamicMenus(data.map((item: any) => ({
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
        const allMenus = data.map((item: any) => ({
          id: item.module.id,
          name: NAME_OVERRIDES[item.module.path] || item.module.name,
          path: item.module.path,
          iconKey: item.module.icon_key,
        }))

        const filteredMenus = allMenus.filter((menu: any) =>
          role === 'master' || hasPageAccess(menu.path)
        )
        setDynamicMenus(filteredMenus)
      }
    }

    if (!loading && (company || role === 'god_admin')) {
      fetchMenus()
    }
  }, [company, loading, role])

  // 그룹 접기/펼치기
  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  // 로그인/인증 페이지는 사이드바 제외
  if (pathname === '/' || pathname.startsWith('/auth')) return <>{children}</>

  // 그룹별로 메뉴 아이템 빌드
  const buildGroupedMenus = () => {
    const groups: { group: MenuGroup; items: { name: string; path: string; iconKey: string }[] }[] = []

    for (const group of MENU_GROUP_ORDER) {
      let items: { name: string; path: string; iconKey: string }[] = []

      if (group.id === 'platform') {
        // god_admin 전용
        if (role !== 'god_admin') continue
        items = PLATFORM_MENUS
      } else if (group.id === 'company') {
        // god_admin + master
        if (role !== 'god_admin' && role !== 'master') continue
        items = COMPANY_MENUS
      } else {
        // 동적 메뉴를 그룹에 매핑
        items = dynamicMenus
          .filter(m => PATH_TO_GROUP[m.path] === group.id)
          .map(m => ({ name: m.name, path: m.path, iconKey: m.iconKey }))

        if (items.length === 0) continue
      }

      groups.push({ group, items })
    }

    return groups
  }

  const groupedMenus = buildGroupedMenus()

  // 현재 경로가 그룹 내에 있는지 확인 (그룹 자동 열기용)
  const isPathInGroup = (items: { path: string }[]) => {
    return items.some(item => pathname === item.path || pathname.startsWith(item.path + '/'))
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 사이드바 토글 버튼 */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed top-4 left-4 z-30 lg:hidden bg-gray-900 text-white p-2 rounded-lg shadow-lg"
      >
        <Icons.Menu />
      </button>

      {/* 사이드바 */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-0 -translate-x-full lg:translate-x-0 lg:w-0'} bg-gray-900 text-white transition-all duration-300 overflow-hidden flex flex-col fixed h-full z-20`}>
        <div className="w-64 flex flex-col h-full">

          {/* 로고 */}
          <div className="p-5 flex items-center justify-between border-b border-gray-800">
            <span className="text-xl font-black text-white tracking-tight cursor-pointer" onClick={() => router.push('/cars')}>
              Sideline
            </span>
            <button onClick={() => setIsSidebarOpen(false)} className="text-gray-500 hover:text-white lg:hidden">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* 워크스페이스 정보 */}
          <div className="px-3 py-4">
            <div className="bg-gray-800/80 rounded-xl p-3.5 border border-gray-700/50">
              <div className="text-gray-500 text-[10px] font-bold mb-1 tracking-wider">WORKSPACE</div>
              <div className="text-white font-bold text-sm truncate">
                {role === 'god_admin' ? 'Platform Admin' : (company?.name || '로딩 중...')}
              </div>
              <div className="mt-2 flex gap-1.5 flex-wrap">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  role === 'god_admin' ? 'bg-purple-900/80 text-purple-300' :
                  role === 'master' ? 'bg-blue-900/80 text-blue-300' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {role === 'god_admin' ? 'GOD ADMIN' : role?.toUpperCase()}
                </span>
                {position && (
                  <span className="text-[9px] bg-green-900/80 text-green-300 px-1.5 py-0.5 rounded font-bold">
                    {position.name}
                  </span>
                )}
                <span className="text-[9px] bg-blue-900/60 text-blue-300 px-1.5 py-0.5 rounded font-bold">
                  {role === 'god_admin' ? 'SYSTEM' : (company?.plan?.toUpperCase() || 'FREE')}
                </span>
              </div>
            </div>
          </div>

          {/* 메뉴 영역 */}
          <nav className="flex-1 px-3 pb-3 overflow-y-auto space-y-1">
            {groupedMenus.map(({ group, items }) => {
              const isCollapsed = collapsedGroups[group.id] && !isPathInGroup(items)
              const hasActiveItem = isPathInGroup(items)
              const isPlatformGroup = group.id === 'platform'

              return (
                <div key={group.id} className="mb-1">
                  {/* 그룹 헤더 */}
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wider ${
                      isPlatformGroup
                        ? 'text-purple-400 hover:bg-purple-900/20'
                        : group.id === 'company'
                        ? 'text-blue-400 hover:bg-blue-900/20'
                        : 'text-gray-500 hover:bg-gray-800/50'
                    }`}
                  >
                    <span>{group.label}</span>
                    <span className={`transition-transform duration-200 ${isCollapsed ? '' : 'rotate-0'}`}>
                      {isCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronDown />}
                    </span>
                  </button>

                  {/* 그룹 아이템 */}
                  {!isCollapsed && (
                    <div className="space-y-0.5 mt-0.5">
                      {items.map((item) => {
                        const Icon = Icons[item.iconKey] || Icons.Doc
                        const isActive = pathname === item.path ||
                          (item.path !== '/admin' && pathname.startsWith(item.path + '/')) ||
                          (item.path === '/admin' && pathname === '/admin')

                        return (
                          <Link
                            key={item.path}
                            href={item.path}
                            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-[13px] font-semibold ${
                              isActive
                                ? isPlatformGroup
                                  ? 'bg-purple-600/30 text-purple-200 border border-purple-500/30'
                                  : 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                                : isPlatformGroup
                                  ? 'text-purple-300/70 hover:bg-purple-900/20 hover:text-purple-200'
                                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                            }`}
                          >
                            <Icon />
                            {item.name}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* 하단 유저 정보 */}
          <div className="p-3 border-t border-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="overflow-hidden flex-1 min-w-0">
                <p className="text-xs font-bold truncate text-gray-200">{user?.email}</p>
                <button
                  onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
                  className="text-[10px] text-gray-500 hover:text-red-400 transition-colors font-medium"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>

        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-0'}`}>
        <div className="min-h-screen">
          {children}
        </div>
      </main>
    </div>
  )
}
