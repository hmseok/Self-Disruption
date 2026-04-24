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

    // JWT 페이로드에서 사용자 정보 추출
    const decoded = verifyJwt(token, JWT_SECRET)
    if (!decoded) {
      lastVerifyError = 'JWT decode failed'
      return null
    }

    // 단독 ERP: company_id 조회
    let companyId: string | null = null
    try {
      const companies = await prisma.$queryRaw<any[]>`SELECT id FROM companies LIMIT 1`
      if (companies[0]) companyId = companies[0].id
    } catch {
      // companies 테이블 미존재 시 null
    }

    // DB에서 프로필 조회 시도
    let profile: any = null
    try {
      const profiles = await prisma.$queryRaw<any[]>`
        SELECT id, role FROM profiles WHERE id = ${userId} LIMIT 1
      `
      profile = profiles[0]
    } catch (dbErr: any) {
      console.warn('[auth] profiles 조회 실패:', dbErr?.message)
    }

    // ★ 프로필이 없으면 JWT 페이로드 기반으로 자동 생성 시도
    if (!profile) {
      try {
        await prisma.$executeRaw`
          INSERT INTO profiles (id, email, role, is_active, is_approved, created_at, updated_at)
          VALUES (${userId}, ${decoded.email || ''}, ${decoded.role || 'user'}, 1, 1, NOW(), NOW())
        `
        console.warn('[auth] 프로필 자가 복구 성공:', userId, decoded.email)
        profile = { id: userId, role: decoded.role || 'user' }
      } catch (insertErr: any) {
        // INSERT 실패해도 JWT 페이로드로 인증 통과 (테이블 구조 불일치 대비)
        console.warn('[auth] 프로필 INSERT 실패, JWT 폴백:', insertErr?.message)
        profile = { id: userId, role: decoded.role || 'user' }
      }
    }

    lastVerifyError = null
    return { id: userId, company_id: companyId, ...serialize(profile) }
  } catch (e: any) {
    lastVerifyError = 'CATCH: ' + (e?.message || String(e))
    return null
  }
}
