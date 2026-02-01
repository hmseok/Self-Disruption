import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // 🐳 도커 배포 필수 설정

  // 1. 빌드 시 에러 무시 설정 (기존 유지)
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // 🔥 2. [추가됨] 업로드 용량 제한 해제 (기본 1MB -> 10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  // (참고) 만약 API 라우트에서 413 에러가 계속된다면,
  // 클라이언트(page.tsx)에서 이미지를 리사이징해서 보내는 로직이 필요할 수 있습니다.
};

export default nextConfig;