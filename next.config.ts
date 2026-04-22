import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // 🐳 도커 배포 필수 설정
  serverExternalPackages: ['mysql2'], // cafe24 DB — standalone에서 외부 모듈로 관리
  // ⚠️ Next.js 16은 Turbopack이 기본 — webpack 강제 시 런타임 청크 불일치로 hydration 실패
  // bundler: 'webpack',  // (16.1.6에서 standalone CSS 버그 수정됨 — 제거)

  // 1. 빌드 에러 무시 (Next.js 16에서는 typescript만 지원, eslint는 next.config에서 제거됨)
  typescript: {
    ignoreBuildErrors: true,
  },

  // 2. 업로드 용량 제한 해제
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  // 3. 개발모드 인디케이터 비활성화 (좌측하단 떠다니는 N 아이콘)
  devIndicators: false,

  // 4. Phase I (#85) — 구 finance 경로 → /finance/transactions 탭 허브 301 리다이렉트
  //    레거시 페이지(/finance/page.tsx 등)는 _tabs/*에서 재수출로 여전히 사용되지만,
  //    URL 라우팅은 허브 단일 진입점으로 강제한다 (외부 북마크/링크 보존용 301).
  redirects: async () => [
    {
      source: '/finance',
      destination: '/finance/transactions?tab=dashboard',
      permanent: true,
    },
    {
      source: '/finance/upload',
      destination: '/finance/transactions?tab=classify',
      permanent: true,
    },
    {
      source: '/finance/uploads',
      destination: '/finance/transactions?tab=uploads',
      permanent: true,
    },
    {
      source: '/finance/cards',
      destination: '/finance/transactions?tab=cards',
      permanent: true,
    },
    {
      source: '/finance/codef',
      destination: '/finance/transactions?tab=codef',
      permanent: true,
    },
  ],

  // 5. Cloudflare CDN 캐시 제어 — HTML은 캐시 금지, 정적 자산은 영구 캐시
  headers: async () => [
    {
      // _next/static 은 파일명에 해시가 포함되므로 안전하게 장기 캐시
      source: '/_next/static/(.*)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    {
      // HTML 페이지는 항상 최신 버전을 가져오도록 캐시 금지
      source: '/((?!_next/static).*)',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Pragma', value: 'no-cache' },
        { key: 'Expires', value: '0' },
      ],
    },
  ],
};

export default nextConfig;