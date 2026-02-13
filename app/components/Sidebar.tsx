'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

// ✨ 아이콘 세트 (누락된 Chart 아이콘 추가됨)
const Icons = {
  // UI
  ChevronLeft: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>,
  ChevronRight: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>,
  Dashboard: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,

  // 1. 대고객 (영업)
  UserGroup: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  DocumentCheck: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,

  // 2. 파트너 (자금/정산)
  Handshake: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  Briefcase: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Bank: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>,

  // 3. 자산 (차량)
  Car: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  Wrench: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Shield: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Clipboard: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  // 👇 [추가됨] 누락되었던 Chart 아이콘
  Chart: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,

  // 4. 경영 지원
  Calculator: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  Cog: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
}

interface SidebarProps {
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

export default function Sidebar({ isCollapsed, toggleSidebar }: SidebarProps) {
  const pathname = usePathname()

  // 📂 옵션 B: 대상 중심형 그룹 상태
  // sales(고객), partners(자금), assets(자산), mgmt(경영)
  const [openGroups, setOpenGroups] = useState<{[key:string]: boolean}>({
    sales: true, partners: true, assets: true, mgmt: true
  })

  const toggleGroup = (group: string) => {
    if (isCollapsed) toggleSidebar();
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  const renderMenuItem = (name: string, path: string, icon: JSX.Element) => {
    // /finance와 /finance/settlement 구분을 위해 정확 매칭 + 하위경로 매칭 사용
    const active = pathname === path || (pathname.startsWith(path + '/') && path !== '/finance')
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

  return (
    <aside className={`bg-gray-950 text-gray-300 flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300 ease-in-out border-r border-gray-800 ${isCollapsed ? 'w-20 overflow-visible' : 'w-64 overflow-y-auto'}`}>
      
      {/* 1. 로고 */}
      <div className="p-4 flex items-center justify-between border-b border-gray-800 h-16 bg-gray-950 sticky top-0 z-20">
        {!isCollapsed && <h1 className="text-xl font-black text-white tracking-tighter">SECOND<span className="text-blue-500">.</span></h1>}
        <button onClick={toggleSidebar} className={`p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 transition-colors ${isCollapsed ? 'mx-auto' : ''}`}>
          {isCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronLeft />}
        </button>
      </div>

      {/* 2. 메뉴 영역 */}
      <nav className="flex-1 px-3 space-y-1 py-4">
        {renderMenuItem('대시보드', '/', <Icons.Dashboard />)}

        {/* 1️⃣ 그룹: 대고객 (영업) */}
        {renderGroupHeader('sales', '대고객 영업')}
        <div className={`space-y-1 transition-all duration-300 ${openGroups.sales || isCollapsed ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
           {renderMenuItem('렌트가 산출', '/quotes/pricing', <Icons.Calculator />)}
           {renderMenuItem('렌트 견적/계약', '/quotes', <Icons.DocumentCheck />)}
           {renderMenuItem('고객 관리 (CRM)', '/customers', <Icons.UserGroup />)}
        </div>

        {/* 2️⃣ 그룹: 파트너 (자금/정산) */}
        {renderGroupHeader('partners', '파트너 및 자금')}
        <div className={`space-y-1 transition-all duration-300 ${openGroups.partners || isCollapsed ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
          {renderMenuItem('위수탁(지입) 정산', '/jiip', <Icons.Handshake />)}
          {renderMenuItem('투자자/펀딩 정산', '/invest', <Icons.Briefcase />)}
          {renderMenuItem('대출/금융사 관리', '/loans', <Icons.Bank />)}
        </div>

        {/* 3️⃣ 그룹: 자산 관리 (차량 + 관련 DB 통합) */}
        {renderGroupHeader('assets', '차량 자산 관리')}
        <div className={`space-y-1 transition-all duration-300 ${openGroups.assets || isCollapsed ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
          {renderMenuItem('전체 차량 대장', '/cars', <Icons.Car />)}
          {renderMenuItem('등록/제원 상세', '/registration', <Icons.Clipboard />)}
          {renderMenuItem('보험/사고/정비', '/insurance', <Icons.Shield />)}
          <div className="pt-1 pb-1 border-t border-gray-800 mx-2 my-1" /> {/* 구분선 */}
          {renderMenuItem('산출 기준 관리', '/db/pricing-standards', <Icons.Calculator />)}
          {renderMenuItem('차량 시세/감가 DB', '/db/models', <Icons.Chart />)}
          {renderMenuItem('정비/부품 DB', '/db/maintenance', <Icons.Wrench />)}
        </div>

        {/* 4️⃣ 그룹: 경영 지원 (내부 자금 + 설정) */}
        {renderGroupHeader('mgmt', '경영 지원')}
        <div className={`space-y-1 transition-all duration-300 ${openGroups.mgmt || isCollapsed ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
          {renderMenuItem('매출 회계 정산', '/finance/settlement', <Icons.Chart />)}
          {renderMenuItem('자금 장부 (입출금)', '/finance', <Icons.Calculator />)}
          {renderMenuItem('리포트 / 통계', '/report', <Icons.Chart />)}
          {renderMenuItem('환경 설정 / 코드', '/db/codes', <Icons.Cog />)}
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