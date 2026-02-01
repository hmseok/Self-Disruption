'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

export default function Sidebar() {
  const pathname = usePathname()
  // 차량관리 메뉴 펼침 상태 관리
  const [isCarMenuOpen, setIsCarMenuOpen] = useState(true)

  const isActive = (path: string) => pathname.startsWith(path) ? 'bg-gray-800 text-white font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white'

  return (
    <aside className="w-64 bg-gray-900 text-gray-300 flex flex-col h-screen fixed left-0 top-0 overflow-y-auto">
      {/* 로고 영역 */}
      <div className="p-6">
        <h1 className="text-2xl font-black text-white tracking-tighter">SECOND LIFE<span className="text-blue-500">.</span></h1>
        <p className="text-xs text-gray-500 mt-1">Enterprise Resource Planning</p>
      </div>

      {/* 메뉴 영역 */}
      <nav className="flex-1 px-4 space-y-2">
        <Link href="/" className={`block px-4 py-3 rounded-xl transition-colors ${pathname === '/' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-gray-800'}`}>
          📊 대시보드
        </Link>

        {/* 👇 [차량 관리] 그룹 메뉴 (클릭하면 펼쳐짐) */}
        <div>
          <button onClick={() => setIsCarMenuOpen(!isCarMenuOpen)} className="w-full flex justify-between items-center px-4 py-3 text-gray-400 hover:text-white font-bold transition-colors">
            <span>🚙 차량 관리</span>
            <span>{isCarMenuOpen ? '▼' : '▶'}</span>
          </button>

          {/* 하위 메뉴들 */}
          {isCarMenuOpen && (
            <div className="space-y-1 pl-4 mt-1 border-l-2 border-gray-800 ml-4">
              <Link href="/cars" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/cars')}`}>
                전체 차량 리스트
              </Link>
              <Link href="/registration" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/registration')}`}>
                📄 차량등록/제원
              </Link>
              <Link href="/insurance" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/insurance')}`}>
                🛡️ 보험/공제 관리
              </Link>
              <Link href="/finance" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/finance')}`}>
                💰 금융/여신 관리
              </Link>
              {/* 👇 지입과 투자가 분리되었습니다 */}
              <Link href="/jiip" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/jiip')}`}>
                🤝 지입(위수탁) 관리
              </Link>
              <Link href="/invest" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/invest')}`}>
                📈 투자/펀딩 관리
              </Link>
            </div>
          )}
        </div>

        {/* 하단 메뉴 영역 */}
        <div className="pt-4 mt-4 border-t border-gray-800">
           <Link href="/quotes" className={`block px-4 py-3 rounded-xl ${isActive('/quotes')}`}>
             📑 견적/계약 관리
           </Link>
           <Link href="/customers" className={`block px-4 py-3 rounded-xl ${isActive('/customers')}`}>
             👥 고객 관리
           </Link>
        </div>
      </nav>
    </aside>
  )
}