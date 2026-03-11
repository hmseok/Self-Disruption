'use client'

import { usePathname } from 'next/navigation'
import { AppProvider } from '@/app/context/AppContext'
import { UploadProvider } from '@/app/context/UploadContext'
import ClientLayout from './ClientLayout'
import UploadWidget from '../UploadWidget'

/**
 * 경로에 따라 ClientLayout 적용 여부를 결정하는 래퍼.
 * /sign 경로는 게스트 전용이므로 ClientLayout(인증 체크, 사이드바) 없이 렌더링.
 */
export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // 게스트 전용 경로 — ClientLayout 완전 우회
  const isGuestRoute = pathname.startsWith('/sign')
    || pathname.startsWith('/settlement/view')
    || pathname.startsWith('/e-contract/')

  if (isGuestRoute) {
    return <>{children}</>
  }

  // 일반 경로 — 기존 AppProvider + ClientLayout + UploadProvider
  return (
    <AppProvider>
      <UploadProvider>
        <ClientLayout>
          {children}
        </ClientLayout>
        <UploadWidget />
      </UploadProvider>
    </AppProvider>
  )
}
