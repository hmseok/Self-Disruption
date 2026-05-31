// ═══════════════════════════════════════════════════════════════════
// FMI ERP — 메뉴 레지스트리 (단일 SOURCE OF TRUTH)
// ═══════════════════════════════════════════════════════════════════
//
// PR-RIDE-EC2-2 (2026-05-31) — MODULE_PROFILE 환경변수 기반 자동 필터:
//   · NEXT_PUBLIC_MODULE_PROFILE=ride → 라이드 11 모듈만 helper 반환
//   · NEXT_PUBLIC_MODULE_PROFILE=fmi  → FMI 모듈만 helper 반환
//   · 미설정 또는 'all' → 전체 반환 (기존 동작 유지 — hmseok.com 기본)
//   helper: toSystemModules / getBusinessMenusByGroup / getMenusByGroup / PATH_TO_GROUP
import { isPathEnabled } from './module-profile'
//
// 본 파일이 사이드바 / 권한 페이지 (admin/employees) / 초대 페이지 모두의
// 단일 source. 새 메뉴 추가 시 ★ 본 파일 한 곳에만 ★ entry 추가하면
// 모든 곳에 자동 동기화.
//
// 사용처:
//   /api/system_modules/route.ts  → toSystemModules() 호출 (권한 페이지 데이터)
//   app/components/auth/ClientLayout.tsx → MENUS / GROUPS / HIDDEN_PATHS import
//   app/admin/employees/page.tsx → /api/system_modules 호출 (자동 sync)
//
// 새 페이지 추가 절차:
//   1. ⬇️ MENUS 배열에 entry 추가 (id / name / displayName / path / iconKey / group / sortOrder)
//   2. 빌드 + 사이드바 / 권한 페이지 자동 반영 확인
//
// 비고:
//   - displayName: 사이드바 표시 (이모지 포함). 미정의 시 name 사용
//   - hidden: 사이드바 + 권한 페이지에서 숨김 (legacy 경로 등)
//   - requirePermission: 권한 부여 대상 여부 (false = 모든 사용자 / 또는 admin 코드 처리)
// ═══════════════════════════════════════════════════════════════════

export interface MenuEntry {
  id: string
  name: string                   // 권한 페이지 / system_modules 표시명
  displayName?: string           // 사이드바 표시 (이모지 포함)
  path: string
  iconKey: string                // 아이콘 키 (Icons[iconKey])
  group: string                  // GROUPS 의 id 와 매칭
  sortOrder: number
  hidden?: boolean               // 사이드바 + 권한 페이지 모두에서 숨김 (legacy 경로)
  sidebarHidden?: boolean        // 사이드바만 숨김 (권한 페이지에는 노출) — 부모 페이지 안에서 sub-nav 로 접근
  requirePermission?: boolean    // 권한 부여 대상 (default: 'asset|operation|finance|sales|admin' = true / 그 외 false)
}

export interface MenuGroup {
  id: string
  label: string
  section: 'business' | 'work-essentials' | 'settings' // 사이드바 섹션 분류
  sortOrder: number
  // PR-HR-18 (2026-05-28) — 사이드바 회사 격리 분류.
  //   명시 안 함 = 양사 공통 (FMI / RIDE 둘 다 노출)
  //   ['FMI'] = FMI 직원에게만 사이드바 노출 (admin 은 전체 보임)
  //   ['RIDE'] = RIDE 직원에게만 사이드바 노출
  //   사용자 명령 (2026-05-28): "라이드 중그룹밑이 라이드 용"
  companies?: ('FMI' | 'RIDE')[]
}

