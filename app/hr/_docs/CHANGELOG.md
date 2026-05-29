# /hr 모듈 — CHANGELOG

> Rule 22 (_docs 의무) — 매 PR 한 줄 이상.
> 세션: peaceful-laughing-volta (hr 세션, 2026-05-16~), happy-busy-euler (2026-05-29~)

## 2026-05-29

- **PR-HR-23d** (hr 세션 happy-busy-euler) — FMI `departments` 트리 마이그 + API tree 응답.
  - `migrations/2026-05-29_pr_hr_23d_departments_tree.sql` — `parent_id` CHAR(36) NULL + `color_tone` VARCHAR(20) + `sort_order` INT 추가 (멱등, information_schema 체크).
  - `app/api/departments/route.ts` GET — `?tree=1` / `?company_key=` 옵션 + 재귀 트리 build. graceful fallback (parent_id 컬럼 미적용 시 `_migration_pending: true` 응답 + 평면 데이터, Rule 23). POST 도 parent_id 분기.
  - 사용자 직접 마이그 SQL 실행 필요: `mysql -h ... < migrations/2026-05-29_pr_hr_23d_departments_tree.sql`

- **PR-HR-23b** (hr 세션 happy-busy-euler) — FMI 직원 탭 → CompanyEmployeePanel 마이그 + 회사별 sub-tab 통일.
  - **사용자 명령 (5/29)**: 「각 회사별 구조가 동일해야 하는데 다르군요」 → Option A 단일 통합 패널 선택.
  - `app/hr/_components/CompanyEmployeePanel.tsx` props 확장 — `customEmployees / customDepartments / columns / onRowClick / actions / filters / activeFilter / onFilterChange / mobileCard / searchPlaceholder / stats` 외부 주입 옵션. fetch skip 모드 + 기본 columns 의 sortBy 전체 추가 (Rule 18).
  - `app/hr/page.tsx`:
    - `EmployeeListPanel` → `CompanyEmployeePanel` 교체 (FMI 직원 / 공통 admin 탭 모두).
    - `employeeColumns` 모든 컬럼에 `sortBy` 추가 (Rule 18 의무) — name/role/position/department/status/hire_date/created_at.
    - `TABS_BY_COMPANY` 수정: RIDE `['employees', 'org']` → `['employees']` (RideOrgPanel 이 둘 다 같은 화면이라 무의미). 새 회사 default `DEFAULT_DYNAMIC_TABS = ['employees']` (통일).
    - `org` 탭 라벨 `'🏢 조직도'` → `'🏢 부서·직급 마스터'` (FMI 의 CRUD 마스터 의미 명확화).
  - `EmployeeListPanel.tsx` deprecated (즉시 삭제 X — 안정화 1주 후 다음 세션 제거).
  - **회귀 위험**: RIDE 는 본 PR 에서 RideOrgPanel 그대로 유지 — 본격 분해 (1,131 라인 → CompanyEmployeePanel 마이그) 는 다음 세션 PR-HR-23c2.

- **PR-HR-23bcd 설계서 v2** — `app/hr/_docs/PR-HR-23bcd-DESIGN-V2.md` — 본 PR 시리즈 통합 설계. End-to-End 시뮬레이션 6단계 (Rule 8) + 영향 파일 인덱스 (Rule 11/12) + GATE 체크리스트 (Rule 27) + cowork 영역 (Rule 21).

## 2026-05-28

