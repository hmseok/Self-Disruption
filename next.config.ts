import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // 🐳 도커 배포 필수 설정
  // mysql2는 순수 JS — Turbopack이 직접 번들하므로 serverExternalPackages 불필요
  // ⚠️ Next.js 16은 Turbopack이 기본 — webpack 강제 시 런타임 청크 불일치로 hydration 실패
  // bundler: 'webpack',  // (16.1.6에서 standalone CSS 버그 수정됨 — 제거)

  // 1. 빌드 에러 무시 (TypeScript는 아직 여기서 지원합니다)
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

  // 4. Cloudflare CDN 캐시 제어 — HTML은 캐시 금지, 정적 자산은 영구 캐시
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