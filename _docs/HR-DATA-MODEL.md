# HR — 데이터 모델 도식

> **작성**: 2026-05-11 (sweet-amazing-galileo 메인 세션)
> **목적**: hr 세션 인계 — 기존 ride_employees + 신설 ride_departments + 관계.
> **Rule**: Rule 22 (_docs 의무) / Rule 11 (SQL 컬럼 검증) / Rule 23 (마이그 + 검증).

---

## 1. 핵심 테이블 3개

```
┌────────────────┐         ┌──────────────────┐         ┌────────────────┐
│   profiles     │  옵션   │  ride_employees   │   FK    │ride_departments│
│   (인증 마스터) │ ──FK──> │   (인사 마스터)    │ ──참조──>│  (부서 마스터)  │
│   PK: id UUID  │         │   PK: id UUID     │         │ PK: id UUID     │
│   email/role   │         │   profile_id FK   │         │ name / parent_id│
└────────────────┘         │   department_id   │         │ manager_id      │
                            │   (신설 FK 예정)   │         │ color_tone      │
                            └────────┬──────────┘         └────────────────┘
                                     │ 1:N
                            ┌────────┴──────────┐
                            │   cs_workers      │
                            │  (콜센터 특화)     │
                            │  employee_id FK   │
                            └───────────────────┘
```

---

## 2. `ride_employees` — 인사 마스터 (이미 운영 중)

마이그: `migrations/2026-05-03_ride_employees_init.sql`

```sql
CREATE TABLE ride_employees (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  name              VARCHAR(64)  NOT NULL,
  profile_id        CHAR(36)     NULL,  -- profiles.id 옵션 FK

  -- 인사 기본
  department        VARCHAR(32)  NULL,  -- ⚠️ free text — V2-Dept-FK 마이그 대상
  position          VARCHAR(32)  NULL,  -- 직급/직책
  employment_type   VARCHAR(16)  NULL,  -- 정규|계약|파트|용역
  hire_date         DATE         NULL,
  resign_date       DATE         NULL,

  -- 연락
  phone             VARCHAR(32)  NULL,
  email             VARCHAR(128) NULL,

  -- 표시
  color_tone        VARCHAR(16)  NOT NULL DEFAULT 'none',
  group_label       VARCHAR(32)  NULL,

  -- 메타
  memo              VARCHAR(500) NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_ride_emp_active (is_active, department),
  KEY idx_ride_emp_profile (profile_id),
  KEY idx_ride_emp_name (name)
);
```

**현재 상태**:
- 16명+ 등록 (사용자 직접 등록)
- `department` 가 free text → 일관성 깨질 위험
- cs_workers 와 1:1 매핑 (UUID 동일)

---

## 3. `ride_departments` — 부서 마스터 (신설 필요)

**제안 스키마** (사용자 인터뷰 후 hr 세션이 확정):

```sql
CREATE TABLE IF NOT EXISTS ride_departments (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  name            VARCHAR(64)  NOT NULL UNIQUE,
  parent_id       CHAR(36)     NULL,            -- 트리 구조
  manager_id      CHAR(36)     NULL,            -- ride_employees.id 부서장
  color_tone      VARCHAR(16)  NOT NULL DEFAULT 'slate',
  sort_order      INT          NOT NULL DEFAULT 0,
  description     VARCHAR(255) NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ride_dept_parent (parent_id),
  KEY idx_ride_dept_manager (manager_id),
  KEY idx_ride_dept_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**시드 권장** (사용자 인터뷰 후 확정):
- 콜센터 / 운영 / 정비 / MT팀 / 영업 / 관리 등
- `INSERT IGNORE` 또는 `ON DUPLICATE KEY UPDATE` (Rule 24 멱등성)
- UNIQUE 키 (name) 으로 동일 부서명 중복 차단

---

## 4. `ride_employees.department_id` 마이그 (V2-Dept-FK)

기존 `department` (free text) → `department_id` (FK) 마이그 단계:

```sql
-- Step 1: 컬럼 추가 (FK 없이)
ALTER TABLE ride_employees
  ADD COLUMN IF NOT EXISTS department_id CHAR(36) NULL AFTER department;

