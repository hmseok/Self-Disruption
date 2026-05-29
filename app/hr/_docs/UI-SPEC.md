# /hr 모듈 — UI-SPEC

> Rule 22 + Rule 26 — UI 레이아웃 / 컴포넌트 / 페르소나별 흐름.
> CLAUDE.md § 10 + `_docs/UI-DESIGN-STANDARD.md` 표준 준수.

## 1. 레이아웃 표준 (5층)

```
[PageTitle 자동 헤더 (app/components/PageTitle.tsx)]
─────── 디바이더 ───────
[회사 토글 — NeuFilterTabs] FMI · RIDE · 새 회사 · 공통
─────── 디바이더 ───────
[Sub-tab — NeuFilterTabs] 회사별 가변
─────── 디바이더 ───────
[DcStatStrip] 5 카드 + 액션 버튼
[DcToolbar] 검색 + 필터
[부서 트리 (Glass L3) | NeuDataTable (직원)]  ← 2열 grid
```

## 2. 회사별 sub-tab 통일 (PR-HR-23b)

| 회사 | sub-tab |
|---|---|
| 🏢 FMI | [👥 직원] [🏢 부서·직급 마스터] [💰 급여 운영] |
| 🚗 RIDE | [👥 직원] (PR-HR-23b — 'org' 제거) |
| ✨ 새 회사 | [👥 직원] (DEFAULT_DYNAMIC_TABS — 통일) |
| 🔧 공통 | [✉️ 초대] [🤝 프리랜서] [🏛️ 회사 마스터] [🎭 역할 템플릿] [🔧 시스템 관리자] |

권한 분기 (visibleTabs):
- `admin` (GOD): 모든 회사 + 모든 sub-tab
- `master/user`: 자기 `company_key` + `common`
- `common` 의 `companies/roles/admin` 는 `admin` 만

## 3. 회사별 [👥 직원] 패널 — CompanyEmployeePanel (단일 통합)

PR-HR-23b 사용자 명령 「각 회사별 구조 동일」 결과 — 모든 회사가 본 패널 사용 (RIDE 는 다음 세션 PR-HR-23c2 마이그 예정).

### 3.1 외부 주입 props

```ts
{
  companyKey: string                          // 'FMI'/'RIDE'/동적
  companyLabel?: string                       // 표시 라벨
  role?: 'admin'|'master'|'user'
  customEmployees?: EmployeeRow[]             // 외부 데이터 (FMI 는 page.tsx useEmployees())
  customDepartments?: DepartmentNode[]        // 외부 부서 트리
  columns?: TableColumn<EmployeeRow>[]        // 외부 컬럼 (FMI 는 employeeColumns 주입)
  extraColumns?: TableColumn<EmployeeRow>[]   // defaultColumns 와 병합
  onRowClick?: (row) => void                  // 편집 모달 트리거
  actions?: ActionButton[]                    // DcStatStrip 액션
  filters?: FilterItem[]                      // 외부 status 필터 (FMI: 재직/휴직/퇴사)
  activeFilter?: string
  onFilterChange?: (k) => void
  mobileCard?: MobileCardConfig<EmployeeRow>
  searchPlaceholder?: string
  bulkExcel?: boolean                         // RIDE 등 엑셀 활성
  stats?: StatItem[]                          // 외부 stat 주입 (FMI: 재직/휴직/퇴사/관리자/초대)
}
```

### 3.2 동작 모드

- **외부 주입 모드 (FMI)**: `customEmployees + columns + filters` 주입 → 자체 fetch skip. 검색/부서 필터만 내부 처리.
- **자체 fetch 모드 (새 회사)**: props 없으면 `/api/employees?company_key=X&tree=1` 호출 + 기본 columns 사용.

### 3.3 sortBy 의무 (Rule 18)

모든 컬럼에 sortBy 정의. defaultColumns 7개 모두 sortBy 함수 포함.
FMI 의 employeeColumns (page.tsx) 도 7개 모두 sortBy 추가 (PR-HR-23b).

## 4. FMI [🏢 부서·직급 마스터] 탭 — CompanyOrgPanel (그대로 유지)

PR-HR-21 추출. 직급 카드 + 부서 카드 — CRUD (추가/이름변경/레벨변경/삭제).

향후 PR-HR-23d 적용 후 부서 카드를 트리로 강화 (parent_id 활용).

## 5. FMI [💰 급여 운영] 탭 — PayrollOps

PR-B7 (2026-05-05). FMI 전용 — 외부 영향 X (본 PR 비대상).

## 6. 회사 토글 동적 노출 (PR-HR-22)

`useCompanies()` SWR hook → `companies` 테이블 row 추가만으로 토글 자동 노출. 새 회사도 즉시 `CompanyEmployeePanel` 사용 (자체 fetch 모드).

## 7. 페르소나 — 사용 흐름

### 페르소나 1: GOD ADMIN (석호민)
1. /hr 진입 → 회사 토글 [FMI/RIDE/회사테스트/공통] 모두 보임
2. FMI 선택 → [직원] 진입 → 부서 트리 + 직원 테이블 + 재직/휴직/퇴사 stat
3. RIDE 선택 → [직원] 진입 → 같은 UI 패러다임 (단 본 PR 에서는 RideOrgPanel)
4. 회사테스트 선택 → [직원] 진입 → CompanyEmployeePanel 자체 fetch (빈 데이터)
5. 공통 선택 → [회사 마스터] 에서 새 회사 추가 → 다음 새로고침 시 토글에 자동 노출

### 페르소나 2: FMI 매니저 (master role, company_key=FMI)
1. /hr 진입 → 회사 토글 [FMI] [공통] 만 보임
2. FMI 직원 관리 + 공통 초대/프리랜서

### 페르소나 3: RIDE 매니저 (master role, company_key=RIDE)
1. /hr 진입 → 회사 토글 [RIDE] [공통] 만 보임
2. RIDE 직원 + 공통 초대/프리랜서

## 8. 사이드바 회사 격리 (PR-HR-18)

`lib/menu-registry.ts` MenuGroup interface `companies?: ('FMI'|'RIDE')[]` 필드 활용.
- business 그룹 = FMI 전용
- cx-team / mt-team / vision = RIDE 전용
- settings = admin 만

ClientLayout 에서 사용자 `profile.company_key` 기반 가드.
