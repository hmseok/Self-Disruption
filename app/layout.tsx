import './globals.css'
import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
// IBM Plex Sans KR — CDN으로 로드 (빌드 시 Google Fonts 접근 불가 대비)
import ConditionalLayout from '@/app/components/auth/ConditionalLayout'


export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
}

// PR-MULTI-BRAND P3+g (2026-05-27 사용자 보고):
//   layout 의 title 'FMI ERP' 가 카톡/SNS 공유 link preview 에 노출 → 사용자 명령
//   「FMI 가 뜨면 어떻게」.
//   서브도메인 기반 동적 metadata:
//     ride.hmseok.com → '라이드 주식회사' (RIDE 직원에게 자기 브랜드)
//     그 외 (hmseok.com 등) → 중립 'ERP' (FMI 표기 노출 X — P3+e 와 동일 정책)
//   OG tags 도 같이 설정 — 카톡·페이스북 등 공유 preview 통일.
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const host = (h.get('host') || '').toLowerCase()
  const isRide = host.startsWith('ride.')
  const publicName = isRide ? '라이드 주식회사' : 'ERP'
  const description = isRide ? '라이드 주식회사 통합 운영 시스템' : '통합 운영 시스템'
  return {
    title: publicName,
    description,
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: publicName,
    },
    openGraph: {
      title: publicName,
      description,
      siteName: publicName,
      type: 'website',
    },
    twitter: {
      title: publicName,
      description,
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        {/* 모바일 CSS 로딩 실패 대비 — 최소한의 레이아웃 보장 인라인 스타일 */}
        <style dangerouslySetInnerHTML={{ __html: `
          html,body{margin:0;padding:0;height:100%;font-family:'IBM Plex Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
          body{background:#f9fafb;color:#171717}
          *,*::before,*::after{box-sizing:border-box}
          .hidden{display:none}
          @media(min-width:768px){.md\\:block{display:block}.md\\:hidden{display:none}}
          @media(min-width:1024px){.lg\\:flex{display:flex}.lg\\:ml-60{margin-left:15rem}}
          .flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1 1 0%}
          .items-center{align-items:center}.justify-center{justify-content:center}
          .min-h-screen{min-height:100vh}.w-full{width:100%}.overflow-x-hidden{overflow-x:hidden}
          .bg-white{background:#fff}.text-center{text-align:center}
          .p-6{padding:1.5rem}.rounded-lg{border-radius:.5rem}
          input,select,textarea{font-size:16px}
        `}} />
      </head>
      <body>
        <ConditionalLayout>
          {children}
        </ConditionalLayout>
      </body>
    </html>
  )
}