- **PR-HR-HANDOVER** (hr 세션) — 본 세션 14 commit 인계 문서 작성. 다음 세션 진입점 명시 (`HANDOVER-2026-05-28-NEXT-SESSION.md`).
- **PR-HR-23b** (hr 세션) — 새 회사 탭 → CompanyEmployeePanel 자동 노출. `topCompany !== 'FMI/RIDE/common'` (동적 회사) + `employees|org` → 본 패널 자동 사용. FMI/RIDE 는 그대로 (PR-HR-23c/d 에서 마이그).
- **PR-HR-23a** (hr 세션) — CompanyEmployeePanel 스켈레톤 + 설계서 신설 (`_docs/COMPANY-EMPLOYEE-PANEL.md`). 5층 표준 (DcStatStrip + DcToolbar + 부서 트리 + NeuDataTable). 회사별 data source 분기 (FMI=`/api/employees?company_key=`, RIDE=`/api/ride-employees`).
- **PR-HR-18** + **PR-HR-22 hotfix** (hr 세션) — 사이드바 회사별 자동 필터 + 토글 카운트 정확화. `lib/menu-registry.ts` MenuGroup interface 에 `companies?: ('FMI'|'RIDE')[]` 추가 / business 그룹=FMI / cx-team/mt-team/vision=RIDE / settings=admin only. ClientLayout 의 라이드 sub-section 3개에 회사 가드. + 동적 회사 토글의 count fallback 버그 (commonCount=22) 해결.
- **PR-HR-22 hotfix** (hr 세션) — 새 회사 토글 카운트 정확화 (별 commit).
- **PR-HR-17** (hr 세션) — `withCompanyScope(req, opts)` 헬퍼 + `scopeFilter(user, col)` 신설. API 라우트 회사 격리 + admin 우회. 메인 세션 `lib/company-context.ts` + `verifyUser` 위에 build. 단계적 마이그 (PR-HR-17b 차수).
- **PR-HR-22** (hr 세션) — `useCompanies()` SWR hook + 회사 토글 동적화. visibleCompanies 가 DB 기반 → 「+ 회사 추가」 UI 로 새 회사 row 추가만으로 토글 자동 노출. `dynamicLabel` 헬퍼 (DB label 폴백).
- **PR-HR-21** (hr 세션) — CompanyOrgPanel 추출 (FMI 조직도 인라인 90 라인 → 컴포넌트). 직급 + 부서 카드 2개 표준 패널. props 외부 주입.
- **PR-HR-20b** (hr 세션) — RideOrgPanel 검색바 룩앤필 통일. 자체 input → DcToolbar (EmployeeListPanel 패턴). 「하위 부서 포함」 + bulk action 별도 줄 분리.
- **PR-HR-20** (hr 세션) — EmployeeListPanel 추출 + FMI 직원 탭 마이그. ★ 사용자 「fmi/ride 탭 정리되어야」 1단계.
- **PR-HR-DESIGN-FIX** (hr 세션, 메인 세션 요청) — hr/page.tsx UI 표준 위반 3건 정리: max-w-[1400px] 제거 / DcToolbar→NeuFilterTabs / 자체 <table>→div role grid.
- **PR-HR-16 hotfix** (hr 세션) — role_templates collation utf8mb4_unicode_ci 통일 + 회귀 케이스 등록 (Rule 9/15 — 누적 사고 2회 → 다음 같은 사고 시 `sql-collation-lint.js` 자동화 의무).

