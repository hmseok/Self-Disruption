/**
 * lib/ride-compliance-perm.ts
 *
 * 라이드 정보보안 (RideCompliance) — 권한 체크 helper
 *
 * 3-tier 조직 (매뉴얼 통합본 5.17 제6/9조 + 제26조):
 *   1. 'cpo'           — 개인정보보호 책임자 (이사급, 임성민) — 전체 권한 + 결재
 *   2. 'manager'       — 개인정보보호 관리자 (부장급, 석호민·양재희) — 운영 + CPO 보고
 *   3. 'handler'       — 개인정보취급자 (전 임·직원) — 본인 사고 보고 + 본인 자산 조회
 *   4. 'incident_team' — 관리팀 침해사고 일선 (제26조 ①) — 사고 1차 분류
 *
 * 시스템 admin (users.role === 'admin') 은 cpo 와 동일 권한으로 처리.
 *
 * 마이그레이션 미적용 환경에서도 graceful — 테이블 없으면 admin role 만 통과.
 *
 * 사용:
 *   import { getOfficerRole, isManager, isCpo, canHandleIncident } from '@/lib/ride-compliance-perm'
 *   if (!(await isManager(user))) return forbidden
 */
import { prisma } from './prisma'

interface UserLike {
  id?: string
  role?: string | null
}

export type ComplianceRole = 'cpo' | 'manager' | 'handler' | 'incident_team' | null

/**
 * 사용자의 현재 활성 컴플라이언스 역할 반환.
 *
 * users.role === 'admin' → 'cpo' 로 매핑 (시스템 관리자 자동 권한).
 * 1명이 여러 role 보유 가능 — 우선순위: cpo > manager > incident_team > handler.
 * 마이그 미적용 시 admin → 'cpo', 일반 사용자 → null.
 */
export async function getOfficerRole(user: UserLike | null | undefined): Promise<ComplianceRole> {
  if (!user || !user.id) return null
  if (user.role === 'admin') return 'cpo'
  try {
    const rows = await prisma.$queryRaw<Array<{ role: string }>>`
      SELECT role FROM ride_compliance_officers
       WHERE user_id = ${user.id}
         AND is_active = 1
         AND (released_at IS NULL OR released_at > CURDATE())
    `
    if (!rows.length) return null
    // 우선순위: cpo > manager > incident_team > handler
    const order: Record<string, number> = { cpo: 4, manager: 3, incident_team: 2, handler: 1 }
    const top = rows.reduce<{ role: string; r: number }>(
      (acc, cur) => {
        const r = order[cur.role] || 0
        return r > acc.r ? { role: cur.role, r } : acc
      },
      { role: '', r: 0 }
    )
    return (top.role as ComplianceRole) || null
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return null
    }
    console.error('[getOfficerRole] error:', err.code, err.message)
    return null
  }
}

/** CPO 권한 (결재·승인·전체 데이터). admin role 자동 포함. */
export async function isCpo(user: UserLike | null | undefined): Promise<boolean> {
  const r = await getOfficerRole(user)
  return r === 'cpo'
}

/** 관리자 이상 (cpo OR manager). 자산·사고 등록·수정 권한. */
export async function isManager(user: UserLike | null | undefined): Promise<boolean> {
  const r = await getOfficerRole(user)
  return r === 'cpo' || r === 'manager'
}

/**
 * 사고 처리 권한 (cpo / manager / incident_team).
 * 관리팀(제26조 ①)은 사고 1차 분류 가능, 단 자산 등록·수정은 불가.
 */
export async function canHandleIncident(user: UserLike | null | undefined): Promise<boolean> {
  const r = await getOfficerRole(user)
  return r === 'cpo' || r === 'manager' || r === 'incident_team'
}

/**
 * 사고 보고 권한 — 매뉴얼 제27조 "즉시 모든 직원은 관리팀에 사고를 접수".
 * 즉 인증된 모든 사용자가 사고 보고 가능 (취급자 포함). null 만 거부.
 */
export function canReportIncident(user: UserLike | null | undefined): boolean {
  return !!(user && user.id)
}
