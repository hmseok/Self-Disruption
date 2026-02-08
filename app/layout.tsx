import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AppProvider } from '@/app/context/AppContext'
import ClientLayout from '@/app/components/auth/ClientLayout'
import { UploadProvider } from '@/app/context/UploadContext'
import UploadWidget from '@/app/components/UploadWidget'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Sideline ERP',
  description: 'Smart Mobility Business Solution',
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
