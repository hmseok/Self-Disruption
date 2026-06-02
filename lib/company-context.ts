// ═══════════════════════════════════════════════════════════════
// PR-MULTI-BRAND P3+a — 회사 컨텍스트 헬퍼 (서버 전용)
// 설계: _docs/HR-OPERATIONS.md § 9.5 (옵션 C — 회사 분리)
// ───────────────────────────────────────────────────────────────
// profiles.company_id (P1 마이그) 를 「회사 분기의 단일 진실」로 삼는다.
// 기존 「dept === '라이드주식회사'」 / 「email LIKE '%@rideoffice%'」 같은
// 문자열 매칭 분기는 이 헬퍼로 점진 교체.
//
// 사용 예 (서버 라우트):
//   const company = await getCompanyOfProfile(user.id)
//   if (company === 'RIDE') { ... }
// ═══════════════════════════════════════════════════════════════

import { prisma } from '@/lib/prisma'
import type { CompanyKey } from '@/lib/company-brand'

// company UUID 캐시 (process lifetime — companies 행은 거의 안 바뀜)
const _companyIdCache: Partial<Record<CompanyKey, string>> = {}

/**
 * company_key('FMI'|'RIDE') → companies.id (UUID).
 * 미존재/오류 시 null.
 */
export async function getCompanyIdByKey(key: CompanyKey): Promise<string | null> {
  if (_companyIdCache[key]) return _companyIdCache[key] as string
  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM companies WHERE company_key = ${key} LIMIT 1
    `
    if (rows.length === 0) return null
    _companyIdCache[key] = rows[0].id
    return rows[0].id
  } catch {
    return null
  }
}

/**
 * profile.id → CompanyKey('FMI'|'RIDE').
 * profiles.company_id JOIN companies.company_key 가 RIDE 이면 RIDE,
 * 그 외(NULL / FMI / 조회 실패) 모두 FMI 로 폴백.
 */
export async function getCompanyOfProfile(_profileId: string): Promise<CompanyKey> {
  // PR-FMI-ONLY-PURGE Phase 3b (2026-06-02) — 라이드 분리: 단독회사 FMI 고정.
  return 'FMI'
}

/**
 * 편의 함수 — profile.id 가 라이드 소속인지 boolean.
 */
export async function isRideProfile(profileId: string): Promise<boolean> {
  return (await getCompanyOfProfile(profileId)) === 'RIDE'
}