- **PR-HR-15+16** (hr 세션) — multi-tenancy 회사 마스터 + 페이지 권한 역할 템플릿. ★ 사용자 「실수할까봐 두려움」 직접 해결.
  - 사용자 요구 (2026-05-28): FMI ↔ 라이드 「구조가 다르다 → 구조 정리 필요」, F = 전면 정리.
    페인 결론: 회사별 격리 자동화 + 페이지 권한 사람마다 고민 → 템플릿화 (회사+역할 묶음).
  - 메인 세션 합의 (b 분리 유지) — 본 세션은 HR + 권한 + 사이드바, 메인 세션은 ride_* 본문.
    활용한 메인 세션 헬퍼: `lib/company-context.ts`, `lib/use-company.ts`, `/api/me/company`, `lib/company-brand.ts`.
  - **PR-HR-15 — companies 메타 컬럼**:
    1. `migrations/2026-05-28_pr_hr_15_companies_meta.sql` (멱등) — `label/primary_color/accent_color/short_name/is_active/is_internal_host/sort_order` 7 컬럼 추가 + FMI(internal=1,sort=10) / RIDE(internal=0,sort=20) 시드.
    2. `prisma/schema.prisma` Company 모델 동기화 (그동안 누락된 `company_key/subdomain/logo_url/theme_json` 포함).
    3. `app/api/companies/[id]/route.ts` PATCH `ALLOWED_COLS` 확장 (신규 7 컬럼 + `company_key`/`subdomain`/`theme_json`).
    4. `app/hr/_components/CompanyMasterPanel.tsx` — 회사 목록 (color chip + 호스트/활성/순서) + 인라인 편집 + 「+ 회사 추가」 모달.
  - **PR-HR-16 — role_templates (페이지 권한 묶음)**:
    1. `migrations/2026-05-28_pr_hr_16_role_templates.sql` (멱등) — `role_templates` + `role_template_pages` 신설 + `user_page_permissions.source_template_id` 추가 + FMI/RIDE × admin/manager/staff/viewer 8개 기본 템플릿 시드.
    2. `prisma/schema.prisma` — `RoleTemplate` / `RoleTemplatePage` 모델 신설 + `UserPagePermission.source_template_id` 추가.
    3. `app/api/role-templates/route.ts` — GET `?company_key=` 목록 / POST 추가.
    4. `app/api/role-templates/[id]/route.ts` — GET (pages 포함) / PATCH (헤더) / PUT (pages 일괄 교체) / DELETE.
    5. `app/api/role-templates/[id]/apply/route.ts` — POST `{user_ids, mode: 'replace'|'merge'}` → user_page_permissions 일괄 INSERT (source_template_id 추적).
    6. `app/hr/_components/RoleTemplatePanel.tsx` — 회사 필터 + 템플릿 목록 + 펼침 트리 (menu-registry MENUS 기반 view/create/edit/delete 체크박스) + 「적용」 모달 (직원 선택 + replace/merge 모드 + 결과 패널).
  - **/hr 페이지 통합**:
    · `SubTab` union 확장: `'companies' | 'roles'` (common 안, admin 만).
    · `TAB_LABEL`: 🏛️ 회사 마스터 / 🎭 역할 템플릿.
    · `visibleTabs` admin 가드 — admin 아니면 두 탭 자동 숨김.
    · 렌더 분기: `topCompany === 'common' && topTab === 'companies' && role === 'admin' && <CompanyMasterPanel />` / `roles && <RoleTemplatePanel />`.
  - 운영 사실 (Rule 25 인터뷰):
    · 회사 관계: FMI ↔ RIDE = 무관 거래 (B2B 운영 위탁). FMI=내부 호스트.
    · 권한: 회사별 격리 (자기 회사만). admin = 양사.
    · 향후: 제 3 회사 추가 가능성 있음 → companies 마이그 없이 「+ 회사 추가」 UI 로 row 추가 (코드 동기화는 별도 deploy 토스트 안내).
    · 이중 소속: 사용자 본인 1명만 — admin role 로 흡수 (별도 모델 X).
    · 부서: 회사별 다른 트리 (현재 ride_departments 구조 유지).
  - 효과: 직원 추가 → 회사 + 역할 선택 1번 → 페이지 권한 일괄 자동. 「사람마다 고민하고 페이지 설정」 페인 해소.

- **PR-HR-14** (hr 세션) — hr 모듈 `useEmployees` SWR hook 도입 (실시간 동기화 1단계).
  - 사용자 요구: 「전체 페이지 사용자 표시 공통화 + 실시간 연동」 — 옵션 A 1단계 hr 모듈 입점 GO.
  - 현재 분산 상태 진단: `/api/profiles` 호출 5개 페이지 (admin/developer / admin / ProtectedRoute / PayrollOps / hr) — 각자 fetch + 캐시 X. 한 페이지 변경 → 다른 페이지 다음 mount 까지 옛 데이터.
  - 조치:
    1. 의존성 `swr ^2.4.1` 1개 추가.
    2. 신규 `lib/hooks/useEmployees.ts` — SWR 기반 `/api/profiles` fetcher + `revalidateOnFocus` + `dedupingInterval=2000` + `mutate` 노출. 모든 사용처가 같은 cache 공유.
    3. `app/hr/page.tsx` — `employees` state → `useEmployees()` hook 교체. `loadEmployees()` 는 mutate wrapper (호환 유지). 변경 호출처 (saveEdit / withdrawEmployee / InviteModal onSuccess) 그대로 동작 + 다른 사용처 자동 refresh.
    4. `app/hr/_components/PayrollOps.tsx` — `emps` state → `useEmployees()` 교체. `fetchEmps` 는 mutate wrapper.
  - 효과:
    · /hr 와 /admin/payroll 둘 다 열면 같은 cache → 한 번만 fetch.
    · 한 탭에서 직원 수정 → 다른 탭 클릭 진입 (focus) 시 자동 refresh.
    · 같은 키 fetch 2초 내 중복 방지 (dedupingInterval).
  - 향후: RideOrgPanel (ride_employees), admin/employees, admin/developer, ProtectedRoute, CallScheduler 등 다른 모듈은 점진 확장 (별 PR).