// ─── 그룹 정의 ───────────────────────────────────────────
// label = 권한 페이지 / 초대 페이지 표시명 (구체적)
// shortLabel = 사이드바 표시명 (짧음, 미정의 시 label 사용)
export const GROUPS: MenuGroup[] = [
  // PR-HR-18 (2026-05-28) — 사이드바 회사 격리 (companies 필드).
  //   사용자 명령: "라이드 중그룹밑이 라이드 용으로 만들었지만 페이지 권한은 각각 줘야 하고
  //              설정쪽 메뉴는 아무도 주면 안 됨".

  // 비즈니스 메뉴 (FMI 렌터카 — admin 권한 부여 대상)
  { id: 'asset',           label: '차량 자산',     section: 'business',         sortOrder: 1,  companies: ['FMI'] },
  { id: 'operation',       label: '차량 운영',     section: 'business',         sortOrder: 2,  companies: ['FMI'] },
  { id: 'finance',         label: '재무/경영지원', section: 'business',         sortOrder: 3,  companies: ['FMI'] },
  { id: 'sales',           label: '영업/계약',     section: 'business',         sortOrder: 4,  companies: ['FMI'] },
  { id: 'admin',           label: '관리',         section: 'business',         sortOrder: 5,  companies: ['FMI'] },
  // 2026-05-05 PR-B1 — 'hr' 그룹 폐기. 「인사 마스터」 (1개 통합 페이지) 는 settings 그룹 안
  // 직장인필수 — 양사 공통 (모든 로그인 사용자)
  { id: 'work-essentials', label: '직장인필수',    section: 'work-essentials', sortOrder: 10 },
  // RIDE 라이드 인력 전용 그룹들 (cx-team / mt-team / vision)
  { id: 'cx-team',         label: 'CX팀',         section: 'work-essentials', sortOrder: 11, companies: ['RIDE'] },
  // PR-MT-OPS (2026-05-11) — MT팀 운영 그룹 (위탁: 다른 세션 작업, 본 세션 단독 commit)
  { id: 'mt-team',         label: '🔧 MT팀',      section: 'work-essentials', sortOrder: 12, companies: ['RIDE'] },
  // PR-VISION (2026-05-24) — 비전 그룹 (로또번호추출기 등 가벼운 유틸)
  { id: 'vision',          label: '비전',         section: 'work-essentials', sortOrder: 13, companies: ['RIDE'] },
  // PR-6.9.b (2026-05-06) — 관리자 운영 그룹 (양사 공통 — admin 관리자)
  // 2026-05-24 — 라이드 하위 그룹 중 항상 최하단 (사용자 요청) → sortOrder 최대
  { id: 'admin-ops',       label: '관리자 운영',   section: 'work-essentials', sortOrder: 14 },
  // 설정 (admin 전용 — 사이드바 별도 섹션, 페이지 권한 부여 대상 X)
  { id: 'settings',        label: '설정',         section: 'settings',         sortOrder: 20 },
]

