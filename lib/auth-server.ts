import { prisma } from './prisma'
import crypto from 'crypto'

const JWT_SECRET = process.env.JWT_SECRET || 'fmi_dev_secret_change_in_production'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

/**
 * JWT HS256 검증 (Node.js crypto만 사용)
 */
function verifyJwt(token: string, secret: string): any | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    if (header.alg !== 'HS256') return null

    const signatureInput = parts[0] + '.' + parts[1]
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signatureInput)
      .digest('base64url')

    if (expectedSignature !== parts[2]) return null

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null

    return payload
  } catch {
    return null
  }
}

/**
 * JWT 토큰에서 userId 추출
 */
export function getUserIdFromToken(token: string): string | null {
  try {
    const decoded = verifyJwt(token, JWT_SECRET)
    if (!decoded) return null
    return decoded.sub || decoded.userId || null
  } catch {
    return null
  }
}

// 마지막 에러를 저장 (디버그용)
export let lastVerifyError: string | null = null

/**
 * Request에서 Authorization 헤더를 읽고 사용자 정보 조회
 */
export async function verifyUser(request: Request) {
  lastVerifyError = null
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      lastVerifyError = 'no auth header'
      return null
    }

    const token = authHeader.replace('Bearer ', '')
    const userId = getUserIdFromToken(token)
    if (!userId) {
      lastVerifyError = 'getUserIdFromToken returned null'
      return null
    }

    lastVerifyError = 'before prisma query, userId=' + userId
    const profiles = await prisma.$queryRaw<any[]>`
      SELECT id, role FROM profiles WHERE id = ${userId} LIMIT 1
    `
    lastVerifyError = 'after prisma query, count=' + profiles.length

    const profile = profiles[0]
    if (!profile) {
      lastVerifyError = 'profile not found for userId=' + userId
      return null
    }

    lastVerifyError = null
    return { id: userId, ...serialize(profile) }
  } catch (e: any) {
    lastVerifyError = 'CATCH: ' + (e?.message || String(e))
    return null
  }
}
