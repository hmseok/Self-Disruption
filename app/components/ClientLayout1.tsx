'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const pathname = usePathname()

  // 👇 메뉴 항목 (대표님의 프로젝트 구조에 맞춰 수정 가능)
  const menuItems = [
    { name: '홈/대시보드', path: '/', icon: '🏠' },
    { name: '자금 관리', path: '/finance', icon: '💰' },
    { name: '차량 관리', path: '/cars', icon: '🚗' },
    { name: '지입/차주', path: '/jiip', icon: '🚛' },
    { name: '투자 관리', path: '/invest', icon: '📈' },
    { name: '보험 관리', path: '/insurance', icon: '🛡️' },
    { name: '대출 관리', path: '/loans', icon: '🏦' },
    { name: '설정', path: '/admin', icon: '⚙️' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">

      {/* 📱 [모바일 전용] 상단 헤더 (햄버거 버튼) */}
      <header className="md:hidden bg-white border-b border-gray-200 p-4 flex justify-between items-center sticky top-0 z-40 h-16">
        <h1 className="text-xl font-black text-indigo-900">Second Life</h1>
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg active:bg-gray-200 transition-colors"
        >
          {/* 햄버거 아이콘 */}
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </header>

      {/* 🌑 [모바일 전용] 사이드바 열렸을 때 배경 어둡게 (오버레이) */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 🚚 사이드바 (네비게이션) */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 shadow-2xl md:shadow-none
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static md:h-screen md:sticky md:top-0
      `}>
        <div className="p-6 h-full flex flex-col">
          {/* 사이드바 헤더 */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-black text-indigo-900">Second Life</h1>
            {/* 모바일 닫기 버튼 */}
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* 메뉴 리스트 */}
          <nav className="space-y-1 flex-1 overflow-y-auto">
            {menuItems.map((item) => {
              // 현재 페이지 활성화 체크
              const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));

              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setIsSidebarOpen(false)} // 모바일에서 클릭 시 사이드바 닫기
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm
                    ${isActive
                      ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.name}
                </Link>
              )
            })}
          </nav>

          <div className="pt-6 mt-auto border-t border-gray-100">
             <p className="text-xs text-gray-400 text-center">© 2026 Second Life ERP</p>
          </div>
        </div>
      </aside>

      {/* 🖼️ 메인 콘텐츠 영역 */}
      <main className="flex-1 min-w-0 bg-gray-50 min-h-[calc(100vh-64px)] md:min-h-screen">
        {children}
      </main>

    </div>
  )
}