// ─── 메뉴 정의 ───────────────────────────────────────────
// sortOrder 규칙: 자산 1~9 / 운영 10~19 / 재무 20~29 / 영업 30~39 / 관리 40~49
//                 직장인필수 50~59 / CX팀 60~69 / 설정 70~79
export const MENUS: MenuEntry[] = [
  // ── 자산 (asset) ── 차량을 어떻게 소유·보호하는가
  { id: 'mod-cars',      name: '차량', displayName: '🚗 차량', path: '/cars',      iconKey: 'Car',   group: 'asset', sortOrder: 1 },
  { id: 'mod-loans',     name: '대출', displayName: '💰 대출', path: '/loans',     iconKey: 'Money', group: 'asset', sortOrder: 2 },
  { id: 'mod-insurance', name: '보험', displayName: '🛡 보험',  path: '/insurance', iconKey: 'Money', group: 'asset', sortOrder: 3 },

  // ── 운영 (operation) ── 차량을 어떻게 굴리는가
  // P2.2 (2026-05-13) — operations 통합 페이지로 정리.
  // /operations 안 5 sub-tab: 사고접수 / 대차접수 / 배차스케줄 / 청구관리 / 대기차량
  // /maintenance, /operations/intake 메뉴는 hide (페이지는 그대로 — backward compat)
  { id: 'mod-ops',    name: '사고대차',  displayName: '🚗 사고대차',   path: '/operations',        iconKey: 'Wrench',            group: 'operation', sortOrder: 10 },
  // PR-L1 (2026-05-24) — 장기렌트 (대차와 별개 장기 계약 원장)
  // PR-Q1 (2026-05-26) — 견적 탭 추가 (영업 동선 우선) — long_term_quotes 별도 테이블
  { id: 'mod-long-term', name: '장기렌트', displayName: '🔑 장기렌트', path: '/long-term-rentals', iconKey: 'Car', group: 'operation', sortOrder: 11 },

  // ── 재무 (finance) ── 통장 진입점 + 손익/정산/투자
  { id: 'mod-bank-card',     name: '통장/카드',  displayName: '💳 통장/카드',  path: '/finance/bank-card',     iconKey: 'Money', group: 'finance', sortOrder: 20 },
  { id: 'mod-fleet-fin',     name: '차량 손익',  displayName: '📊 차량 손익',  path: '/finance/fleet',         iconKey: 'Chart', group: 'finance', sortOrder: 21 },
  { id: 'mod-settlement',    name: '정산/수금',  displayName: '💵 정산/수금',  path: '/finance/settlement',    iconKey: 'Chart', group: 'finance', sortOrder: 22 },
  { id: 'mod-investor',      name: '투자자 정산', displayName: '👥 투자자 정산', path: '/finance/investor',      iconKey: 'Money', group: 'finance', sortOrder: 23 },
  { id: 'mod-cost-analysis', name: '원가 분석',  displayName: '📈 원가 분석',  path: '/finance/cost-analysis', iconKey: 'Chart', group: 'finance', sortOrder: 24 },
  { id: 'mod-classify',      name: '거래 분류',  displayName: '🏷 거래 분류',   path: '/finance/classify',      iconKey: 'Chart', group: 'finance', sortOrder: 25 },
  { id: 'mod-sms',           name: 'SMS 수집',   displayName: '📨 SMS 수집',  path: '/finance/sms',           iconKey: 'Doc',   group: 'finance', sortOrder: 26 },

  // ── 영업/계약 (sales) ──
  // PR-Q2-5 (2026-05-26) — 폐기: mod-quotes, mod-operational-learning
  //   장기렌트 견적은 /long-term-rentals 안 견적 탭 (mod-long-term)으로 통합.
  { id: 'mod-contracts',               name: '계약/고객', displayName: '📑 계약/고객', path: '/contracts',                   iconKey: 'Doc',   group: 'sales', sortOrder: 32 },

  // ── 관리 (admin) ──
  // ※ 대시보드 — 사이드바에서 ClientLayout 별도 코드로 최상단 렌더 (그룹 무관)
  // ※ mod-payroll-ops — 2026-05-06 PR-B4: /hr/payroll 로 이동 (settings 그룹)
  { id: 'mod-dashboard', name: '대시보드', displayName: '🏠 대시보드', path: '/dashboard', iconKey: 'Setting', group: 'admin', sortOrder: 39, requirePermission: true },

  // ── 직장인필수 (work-essentials) ──
  // 모두 권한 부여 대상 — 권한 페이지에서 ON/OFF 토글 (사용자 요청: 「실제 적용 페이지만 표출」)
  { id: 'mod-my-info',         name: '내 정보',     path: '/work-essentials/my-info',  iconKey: 'Users',     group: 'work-essentials', sortOrder: 50, requirePermission: true },
  { id: 'mod-receipts',        name: '영수증제출',   path: '/work-essentials/receipts', iconKey: 'Clipboard', group: 'work-essentials', sortOrder: 51, requirePermission: true },
  { id: 'mod-meetings',        name: '회의록', displayName: '📋 회의록', path: '/meetings', iconKey: 'Doc', group: 'work-essentials', sortOrder: 52, requirePermission: true },
  { id: 'mod-meetings-me',     name: '내 TODO', displayName: '✓ 내 TODO', path: '/meetings/me', iconKey: 'Clipboard', group: 'work-essentials', sortOrder: 53, requirePermission: true },

  // ── CX팀 (cx-team) ── Employee of Ride Inc. > CX팀 — 권한 부여 대상 (CX팀원만)
  // PR-6.3.c (2026-05-05) — 카페24 ERP (skyautosvc.co.kr) read-only 연동
  // PR-6.7 (2026-05-06) — 라벨 정정: aceesosh = 긴급출동 / acrotpth = 사고접수 분리
  { id: 'mod-ride-accidents',     name: '라이드 긴급출동',  displayName: '🚨 라이드 긴급출동',  path: '/RideAccidents',         iconKey: 'Clipboard', group: 'cx-team', sortOrder: 63, requirePermission: true },
  { id: 'mod-ride-accident-rep',  name: '라이드 사고접수',  displayName: '🚗 라이드 사고접수',  path: '/RideAccidentReports',   iconKey: 'Wrench',    group: 'cx-team', sortOrder: 64, requirePermission: true },
  // PR-6.13 (2026-05-09) — 라이드 운영 통합 (NavTabs 1개 메뉴 + 3 sub-page)
  // 사이드바 메뉴 1개 (mod-ride-vehicle-reg) → /RideVehicleRegistry 진입 → 페이지 내 NavTabs 로 sub-route
  // path 중복 회피 — 기존 entry 의 displayName 만 「라이드 운영」 으로 변경
  { id: 'mod-ride-vehicle-reg',   name: '라이드 운영',       displayName: '🚗 라이드 운영',         path: '/RideVehicleRegistry',   iconKey: 'Car',       group: 'admin-ops', sortOrder: 80, requirePermission: true },
  // sub-page 들 — 사이드바 hidden (NavTabs 로만 진입)
  { id: 'mod-ride-customer-data', name: '라이드 고객사 데이터', displayName: '🏢 고객사 데이터',  path: '/RideCustomerData',      iconKey: 'Building',  group: 'admin-ops', sortOrder: 81, requirePermission: true, sidebarHidden: true },
  { id: 'mod-ride-settlements',   name: '고객사 마감자료',    displayName: '💰 마감자료',          path: '/RideSettlements',       iconKey: 'Money',     group: 'admin-ops', sortOrder: 82, requirePermission: true, sidebarHidden: true },
  // PR-COMPLIANCE (2026-05-11) — 정보보안 (개인정보 + 정보자산 + 보안사고 + 규정준수 + 직원교육)
  { id: 'mod-ride-compliance',    name: '정보보안',           displayName: '🔒 정보보안',           path: '/RideCompliance',        iconKey: 'Shield',    group: 'admin-ops', sortOrder: 83, requirePermission: true },
  // PR-ASSETS-1.0 (2026-05-14) — 라이드 자산 관리 (QR 스티커 자산 대장 — 차량/사무비품/IT장비/법인카드)
  { id: 'mod-ride-assets',        name: '라이드 자산',        displayName: '📦 라이드 자산',        path: '/RideAssets',            iconKey: 'Clipboard', group: 'admin-ops', sortOrder: 84, requirePermission: true },
  { id: 'mod-call-scheduler',  name: '스케줄 및 운영', displayName: '📅 스케줄 및 운영', path: '/CallScheduler', iconKey: 'Setting', group: 'cx-team', sortOrder: 60, requirePermission: true },
  // 직원 마스터 — 사이드바 숨김. 근무스케줄 페이지 안에서 sub-nav 로 접근 (권한 페이지에는 노출 유지)
  { id: 'mod-ride-employees',  name: '직원 마스터',   path: '/RideEmployees',  iconKey: 'Users',   group: 'cx-team', sortOrder: 61, requirePermission: true, sidebarHidden: true },
  // 협력공장 추천 — 사고 발생 시 가까운 공장 추천이 메인. 서브: /factory-search/{map,mgmt,groups} (SubNav 진입)
  { id: 'mod-factory-search',  name: '협력공장 추천', displayName: '🚨 협력공장 추천', path: '/factory-search', iconKey: 'Wrench', group: 'cx-team', sortOrder: 62, requirePermission: true },

  // PR-MT-OPS (2026-05-11) — MT팀 운영 (위탁: 다른 세션 작업, 본 세션 단독 commit — Rule 21 § 2.1)
  // 사이드바 메뉴 1개 (mod-mt-tours) → /RideMTOps/maintenance-tours 진입 → NavTabs 로 3 sub-page
  // path 중복 회피 — 다른 sub-page 는 sidebarHidden: true (menu-path-duplicate-lint 통과)
  { id: 'mod-mt-tours',    name: '순회정비', displayName: '🚗 순회정비', path: '/RideMTOps/maintenance-tours', iconKey: 'Wrench',    group: 'mt-team', sortOrder: 50, requirePermission: true },
  { id: 'mod-mt-inspect',  name: '법정검사', displayName: '📋 법정검사', path: '/RideMTOps/legal-inspections', iconKey: 'Clipboard', group: 'mt-team', sortOrder: 51, requirePermission: true, sidebarHidden: true },
  { id: 'mod-mt-chargers', name: '충전기',   displayName: '🔌 충전기',   path: '/RideMTOps/chargers',          iconKey: 'Bolt',      group: 'mt-team', sortOrder: 52, requirePermission: true, sidebarHidden: true },

  // PR-VISION (2026-05-24) — 비전 그룹 (가벼운 유틸). 페이지: 별도 세션 PR-VISION-1
  { id: 'mod-lotto', name: '믿을 건 로또 뿐', displayName: '🎰 믿을 건 로또 뿐', path: '/RideVision/lotto', iconKey: 'Doc', group: 'vision', sortOrder: 90, requirePermission: true },

  // ── 설정 (settings) ── admin 전용 (사이드바 별도 섹션)
  // 권한 부여 대상 — 일부 사용자에게 회사 정보 / 메시지 센터 등 위임 가능
  // 2026-05-05 PR-B1 — 「인사 마스터」 통합 페이지 (직원/부서·직급/초대/외부인력) 1개 메뉴로 통합
  // 2026-05-06 PR-B4 — 「급여 운영」 admin → settings 그룹으로 이동 (인사 영역 통합)
  // 2026-05-06 PR-B6 — mod-payroll-ops 사이드바에서 숨김 (sidebarHidden), 권한 페이지에는 유지
  // 「인사 마스터」(/hr) 안 5번째 탭에서 「급여 운영」 으로 진입 — 사이드바는 1 메뉴만
  { id: 'mod-company-info',     name: '회사 정보',     path: '/db/codes',                iconKey: 'Setting',   group: 'settings', sortOrder: 70, requirePermission: true },
  { id: 'mod-hr-master',        name: '인사 마스터', displayName: '👥 인사 마스터', path: '/hr', iconKey: 'Users', group: 'settings', sortOrder: 71, requirePermission: true },
  { id: 'mod-payroll-ops',      name: '급여 운영', displayName: '💼 급여 운영', path: '/hr/payroll', iconKey: 'Money', group: 'settings', sortOrder: 72, requirePermission: true, sidebarHidden: true },
  { id: 'mod-contract-terms',   name: '계약 약관 관리', path: '/admin/contract-terms',    iconKey: 'Doc',       group: 'settings', sortOrder: 73, requirePermission: true },
  { id: 'mod-message-templates',name: '메시지 센터',    path: '/admin/message-templates', iconKey: 'Clipboard', group: 'settings', sortOrder: 74, requirePermission: true },
]

