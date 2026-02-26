import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { AppProvider } from '@/app/context/AppContext'
import ClientLayout from '@/app/components/auth/ClientLayout'
import { UploadProvider } from '@/app/context/UploadContext'
import UploadWidget from '@/app/components/UploadWidget'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Self-Disruption ERP',
  description: 'Enterprise Business Solution',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Self-Disruption',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 모바일 CSS 로딩 실패 대비 — 최소한의 레이아웃 보장 인라인 스타일 */}
        <style dangerouslySetInnerHTML={{ __html: `
          html,body{margin:0;padding:0;height:100%;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
          body{background:#f9fafb;color:#171717}
          *,*::before,*::after{box-sizing:border-box}
          .hidden{display:none!important}
          @media(min-width:1024px){.lg\\:flex{display:flex!important}.lg\\:ml-60{margin-left:15rem!important}}
          .flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1 1 0%}
          .items-center{align-items:center}.justify-center{justify-content:center}
          .min-h-screen{min-height:100vh}.w-full{width:100%}.overflow-x-hidden{overflow-x:hidden}
          .bg-white{background:#fff}.text-center{text-align:center}
          .p-6{padding:1.5rem}.rounded-lg{border-radius:.5rem}
          input,select,textarea{font-size:16px}
        `}} />
      </head>
      <body className={inter.className}>
        <AppProvider>
          <UploadProvider>
            <ClientLayout>
              {children}
            </ClientLayout>
            <UploadWidget />
          </UploadProvider>
        </AppProvider>
      </body>
    </html>
  )
}
