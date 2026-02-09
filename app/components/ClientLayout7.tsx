'use client'
import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// ✅ [수정] 권한 검사 함수: DB에서 받아온 allowed_menus 목록에 포함되어 있는지 확인
const canAccess = (menuId: string) => {
    // 1. 최고 관리자(admin)는 무조건 통과
    if (currentCompany?.role === 'admin') return true;

    // 2. 일반 직원은 '내 부서(Role)'가 허용한 메뉴만 통과
    // (currentCompany 객체 안에 my_permissions를 추가로 가져오게 해야 함 -> Context 수정 필요)
    // 간단하게 구현하기 위해: 현재 DB에 저장된 내 role의 메뉴 목록을 확인

    // *실제 적용 팁*: AppContext에서 user 정보를 가져올 때 'allowed_menus' 배열도 같이 가져오게 해야 합니다.
    // 지금은 임시로 '모두 허용' 하되, 위 2단계가 완료되면 이 부분을 활성화하세요.

    return true; // 일단 에러 방지를 위해 true (나중에 user.permissions.includes(menuId) 로 변경)
}

// ✨ 아이콘 세트 (Sidebar.tsx에서 가져옴)
const Icons = {
  Dashboard: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  UserGroup: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  DocumentCheck: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Handshake: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  Briefcase: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Bank: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>,
  Car: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  Wrench: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Shield: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Clipboard: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  Chart: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  Calculator: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  Cog: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
}

