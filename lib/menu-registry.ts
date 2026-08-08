// ═══════════════════════════════════════════════════════════════════
// FMI ERP — 메뉴 레지스트리 (단일 SOURCE OF TRUTH)
// ═══════════════════════════════════════════════════════════════════
//
//   2026-07-30 전면 개편 (REDESIGN-2026-07.md) — 새 IA 적용
//     · 핵심 업무 6 (홈/차량/계약/장부/정산/손익) = 'core' 그룹
//     · 아직 통합 전인 기존 화면 = 'detail' 그룹 (개편 진행에 따라 core 로 흡수 후 삭제)
//     · 역할별 업무 (배차/경리/실시간) = 'roles' 그룹 (페이지 구현 시 entry 추가)
//     · 직장인필수 섹션 — 사이드바에서 제거 (사용자 확정). 페이지·권한은 유지,
//       진입은 홈 대시보드 하단 바로가기. group 정의는 권한 페이지 라벨용으로 보존.
//
// 본 파일이 사이드바 / 권한 페이지 (hr) / 초대 페이지 모두의
// 단일 source. 새 메뉴 추가 시 ★ 본 파일 한 곳에만 ★ entry 추가하면
// 모든 곳에 자동 동기화.
//
// 사용처:
//   /api/system_modules/route.ts  → toSystemModules() 호출 (권한 페이지 데이터)
//   /api/menus/route.ts           → GROUPS + MENUS 반환 (초대 페이지)
//   app/components/auth/ClientLayout.tsx → MENUS / GROUPS / HIDDEN_PATHS import
//   app/hr/page.tsx → 그룹 라벨 / 권한 트리
//
// 새 페이지 추가 절차:
//   1. ⬇️ MENUS 배열에 entry 추가 (id / name / path / iconKey / group / sortOrder)
//   2. 빌드 + 사이드바 / 권한 페이지 자동 반영 확인
//
// 비고:
//   - displayName: 사이드바 표시. 미정의 시 name 사용 (새 UI 는 이모지 미사용 — 라인 아이콘)
//   - hidden: 사이드바 + 권한 페이지에서 숨김 (legacy 경로 등)
//   - sidebarHidden: 사이드바만 숨김 (권한 페이지에는 노출)
//   - requirePermission: 권한 부여 대상 여부 — 비즈니스 그룹(core/detail/roles)은 기본 true
// ═══════════════════════════════════════════════════════════════════

export interface MenuEntry {
  id: string
  name: string                   // 권한 페이지 / system_modules 표시명
  displayName?: string           // 사이드바 표시
  path: string
  iconKey: string                // 아이콘 키 (Icons[iconKey])
  group: string                  // GROUPS 의 id 와 매칭
  sortOrder: number
  hidden?: boolean               // 사이드바 + 권한 페이지 모두에서 숨김 (legacy 경로)
  sidebarHidden?: boolean        // 사이드바만 숨김 (권한 페이지에는 노출) — 부모 페이지 안에서 sub-nav 로 접근
  requirePermission?: boolean    // 권한 부여 대상 (default: core/detail/roles 그룹 = true / 그 외 false)
}

export interface MenuGroup {
  id: string
  label: string
  section: 'business' | 'work-essentials' | 'settings' // 사이드바 섹션 분류
  sortOrder: number
  companies?: ('FMI' | 'RIDE')[]  // legacy 필드 — 단독회사 FMI 이후 미사용
}

