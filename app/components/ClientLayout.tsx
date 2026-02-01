'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  // 접힘 상태 관리 (기본값: false = 펼쳐짐)
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900">

      {/* 사이드바에 상태와 제어 함수 전달 */}
      <Sidebar isCollapsed={isCollapsed} toggleSidebar={() => setIsCollapsed(!isCollapsed)} />

      {/* 메인 컨텐츠: 사이드바 상태에 따라 왼쪽 여백(margin) 조절 */}
      <main
        className={`flex-1 transition-all duration-300 ease-in-out min-h-screen ${
          isCollapsed ? 'ml-20' : 'ml-64'
        }`}
      >
        {children}
      </main>

    </div>
  )
}