// ─── 숨김 경로 (legacy + 통합/축소 / 미사용) ───
export const HIDDEN_PATHS = new Set<string>([
  // ── 삭제된 모듈 (코드 제거됨) ──
  '/jiip', '/invest', '/accidents', '/rental',
  '/registration',           // 2026-04-29 — /cars/[id] 등록증 탭으로 통합
  '/claims/accident-mgmt', '/claims/billing-mgmt',
  '/claims/intake', '/claims/investigation',
  '/claims/assessment', '/claims/billing', '/claims/rental',
  '/fleet/factory-mgmt', '/fleet/vehicle-lookup',
  '/db/depreciation', '/db/maintenance', '/db/models',
  // ── 중복/통합 완료 ──
  // P2.2 (2026-05-13) — operations 통합 페이지로 흡수
  '/maintenance',           // → /operations 안 「대기차량」 sub-tab
  '/operations/intake',     // → /operations 안 「사고접수」 sub-tab
  '/operations/rentals',    // → /operations 안 「배차스케줄」 sub-tab (예정)
  '/operations/intake-bulk',// → /operations 안 작업 (또는 별도 admin)
  '/e-contract',
  // PR-Q2-5 폐기: '/quotes/pricing', '/quotes/short-term' (hidden 도 제거)
  '/customers',
  '/finance/collections',
  '/db/pricing-standards',
  '/finance', '/finance/transactions',
  '/finance/upload', '/finance/uploads',
  '/finance/codef', '/finance/cards',
  '/finance/openbanking',
  '/db/lotte', '/admin/code-master',
  // ── 통합/축소 ──
  '/finance/tax', '/report',
  // ── 미사용/불필요 ──
  '/finance/review', '/finance/freelancers', '/admin/freelancers',
  // ── FMI 단일회사 — 플랫폼 관리 메뉴 숨김 ──
  '/system-admin', '/admin/developer', '/admin/contracts',
  // ── 미사용 admin 페이지 (legacy / 통합 완료) ──
  '/admin', '/admin/cards', '/admin/codes', '/admin/locations',
  '/admin/market-prices', '/admin/model', '/admin/permissions',
  // 2026-05-05 PR-A4 — /finance/payroll-ops 로 이전
  '/admin/employees', '/admin/payroll',
  // 2026-05-05 PR-B1 — /hr 통합 페이지로 흡수
  '/hr/people', '/hr/org',
  // 2026-05-06 PR-B4 — /hr/payroll 로 이동 (인사 영역 통합)
  '/finance/payroll-ops',
  // ── 인증 콜백 / 미사용 모듈 ──
  '/auth', '/loans-out',
])