// ─── 그룹 정의 ───────────────────────────────────────────
export const GROUPS: MenuGroup[] = [
  // 2026-08-08 사용자 확정 — 「차량관리 / 렌터카 / 타이어 / 경리부 업무」 4그룹 분리
  { id: 'g-cars',       label: '차량관리',    section: 'business', sortOrder: 1 },
  { id: 'g-rental',     label: '렌터카',      section: 'business', sortOrder: 2 },
  { id: 'g-tire',       label: '타이어',      section: 'business', sortOrder: 3 },
  { id: 'g-accounting', label: '경리부 업무',  section: 'business', sortOrder: 4 },
  // legacy 그룹 (sidebarHidden 세부 화면들)
  { id: 'core',            label: '업무',        section: 'business',        sortOrder: 5 },
  { id: 'detail',          label: '세부 화면',    section: 'business',        sortOrder: 6 },
  { id: 'roles',           label: '역할별 업무',  section: 'business',        sortOrder: 7 },
  // 직장인필수 — 사이드바 섹션 제거 (2026-07-30 사용자 확정). 권한 페이지 라벨용으로 보존.
  { id: 'work-essentials', label: '직장인필수',   section: 'work-essentials', sortOrder: 10 },
  // 설정 (admin 전용 — 사이드바 별도 섹션)
  { id: 'settings',        label: '설정',        section: 'settings',        sortOrder: 20 },
]

