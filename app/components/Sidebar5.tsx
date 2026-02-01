'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

export default function Sidebar() {
  const pathname = usePathname()

  // 메뉴 펼침 상태 관리
  const [isCarMenuOpen, setIsCarMenuOpen] = useState(true)
  const [isDbMenuOpen, setIsDbMenuOpen] = useState(true)

  const isActive = (path: string) => pathname.startsWith(path) ? 'bg-gray-800 text-white font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white'

  return (
    <aside className="w-64 bg-gray-900 text-gray-300 flex flex-col h-screen fixed left-0 top-0 overflow-y-auto z-50">
      {/* 로고 영역 */}
      <div className="p-6">
        <h1 className="text-2xl font-black text-white tracking-tighter">SECOND LIFE<span className="text-blue-500">.</span></h1>
        <p className="text-xs text-gray-500 mt-1">Enterprise Resource Planning</p>
      </div>

      {/* 메뉴 영역 */}
      <nav className="flex-1 px-4 space-y-2 pb-10">
        <Link href="/" className={`block px-4 py-3 rounded-xl transition-colors ${pathname === '/' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-gray-800'}`}>
          📊 대시보드
        </Link>

        {/* 1. 차량 관리 그룹 */}
        <div className="pt-2">
          <button onClick={() => setIsCarMenuOpen(!isCarMenuOpen)} className="w-full flex justify-between items-center px-4 py-2 text-gray-400 hover:text-white font-bold transition-colors">
            <span>🚙 차량 관리</span>
            <span className="text-xs">{isCarMenuOpen ? '▼' : '▶'}</span>
          </button>

          {isCarMenuOpen && (
            <div className="space-y-1 pl-4 mt-1 border-l-2 border-gray-800 ml-4 transition-all">
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
              <Link href="/jiip" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/jiip')}`}>
                🤝 지입(위수탁) 관리
              </Link>
              <Link href="/invest" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/invest')}`}>
                📈 투자/펀딩 관리
              </Link>
            </div>
          )}
        </div>

        {/* 2. DB/기준 관리 그룹 */}
        <div className="pt-4 border-t border-gray-800 mt-4">
          <button onClick={() => setIsDbMenuOpen(!isDbMenuOpen)} className="w-full flex justify-between items-center px-4 py-2 text-gray-400 hover:text-white font-bold transition-colors">
            <span>💾 DB/기준 관리</span>
            <span className="text-xs">{isDbMenuOpen ? '▼' : '▶'}</span>
          </button>

          {isDbMenuOpen && (
            <div className="space-y-1 pl-4 mt-1 border-l-2 border-gray-800 ml-4">
              {/* 👇 새로 추가된 메뉴 */}
              <Link href="/db/codes" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/db/codes')}`}>
                🏗️ 차량 표준 코드 (트림)
              </Link>
              <Link href="/db/models" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/db/models')}`}>
                🚗 차종/시세표 DB
              </Link>
              <Link href="/db/depreciation" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/db/depreciation')}`}>
                📉 잔가/감가율 DB
              </Link>
              <Link href="/db/maintenance" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/db/maintenance')}`}>
                🔧 정비/소모품 DB
              </Link>
              <Link href="/db/lotte" className={`block px-4 py-2 rounded-lg text-sm ${isActive('/db/lotte')}`}>
                🏢 롯데렌터카 DB
              </Link>

            </div>
          )}
        </div>

        {/* 3. 영업 관리 그룹 */}
        <div className="pt-4 border-t border-gray-800 mt-4">
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