/**
 * lib/ride-asset-perm.ts
 *
 * 라이드 자산 관리 — 권한 체크 helper
 *
 * 권한자(asset admin) 판정:
 *   1. users.role === 'admin' (라이드 시스템 관리자 — 자동 권한자)
 *   2. ride_asset_admins 화이트리스트에 user_id 등록됨 (총무팀)
 *
 * 마이그레이션 미적용 환경에서도 graceful — 테이블 없으면 admin role 만 통과.
 *
 * 사용:
 *   import { isAssetAdmin } from '@/lib/ride-asset-perm'
 *   if (!(await isAssetAdmin(user))) return forbidden
 */
import { prisma } from './prisma'

interface UserLike {
  id?: string
  role?: string | null
}

/**
 * 권한자 여부 (admin OR 화이트리스트).
 * 마이그 미적용 시 admin role 만 통과.
 */
export async function isAssetAdmin(user: UserLike | null | undefined): Promise<boolean> {
  if (!user || !user.id) return false
  if (user.role === 'admin') return true
  try {
    const rows = await prisma.$queryRaw<Array<{ user_id: string }>>`
      SELECT user_id FROM ride_asset_admins WHERE user_id = ${user.id} LIMIT 1
    `
    return Array.isArray(rows) && rows.length > 0
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      // 마이그레이션 미적용 — admin role 만 통과
      return false
    }
    // 다른 에러는 권한 없음으로 안전하게 처리
    console.error('[isAssetAdmin] error:', err.code, err.message)
    return false
  }
}

/**
 * 권한자 목록 (admin role 자동 포함 X — 화이트리스트만 반환).
 */
export async function listAssetAdmins(): Promise<Array<{
  user_id: string
  granted_by: string | null
  granted_at: Date | string
  note: string | null
  user_name?: string | null
}>> {
  try {
    const rows = await prisma.$queryRaw<Array<{
      user_id: string
      granted_by: string | null
      granted_at: Date | string
      note: string | null
      user_name: string | null
    }>>`
      SELECT a.user_id, a.granted_by, a.granted_at, a.note,
             u.name AS user_name
        FROM ride_asset_admins a
        LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.granted_at DESC
    `
    return rows
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return []
    }
    throw e
  }
}
