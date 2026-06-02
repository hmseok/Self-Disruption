/**
 * lib/module-profile.ts
 *
 * 환경변수 `MODULE_PROFILE` 로 본 ERP 의 모듈 노출 범위를 제어한다.
 * 라이드 회사 (Ride-IT) EC2 별도 호스팅 — `MODULE_PROFILE=ride` 로 라이드만 노출.
 * hmseok.com Cloud Run — `MODULE_PROFILE=fmi` 로 FMI 만 노출.
 * 미설정 또는 'all' — 전체 모듈 노출 (기존 동작 유지 — 기본값).
 *
 * 본 모듈은 사이드 이펙트 없는 순수 함수만. 라우트 가드 / 메뉴 필터 /
 * PageTitle 필터는 본 함수를 참조한다.
 *
 * 가이드: _docs/RIDE-EC2-SETUP.md 부록 D
 * 신설: 2026-05-31 (PR-RIDE-EC2-1)
 */

export type ModuleProfile = 'fmi' | 'ride' | 'all'

/** RIDE 영역 모듈 — 폴더명 또는 라우트 prefix 기준 */
export const RIDE_MODULES: ReadonlySet<string> = new Set([
  'RideAccidentReports',
  'RideAccidents',
  'RideAssets',
  'RideCompliance',
  'RideCustomerData',
  'RideEmployees',
  'RideMTOps',
  'RideSettlements',
  'RideVehicleRegistry',
  'RideVision',
  'CallScheduler',
])

/**
 * 공유 모듈 — fmi·ride 양쪽 모두 노출 (각 인스턴스가 자기 데이터로 사용).
 * 프로파일 무관하게 항상 enabled. 예: 회의록(meetings).
 */
export const SHARED_MODULES: ReadonlySet<string> = new Set([
  'meetings',
])

/** RIDE 영역 API prefix — `/api/<prefix>` 매칭용 */
export const RIDE_API_PREFIXES: readonly string[] = [
  'ride-accident-reports',
  'ride-accidents',
  'ride-asset',           // ride-asset-* / ride-assets 모두 매칭
  'ride-audit-logs',
  'ride-capital-reports',
  'ride-charger',         // ride-chargers / ride-charger-maintenance
  'ride-compliance',
  'ride-contracts',
  'ride-customer',
  'ride-employees',
  'ride-mt-ops',
  'ride-settlements',
  'ride-vehicle',
  'ride-vision',
  'call-scheduler',
]

/** 공유 API prefix — fmi·ride 양쪽 노출. 프로파일 무관. */
export const SHARED_API_PREFIXES: readonly string[] = [
  'meetings',
]

/**
 * 현재 프로파일.
 *   · 서버 + 클라이언트 모두 동작 — NEXT_PUBLIC_MODULE_PROFILE (빌드 인라인) 우선
 *   · 서버 only — MODULE_PROFILE (fallback)
 *   · 미설정 또는 invalid — 'all'
 *
 * EC2 운영 시 .env.local 에 둘 다 같은 값 설정 권장:
 *   NEXT_PUBLIC_MODULE_PROFILE=ride
 *   MODULE_PROFILE=ride
 */
export function getModuleProfile(): ModuleProfile {
  const raw = (
    process.env.NEXT_PUBLIC_MODULE_PROFILE ||
    process.env.MODULE_PROFILE ||
    ''
  ).toLowerCase().trim()
  if (raw === 'ride' || raw === 'fmi' || raw === 'all') return raw
  return 'all'
}

/**
 * 모듈 이름 (폴더 또는 그룹 라벨) 이 현재 프로파일에서 노출되는지.
 * @example
 *   isModuleEnabled('RideCompliance')  // profile=ride → true, profile=fmi → false
 *   isModuleEnabled('finance')         // profile=fmi → true, profile=ride → false
 *   isModuleEnabled('CallScheduler')   // profile=ride → true
 */
export function isModuleEnabled(moduleName: string): boolean {
  const profile = getModuleProfile()
  if (profile === 'all') return true
  if (SHARED_MODULES.has(moduleName)) return true   // 공유 모듈 — 양쪽 노출
  const isRide = RIDE_MODULES.has(moduleName)
  return profile === 'ride' ? isRide : !isRide
}

/**
 * 경로 (라우트 또는 API path) 가 현재 프로파일에서 노출되는지.
 * @example
 *   isPathEnabled('/RideCompliance/forms/F-M01-01')   // ride 프로파일 → true
 *   isPathEnabled('/finance/settlement')              // fmi 프로파일 → true
 *   isPathEnabled('/api/ride-compliance/officers')    // ride 프로파일 → true
 */
export function isPathEnabled(path: string): boolean {
  const profile = getModuleProfile()
  if (profile === 'all') return true

  // /api/<prefix> 매칭
  if (path.startsWith('/api/')) {
    const apiTail = path.slice(5).split('/')[0] || ''
    if (SHARED_API_PREFIXES.some(p => apiTail.startsWith(p))) return true   // 공유 API — 양쪽
    const isRideApi = RIDE_API_PREFIXES.some(p => apiTail.startsWith(p))
    return profile === 'ride' ? isRideApi : !isRideApi
  }

  // /(employees)/<Module>/ 또는 /<Module>/ 매칭
  const segments = path.split('/').filter(Boolean)
  // route group 통과: '(employees)', '(admin)', '(public)' 무시
  const firstReal = segments.find(s => !s.startsWith('(')) || ''
  if (SHARED_MODULES.has(firstReal)) return true   // 공유 모듈 — 양쪽
  const isRidePath = RIDE_MODULES.has(firstReal)
  return profile === 'ride' ? isRidePath : !isRidePath
}

/**
 * 디버그용 — 현재 프로파일 상태 객체. UI 노출 X (관리자 진단 도구 전용).
 */
export function describeProfile(): {
  profile: ModuleProfile
  source: 'env-public' | 'env-server' | 'default'
  ride_modules: string[]
  ride_api_prefixes: string[]
  shared_modules: string[]
  shared_api_prefixes: string[]
} {
  const publicRaw = (process.env.NEXT_PUBLIC_MODULE_PROFILE || '').toLowerCase().trim()
  const serverRaw = (process.env.MODULE_PROFILE || '').toLowerCase().trim()
  const validPublic = publicRaw === 'ride' || publicRaw === 'fmi' || publicRaw === 'all'
  const validServer = serverRaw === 'ride' || serverRaw === 'fmi' || serverRaw === 'all'
  return {
    profile: getModuleProfile(),
    source: validPublic ? 'env-public' : (validServer ? 'env-server' : 'default'),
    ride_modules: Array.from(RIDE_MODULES),
    ride_api_prefixes: [...RIDE_API_PREFIXES],
    shared_modules: Array.from(SHARED_MODULES),
    shared_api_prefixes: [...SHARED_API_PREFIXES],
  }
}
