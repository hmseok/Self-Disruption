import * as jwt from 'jsonwebtoken'
import { prisma } from './prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'fmi_dev_secret_change_in_production'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

/**
 * JWT 토큰에서 userId 추출
 */
export function getUserIdFromToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
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
