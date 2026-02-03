import type { Metadata } from 'next'
import './globals.css'
import ClientLayout from './components/ClientLayout'
import SupabaseProvider from './supabase-provider'
import { UploadProvider } from './context/UploadContext'
import UploadWidget from './components/UploadWidget'
import { AppProvider } from './context/AppContext' // 👈 [중요] 회사 관리 기능 추가

export const metadata: Metadata = {
  title: 'Sideline', // 👈 이름 변경 완료
  description: 'Smart Business Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>
        <SupabaseProvider>
          {/* 👇 AppProvider로 감싸야 회사/권한 관리가 작동합니다 */}
          <AppProvider>
            <UploadProvider>

              <ClientLayout>
                {children}
              </ClientLayout>

              <UploadWidget />

            </UploadProvider>
          </AppProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}