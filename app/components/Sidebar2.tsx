'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Sidebar() {
  const pathname = usePathname()

  const menuItems = [
    { name: '대시보드', path: '/', icon: '📊' },
    { name: '차량 관리', path: '/cars', icon: '🚙' }, // /cars/new 등 하위 페이지도 포함 인식
    { name: '견적/계약', path: '/quotes', icon: '📄' },
    { name: '고객 관리', path: '/customers', icon: '👥' },
  ]

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col fixed left-0 top-0 border-r border-gray-800 z-50">

      {/* 로고 영역 */}
      <div className="h-20 flex items-center px-8 border-b border-gray-800">
        <h1 className="text-xl font-black tracking-tighter text-white">
          SECOND<span className="text-blue-500">LIFE</span>
        </h1>
      </div>

      {/* 메뉴 리스트 */}
      <nav className="flex-1 py-6 px-4 space-y-2">
        {menuItems.map((item) => {
          // 현재 주소가 메뉴 경로와 일치하거나 포함하면 활성화 (Active)
          const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path))

          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/50'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-sm">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* 하단 유저 정보 (장식) */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs">👨‍💼</div>
            <div>
                <p className="text-sm font-bold">관리자님</p>
                <p className="text-xs text-gray-500">Super Admin</p>
            </div>
        </div>
      </div>
    </aside>
  )
}