'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

// 아이콘 SVG 컴포넌트들
const Icons = {
  Dashboard: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  Car: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  ChevronLeft: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>,
  ChevronRight: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>,
  Folder: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>,
  List: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  Shield: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
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

  // 🔥 [핵심] 메뉴 아이템 렌더링 함수 (툴팁 포함)
  const renderMenuItem = (name: string, path: string, icon: JSX.Element) => {
    const active = pathname.startsWith(path)

    return (
      <Link
        key={path}
        href={path}
        className={`
          group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 overflow-hidden whitespace-nowrap z-10
          ${active
            ? 'bg-blue-600 text-white font-bold shadow-md'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          }
        `}
      >
        {/* 활성 상태일 때 왼쪽 강조선 (선택 사항) */}
        {active && !isCollapsed && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-white/30 rounded-r-full" />}

        <div className="min-w-[20px] z-10">{icon}</div>

        <span className={`transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
          {name}
        </span>

        {/* 💡 [툴팁] 접혔을 때만 hover 시 나타남 */}
        {isCollapsed && (
          <div className="
            absolute left-14 top-1/2 -translate-y-1/2 ml-2
            bg-gray-900 text-white text-xs font-bold px-3 py-2 rounded-lg
            shadow-xl border border-gray-700 whitespace-nowrap
            opacity-0 group-hover:opacity-100 pointer-events-none
            transition-all duration-200 z-50 translate-x-2 group-hover:translate-x-0
          ">
            {name}
            {/* 말풍선 꼬리 */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 w-2 h-2 bg-gray-900 border-l border-b border-gray-700 transform rotate-45"></div>
          </div>
        )}
      </Link>
    )
  }

  return (
    <aside
      className={`bg-gray-950 text-gray-300 flex flex-col h-screen fixed left-0 top-0 overflow-y-auto overflow-x-hidden z-50 transition-all duration-300 ease-in-out border-r border-gray-800
      ${isCollapsed ? 'w-20' : 'w-64'}`}
    >
      {/* 1. 로고 */}
      <div className="p-4 flex items-center justify-between border-b border-gray-800 h-16 bg-gray-950 sticky top-0 z-20">
        {!isCollapsed && (
          <div className="flex flex-col animate-fadeIn">
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
            <button onClick={() => toggleGroup('car')} className="w-full flex justify-between items-center px-4 py-2 text-xs font-bold text-gray-500 hover:text-white uppercase tracking-wider transition-colors mb-1">
              <span>차량 관리</span>
              <span>{openGroups.car ? '▼' : '▶'}</span>
            </button>
          ) : (
            <div className="h-px bg-gray-800 my-3 mx-2" title="차량 관리 섹션" />
          )}

          <div className={`space-y-1 transition-all duration-300 ${openGroups.car || isCollapsed ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
            {renderMenuItem('전체 차량', '/cars', <Icons.List />)}
            {renderMenuItem('차량등록/제원', '/registration', <Icons.Folder />)}
            {renderMenuItem('보험/공제', '/insurance', <Icons.Shield />)}
            {renderMenuItem('금융/여신', '/finance', <Icons.Folder />)}
            {renderMenuItem('지입/위수탁', '/jiip', <Icons.Folder />)}
            {renderMenuItem('투자/펀딩', '/invest', <Icons.Folder />)}
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
            <div className="h-px bg-gray-800 my-3 mx-2" title="DB 관리 섹션" />
          )}

          <div className={`space-y-1 transition-all duration-300 ${openGroups.db || isCollapsed ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
             {renderMenuItem('표준 코드', '/db/codes', <Icons.List />)}
             {renderMenuItem('시세표 DB', '/db/models', <Icons.List />)}
             {renderMenuItem('감가율 DB', '/db/depreciation', <Icons.List />)}
             {renderMenuItem('정비 DB', '/db/maintenance', <Icons.List />)}
             {renderMenuItem('롯데렌터카', '/db/lotte', <Icons.List />)}
          </div>
        </div>

        {/* --- 그룹 3: 영업 관리 --- */}
        <div className="pt-2">
           {!isCollapsed ? (
            <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">영업 관리</div>
           ) : (
            <div className="h-px bg-gray-800 my-3 mx-2" title="영업 관리 섹션" />
           )}
           {renderMenuItem('견적/계약', '/quotes', <Icons.Folder />)}
           {renderMenuItem('고객 관리', '/customers', <Icons.Folder />)}
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