- **PR-HR-11a** (hr 세션) — `/hr` 회사 토글 + 회사별 하위 탭 리뉴얼 (UI 골격).
  - 사용자 요구 (2026-05-27/28):
    1. 「company 추가 후 인사 마스터 UI 구조 리뉴얼」 — 옵션 A 회사 토글 + 하위 탭 (사용자 GO).
    2. 「이중탭 UI 부자연스러움」 (외부 인력 → 프리랜서/라이드 서브탭) — 동일 PR 안에서 해소.
  - 구조 변경:
    1. 기존 5 탭 (employees/org/invitations/external/payroll) → 회사 토글 (FMI/RIDE/common) + 회사별 하위 탭.
       · FMI: 직원 / 조직도 / 급여 운영
       · RIDE: 직원 / 조직도 (RideOrgPanel — 양쪽 탭에서 마당 노출)
       · common: 초대 / 프리랜서 / 시스템 관리자 (admin 만)
    2. `profile.company_key` 기반 권한 분리 — admin GOD = 전체 / user|master = 본인 회사 + common.
    3. URL `?company=&tab=` sync (새로고침 + 공유 가능).
    4. 이중탭 (externalSubTab freelancer/ride) **폐기** — freelancer 는 common 탭, ride 는 RIDE 탭으로 마당 흡수.
    5. 「소속 유형」 필터 (sosokFilter DcToolbar) 폐기 — 회사 토글이 그 역할 대체.
  - API: `/api/profiles/me` LEFT JOIN companies + `company_key` 평탄화 (PR-HR-7 와 동형 패턴 Rule 14, graceful fallback Rule 23).
  - types: `app/types/rbac.ts` `Profile` 타입 `company_id` / `company_key` / `company` 필드 추가.

- **PR-HR-12-hotfix** (hr 세션) — `getEmpStatus` TDZ 회피 (filteredEmployees useMemo 위로 이동).
  - PR-HR-12 가 `statusFilter` 디폴트 'active' 변경 → 첫 렌더 시 useMemo callback 이 즉시 `getEmpStatus(e)` 호출 → const 화살표 함수 미정의 → ReferenceError. 사용자 보고: 「Application error: client-side exception」.
  - 조치: `type EmpStatus + const getEmpStatus` 정의를 `filteredEmployees` useMemo 보다 위로 이동.
  - 재발 방지 원칙: const 화살표 함수는 사용 코드보다 위에 정의 의무 (function declaration 만 hoisting).

## 2026-05-27

