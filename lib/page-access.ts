/**
 * lib/page-access.ts — 서버측 페이지 권한 검증 helper
 *
 * 사용:
 *   const allowed = await canAccessPage(user, '/RideAccidentReports')
 *   if (!allowed) return NextResponse.json({...}, { status: 403 })
 *
 * 검증 우선순위:
 *   1) user.role === 'admin'   → 무조건 허용
 *   2) user_page_permissions 에 page_path 존재 + can_view=1 → 허용
 *   3) 그 외 → 차단
 *
 * 단일 페이지 path 또는 path 배열 (any-of 검증) 지원.
 * PR-6.10.h
 */
import { prisma } from '@/lib/prisma'

interface UserLike {
  id?: string
  role?: string
}

interface PermRow {
  page_path: string
  can_view: number
}

export async function canAccessPage(
  user: UserLike | null,
  pagePath: string | string[]
): Promise<boolean> {
  if (!user) return false
  if (user.role === 'admin') return true
  if (!user.id) return false

  const paths = Array.isArray(pagePath) ? pagePath : [pagePath]
  if (paths.length === 0) return false

  try {
    const rows = await prisma.$queryRaw<PermRow[]>`
      SELECT page_path, can_view
        FROM user_page_permissions
       WHERE user_id = ${user.id}
         AND can_view = 1
    `
    const allowed = new Set(rows.map(r => r.page_path))
    return paths.some(p => allowed.has(p))
  } catch (e) {
    // 테이블 미존재 등 — admin 만 통과
    console.warn('[canAccessPage]', (e as Error).message)
    return false
  }
}
