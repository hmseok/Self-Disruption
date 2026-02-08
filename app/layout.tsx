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
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Sideline ERP',
  description: 'Smart Mobility Business Solution',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Sideline',
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
    <html lang="ko">
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