- **PR-HR-13** (hr 세션) — InviteModal 페이지 권한 menu-registry 단일 source 동기화.
  - 사용자 보고: 「멤버 초대에 아직도 페이지 권한 실제 페이지 항목 동기화가 안되네요 구조적으로 개선해야 실시간 동기화가능할것같은데」.
  - 진단: `InviteModal.tsx` 안 hardcoded `PAGE_GROUPS` (5 그룹) + `PATH_TO_GROUP` 가 `lib/menu-registry` (12 그룹) 와 별도 정의 → 신규 메뉴/그룹 추가 시 페이지 권한에 자동 반영 X (비전 / MT팀 / CX팀 / admin-ops 그룹 누락).
  - 조치 (사용자 결정: 옵션 C 공용 API):
    1. 신설 `GET /api/menus` — `lib/menu-registry` GROUPS + MENUS 한 번에 반환. 쿼리 `?for=permission` (권한 부여 대상만) / `?include_hidden=1` (디버그). 향후 `?company=` 옵션 확장 여지.
    2. InviteModal hardcoded `PAGE_GROUPS` / `PATH_TO_GROUP` 폐기 → `/api/menus?for=permission` 응답 기반 `groups` + `menus.group` 매칭 자동 그룹화.
    3. state `activeModules` → `menus + groups` 둘 다 보관.
  - 효과: 이제 `lib/menu-registry` 한 곳만 수정하면 사이드바 + 권한 페이지 + 초대 모달 모두 자동 동기화 (단일 source).
  - 사용자 보고: 「완전 삭제 해도 삭제되지 않네요?」 + 「기존 연동 데이터 때문에?」 — 정확.
  - 진단: `/api/employees/withdraw` 는 `UPDATE is_active=0` (soft delete) — DB row 보존. 거래/계약/회의록 등 FK 참조 데이터의 감사 추적 무결성을 위해 진짜 DELETE 미사용. 버튼 라벨 「완전 삭제」 가 오해 유발.
  - 조치 (사용자 결정: 옵션 A 숨김 운영):
    1. 직원 목록 디폴트 `statusFilter='active'` (퇴사자 기본 숨김 — 일상 화면 깨끗).
    2. 버튼 라벨 「완전 삭제」 → 「퇴사 처리」, 보조 설명 「감사 추적 보존」 명시.
    3. confirm 메시지 정확화 (계정 비활성화 / 부서 해제 / 데이터 보존 / 보관함 조회 가능 명시).
  - 퇴사자 조회: 「퇴사」 필터 (DcStatStrip 카드 또는 검색 옆 필터) 클릭 시 진입.

## 2026-05-26

- **PR-HR-7+9** (hr 세션) — getSoSokType 회사 기반 + SOSOK_LABEL 「RIDE 직원」 (구 「외부 매니저」).
  - `/api/profiles/route.ts` — LEFT JOIN companies + `company_key` 응답 평탄화 (메인 PR-MULTI-BRAND P3+b 의존).
    graceful fallback (Rule 23): JOIN 자체 실패 시 `SELECT *` 폴백 — page.tsx 가 FMI 디폴트 처리.
  - `app/hr/page.tsx` — `getSoSokType` dept.name 문자열 매칭 (`'라이드주식회사' / /라이드/`) 폐기 → `emp.company_key === 'RIDE'` 회사 기반 분기. SOSOK_LABEL `'외부 매니저'` → `'RIDE 직원'`. 탭 「👥 RIDE 직원」 + 주석 일괄 정리.
  - `app/hr/_components/PayrollOps.tsx` — `isExternal` 회사 기반 + graceful fallback (dept 매칭 유지).
  - 사용자 GO (AskUserQuestion): `'외부 매니저'` → `'RIDE 직원'` 전수 교체 + `/api/employees`(실 `/api/profiles`) 수정은 hr 세션 처리.
- **PR-HR-8** (hr 세션) — `POST /api/ride-employees/upsert-from-invite` 신설.
  - 메인 세션 PR-MULTI-BRAND P3+c-3 (member-invite/accept) 호출 대기용.
  - target_company === 'RIDE' 인 초대 수락 시 profile 생성 직후 본 API → ride_employees UPSERT.
  - 기존 row UPDATE (COALESCE 기존값 보존) / 없으면 INSERT (name 필수).
  - 응답: `{ data: { ...row, upserted: 'update' | 'insert' } }` — JOIN ride_departments 로 부서명 포함.
- **PR-HR-6** (hr 세션) — `profile ↔ ride_employees` 매핑 헬퍼 API.
  - `GET /api/ride-employees/by-profile/[profileId]` — 1:1 조회 (회사 판별: 있으면 RIDE)
  - `GET /api/ride-employees/lookup?email=&name=` — 이메일/이름 매칭 후보 list (최대 20)
  - 메인 세션 PR-MULTI-BRAND P3+b/c/d 위탁 충족 (getSoSokType 회사 기반 / InviteModal RIDE 부서 / FMI 「라이드주식회사」 폐기 매핑)
- **§ 9.5 기록** — `_docs/HR-OPERATIONS.md` 부서 구조 통합 C 정책 (2026-05-24 사용자 결정, 본 커밋과 분리).

