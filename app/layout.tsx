import type { Metadata } from 'next'
import './globals.css'
import ClientLayout from './components/ClientLayout' // 👈 새로 만든 컴포넌트

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
      <body>
        {/* 모든 클라이언트 UI 로직(사이드바 상태 등)을 여기서 처리 */}
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  )
}