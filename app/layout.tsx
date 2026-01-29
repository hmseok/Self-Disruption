import type { Metadata } from 'next'
import './globals.css'
import Sidebar from './components/Sidebar' // 👈 방금 만든 메뉴 불러오기

export const metadata: Metadata = {
  title: '세컨드라이프 ERP',
  description: '차량 렌탈 관리 시스템',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 flex min-h-screen text-gray-900">

        {/* 1. 왼쪽 고정 사이드바 */}
        <Sidebar />

        {/* 2. 오른쪽 메인 컨텐츠 영역 (메뉴 너비만큼 띄우기) */}
        <main className="flex-1 ml-64 min-h-screen transition-all">
          {children}
        </main>

      </body>
    </html>
  )
}