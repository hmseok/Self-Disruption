# /hr 모듈 — CHANGELOG

> Rule 22 (_docs 의무) — 매 PR 한 줄 이상.
> 세션: peaceful-laughing-volta (hr 세션, 2026-05-16~)

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
