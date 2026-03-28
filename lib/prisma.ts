// ============================================================
// lib/prisma.ts — Prisma Client (Google Cloud SQL MySQL)
//
// 연결 방식:
//   - 로컬 개발: Cloud SQL Auth Proxy (127.0.0.1:3307)
//   - Cloud Run 운영: Cloud SQL Connector (IAM 기반, 비밀번호 불필요)
// ============================================================

import { PrismaClient } from '@prisma/client'

// ============================================================
// PrismaClient 싱글톤 (Next.js 핫리로드 시 중복 연결 방지)
// ============================================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// ============================================================
// 연결 상태 확인 헬퍼
// ============================================================
export async function checkPrismaConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

// ============================================================
// 환경변수 설정 가이드
// ============================================================
// .env.local (로컬 개발 — Cloud SQL Proxy 사용):
//   cloud-sql-proxy secondlife-485816:asia-northeast3:r-care-db --port=3307
//   DATABASE_URL="mysql://root:PASSWORD@127.0.0.1:3307/fmi_op"
//
// .env.local (로컬 개발 — Public IP 직접):
//   DATABASE_URL="mysql://root:PASSWORD@34.47.105.219:3306/fmi_op"
//
// Dockerfile (Cloud Run 운영 — Unix Socket, 가장 빠름):
//   ENV DATABASE_URL="mysql://root:PASSWORD@localhost/fmi_op?socket=/cloudsql/secondlife-485816:asia-northeast3:r-care-db"
//
// Cloud SQL Connection Name: secondlife-485816:asia-northeast3:r-care-db
// ============================================================
