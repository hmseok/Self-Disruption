# /hr 모듈 — DATA-MODEL

> Rule 22 + Rule 25 — 모듈 데이터 모델 + 운영 사실 근거 문서.
> 본 모듈은 회사별 직원 마스터 + 권한 + 부서·직급 + 급여 + 외부 인력 통합 관리.

## 1. 핵심 테이블

### 1.1 `companies` — 회사 마스터 (multi-tenancy)

PR-HR-15+16 (2026-05-28) 도입.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | CHAR(36) PK | UUID |
| `name`, `label`, `short_name` | VARCHAR | 표시명 |
| `company_key` | VARCHAR UNIQUE | 'FMI'/'RIDE'/'NEW1' 등 — 코드/URL 식별자 |
| `subdomain` | VARCHAR | 향후 *.hmseok.com 라우팅 |
| `logo_url`, `theme_json` | VARCHAR / JSON | 브랜드 |
| `primary_color`, `accent_color` | VARCHAR(7) | 색상 chip |
| `is_active` | TINYINT | 사이드바/토글 노출 |
| `is_internal_host` | TINYINT | FMI(1) = 운영 호스트 / RIDE(0) = 위탁사 |
| `sort_order` | INT | 토글 순서 |
| `created_at`, `updated_at` | DATETIME | |

시드: FMI (internal=1, sort=10) / RIDE (internal=0, sort=20) / 회사테스트 (sort=100 — 사용자 UI 추가).

### 1.2 `role_templates` — 회사별 역할 템플릿

PR-HR-16 (2026-05-28) 도입.

- `id`, `company_id`, `role_key` (admin/manager/staff/viewer), `label`, `description`, `sort_order`, `is_active`
- 시드: FMI/RIDE × 4 = 8개
- 페이지 권한 묶음: `role_template_pages` (template_id + page_path + 4 권한 + data_scope)
- `user_page_permissions.source_template_id` — 적용 추적

### 1.3 `profiles` — FMI 직원 마스터

- `id` (CHAR(36) PK), `email`, `display_name`, `employee_name`, `phone`
- `role` ('admin'/'master'/'user'), `is_active`
- `company_id` (PR-MULTI-BRAND P3+b) — 'FMI' company_id
- `position_id`, `department_id`
- `hire_date`, `resign_date`, `resign_reason`, `emp_status` ('active'/'on_leave'/'resigned')
- `created_at`, `updated_at`

### 1.4 `ride_employees` — RIDE 직원 마스터

PR-HR-2 (2026-05-16) 도입.

- `id` (CHAR(36) PK), `name`, `department`, `department_id`, `position`, `promotion_target`
- `employment_type` ('정규'/'계약'/'파트'/'용역'/'프리')
- `hire_date`, `resign_date`, `phone`, `email`, `color_tone`
- `is_active`
- 본 ERP 계정 X (외주 — 권한은 별도)

### 1.5 `departments` — FMI 부서 (PR-HR-23d 트리 마이그)

PR-HR-23d (2026-05-29) — `parent_id` / `color_tone` / `sort_order` 추가 (멱등).

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | CHAR(36) PK | |
| `name` | VARCHAR | |
| `parent_id` | CHAR(36) NULL | ⭐ PR-HR-23d — 부모 부서 (NULL=루트) |
| `color_tone` | VARCHAR(20) | ⭐ 트리 색상 (blue/green/red/amber/violet/slate) |
| `sort_order` | INT DEFAULT 0 | ⭐ 트리 내 정렬 |
| `company_id` | CHAR(36) | |
| `created_at`, `updated_at` | | |

API: `/api/departments?company_key=FMI&tree=1` → 재귀 트리 응답. graceful (parent_id 미적용 시 `_migration_pending: true`).

### 1.6 `ride_departments` — RIDE 부서 (계층 트리, 이미 존재)

PR-HR-1 (2026-05-16) 도입.

- `id`, `name`, `parent_id`, `leader_employee_id`, `leader_name`, `color_tone`, `sort_order`, `description`, `is_active`
- API: `/api/ride-departments/tree` → 재귀 트리

### 1.7 `positions` — FMI 직급 마스터

- `id`, `name`, `level` (정렬용 — 1~10)

### 1.8 외부 인력

- `freelancers` — 3.3% 사업소득 / 8.8% 기타소득 / 세금계산서 / 원천징수 없음
- (참고) `ride_employees` 도 외부 인력으로 간주 (FMI 본사 직원 X)

## 2. 회사별 데이터 분기 (Rule 14 동형 인덱스)

| 데이터 종류 | FMI | RIDE | 새 회사 (동적) |
|---|---|---|---|
| 직원 | `profiles` (company_id=FMI) | `ride_employees` | `profiles` (company_id 분기) |
| 부서 | `departments` (PR-HR-23d 트리) | `ride_departments` | `departments` (동적) |
| 직급 | `positions` | (ride_employees.position 자유) | (TBD) |
| 권한 | `user_page_permissions` | (RIDE 본 ERP 권한 X — 외주) | (`role_templates` 적용) |
| API 직원 | `/api/employees`, `/api/profiles` | `/api/ride-employees` | `/api/employees?company_key=` |
| API 부서 | `/api/departments?tree=1` | `/api/ride-departments/tree` | `/api/departments?company_key=&tree=1` |

## 3. 향후 (PR-HR-23c2 본격 RIDE 분해)

- `EmployeeEditModal` 추출 — 회사 공통 모달 (현재 RideOrgPanel 안에 매몰)
- `BulkExcelModal` 추출 — RIDE/회사별 엑셀 일괄 등록
- `RideOrgPanel.tsx` 폐기 → `CompanyEmployeePanel + extraColumns` 마이그
