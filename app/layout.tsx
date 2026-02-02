import type { Metadata } from 'next'
import './globals.css'
import ClientLayout from './components/ClientLayout' // 👈 기존 사이드바 레이아웃 (유지!)
import SupabaseProvider from './supabase-provider' // 👈 로그인 관리
import { UploadProvider } from './context/UploadContext' // 👈 업로드 기능
import UploadWidget from './components/UploadWidget' // 👈 업로드 위젯

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
        {/* 1. 로그인 세션 관리 */}
        <SupabaseProvider>
          {/* 2. 업로드 상태 관리 */}
          <UploadProvider>

            {/* 3. 기존 레이아웃 (사이드바 포함) */}
            <ClientLayout>
              {children}
            </ClientLayout>

            {/* 4. 화면 우측 하단에 뜨는 업로드 위젯 */}
            <UploadWidget />

          </UploadProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}