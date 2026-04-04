import { prisma } from './prisma'
import crypto from 'crypto'

const JWT_SECRET = process.env.JWT_SECRET || 'fmi_dev_secret_change_in_production'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

/**
 * JWT HS256 검증 (jsonwebtoken 라이브러리 없이 Node.js crypto만 사용)
 */
function verifyJwt(token: string, secret: string): any | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    // 헤더 검증
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    if (header.alg !== 'HS256') return null

    // 서명 검증
    const signatureInput = parts[0] + '.' + parts[1]
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signatureInput)
      .digest('base64url')

    if (expectedSignature !== parts[2]) return null

    // 페이로드 디코딩
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

    // 만료 확인
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

/**
 * Request에서 Authorization 헤더를 읽고 사용자 정보 조회
 */
export async function verifyUser(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null

    const token = authHeader.replace('Bearer ', '')
    const userId = getUserIdFromToken(token)
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
