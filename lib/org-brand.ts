// ═══════════════════════════════════════════════════════════════════
// 조직 브랜드 (org-brand) — 회사/사업부별 헤더 표기 분기
// ═══════════════════════════════════════════════════════════════════
//
// 사용 시나리오:
//   FMI 매니저 김경필이 「CX팀」 부서 (라이드주식회사 소속) 면
//   로그인 시 헤더에 RIDE CARE / 라이드주식회사 표시.
//
// 식별 방식:
//   profiles.department.name 이 RIDE_DEPARTMENTS 사전과 부분 일치 시
//   → org_brand = 'RIDE'
//   → 헤더 변경
//
// 확장:
//   라이드 안에 영업팀 / 운영팀 / 정비팀 신설 시 사전에 키워드만 추가.
//   향후 departments 테이블에 org_brand 컬럼 추가 시 본 파일 deprecated.
// ═══════════════════════════════════════════════════════════════════

export type OrgBrand = 'FMI' | 'RIDE'

export interface OrgBrandConfig {
  brand: OrgBrand
  primaryLabel: string   // 좌측 상단 (서비스/브랜드명)
  companyLabel: string   // 우측 상단 (법인명)
}

export const ORG_BRAND_CONFIGS: Record<OrgBrand, OrgBrandConfig> = {
  FMI: {
    brand: 'FMI',
    primaryLabel: 'FMI ERP',
    companyLabel: '주식회사 에프엠아이',
  },
  RIDE: {
    brand: 'RIDE',
    primaryLabel: 'RIDE CARE',
    companyLabel: '라이드 주식회사',
  },
}

// 라이드 소속 부서명 사전 (부분 일치)
// 부서가 늘어나면 키워드만 추가 (예: '라이드 영업팀', '라이드 운영팀' 자동 인식 — '라이드' prefix 만 있어도 OK)
export const RIDE_DEPARTMENTS_KEYWORDS: string[] = [
  '라이드주식회사',
  '라이드',
  'Ride',
  'RIDE',
  'CX팀',           // 라이드 소속 콜센터/CX
]

// 라이드 소속 이메일 도메인 사전
// 부서 정보 없어도 이메일 도메인으로 라이드 직원 식별 가능
export const RIDE_EMAIL_DOMAINS: string[] = [
  'rideoffice.kr',
  'rideoffice.com',
  'ride.co.kr',
]

/**
 * 부서명이 라이드 소속인지 판별 (부분 일치).
 */
export function isRideDepartment(deptName?: string | null): boolean {
  if (!deptName) return false
  const name = String(deptName).trim()
  if (!name) return false
  return RIDE_DEPARTMENTS_KEYWORDS.some(k => name.includes(k))
}

/**
 * 이메일이 라이드 도메인인지 판별.
 */
export function isRideEmail(email?: string | null): boolean {
  if (!email) return false
  const lc = String(email).toLowerCase().trim()
  return RIDE_EMAIL_DOMAINS.some(d => lc.endsWith('@' + d) || lc.endsWith('.' + d))
}

/**
 * org_brand 결정 — 부서명 OR 이메일 도메인 매칭.
 * 둘 중 하나라도 라이드 소속이면 RIDE.
 */
export function detectOrgBrand(deptName?: string | null, email?: string | null): OrgBrand {
  if (isRideDepartment(deptName)) return 'RIDE'
  if (isRideEmail(email)) return 'RIDE'
  return 'FMI'
}

/**
 * 헤더 설정 (편의 함수) — 부서명 + 이메일 모두 고려.
 */
export function getOrgBrandConfig(deptName?: string | null, email?: string | null): OrgBrandConfig {
  return ORG_BRAND_CONFIGS[detectOrgBrand(deptName, email)]
}
