'use client'
import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'
import { supabase } from '../utils/supabase'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const { user, currentCompany, companies, switchCompany, isLoading } = useApp()

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isCompanyMenuOpen, setIsCompanyMenuOpen] = useState(false)

  // 🚫 사이드바를 숨겨야 하는 페이지 목록 (로그인 + 인증 관련 모든 페이지)
  const isAuthPage = pathname === '/login' || pathname?.startsWith('/auth')

  // 1. 로그아웃 로직
  const handleLogout = async () => {
    if (confirm('정말 로그아웃 하시겠습니까?')) {
        await supabase.auth.signOut()
        localStorage.removeItem('last_company_id')
        window.location.href = '/login'
    }
  }

  // 2. 로그인 체크 (비로그인 유저 튕겨내기)
  useEffect(() => {
    // 로딩 끝났고 + 유저 없고 + 지금 로그인페이지도 아니고 + "인증처리페이지도 아닐 때"만 튕겨냄
    if (!isLoading && !user && !isAuthPage) {
      router.replace('/login')
    }
  }, [user, isLoading, pathname, router, isAuthPage])

  // 3. 메뉴 데이터
  const MENU_ITEMS = [
    { name: '대시보드', path: '/', icon: '🏠', roles: ['all'] },
    { name: '자금 관리', path: '/finance', icon: '💰', roles: ['admin', 'manager', 'staff'] },
    { name: '차량 관리', path: '/cars', icon: '🚗', roles: ['admin', 'manager', 'driver'] },
    { name: '지입/차주', path: '/jiip', icon: '🚛', roles: ['admin', 'manager'] },
    { name: '투자 관리', path: '/invest', icon: '📈', roles: ['admin'] },
    { name: '대출 관리', path: '/loans', icon: '🏦', roles: ['admin', 'manager'] },
    { name: '보험 관리', path: '/insurance', icon: '🛡️', roles: ['admin', 'manager'] },
    { name: '견적/계약', path: '/quotes', icon: '📝', roles: ['admin', 'manager'] },
    { name: '설정', path: '/admin', icon: '⚙️', roles: ['admin'] },
  ]

  const visibleMenus = useMemo(() => {
    if (!currentCompany) return [];
    const myRole = currentCompany.role || 'staff';
    return MENU_ITEMS.filter(menu =>
      menu.roles.includes('all') || menu.roles.includes(myRole)
    );
  }, [currentCompany]);


  // 🔴 [CASE 1] 인증 관련 페이지면 사이드바 없이 본문만 표시 (전체 화면)
  if (isAuthPage) {
      return <div className="bg-white min-h-screen w-full">{children}</div>
  }

  // [CASE 2] 로딩 중
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
        <p className="text-gray-400 font-bold text-sm animate-pulse">Sideline 로딩 중...</p>
      </div>
    )
  }

  // [CASE 3] 정상 접속 (사이드바 표시)
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* 모바일 헤더 */}
      <header className="md:hidden bg-white border-b border-gray-200 p-4 flex justify-between items-center sticky top-0 z-40 h-16 shadow-sm">
        <h1 className="text-xl font-black text-indigo-950 tracking-tight flex items-center gap-2">
            SIDE<span className="text-indigo-600">LINE</span>
        </h1>
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </header>

      {/* 모바일 오버레이 */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* 사이드바 본체 */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 shadow-2xl md:shadow-none
        transform transition-transform duration-300 ease-in-out flex flex-col
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static md:h-screen md:sticky md:top-0
      `}>
        {/* 로고 */}
        <div className="h-16 flex items-center px-6 border-b border-gray-100 bg-white md:bg-gray-50/50">
            <h1 className="text-2xl font-black text-indigo-950 tracking-tighter cursor-pointer" onClick={()=>window.location.href='/'}>
                SIDE<span className="text-indigo-600">LINE</span><span className="text-xs text-gray-400 font-normal ml-1">beta</span>
            </h1>
        </div>

        {/* 회사 선택 메뉴 */}
        <div className="p-5 border-b border-gray-100 relative">
            <button
              onClick={() => setIsCompanyMenuOpen(!isCompanyMenuOpen)}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 transition-all border border-indigo-100 group"
            >
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                        {currentCompany?.name.substring(0,1) || 'S'}
                    </div>
                    <div className="text-left overflow-hidden">
                        <p className="font-bold text-indigo-950 text-sm truncate w-32">{currentCompany?.name || '내 회사'}</p>
                        <p className="text-xs text-indigo-500 font-medium">{currentCompany?.role === 'admin' ? '관리자' : '직원'}</p>
                    </div>
                </div>
                <svg className={`w-5 h-5 text-indigo-400 transition-transform ${isCompanyMenuOpen?'rotate-180':''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            {isCompanyMenuOpen && (
                <div className="absolute top-full left-4 right-4 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-fade-in-down ring-1 ring-black/5">
                    <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">내 사업장</div>
                    {companies.map(comp => (
                        <button
                            key={comp.id}
                            onClick={() => { switchCompany(comp.id); setIsCompanyMenuOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-sm font-bold flex items-center gap-2 hover:bg-gray-50 transition-colors
                                ${currentCompany?.id === comp.id ? 'text-indigo-600 bg-indigo-50/30' : 'text-gray-600'}
                            `}
                        >
                            <span className={`w-2 h-2 rounded-full ${currentCompany?.id === comp.id ? 'bg-indigo-500' : 'bg-gray-300'}`}></span>
                            {comp.name}
                        </button>
                    ))}
                    <div className="p-2 border-t border-gray-100">
                        <Link href="/admin" onClick={()=>setIsCompanyMenuOpen(false)} className="block w-full py-2.5 text-xs text-center text-gray-500 hover:text-indigo-600 font-bold border border-dashed border-gray-300 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all">
                            + 새 사업장 추가
                        </Link>
                    </div>
                </div>
            )}
        </div>

        {/* 메뉴 아이템 */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-hide">
            <p className="px-3 mb-2 text-xs font-extrabold text-gray-400 tracking-wider">MENU</p>
            {visibleMenus.map((item) => {
                const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
                return (
                    <Link
                        key={item.path}
                        href={item.path}
                        onClick={() => setIsSidebarOpen(false)}
                        className={`
                            flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm group
                            ${isActive
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                            }
                        `}
                    >
                        <span className={`text-xl transition-transform group-hover:scale-110 ${isActive ? 'opacity-100' : 'opacity-80'}`}>
                            {item.icon}
                        </span>
                        {item.name}
                    </Link>
                )
            })}
        </div>

        {/* 하단 프로필 */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
             <div onClick={handleLogout} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-red-100 transition-all cursor-pointer group">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-sm text-indigo-700 font-bold shadow-inner overflow-hidden">
                    {user?.user_metadata?.avatar_url ? (
                        <img src={user.user_metadata.avatar_url} alt="profile" className="w-full h-full object-cover" />
                    ) : '👤'}
                </div>
                <div className="overflow-hidden flex-1">
                    <p className="text-sm font-bold text-gray-700 truncate">{user?.user_metadata?.name || '사용자'}님</p>
                    <p className="text-[10px] text-gray-400 truncate group-hover:text-red-500 font-medium">로그아웃 하기 🚪</p>
                </div>
             </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 bg-gray-50 min-h-[calc(100vh-64px)] md:min-h-screen transition-all">
        {children}
      </main>
    </div>
  )
}