## 2026-05-16

- **PR-HR-5c** (hr 세션) — RideOrgPanel 직원 선택 체크박스 확대.
  - 기본 13px → 18px (`accentColor` 네이비), `label` 래퍼로 클릭 영역 확장 (사용자 피드백: 체크박스 너무 작음).
  - 전체 선택 체크박스도 17px 로.
- **정책 기록** — `_docs/HR-OPERATIONS.md § 9` 신설: 라이드 직원 계정(외부 매니저, 옵션 a) + 독립 브랜딩(라이드주식회사) + 인사마스터 동기화 정책. 멀티 브랜딩은 메인 세션 위탁 (PR-MULTI-BRAND).
- **PR-HR-5b** (hr 세션) — 컨택 명단 17명 연락처/이메일 UPSERT (`migrations/2026-05-16_ride_employees_contact.sql`).
  - bulk-upload 는 INSERT-only → 기존 직원 보강 불가. UPDATE + NOT EXISTS INSERT 멱등 UPSERT 로 해결.
- **PR-HR-5** (hr 세션) — RideOrgPanel 엑셀 일괄 등록 (컨택 명단).
  - DcStatStrip 「📥 엑셀 일괄 등록」 버튼 → 파일 선택 → 브라우저 XLSX 파싱.
  - 헤더 자동 매핑 (이름/성명, 연락처/전화/휴대폰, 이메일, 부서, 직급) — 5행 내 헤더 자동 탐지.
  - `bulk-upload` API preview → 미리보기 모달 (신규/중복/빈행/오류 summary + 행별 상태) → apply.
  - 같은 이름 중복 자동 skip (API), 결과 글래스 패널 (Rule 20).
- **PR-HR-4b** (hr 세션) — 퇴사/수정 후 리스트 미갱신 hotfix.
  - mutation(퇴사·수정·부서변경) 후 `load()` 의 GET 이 브라우저 캐시된 옛 데이터를 받아
    리스트에 반영 안 됨 (사용자 피드백: "떴는데 리스트에 적용이 안 됨").
  - `load()` 의 tree/employees fetch 에 `cache: 'no-store'` 추가 — refetch 시 항상 fresh.
- **PR-HR-4** (hr 세션) — RideOrgPanel 직원 편집/등록 모달.
  - 직원 행 클릭 → 편집 모달 / DcStatStrip 「+ 신규 직원」 → 등록 모달.
  - 필드 11종: 이름/부서/직급/승진대상/고용형태/입사일/퇴사일/연락처/이메일/색상/활성.
  - 저장 → POST/PATCH `ride-employees`, 「퇴사 처리」 → DELETE (soft, resign_date 기록).
  - 결과 글래스 패널 (Rule 20), 모달 배경 #fff (ui-token 무관).
- **PR-HR-3b** (hr 세션) — 「외부 인력」 탭 카운트 lazy load 수정.
  - `loadExternal()` 이 `topTab==='external'` 일 때만 호출 → 탭 클릭 전엔 카운트 0 (사용자 피드백).
  - 마운트 시부터 호출하도록 변경 — 「외부 인력 38」 + 서브탭 「프리랜서 22 / 라이드 16」 카운트 즉시 표시.
- **PR-HR-3** (hr 세션) — RideOrgPanel 보강 (부서 CRUD + 직원 활성 필터).
  - 직원 테이블 기본 **활성만** + 「비활성 포함 (N)」 토글 — 중복 정리(dedupe) 잔재가 다 보여 "인원 많아 보임" 사용자 피드백 해소.
  - 부서 트리 CRUD — 「+ 부서」 추가 (이름/상위부서/색상) / ✏️ 이름·상위·색상 변경 / 🗑 삭제 (직원·자식 가드).
  - glassCard → `GLASS.L4` 토큰, search input → `GLASS.L1` (ui-token-lint 준수, baseline 무증가).
- **PR-HR-2b** (hr 세션) — 「외부 인력」 탭 서브탭 분리.
  - 프리랜서(22명) + 라이드 인력 부서관리가 위아래로 쌓여 스크롤 과도 (사용자 피드백).
  - 서브탭 2개로 분리: 「🤝 프리랜서」 / 「🚗 라이드 인력」 — `externalSubTab` state, 검정 pill 활성 스타일.