// ─── 메뉴 정의 ───────────────────────────────────────────
// sortOrder 규칙: 홈 0 / core 1~9 / detail 10~29 / roles 30~39
//                 직장인필수 50~59 / 설정 70~79
export const MENUS: MenuEntry[] = [
  // ── 홈 — 모든 로그인 사용자. 사이드바 최상단에 별도 렌더 (ClientLayout)
  { id: 'mod-home', name: '홈', path: '/home', iconKey: 'Home', group: 'core', sortOrder: 0, requirePermission: false, sidebarHidden: true },

  // ── 핵심 업무 (core) — 새 IA (계약은 A안 확정: 장기계약 / 단기·대차 — 2026-07-30)
  { id: 'mod-cars',       name: '차량',    path: '/cars',                 iconKey: 'Car',    group: 'g-cars', sortOrder: 1, requirePermission: true },
  { id: 'mod-long-term',  name: '장기렌트', displayName: '장기계약', path: '/long-term-rentals', iconKey: 'Doc', group: 'g-rental', sortOrder: 1, requirePermission: true },
  { id: 'mod-ops',        name: '사고대차', displayName: '단기·대차', path: '/operations',       iconKey: 'Key', group: 'g-rental', sortOrder: 2, requirePermission: true },
  // 견적함 — 별도 페이지 분리 (2026-08-02 사용자 확정: 임의 견적 보관 → 계약에서 불러와 연결)
  { id: 'mod-quotes',     name: '견적',    path: '/quotes',               iconKey: 'Clipboard', group: 'g-rental', sortOrder: 3, requirePermission: true },
  { id: 'mod-ledger',     name: '통장/카드', displayName: '장부', path: '/finance/bank-card', iconKey: 'Ledger', group: 'g-accounting', sortOrder: 1, requirePermission: true },
  // 카드관리·수금 — 장부에서 분리 (2026-08-03 사용자 확정)
  { id: 'mod-card-mgmt',  name: '카드관리', path: '/finance/card-mgmt',   iconKey: 'Money',  group: 'g-accounting', sortOrder: 2, requirePermission: true },
  { id: 'mod-collection', name: '수금',    path: '/finance/collection',  iconKey: 'Coin',   group: 'g-accounting', sortOrder: 3, requirePermission: true },
  { id: 'mod-tire',       name: '타이어 판매', displayName: '타이어', path: '/tire', iconKey: 'Wrench', group: 'g-tire', sortOrder: 1, requirePermission: true },
  { id: 'mod-settlement', name: '정산/수금', displayName: '정산', path: '/finance/settlement', iconKey: 'Coin',   group: 'g-accounting', sortOrder: 4, requirePermission: true },
  { id: 'mod-pnl',        name: '차량 손익', displayName: '손익', path: '/finance/fleet',      iconKey: 'Trend',  group: 'g-cars', sortOrder: 2, requirePermission: true },
  { id: 'mod-violations',  name: '과태료·미납', path: '/violations', iconKey: 'Shield', group: 'g-cars', sortOrder: 3, requirePermission: true },

  // ── 세부 화면 (detail) — 2026-07-30 사용자 확정 「사이드바 전부 걷어내고 목업처럼」:
  //    전 항목 sidebarHidden — URL·권한 유지, 각 개편 단계에서 core 화면에 흡수 후 9단계에 코드 삭제.
  //    (대출·보험→차량 금융탭 / 분류·SMS→장부 / 투자자 정산→정산 / 원가→손익 / 협력공장→단기·대차)
  { id: 'mod-contracts',      name: '계약/고객(구)', path: '/contracts',             iconKey: 'Doc',    group: 'detail', sortOrder: 10, requirePermission: true, sidebarHidden: true },
  { id: 'mod-factory-search', name: '협력공장 추천', path: '/factory-search',        iconKey: 'Wrench', group: 'detail', sortOrder: 11, requirePermission: true, sidebarHidden: true },
  { id: 'mod-loans',          name: '대출',         path: '/loans',                 iconKey: 'Money',  group: 'detail', sortOrder: 12, requirePermission: true, sidebarHidden: true },
  { id: 'mod-insurance',      name: '보험',         path: '/insurance',             iconKey: 'Shield', group: 'detail', sortOrder: 13, requirePermission: true, sidebarHidden: true },
  { id: 'mod-classify',       name: '거래 분류',    path: '/finance/classify',      iconKey: 'Tag',    group: 'detail', sortOrder: 14, requirePermission: true, sidebarHidden: true },
  { id: 'mod-sms',            name: 'SMS 수집',     path: '/finance/sms',           iconKey: 'Doc',    group: 'detail', sortOrder: 15, requirePermission: true, sidebarHidden: true },
  { id: 'mod-investor',       name: '투자자 정산',  path: '/finance/investor',      iconKey: 'Users',  group: 'detail', sortOrder: 16, requirePermission: true, sidebarHidden: true },
  { id: 'mod-cost-analysis',  name: '원가 분석',    path: '/finance/cost-analysis', iconKey: 'Chart',  group: 'detail', sortOrder: 17, requirePermission: true, sidebarHidden: true },
  // 구 대시보드 — 홈(/home)으로 대체. 페이지·권한 유지, 사이드바 숨김 (개편 9단계에서 삭제 예정)
  { id: 'mod-dashboard', name: '대시보드(구)', path: '/dashboard', iconKey: 'Setting', group: 'detail', sortOrder: 19, requirePermission: true, sidebarHidden: true },

  // ── 역할별 업무 (roles) — 개편 7단계에서 배차 업무 / 경리 업무 / 실시간 현황 추가 예정

  // ── 직장인필수 (work-essentials) — 사이드바 미노출 (섹션 제거). 홈 하단 바로가기로 진입.
  { id: 'mod-my-info',  name: '내 정보',   path: '/work-essentials/my-info',  iconKey: 'Users',     group: 'work-essentials', sortOrder: 50, requirePermission: true, sidebarHidden: true },
  { id: 'mod-receipts', name: '영수증제출', path: '/work-essentials/receipts', iconKey: 'Clipboard', group: 'work-essentials', sortOrder: 51, requirePermission: true, sidebarHidden: true },
  { id: 'mod-meetings', name: '회의록',    path: '/meetings',                 iconKey: 'Doc',       group: 'work-essentials', sortOrder: 52, requirePermission: true, sidebarHidden: true },
  { id: 'mod-meetings-me', name: '내 TODO', path: '/meetings/me',             iconKey: 'Clipboard', group: 'work-essentials', sortOrder: 53, requirePermission: true, sidebarHidden: true },

  // ── 설정 (settings) ── admin 전용 (사이드바 별도 섹션)
  { id: 'mod-company-info',      name: '회사 정보',      path: '/db/codes',                iconKey: 'Setting',   group: 'settings', sortOrder: 70, requirePermission: true },
  // 요금 기준표 — REDESIGN: 설정 하위 (인사/요금 기준표/회사 정보/권한)
  { id: 'mod-hr-master',         name: '인사 마스터',    path: '/hr',                      iconKey: 'Users',     group: 'settings', sortOrder: 71, requirePermission: true },
  { id: 'mod-payroll-ops',       name: '급여 운영',      path: '/hr/payroll',              iconKey: 'Money',     group: 'settings', sortOrder: 72, requirePermission: true, sidebarHidden: true },
  { id: 'mod-contract-terms',    name: '계약 약관 관리', path: '/admin/contract-terms',    iconKey: 'Doc',       group: 'settings', sortOrder: 73, requirePermission: true },
  { id: 'mod-menu-layout',       name: '메뉴 구성',      path: '/admin/menu-layout',       iconKey: 'Setting',   group: 'settings', sortOrder: 74, requirePermission: true },
  { id: 'mod-message-templates', name: '메시지 센터',    path: '/admin/message-templates', iconKey: 'Clipboard', group: 'settings', sortOrder: 74, requirePermission: true },
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
  '/maintenance',           // → /operations 안 「대기차량」 sub-tab
  '/operations/intake',     // → /operations 안 「사고접수」 sub-tab
  '/operations/rentals',    // → /operations 안 「배차스케줄」 sub-tab (예정)
  '/operations/intake-bulk',
  '/e-contract',
  '/customers',
  '/finance/collections',
  '/finance', '/finance/transactions',
  '/finance/upload', '/finance/uploads',
  '/finance/codef', '/finance/cards',
  '/finance/openbanking',
  '/admin/code-master',
  // ── 통합/축소 ──
  '/finance/tax', '/report',
  // ── 미사용/불필요 ──
  '/finance/review', '/finance/freelancers', '/admin/freelancers',
  // ── FMI 단일회사 — 플랫폼 관리 메뉴 숨김 ──
  '/system-admin', '/admin/developer', '/admin/contracts',
  // ── 미사용 admin 페이지 (legacy / 통합 완료) ──
  '/admin', '/admin/cards', '/admin/codes', '/admin/locations',
  '/admin/market-prices', '/admin/model', '/admin/permissions',
  '/admin/employees', '/admin/payroll',
  '/hr/people', '/hr/org',
  '/finance/payroll-ops',
  // ── 인증 콜백 / 미사용 모듈 ──
  '/auth', '/loans-out',
])