const supabase = createClientComponentClient()

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, currentCompany, companies, switchCompany, isLoading: appLoading } = useApp()

  const [isSidebarOpen, setIsSidebarOpen] = useState(false) // 모바일용
  const [isCollapsed, setIsCollapsed] = useState(false)     // PC용 접기/펴기
  const [isCompanyMenuOpen, setIsCompanyMenuOpen] = useState(false)

  const [isAuthInitializing, setIsAuthInitializing] = useState(true)
  const [userSession, setUserSession] = useState<any>(null)

  // 그룹 메뉴 상태 (기본값: 모두 펼침)
  const [openGroups, setOpenGroups] = useState<{[key:string]: boolean}>({
    sales: true, partners: true, assets: true, mgmt: true
  })

  const isAuthPage = pathname === '/login' || pathname?.startsWith('/auth')

  const handleLogout = async () => {
    if (confirm('정말 로그아웃 하시겠습니까?')) {
        await supabase.auth.signOut()
        localStorage.removeItem('last_company_id')
        window.location.href = '/login'
    }
  }

  const toggleGroup = (group: string) => {
    if (isCollapsed) setIsCollapsed(false); // 접힌 상태에서 그룹 누르면 펼치기
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  // 인증 체크 로직 (기존 유지)
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session && !isAuthPage) {
          router.replace('/login')
          return
        }
        setUserSession(session)
        setIsAuthInitializing(false)
      } catch (error) {
        if (!isAuthPage) router.replace('/login')
      }
    }
    initAuth()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUserSession(session)
      if (event === 'SIGNED_OUT') router.replace('/login')
      else if (event === 'SIGNED_IN') setIsAuthInitializing(false)
    })
    return () => subscription.unsubscribe()
  }, [pathname, isAuthPage, router])


  // 🏗️ 메뉴 구조 정의 (권한 포함)
  // role: 'all' | 'admin' | 'manager' | 'staff' | 'driver'
  const MENU_STRUCTURE = [
    {
        id: 'sales', title: '대고객 영업',
        items: [
            { name: '렌트 견적/계약', path: '/quotes', icon: <Icons.DocumentCheck />, role: 'staff' },
            { name: '고객 관리 (CRM)', path: '/customers', icon: <Icons.UserGroup />, role: 'staff' },
        ]
    },
    {
        id: 'partners', title: '파트너 및 자금',
        items: [
            { name: '위수탁(지입) 정산', path: '/jiip', icon: <Icons.Handshake />, role: 'manager' },
            { name: '투자자/펀딩 정산', path: '/invest', icon: <Icons.Briefcase />, role: 'admin' },
            { name: '대출/금융사 관리', path: '/loans', icon: <Icons.Bank />, role: 'manager' },
        ]
    },
    {
        id: 'assets', title: '차량 자산 관리',
        items: [
            { name: '전체 차량 대장', path: '/cars', icon: <Icons.Car />, role: 'driver' },
            { name: '등록/제원 상세', path: '/registration', icon: <Icons.Clipboard />, role: 'manager' },
            { name: '보험/사고/정비', path: '/insurance', icon: <Icons.Shield />, role: 'manager' },
            { type: 'divider' },
            { name: '차량 시세/감가 DB', path: '/db/models', icon: <Icons.Chart />, role: 'admin' },
            { name: '정비/부품 DB', path: '/db/maintenance', icon: <Icons.Wrench />, role: 'admin' },
        ]
    },
    {
        id: 'mgmt', title: '경영 지원',
        items: [
            { name: '자금 장부 (입출금)', path: '/finance', icon: <Icons.Calculator />, role: 'admin' },
            { name: '환경 설정 / 코드', path: '/admin', icon: <Icons.Cog />, role: 'admin' },
        ]
    }
  ]

  // 내 권한 확인 (없으면 staff로 취급)
  const myRole = currentCompany?.role || 'staff';

  // 권한 검사 함수 (admin > manager > staff > driver 순서)
  const canAccess = (requiredRole: string) => {
    if (myRole === 'admin') return true;
    if (requiredRole === 'all') return true;
    if (myRole === 'manager' && ['manager', 'staff', 'driver'].includes(requiredRole)) return true;
    if (myRole === 'staff' && ['staff', 'driver'].includes(requiredRole)) return true;
    if (myRole === 'driver' && requiredRole === 'driver') return true;
    return false;
  }

  // 🎨 메뉴 렌더링 헬퍼
  const renderMenuItem = (name: string, path: string, icon: JSX.Element) => {
    const active = pathname === path || (path !== '/' && pathname.startsWith(path))
    return (
      <Link
        key={path}
        href={path}
        className={`
          group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 whitespace-nowrap z-10 mb-1
          ${active
            ? 'bg-blue-600 text-white font-bold shadow-md'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          }
        `}
      >
        {active && !isCollapsed && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-white/30 rounded-r-full" />}
        <div className="min-w-[20px] z-10">{icon}</div>
        <span className={`transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
          {name}
        </span>
        {isCollapsed && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 bg-gray-900 text-white text-xs font-bold px-3 py-2 rounded-lg shadow-xl border border-gray-700 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 translate-x-2 group-hover:translate-x-0">
            {name}
            <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 border-l border-b border-gray-700 transform rotate-45"></div>
          </div>
        )}
      </Link>
    )
  }

  const renderGroupHeader = (id: string, title: string) => {
    if (isCollapsed) return <div className="h-px bg-gray-800 my-3 mx-2" title={title} />
    return (
      <button onClick={() => toggleGroup(id)} className="w-full flex justify-between items-center px-4 py-2 text-xs font-bold text-gray-500 hover:text-white uppercase tracking-wider transition-colors mb-1 truncate mt-3">
        <span>{title}</span>
        <span className="text-[10px] text-gray-600 transition-transform duration-200" style={{ transform: openGroups[id] ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
    )
  }

  if (isAuthPage) return <div className="bg-white min-h-screen w-full">{children}</div>

  if (isAuthInitializing || appLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-400 font-bold text-sm animate-pulse">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">

      {/* 모바일 헤더 */}
      <header className="md:hidden bg-gray-950 text-white p-4 flex justify-between items-center sticky top-0 z-40 h-16 shadow-md">
        <h1 className="text-xl font-black tracking-tighter">SECOND<span className="text-blue-500">.</span></h1>
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </header>

      {/* 모바일 오버레이 */}
      {isSidebarOpen && <div className="fixed inset-0 bg-black/80 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />}

      {/* 사이드바 본체 */}
      <aside className={`
        bg-gray-950 text-gray-300 flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300 ease-in-out border-r border-gray-800
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static md:sticky md:top-0
        ${isCollapsed ? 'w-20 overflow-visible' : 'w-64 overflow-y-auto'}
      `}>

        {/* 1. 로고 & 접기 버튼 */}
        <div className="p-4 flex items-center justify-between border-b border-gray-800 h-16 bg-gray-950 sticky top-0 z-20">
            {!isCollapsed && <h1 className="text-xl font-black text-white tracking-tighter cursor-pointer" onClick={()=>window.location.href='/'}>SECOND<span className="text-blue-500">.</span></h1>}
            <button onClick={() => setIsCollapsed(!isCollapsed)} className={`hidden md:block p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 transition-colors ${isCollapsed ? 'mx-auto' : ''}`}>
               {isCollapsed ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>}
            </button>
            {/* 모바일용 닫기 */}
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 text-gray-400 hover:text-white">✖</button>
        </div>

        {/* 2. 회사 선택 (심플하게) */}
        {!isCollapsed && (
            <div className="p-4 border-b border-gray-800">
                <button onClick={() => setIsCompanyMenuOpen(!isCompanyMenuOpen)} className="w-full flex items-center justify-between bg-gray-900 p-3 rounded-xl border border-gray-800 hover:border-gray-600 transition-all group">
                   <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shrink-0">{currentCompany?.name.substring(0,1)}</div>
                      <div className="text-left overflow-hidden">
                          <p className="text-sm font-bold text-white truncate">{currentCompany?.name}</p>
                          <p className="text-xs text-gray-500">{currentCompany?.role === 'admin' ? '최고 관리자' : '직원'}</p>
                      </div>
                   </div>
                   <span className="text-xs text-gray-500 group-hover:text-white">▼</span>
                </button>
                {isCompanyMenuOpen && (
                    <div className="mt-2 bg-gray-900 rounded-xl border border-gray-700 overflow-hidden animate-fade-in-down">
                        {companies.map(c => (
                            <button key={c.id} onClick={()=>{switchCompany(c.id); setIsCompanyMenuOpen(false)}} className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-800 text-gray-300 hover:text-white ${currentCompany?.id === c.id ? 'text-blue-400 font-bold bg-gray-800' : ''}`}>
                                {c.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* 3. 메뉴 영역 */}
        <nav className="flex-1 px-3 space-y-1 py-4">
            {renderMenuItem('대시보드', '/', <Icons.Dashboard />)}

            {MENU_STRUCTURE.map(group => {
                // 그룹 내 권한 있는 메뉴만 필터링
                const validItems = group.items.filter(item => item.type === 'divider' || (item.role && canAccess(item.role)));
                if (validItems.length === 0) return null; // 보여줄 메뉴 없으면 그룹 숨김

                return (
                    <div key={group.id}>
                        {renderGroupHeader(group.id, group.title)}
                        <div className={`space-y-1 transition-all duration-300 ${openGroups[group.id] || isCollapsed ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                            {validItems.map((item, idx) => {
                                if (item.type === 'divider') return <div key={idx} className="pt-1 pb-1 border-t border-gray-800 mx-2 my-1" />;
                                return renderMenuItem(item.name!, item.path!, item.icon!);
                            })}
                        </div>
                    </div>
                )
            })}
        </nav>

        {/* 4. 하단 프로필 */}
        <div className={`p-4 border-t border-gray-800 bg-gray-950 ${isCollapsed ? 'flex justify-center' : ''}`}>
            <div className="flex items-center gap-3 cursor-pointer hover:bg-gray-900 p-2 rounded-xl transition-colors" onClick={handleLogout} title="로그아웃">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex-shrink-0 ring-2 ring-gray-800 overflow-hidden">
                    {userSession?.user_metadata?.avatar_url && <img src={userSession.user_metadata.avatar_url} alt="" className="w-full h-full object-cover" />}
                </div>
                {!isCollapsed && (
                    <div className="overflow-hidden">
                        <p className="text-sm font-bold text-white truncate">{userSession?.user_metadata?.name || '사용자'}님</p>
                        <p className="text-[10px] text-gray-500 truncate group-hover:text-red-400 transition-colors">로그아웃 하기 🚪</p>
                    </div>
                )}
            </div>
        </div>

      </aside>

      <main className="flex-1 min-w-0 bg-gray-50 min-h-[calc(100vh-64px)] md:min-h-screen transition-all">
        {children}
      </main>
    </div>
  )
}