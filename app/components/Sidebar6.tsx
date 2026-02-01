'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

// 아이콘 SVG 컴포넌트들
const Icons = {
  Dashboard: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  Car: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  ChevronLeft: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>,
  ChevronRight: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>,
  Folder: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>,
  List: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  // 🔥 [수정됨] 누락되었던 Shield 아이콘 추가!
  Shield: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
}

interface SidebarProps {
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

export default function Sidebar({ isCollapsed, toggleSidebar }: SidebarProps) {
  const pathname = usePathname()

  // 메뉴 그룹 상태
  const [openGroups, setOpenGroups] = useState<{[key:string]: boolean}>({
    car: true,
    db: true,
    sales: true
  })

  const toggleGroup = (group: string) => {
    if (isCollapsed) toggleSidebar();
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  const getLinkClass = (path: string) => {
    const active = pathname.startsWith(path)
    return `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 overflow-hidden whitespace-nowrap
      ${active ? 'bg-blue-600 text-white font-bold shadow-md' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`
  }

  return (
    <aside
      className={`bg-gray-900 text-gray-300 flex flex-col h-screen fixed left-0 top-0 overflow-y-auto overflow-x-hidden z-50 transition-all duration-300 ease-in-out border-r border-gray-800
      ${isCollapsed ? 'w-20' : 'w-64'}`}
    >
      {/* 1. 로고 및 토글 버튼 */}
      <div className="p-4 flex items-center justify-between border-b border-gray-800 h-16">
        {!isCollapsed && (
          <div className="flex flex-col animate-fadeIn">
            <h1 className="text-xl font-black text-white tracking-tighter">SECOND<span className="text-blue-500">.</span></h1>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className={`p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 transition-colors ${isCollapsed ? 'mx-auto' : ''}`}
        >
          {isCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronLeft />}
        </button>
      </div>

      {/* 2. 메뉴 영역 */}
      <nav className="flex-1 px-3 space-y-2 py-4">

        {/* 대시보드 */}
        <Link href="/" className={getLinkClass('/')}>
          <div className="min-w-[20px]"><Icons.Dashboard /></div>
          <span className={`transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>대시보드</span>
        </Link>

        {/* --- 그룹 1: 차량 관리 --- */}
        <div className="pt-2">
          {!isCollapsed ? (
            <button onClick={() => toggleGroup('car')} className="w-full flex justify-between items-center px-4 py-2 text-xs font-bold text-gray-500 hover:text-white uppercase tracking-wider transition-colors mb-1">
              <span>차량 관리</span>
              <span>{openGroups.car ? '▼' : '▶'}</span>
            </button>
          ) : (
            <div className="h-px bg-gray-800 my-2 mx-2" />
          )}

          <div className={`space-y-1 transition-all duration-300 ${openGroups.car || isCollapsed ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
            {[
              { name: '전체 차량', path: '/cars', icon: <Icons.List /> },
              { name: '차량등록/제원', path: '/registration', icon: <Icons.Folder /> },
              { name: '보험/공제', path: '/insurance', icon: <Icons.Shield /> }, // 이제 에러 안 남
              { name: '금융/여신', path: '/finance', icon: <Icons.Folder /> },
              { name: '지입/위수탁', path: '/jiip', icon: <Icons.Folder /> },
              { name: '투자/펀딩', path: '/invest', icon: <Icons.Folder /> },
            ].map(item => (
              <Link key={item.path} href={item.path} className={getLinkClass(item.path)}>
                <div className="min-w-[20px]">{item.icon}</div>
                <span className={`transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>{item.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* --- 그룹 2: DB 관리 --- */}
        <div className="pt-2">
          {!isCollapsed ? (
            <button onClick={() => toggleGroup('db')} className="w-full flex justify-between items-center px-4 py-2 text-xs font-bold text-gray-500 hover:text-white uppercase tracking-wider transition-colors mb-1">
              <span>DB/기준 관리</span>
              <span>{openGroups.db ? '▼' : '▶'}</span>
            </button>
          ) : (
            <div className="h-px bg-gray-800 my-2 mx-2" />
          )}

          <div className={`space-y-1 transition-all duration-300 ${openGroups.db || isCollapsed ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
             {[
              { name: '표준 코드', path: '/db/codes', icon: <Icons.List /> },
              { name: '시세표 DB', path: '/db/models', icon: <Icons.List /> },
              { name: '감가율 DB', path: '/db/depreciation', icon: <Icons.List /> },
              { name: '정비 DB', path: '/db/maintenance', icon: <Icons.List /> },
              { name: '롯데렌터카', path: '/db/lotte', icon: <Icons.List /> },
            ].map(item => (
              <Link key={item.path} href={item.path} className={getLinkClass(item.path)}>
                <div className="min-w-[20px]">{item.icon}</div>
                <span className={`transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>{item.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* --- 그룹 3: 영업 관리 --- */}
        <div className="pt-2">
           {!isCollapsed ? (
            <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">영업 관리</div>
           ) : (
            <div className="h-px bg-gray-800 my-2 mx-2" />
           )}
           <Link href="/quotes" className={getLinkClass('/quotes')}>
             <div className="min-w-[20px]"><Icons.Folder /></div>
             <span className={`transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>견적/계약</span>
           </Link>
           <Link href="/customers" className={getLinkClass('/customers')}>
             <div className="min-w-[20px]"><Icons.Folder /></div>
             <span className={`transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>고객 관리</span>
           </Link>
        </div>

      </nav>

      {/* 하단 프로필 (옵션) */}
      <div className={`p-4 border-t border-gray-800 transition-all ${isCollapsed ? 'flex justify-center' : ''}`}>
          <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex-shrink-0"></div>
              {!isCollapsed && (
                  <div className="overflow-hidden">
                      <p className="text-sm font-bold text-white truncate">관리자</p>
                      <p className="text-xs text-gray-500 truncate">admin@krma.kr</p>
                  </div>
              )}
          </div>
      </div>
    </aside>
  )
}