- **PR-HR-2** (hr 세션) — `/hr` 「외부 인력」 탭 라이드케어 인력 부서 관리 UI.
  - `app/hr/_components/RideOrgPanel.tsx` 신설 — 「조회 only」 → 본격 부서 관리.
  - DcStatStrip 5칸 (활성/부서수/이번달입사/퇴사예정/승진대상) + 좌측 부서 트리 (Glass 5색) + 우측 NeuDataTable.
  - 부서장 인라인 지정 / 일괄 부서 변경 (bulk-assign) / `?focus=<id>` 직원 부서 자동 선택 + 🔗 강조.
  - NeuDataTable 전 컬럼 sortBy (Rule 18), 셀 nowrap (Rule 19), 결과 글래스 패널 (Rule 20).
  - `/api/ride-employees` route.ts V1.5 — `department_id`/`promotion_target` 컬럼 SELECT 추가 (JOIN 없음).
  - 회의록 연동 전제 완성 — meetings 세션이 `ride_departments` 부서 트리/부서장 활용 가능.
- **스키마 합의** (hr ↔ meetings 세션) — `ride_departments` 부서장 컬럼명 `manager_id` → `leader_employee_id` 통일.
  - meetings 세션이 `_docs` 에 `ride_departments.leader_employee_id` 로 명시 (PR-MTG-V2-Visibility 후속).
  - 마이그에 멱등 RENAME 블록 추가 — 이전 버전(manager_id) 적용분 자동 보정.
  - API POST 는 `body.manager_id` 하위호환 fallback 유지.
- **PR-HR-1** (hr 세션) — 라이드케어 부서 마스터 신설.
  - 마이그 3개: `ride_departments` (17 entry 시드) / `ride_employees.department_id`+`promotion_target` / `ride_employee_assignments` (다대다 겸업).
  - API 6개: `/api/ride-departments/*` × 3 신설 (GET/POST/tree, [id] PATCH/DELETE) + `/api/ride-employees/*` 보강 (route, [id] LEFT JOIN ride_departments) + bulk-assign 신설.
  - graceful fallback (Rule 23): 마이그 미적용 시 V1 schema 로 자동 fallback + `_migration_pending: true` 반환.
  - 운영 사실 인터뷰 완료: `_docs/HR-OPERATIONS.md` 신설 / `HR-DATA-MODEL.md` + `HR-PERSONAS.md` 보강.
  - 도메인 사실: 「메인=FMI, 라이드=외주」 — 두 회사 부서 시스템 분리.

## 2026-05-11

- (메인 세션 sweet-amazing-galileo) — PR-HR-PREP. hr 세션 인계 자료 작성:
  - `_docs/HR-PERSONAS.md` (페르소나 1차 초안)
  - `_docs/HR-DATA-MODEL.md` (테이블 도식 + V2-Dept-FK 설계)
  - `_docs/SESSIONS-COORDINATION.md` § 1.1 모듈 등록 (`app/hr/*` / `app/api/ride-employees/*` / `app/api/ride-departments/*`)

## 2026-05-06

- (메인 세션) PR-B4: 「급여 운영」 admin → settings 그룹 이동. `mod-payroll-ops` 사이드바 숨김 (`sidebarHidden: true`). `/hr/payroll` 페이지 잔존 (deprecated, HIDDEN_PATHS X — 통합 페이지 5번째 탭 진입).

## 2026-05-05

- (메인 세션) PR-B1: 「인사 마스터」 통합 1 페이지 5 탭 구조 신설. `/hr/people`, `/hr/org` 별도 페이지 HIDDEN_PATHS 흡수. `hr` 메뉴 그룹 폐기 → `settings` 그룹 안 `mod-hr-master` (path: `/hr`).

## 2026-05-03

- (메인 세션) `ride_employees` 마이그 신설 (`migrations/2026-05-03_ride_employees_init.sql`). cs_workers 16명 → ride_employees 이전 (UUID 동일 매핑). `cs_workers.employee_id` FK 추가.