// ─── 권한 부여 대상 결정 (requirePermission 명시 안 했으면 group 기준) ───
function isRequirePermission(menu: MenuEntry): boolean {
  if (typeof menu.requirePermission === 'boolean') return menu.requirePermission
  // 비즈니스 그룹 (asset/operation/finance/sales/admin) 은 기본 권한 부여 대상
  return ['asset', 'operation', 'finance', 'sales', 'admin'].includes(menu.group)
}

// ─── 헬퍼: system_modules API 응답 형식 ───
// 권한 페이지 (admin/employees) 가 사용 — 권한 부여 대상만 반환
// PR-RIDE-EC2-2: MODULE_PROFILE 비활성 모듈 제외
export function toSystemModules() {
  return MENUS
    .filter(m => !m.hidden)
    .filter(m => isRequirePermission(m))
    .filter(m => isPathEnabled(m.path))
    .map(m => ({
      id: m.id,
      name: m.name,
      path: m.path,
      icon_key: m.iconKey,
      sort_order: m.sortOrder,
    }))
    .sort((a, b) => a.sort_order - b.sort_order)
}

// ─── 헬퍼: 그룹별 사이드바 메뉴 (비즈니스 섹션) ───
// PR-RIDE-EC2-2: MODULE_PROFILE 비활성 모듈 제외
export function getBusinessMenusByGroup(groupId: string) {
  return MENUS
    .filter(m => !m.hidden && m.group === groupId)
    .filter(m => isPathEnabled(m.path))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

// ─── 헬퍼: 직장인필수 / 설정 섹션 메뉴 ───
// PR-RIDE-EC2-2: MODULE_PROFILE 비활성 모듈 제외
export function getMenusByGroup(groupId: string) {
  return MENUS
    .filter(m => !m.hidden && m.group === groupId)
    .filter(m => isPathEnabled(m.path))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

// ─── 헬퍼: 비즈니스 그룹 목록 (사이드바 5그룹) ───
export const BUSINESS_GROUPS = GROUPS.filter(g => g.section === 'business').sort((a, b) => a.sortOrder - b.sortOrder)

// ─── 헬퍼: 디스플레이 이름 (이모지 포함) — 사이드바 사용 ───
export function getDisplayName(menu: MenuEntry): string {
  return menu.displayName || menu.name
}

// ─── 헬퍼: path → group ID 매핑 (legacy PATH_TO_GROUP 호환) ───
// PR-RIDE-EC2-2: MODULE_PROFILE 비활성 모듈 제외
export const PATH_TO_GROUP: Record<string, string> = Object.fromEntries(
  MENUS.filter(m => !m.hidden && ['asset', 'operation', 'finance', 'sales', 'admin'].includes(m.group))
    .filter(m => isPathEnabled(m.path))
    .map(m => [m.path, m.group])
)
