'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

// ✨ 메뉴별 고유 아이콘 (그대로 유지)
const Icons = {
  ChevronLeft: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>,
  ChevronRight: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>,
  Dashboard: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,

  // 차량 관리
  Car: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  ClipboardList: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  ShieldCheck: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Banknotes: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  Truck: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
  TrendingUp: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,

  // DB 관리
  Tag: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>,
  Database: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>,
  ChartBar: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  Wrench: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  BuildingOffice: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,

  // 영업 관리
  DocumentText: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Users: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
}

interface SidebarProps {
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

export default function Sidebar({ isCollapsed, toggleSidebar }: SidebarProps) {
  const pathname = usePathname()

  const [openGroups, setOpenGroups] = useState<{[key:string]: boolean}>({
    car: true, db: true, sales: true
  })

  const toggleGroup = (group: string) => {
    if (isCollapsed) toggleSidebar();
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  const renderMenuItem = (name: string, path: string, icon: JSX.Element) => {
    const active = pathname.startsWith(path)

    return (
      <Link
        key={path}
        href={path}
        // 🚀 [수정됨] overflow-hidden 제거 -> 말풍선이 잘리지 않게 함!
        className={`
          group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 whitespace-nowrap z-10
          ${active
            ? 'bg-blue-600 text-white font-bold shadow-md'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          }
        `}
      >
        {/* 활성 상태일 때 왼쪽 강조선 */}
        {active && !isCollapsed && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-white/30 rounded-r-full" />}

        <div className="min-w-[20px] z-10">{icon}</div>

        <span className={`transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
          {name}
        </span>

        {/* 💡 [툴팁] 접혔을 때 마우스 올리면 등장 */}
        {isCollapsed && (
          <div className="
            absolute left-full top-1/2 -translate-y-1/2 ml-3
            bg-gray-900 text-white text-xs font-bold px-3 py-2 rounded-lg
            shadow-xl border border-gray-700 whitespace-nowrap
            opacity-0 group-hover:opacity-100 pointer-events-none
            transition-all duration-200 z-50 translate-x-2 group-hover:translate-x-0
          ">
            {name}
            {/* 말풍선 꼬리 */}
            <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 border-l border-b border-gray-700 transform rotate-45"></div>
          </div>
        )}
      </Link>
    )
  }

  return (
    // 🚀 [핵심 수정] 접혔을 때(overflow-visible) vs 펼쳤을 때(overflow-y-auto)
    <aside
      className={`bg-gray-950 text-gray-300 flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300 ease-in-out border-r border-gray-800
      ${isCollapsed ? 'w-20 overflow-visible' : 'w-64 overflow-y-auto'}`}
    >
      {/* 1. 로고 */}
      <div className="p-4 flex items-center justify-between border-b border-gray-800 h-16 bg-gray-950 sticky top-0 z-20">
        {!isCollapsed && (
          <div className="flex flex-col animate-fadeIn truncate">
            <h1 className="text-xl font-black text-white tracking-tighter">SECOND<span className="text-blue-500">.</span></h1>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className={`p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 transition-colors ${isCollapsed ? 'mx-auto' : ''}`}
        >
          {isCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronLeft />}
        </button>
      </div>

      {/* 2. 메뉴 영역 */}
      <nav className="flex-1 px-3 space-y-2 py-4">

        {renderMenuItem('대시보드', '/', <Icons.Dashboard />)}

        {/* --- 그룹 1: 차량 관리 --- */}
        <div className="pt-2">
          {!isCollapsed ? (
            <button onClick={() => toggleGroup('car')} className="w-full flex justify-between items-center px-4 py-2 text-xs font-bold text-gray-500 hover:text-white uppercase tracking-wider transition-colors mb-1 truncate">
              <span>차량 관리</span>
              <span>{openGroups.car ? '▼' : '▶'}</span>
            </button>
          ) : (
            <div className="h-px bg-gray-800 my-3 mx-2" title="차량 관리 섹션" />
          )}

          <div className={`space-y-1 transition-all duration-300 ${openGroups.car || isCollapsed ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
            {renderMenuItem('전체 차량', '/cars', <Icons.Car />)}
            {renderMenuItem('차량등록/제원', '/registration', <Icons.ClipboardList />)}
            {renderMenuItem('보험/공제', '/insurance', <Icons.ShieldCheck />)}
            {renderMenuItem('금융/여신', '/finance', <Icons.Banknotes />)}
            {renderMenuItem('지입/위수탁', '/jiip', <Icons.Truck />)}
            {renderMenuItem('투자/펀딩', '/invest', <Icons.TrendingUp />)}
          </div>
        </div>

        {/* --- 그룹 2: DB 관리 --- */}
        <div className="pt-2">
          {!isCollapsed ? (
            <button onClick={() => toggleGroup('db')} className="w-full flex justify-between items-center px-4 py-2 text-xs font-bold text-gray-500 hover:text-white uppercase tracking-wider transition-colors mb-1 truncate">
              <span>DB/기준 관리</span>
              <span>{openGroups.db ? '▼' : '▶'}</span>
            </button>
          ) : (
            <div className="h-px bg-gray-800 my-3 mx-2" title="DB 관리 섹션" />
          )}

          <div className={`space-y-1 transition-all duration-300 ${openGroups.db || isCollapsed ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
             {renderMenuItem('표준 코드', '/db/codes', <Icons.Tag />)}
             {renderMenuItem('시세표 DB', '/db/models', <Icons.Database />)}
             {renderMenuItem('감가율 DB', '/db/depreciation', <Icons.ChartBar />)}
             {renderMenuItem('정비 DB', '/db/maintenance', <Icons.Wrench />)}
             {renderMenuItem('롯데렌터카', '/db/lotte', <Icons.BuildingOffice />)}
          </div>
        </div>

        {/* --- 그룹 3: 영업 관리 --- */}
        <div className="pt-2">
           {!isCollapsed ? (
            <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 truncate">영업 관리</div>
           ) : (
            <div className="h-px bg-gray-800 my-3 mx-2" title="영업 관리 섹션" />
           )}
           {renderMenuItem('견적/계약', '/quotes', <Icons.DocumentText />)}
           {renderMenuItem('고객 관리', '/customers', <Icons.Users />)}
        </div>

      </nav>

      {/* 하단 프로필 */}
      <div className={`p-4 border-t border-gray-800 transition-all bg-gray-950 ${isCollapsed ? 'flex justify-center' : ''}`}>
          <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex-shrink-0 ring-2 ring-gray-800"></div>
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