-- Step 2: 기존 free text 매핑 (수동 또는 자동)
UPDATE ride_employees re
  JOIN ride_departments rd ON rd.name = re.department
   SET re.department_id = rd.id
 WHERE re.department IS NOT NULL;

-- Step 3: 매핑 안 된 row 확인 (사용자 검수)
SELECT id, name, department FROM ride_employees
 WHERE department IS NOT NULL AND department_id IS NULL;

-- Step 4: department free text 컬럼 → deprecated (즉시 삭제 X)
-- ALTER TABLE ride_employees DROP COLUMN department;  -- 마지막 단계 (3개월 후)
```

**주의**: `department` 컬럼 즉시 삭제 X — 점진 마이그 (Rule 23).

---

## 5. 연계 모듈 매핑

### 5.1 `cs_workers` (콜센터)
- 이미 `employee_id` FK 적용 완료 (2026-05-03 마이그)
- `cs_workers.group_label` 은 콜센터 특화 (주간/야간/저녁) → 부서와 별개 유지

### 5.2 `meetings.department` (회의록)
- 현재 free text (department VARCHAR)
- **V2-Dept-FK 마이그 대상** (hr 세션 Phase 2)
- `ALTER TABLE meetings ADD COLUMN department_id CHAR(36) NULL;`
- meetings 세션이 hr 세션 완료 후 본 작업 진행

### 5.3 `app/admin/payroll` (급여)
- 별도 모듈 — ride_employees 와 1:N 연계
- hr 세션 Phase 3 검토

### 5.4 `profiles` (인증 — 단독 회사)
- 1:1 매핑 (profile_id 옵션 FK)
- 사용자별 권한은 profiles.role 에서 (admin / user)

---

## 6. UI 페이지 매핑

| 페이지 | 현재 | 목표 |
|--------|------|------|
| `/hr` | 대시보드 | 직원 통계 + 부서별 요약 |
| `/hr/people` | 직원 list | DcStatStrip + DcToolbar + NeuDataTable + ?focus=<id> highlight |
| `/hr/org` | (신설) | 부서 트리 + 부서장 + 직원 일괄 변경 |
| `/hr/payroll` | 별도 | 급여 (현재 admin/payroll 와 통합 검토) |

---

## 7. 마이그레이션 적용 순서 (hr 세션 작업)

### Phase 1 (hr 세션)
1. `ride_departments` 테이블 신설 (`migrations/YYYY-MM-DD_ride_departments_init.sql`)
2. 부서 시드 INSERT (사용자 인터뷰로 부서 목록 확정 후)
3. `ride_employees.department_id` 컬럼 추가
4. 기존 free text → FK 매핑 (UPDATE JOIN)
5. UI: /hr/org 부서 트리 + /hr/people 부서 dropdown

### Phase 2 (hr + meetings 협업)
1. `meetings.department_id` 컬럼 추가
2. 기존 free text → FK 매핑
3. meetings 세션이 UI 갱신

### Phase 3 (옵션)
1. 보직변경 이력 테이블 (employment_history)
2. cs_workers ↔ ride_departments 통합 (필요 시)

---

## 8. 검증 SQL (Phase 1 마이그 후)

```sql
-- 검증 1: ride_departments 생성 + 시드 확인
SELECT COUNT(*) FROM ride_departments;
-- 기대: 부서 수 (사용자 결정)

-- 검증 2: ride_employees.department_id 컬럼 존재
SELECT column_name FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND table_name = 'ride_employees'
   AND column_name = 'department_id';
-- 기대: 1 row

-- 검증 3: 매핑 정합성
SELECT
  (SELECT COUNT(*) FROM ride_employees WHERE department IS NOT NULL) AS has_dept_text,
  (SELECT COUNT(*) FROM ride_employees WHERE department_id IS NOT NULL) AS has_dept_fk,
  (SELECT COUNT(*) FROM ride_employees
    WHERE department IS NOT NULL AND department_id IS NULL) AS unmapped;
-- 기대: unmapped = 0 (완료 시)
```

---

본 문서는 hr 세션이 마이그 적용 후 갱신.
