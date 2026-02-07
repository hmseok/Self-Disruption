import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AppProvider } from '@/app/context/AppContext'

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
        {/* 👇 여기에 Sidebar가 있으면 절대 안 됩니다. 오직 Provider와 children만! */}
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  )
}