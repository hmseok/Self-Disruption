import { adminAuth } from './firebase-admin'
import { prisma } from './prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

/**
 * Firebase Admin 또는 JWT 디코딩으로 userId 추출
 * 1. Firebase Admin SDK 검증 (우선)
 * 2. JWT 수동 디코딩 (fallback — Firebase 토큰 호환)
 */
export async function getUserIdFromToken(token: string): Promise<string | null> {
  // 1. Firebase Admin SDK 검증 (우선)
  if (adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(token)
      return decoded.uid
    } catch {
      // fallthrough to JWT decode
    }
  }

  // 2. JWT 수동 디코딩 (fallback — 레거시 토큰 호환)
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch {
    return null
  }
}

/**
 * Request에서 Authorization 헤더를 읽고 사용자 정보 조회
 */
export async function verifyUser(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null

    const token = authHeader.replace('Bearer ', '')
    const userId = await getUserIdFromToken(token)
    if (!userId) return null

    const profiles = await prisma.$queryRaw<any[]>`
      SELECT id, role, company_id FROM profiles WHERE id = ${userId} LIMIT 1
    `
    const profile = profiles[0]
    return profile ? { id: userId, ...serialize(profile) } : null
  } catch {
    return null
  }
}
