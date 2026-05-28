// ═══════════════════════════════════════════════════════════════
// withCompanyScope — API 라우트 회사 격리 미들웨어 헬퍼
//
// PR-HR-17 (2026-05-28, hr 세션) — multi-tenancy 회사 격리.
//   설계: 사용자 (2026-05-28) "회사별 격리" — 자기 회사 데이터만 접근.
//   메인 세션 헬퍼 lib/company-context.ts + verifyUser 위에 build.
//
// 사용 패턴:
//   // 본인 회사 데이터만 — admin 은 회사 무관
//   const auth = await withCompanyScope(req, { allowAdmin: true })
//   if ('error' in auth) return auth.error
//   const { user } = auth
//   // user.companyKey = 'FMI' | 'RIDE' (admin 도 본인 소속 회사)
//
//   // 특정 회사 전용 — 일치 안 하면 403
//   const auth = await withCompanyScope(req, {
//     requireCompany: 'FMI',
//     allowAdmin: true,
//   })
//
// 단계적 적용:
//   PR-HR-17 (본 PR) — 헬퍼 신설 + role-templates 2개 API 에 적용 시연
//   향후 PR — /api/employees, /api/profiles 등 단계적 마이그
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { getCompanyOfProfile } from '@/lib/company-context'
import type { CompanyKey } from '@/lib/company-brand'

export interface ScopedUser {
  id: string
  email: string
  role: string
  companyKey: CompanyKey
}

interface ScopeOptions {
  /** 본 라우트가 요구하는 회사 (불일치 시 403, allowAdmin 으로 우회 가능) */
  requireCompany?: CompanyKey
  /** admin role 은 회사 격리 무시 (모든 회사 접근) — 기본 false */
  allowAdmin?: boolean
  /** 'admin' 권한만 접근 허용 (감사 / 마스터 데이터 편집 등) — 기본 false */
  requireAdmin?: boolean
}

type Result =
  | { user: ScopedUser; error?: undefined }
  | { user?: undefined; error: NextResponse }

/**
 * API 라우트 진입 시 호출 — 인증 + 회사 scope 검증.
 *
 * 반환:
 *   { user: ScopedUser } — 통과 시 user.companyKey 포함
 *   { error: NextResponse } — 401/403 응답 (그대로 return)
 *
 * 인증 실패 시: 401 "인증 필요"
 * requireAdmin 실패 시: 403 "admin 권한 필요"
 * requireCompany 불일치 + !allowAdmin (또는 admin 아닌 경우): 403 "<X> 회사 전용"
 */
export async function withCompanyScope(
  req: NextRequest,
  options: ScopeOptions = {}
): Promise<Result> {
  const user = await verifyUser(req)
  if (!user) {
    return { error: NextResponse.json({ error: '인증 필요' }, { status: 401 }) }
  }

  if (options.requireAdmin && user.role !== 'admin') {
    return { error: NextResponse.json({ error: 'admin 권한 필요' }, { status: 403 }) }
  }

  // 회사 scope 조회 (raw SQL — 캐시 lib/company-context)
  const companyKey = await getCompanyOfProfile(user.id)

  if (options.requireCompany && options.requireCompany !== companyKey) {
    // admin 은 옵션에 따라 우회 가능
    if (!(options.allowAdmin && user.role === 'admin')) {
      return {
        error: NextResponse.json(
          {
            error: `${options.requireCompany} 회사 전용 라우트 (현재 소속: ${companyKey})`,
            _scope: { required: options.requireCompany, current: companyKey, role: user.role },
          },
          { status: 403 }
        ),
      }
    }
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      companyKey,
    },
  }
}

/**
 * SQL JOIN 시 회사 필터 helper — admin 은 전체, 그 외는 자기 회사만.
 *   현재 SQL 패턴:
 *     WHERE profiles.company_id = (SELECT id FROM companies WHERE company_key = ${companyKey})
 *     -- admin 이면 본 WHERE 절 생략
 *
 * 사용 예:
 *   const auth = await withCompanyScope(req, { allowAdmin: true })
 *   if ('error' in auth) return auth.error
 *   const companyFilter = scopeFilter(auth.user, 'p.company_id')
 *   // SQL: SELECT ... FROM profiles p WHERE 1=1 ${Prisma.raw(companyFilter)}
 */
export function scopeFilter(user: ScopedUser, columnExpr: string = 'p.company_id'): string {
  if (user.role === 'admin') return '' // admin 은 회사 무관
  // 보안 강화 — companyKey 는 'FMI'|'RIDE' 의 enum 이라 SQL injection 위험 X
  return `AND ${columnExpr} = (SELECT id FROM companies WHERE company_key = '${user.companyKey}')`
}