// ─── 권한 부여 대상 결정 (requirePermission 명시 안 했으면 group 기준) ───
function isRequirePermission(menu: MenuEntry): boolean {
  if (typeof menu.requirePermission === 'boolean') return menu.requirePermission
  // 비즈니스 그룹 (core/detail/roles) 은 기본 권한 부여 대상
  return ['core', 'detail', 'roles'].includes(menu.group)
}

// ─── 헬퍼: system_modules API 응답 형식 ───
// 권한 페이지 (hr) 가 사용 — 권한 부여 대상만 반환
export function toSystemModules() {
  return MENUS
    .filter(m => !m.hidden)
    .filter(m => isRequirePermission(m))
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
export function getBusinessMenusByGroup(groupId: string) {
  return MENUS
    .filter(m => !m.hidden && m.group === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

// ─── 헬퍼: 직장인필수 / 설정 섹션 메뉴 ───
export function getMenusByGroup(groupId: string) {
  return MENUS
    .filter(m => !m.hidden && m.group === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

// ─── 헬퍼: 비즈니스 그룹 목록 (사이드바) ───
export const BUSINESS_GROUPS = GROUPS.filter(g => g.section === 'business').sort((a, b) => a.sortOrder - b.sortOrder)

// ─── 헬퍼: 디스플레이 이름 — 사이드바 사용 ───
export function getDisplayName(menu: MenuEntry): string {
  return menu.displayName || menu.name
}

// ─── 헬퍼: path → group ID 매핑 (legacy PATH_TO_GROUP 호환) ───
export const PATH_TO_GROUP: Record<string, string> = Object.fromEntries(
  MENUS.filter(m => !m.hidden && ['g-cars', 'g-rental', 'g-tire', 'g-accounting', 'core', 'detail', 'roles'].includes(m.group))
    .map(m => [m.path, m.group])
)
