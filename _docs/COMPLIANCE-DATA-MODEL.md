# RideCompliance (라이드 정보보안) — 데이터 모델

> **작성**: 2026-05-18 (compliance 세션 신설)
> **재구조**: 2026-05-18 Phase 1.2 — 사용자 통찰 반영 (자료·서식 카탈로그 + 버전관리 + 주기적 task + 작성 트래커 + D-7 알림 + 원본 검수 단계)
> **목적**: Rule 22 — 모듈 _docs 갱신 의무 (DATA-MODEL).
> **모듈**: `app/(employees)/RideCompliance/*` + `app/api/ride-compliance/*`
> **인터뷰 출처**: `_docs/COMPLIANCE-PERSONAS.md` § 0 + 매뉴얼 통합본 5.17 § 1~9장 + 별첨 1~7 + 부속 매뉴얼 4종
> **마이그레이션 (Phase 1.1)**: `migrations/2026-05-18_ride_compliance_phase11.sql` (배포 완료)
> **마이그레이션 (Phase 1.2)**: `migrations/2026-05-18_ride_compliance_phase12.sql` (본 PR)

---

## 1. 테이블 개요 — 14 도메인 (Phase 1.1~1.4)

본 모듈은 매뉴얼 통합본 5.17 의 9장 27조 + 별첨 1~7 + 부속 매뉴얼 4종 의 운영 항목을 1:1 매핑한 14 도메인.

### Phase 1.1 — 코어 운영 데이터 (배포 완료, 2026-05-18)

| 테이블 | 용도 | 매뉴얼 출처 | 상태 |
|---|---|---|---|
| `ride_compliance_officers` | 책임자/관리자/취급자 매핑 (3-tier) | 제6/7/9조 | ✅ 배포 |
| `ride_compliance_assets` | 정보자산 본체 (9 type) | 제10~18조 | ✅ 배포 |
| `ride_compliance_incidents` | 침해사고 접수·대응 + 24h SLA | 제25~27조 + 유출대응 매뉴얼 | ✅ 배포 |

### Phase 1.2 — **자료·서식 카탈로그 + 버전 + 주기적 운영 Task + 작성 트래커** (본 PR)

> **사용자 통찰 (2026-05-18)**: 매뉴얼 본문이 "이렇게 해야 한다" 라고 서술하는 것을 운영에서 실제로 진행하려면 (1) 매뉴얼·서식 자체 색인·검수, (2) 버전관리, (3) 주기적 스케줄 task 추적, (4) 서식 작성 별도 체크 가 모두 필요. + (5) 원본 검수 단계 분리 + (6) D-7/D-3/D-day 임박 알림.

| 테이블 | 용도 | 매뉴얼 출처 | 시드 |
|---|---|---|---|
| `ride_compliance_documents` | 매뉴얼·서식 카탈로그 (원본 검수 플래그 포함) | 별첨 1~6 (6 매뉴얼 + 18 서식) + 1 처리방침 | 25행 |
| `ride_compliance_document_versions` | 버전 이력 (시행일·개정사항·차이점) | 통합본 5.17 제·개정 이력 9건 | 6행 (각 매뉴얼 V1.0) |
| `ride_compliance_annual_plans` | 연간 관리계획 마스터 | 별첨 7 RIDE-PLAN-2026-001 | 1행 (2026) |
| `ride_compliance_tasks` | 월별 task carousel (12개월) + D-7/D-3/D-day 알림 추적 | 별첨 7 12개월 일람표 | 12행 (2026) |
| `ride_compliance_form_submissions` | 서식 작성 인스턴스 (보존만료 추적) | 18 서식 + F-06/07 | 0 (운영 데이터) |

### Phase 1.3 — 운영 일일 데이터 (다음 세션)

| 테이블 | 용도 | 매뉴얼 출처 |
|---|---|---|
| `ride_compliance_audits` | 자체감사 회차 + 결과보고서 (반기) | 제20~21조 + 부속 RIDE-M04 |
| `ride_compliance_destructions` | 개인정보 파기 이력 (분기) | 제28~33조 + 부속 RIDE-M05 |
| `ride_compliance_access_reviews` | 접근권한 적정성 검토 (반기) | 안전성 확보조치 기준 제5조 |
| `ride_compliance_drills` | 모의훈련 + 백업복구 테스트 | 별첨 7 8월 + 부속 RIDE-M02 |
| `ride_compliance_processors` | 수탁사 마스터 + 점검 이력 | 제24조 |

### Phase 1.4 — 개인정보 처리방침 + 동의 (다음 세션)

| 테이블 | 용도 | 매뉴얼 출처 |
|---|---|---|
| `ride_compliance_privacy_policies` | 처리방침 버전 (documents 의 특수 case 로 통합 가능) | 제13조 + 별첨 |
| `ride_compliance_consents` | 정보주체 동의 이력 | 개인정보보호법 제15조 |

### 외부 테이블 참조 (라이드 모듈 스타일 — Rule 14 동형)

- ❌ `ride_employees`, FK 관계 없음 (string id 직접 참조)
- ✅ `profiles.id` (cuid Char(36)) 참조 — `assigned_user_id`, `created_by`, `cpo_user_id`, `verified_by_user_id` 등 (Phase 1.1-FIX1: `users` → `profiles` 치환 완료)

---

## 2. 테이블 상세 — Phase 1.1 (배포 완료)

### 2.1 `ride_compliance_officers`

(기존 스키마 그대로 — Phase 1.1 마이그 적용 완료. 상세는 마이그 SQL 본문 참조.)

### 2.2 `ride_compliance_assets`

(기존 스키마 그대로.)

### 2.3 `ride_compliance_incidents`

(기존 스키마 그대로.)

---

## 3. 테이블 상세 — Phase 1.2 (본 PR)

### 3.1 `ride_compliance_documents` — 매뉴얼·서식 카탈로그 (원본 검수 단계)

**핵심 통찰 (사용자 추가-C)**: 원본 매뉴얼·서식 파일이 시스템에 등록되고 CPO가 검수 완료해야 운영 task의 related_form 으로 연결 가능. 검수 미완료 매뉴얼·서식은 form_submissions 작성 단계에서 안내 패널 노출.

```sql
CREATE TABLE IF NOT EXISTS ride_compliance_documents (
  id                       CHAR(36)     NOT NULL PRIMARY KEY,
  doc_code                 VARCHAR(30)  NOT NULL,                    -- 'RIDE-PMP' | 'RIDE-M01' | ... | 'F-M01-01' | 'F-06' 등
  doc_type                 VARCHAR(20)  NOT NULL,                    -- 'manual' | 'form' | 'policy'
  title                    VARCHAR(200) NOT NULL,                    -- '개인정보 유출 대응 매뉴얼' / 'F-M01-01 침해사고 접수·보고서'
  parent_manual_code       VARCHAR(30)  DEFAULT NULL,                -- 서식의 경우 소속 매뉴얼 (F-M01-01 → RIDE-M01)
  description              TEXT         DEFAULT NULL,
  current_version_id       CHAR(36)     DEFAULT NULL,                -- ride_compliance_document_versions.id (활성 버전)
  current_version_no       VARCHAR(20)  DEFAULT NULL,                -- 'V1.0' (캐시)
  effective_date           DATE         DEFAULT NULL,                -- 현 활성 버전 시행일 (캐시)
  retention_years          INT          NOT NULL DEFAULT 3,          -- 보존년수 (서식 작성본의 retention 기본값)
  classification           VARCHAR(20)  NOT NULL DEFAULT 'internal', -- 'public' | 'internal' | 'confidential'
  is_master_verified       TINYINT(1)   NOT NULL DEFAULT 0,          -- ★ CPO 원본 검수 완료 플래그
  verified_by_user_id      CHAR(36)     DEFAULT NULL,                -- profiles.id (CPO)
  verified_by_cpo_at       DATETIME     DEFAULT NULL,                -- 검수 시각
  verification_note        VARCHAR(500) DEFAULT NULL,                -- 검수 코멘트
  file_url                 VARCHAR(500) DEFAULT NULL,                -- GCS signed URL 또는 외부 link (Phase 1.2.0 — 1.2.1 GCS 자동화)
  status                   VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- 'pending' (검수 대기) | 'active' | 'superseded' | 'retired'
  sort_order               INT          NOT NULL DEFAULT 100,
  notes                    TEXT         DEFAULT NULL,
  created_by               CHAR(36)     DEFAULT NULL,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_doc_code (doc_code),
  KEY idx_ride_comp_doc_type (doc_type),
  KEY idx_ride_comp_doc_parent (parent_manual_code),
  KEY idx_ride_comp_doc_verified (is_master_verified, status),
  KEY idx_ride_comp_doc_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**doc_type enum**:
- `manual` — 매뉴얼 본문 (RIDE-PMP, RIDE-M01~06)
- `form` — 서식 양식 (F-M01-01 등 18개 + F-06 + F-07)
- `policy` — 개인정보 처리방침 (별도 — Phase 1.4 통합)

**status 워크플로우**:
- `pending` (시드 직후) → 관리자가 file_url 입력 → CPO 검수 → `active`
- 개정 시: 새 버전 row 추가 → 기존 row `superseded`
- 폐기 시: `retired` (운영 중단)

**시드 25행 (Phase 1.2 마이그 INSERT IGNORE)**:

| doc_code | doc_type | title | parent | retention | classification |
|---|---|---|---|---|---|
| RIDE-PMP | manual | 개인정보보호 내부관리계획서 (통합본) | — | 5 | confidential |
| RIDE-M01 | manual | 개인정보 유출 대응 매뉴얼 | RIDE-PMP | 5 | confidential |
| RIDE-M02 | manual | 라이드케어 비상대응 매뉴얼 (BCP) | RIDE-PMP | 5 | confidential |
| RIDE-M03 | manual | 정보보호 교육관리 매뉴얼 | RIDE-PMP | 5 | confidential |
| RIDE-M04 | manual | 정보보호 점검관리 매뉴얼 | RIDE-PMP | 5 | confidential |
| RIDE-M05 | manual | 개인정보 파기 절차/확인 매뉴얼 | RIDE-PMP | 5 | confidential |
| RIDE-M06 | manual | 개인정보 취급 단말기 반출관리 매뉴얼 | RIDE-PMP | 5 | confidential |
| F-M01-01 | form | 침해사고 접수·보고서 | RIDE-M01 | 3 | internal |
| F-M01-02 | form | 긴급 보고서 | RIDE-M01 | 3 | internal |
| F-M01-03 | form | 유출 통지서 | RIDE-M01 | 3 | internal |
| F-M01-04 | form | 사고 대응 일지 | RIDE-M01 | 3 | internal |
| F-M01-05 | form | 결과보고서 | RIDE-M01 | 3 | internal |
| F-M01-06 | form | 고객 응대 스크립트 | RIDE-M01 | 3 | internal |
| F-M02-01 | form | 비상대응 일지 | RIDE-M02 | 3 | internal |
| F-M02-02 | form | 비상상황 보고서 | RIDE-M02 | 3 | internal |
| F-M02-03 | form | 시스템 장애 대응 기록지 | RIDE-M02 | 3 | internal |
| F-M02-04 | form | 백업 복구 확인서 | RIDE-M02 | 3 | internal |
| F-M05-01 | form | 파기 신청서 | RIDE-M05 | 3 | internal |
| F-M05-02 | form | 파기 대장 | RIDE-M05 | 3 | internal |
| F-M05-03 | form | 파기 완료 확인서 | RIDE-M05 | 3 | internal |
| F-M05-04 | form | 고객사 파기 결과 보고서 | RIDE-M05 | 3 | internal |
| F-14-1 | form | 단말기 지급확인서 | RIDE-M06 | 3 | internal |
| F-14-2 | form | 단말기 반납확인서 | RIDE-M06 | 3 | internal |
| F-06 | form | 연간 교육계획서 | — (별첨 7) | 3 | internal |
| F-07 | form | 교육 이수 확인서 | — (별첨 7) | 3 | internal |

모든 시드의 초기 `status = 'pending'`, `is_master_verified = 0`, `file_url = NULL`. 관리자가 URL 입력 후 CPO가 검수해야 운영 시작.

---

### 3.2 `ride_compliance_document_versions` — 버전 이력

```sql
CREATE TABLE IF NOT EXISTS ride_compliance_document_versions (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  document_id         CHAR(36)     NOT NULL,                       -- ride_compliance_documents.id (소프트 FK)
  version_no          VARCHAR(20)  NOT NULL,                       -- 'V1.0' | 'V1.1' 등
  effective_date      DATE         NOT NULL,                       -- 시행일
  superseded_date     DATE         DEFAULT NULL,                   -- 다음 버전 시행일 (대체된 시점)
  change_summary      TEXT         DEFAULT NULL,                   -- 개정 요약 ('제15조 제3항 12개월 보관 추가' 등)
  approved_by         VARCHAR(40)  DEFAULT NULL,                   -- 'CPO 임성민' 등
  approved_at         DATETIME     DEFAULT NULL,
  file_url            VARCHAR(500) DEFAULT NULL,                   -- 해당 버전 파일 (이전 버전도 보존)
  status              VARCHAR(20)  NOT NULL DEFAULT 'draft',       -- 'draft' | 'active' | 'superseded'
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ride_comp_dv_doc (document_id),
  KEY idx_ride_comp_dv_status (status),
  KEY idx_ride_comp_dv_effective (effective_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**시드 6행**: 각 매뉴얼 V1.0 (시행 2026.05.20, change_summary='2026.05.15 통합본 제정', approved_by='CPO 임성민', status='active'). 관리자가 이전 버전 (2019/2020/2023 등) 추가 등록 가능 (옵션).

---

### 3.3 `ride_compliance_annual_plans` — 연간 관리계획 마스터

```sql
CREATE TABLE IF NOT EXISTS ride_compliance_annual_plans (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  plan_year           INT          NOT NULL,                       -- 2026
  plan_code           VARCHAR(30)  NOT NULL,                       -- 'RIDE-PLAN-2026-001'
  title               VARCHAR(200) NOT NULL,                       -- '2026년 연간 개인정보보호 관리계획'
  prepared_by_user_id CHAR(36)     DEFAULT NULL,                   -- 석호민 부장
  approved_by_user_id CHAR(36)     DEFAULT NULL,                   -- 임성민 이사 (CPO)
  approved_at         DATETIME     DEFAULT NULL,
  effective_date      DATE         NOT NULL,                       -- 2026-05-20
  scope               VARCHAR(255) DEFAULT NULL,                   -- '라이드케어 주식회사 전 임직원 및 개인정보취급자'
  legal_basis         VARCHAR(500) DEFAULT NULL,                   -- '개인정보보호법 제29조, 동법 시행령 제30조'
  notes               TEXT         DEFAULT NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'active',      -- 'active' | 'archived'
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_plan_year (plan_year),
  UNIQUE KEY uq_ride_comp_plan_code (plan_code),
  KEY idx_ride_comp_plan_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**시드 1행** (별첨 7 RIDE-PLAN-2026-001):
- `plan_year = 2026`, `plan_code = 'RIDE-PLAN-2026-001'`
- `effective_date = '2026-05-20'`
- `legal_basis = '개인정보보호법 제29조, 동법 시행령 제30조, 개인정보의 안전성 확보조치 기준'`
- prepared_by_user_id / approved_by_user_id 는 NULL (officers 등록 후 갱신 안내)

---

### 3.4 `ride_compliance_tasks` — 월별 운영 task carousel + 임박 알림

**핵심 통찰 (사용자 추가-B)**: due_date 임박 시 D-7 (info) → D-3 (warning) → D-day/overdue (danger) 시각화 + 알림 발송. reminder_d7/d3/dday_sent 컬럼으로 중복 발송 방지.

```sql
CREATE TABLE IF NOT EXISTS ride_compliance_tasks (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  annual_plan_id      CHAR(36)     NOT NULL,                        -- ride_compliance_annual_plans.id
  task_code           VARCHAR(30)  NOT NULL,                        -- 'TASK-2026-01-01' (연도-월-순번)
  scheduled_month     INT          NOT NULL,                        -- 1~12
  category            VARCHAR(30)  NOT NULL,                        -- 'plan' | 'education' | 'inspection' | 'destruction' | 'audit' | 'processor' | 'drill' | 'access_review' | 'backup_test' | 'closing'
  title               VARCHAR(200) NOT NULL,
  description         TEXT         DEFAULT NULL,
  legal_reference     VARCHAR(200) DEFAULT NULL,                    -- '제22조 (교육계획 수립)' 등
  related_form_codes  TEXT         DEFAULT NULL,                    -- JSON array of doc_code (e.g. '["F-06","F-07"]')
  assignee_user_id    CHAR(36)     DEFAULT NULL,                    -- profiles.id (담당자)
  due_date            DATE         NOT NULL,                        -- 해당 월의 마지막 일
  reminder_d7_sent    TINYINT(1)   NOT NULL DEFAULT 0,
  reminder_d3_sent    TINYINT(1)   NOT NULL DEFAULT 0,
  reminder_dday_sent  TINYINT(1)   NOT NULL DEFAULT 0,
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending',      -- 'pending' | 'in_progress' | 'done' | 'overdue' | 'skipped'
  completed_at        DATETIME     DEFAULT NULL,
  completed_by_user_id CHAR(36)    DEFAULT NULL,
  evidence_notes      TEXT         DEFAULT NULL,                    -- 완료 시 증빙 메모 (form_submissions 와 연계)
  cpo_reviewed_at     DATETIME     DEFAULT NULL,
  cpo_review_note     TEXT         DEFAULT NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_task_code (task_code),
  KEY idx_ride_comp_task_plan (annual_plan_id),
  KEY idx_ride_comp_task_month (scheduled_month),
  KEY idx_ride_comp_task_category (category),
  KEY idx_ride_comp_task_status (status),
  KEY idx_ride_comp_task_due (due_date),
  KEY idx_ride_comp_task_assignee (assignee_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**시드 12행** (별첨 7 RIDE-PLAN-2026 의 12개월 task — 사용자 답변 [3.시드 자동]):

| month | category | title | due_date | related_forms |
|---|---|---|---|---|
| 1 | plan | 연간 관리계획 수립 + CPO 승인, 교육계획서, 처리방침 검토, 1분기 파기 식별 | 2026-01-31 | F-06 |
| 2 | education | 1차 정기교육 (전임직원 + 취급자 + 신규) | 2026-02-28 | F-07 |
| 3 | inspection | 1분기 정보보안 점검, 파기, 접근권한 1차, 백업복구 1차 | 2026-03-31 | F-M05-01,F-M05-02,F-M05-03 |
| 4 | processor | 수탁업체 1차 점검, 계약 검토, 교육 이수 확인 | 2026-04-30 | — |
| 5 | audit | 상반기 자체감사, 결과보고서, CPO 보고, 조치계획 | 2026-05-31 | — |
| 6 | inspection | 2분기 점검, 파기, 접근권한 2차 반기, 상반기 교육 결과, 백업복구 2차 | 2026-06-30 | F-M05-01,F-M05-02,F-M05-03 |
| 7 | education | 2차 정기교육, 미이수자 보충 | 2026-07-31 | F-07 |
| 8 | drill | 유출 모의훈련 (연 1회), 비상대응 시나리오, 취약점 점검, 백업복구 3차 | 2026-08-31 | F-M02-01,F-M02-02,F-M02-03,F-M02-04 |
| 9 | inspection | 3분기 점검, 파기, 수탁사 2차, 교육 이수 확인 | 2026-09-30 | F-M05-01,F-M05-02,F-M05-03 |
| 10 | audit | 하반기 자체감사, 접근권한 3차 반기, 결과보고서, 조치계획 | 2026-10-31 | — |
| 11 | plan | 2027 초안, 법령 개정 모니터링 | 2026-11-30 | — |
| 12 | closing | 4분기 점검, 파기, 연간 결과보고서, 2027 마무리 | 2026-12-31 | F-M05-01,F-M05-02,F-M05-03 |

마이그 적용 즉시 12 row 자동 생성 — 운영자가 메인 대시보드에서 다가오는 일정 자동 확인.

---

### 3.5 `ride_compliance_form_submissions` — 서식 작성 인스턴스

```sql
CREATE TABLE IF NOT EXISTS ride_compliance_form_submissions (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  submission_code     VARCHAR(30)  NOT NULL,                        -- 'SUB-2026-0001'
  document_id         CHAR(36)     NOT NULL,                        -- ride_compliance_documents.id (서식 마스터)
  document_code       VARCHAR(30)  NOT NULL,                        -- 캐시 ('F-07' 등)
  task_id             CHAR(36)     DEFAULT NULL,                    -- ride_compliance_tasks.id (선택 — 어느 task 의 일환)
  title               VARCHAR(200) DEFAULT NULL,                    -- '2026년 1차 교육 이수 확인서 (2월)' 등
  submitted_by_user_id CHAR(36)    NOT NULL,                        -- 작성자 profiles.id
  submitted_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  form_data           JSON         DEFAULT NULL,                    -- 서식 필드 값 (구조화 — 향후 폼 빌더 연계)
  file_url            VARCHAR(500) DEFAULT NULL,                    -- 작성된 PDF/DOCX 업로드 URL (옵션)
  retention_until     DATE         NOT NULL,                        -- 작성일 + documents.retention_years
  reviewed_by_user_id CHAR(36)     DEFAULT NULL,                    -- 검토자 (CPO 또는 관리자)
  reviewed_at         DATETIME     DEFAULT NULL,
  review_status       VARCHAR(20)  NOT NULL DEFAULT 'submitted',    -- 'submitted' | 'approved' | 'rejected' | 'archived'
  review_note         TEXT         DEFAULT NULL,
  notes               TEXT         DEFAULT NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_sub_code (submission_code),
  KEY idx_ride_comp_sub_doc (document_id),
  KEY idx_ride_comp_sub_task (task_id),
  KEY idx_ride_comp_sub_submitted_at (submitted_at),
  KEY idx_ride_comp_sub_retention (retention_until),
  KEY idx_ride_comp_sub_status (review_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**시드 0행** — 운영 데이터.

**보존 만료 추적**: 메인 대시보드 위젯 "📝 보존 만료 임박 서식" 에서 `retention_until - NOW() < 90일` row 노출.

---

## 4. Phase 1.1 마이그레이션 (배포 완료)

`migrations/2026-05-18_ride_compliance_phase11.sql` — Phase 1.1 코어 3 테이블. v1.1 (3ba4fab) + v1.1-FIX1 (4eef1a3) 로 운영 환경 배포 완료.

---

## 5. Phase 1.2 마이그레이션 (본 PR)

`migrations/2026-05-18_ride_compliance_phase12.sql` — 5 테이블 + 시드 44행 (25 documents + 6 versions + 1 annual_plan + 12 tasks + 0 form_submissions).

**Rule 23 graceful fallback**: API 측 — table 존재 여부 catch → 빈 array + `_migration_pending: 'phase12'` 반환.

**Rule 24 시드 멱등**: 모든 INSERT IGNORE + UNIQUE KEY (doc_code, plan_code, task_code) 기반.

---

## 6. API 매핑 (Phase 1.1 + 1.2)

### Phase 1.1 (배포 완료)

| 메서드 | 경로 | 역할 | 권한 |
|---|---|---|---|
| `GET/POST` | `/api/ride-compliance/officers` | 3-tier 조직 매핑 | manager+ / cpo·admin |
| `GET/POST` | `/api/ride-compliance/assets` | 정보자산 | manager+ |
| `GET/POST` | `/api/ride-compliance/incidents` | 침해사고 | manager+/incident_team / 인증 사용자 모두 보고 |

### Phase 1.2 (본 PR)

| 메서드 | 경로 | 역할 | 권한 |
|---|---|---|---|
| `GET` | `/api/ride-compliance/documents` | 매뉴얼·서식 카탈로그 (filter: type/status/verified/parent) | manager+ |
| `POST` | `/api/ride-compliance/documents` | 신규 매뉴얼·서식 등록 (file_url 입력) | manager+ |
| `PATCH` | `/api/ride-compliance/documents/[id]/verify` | CPO 검수 완료 (is_master_verified=1) | cpo |
| `GET/POST` | `/api/ride-compliance/document-versions` | 버전 이력 | manager+ |
| `GET/POST` | `/api/ride-compliance/annual-plans` | 연간 마스터 | manager+ |
| `GET/POST` | `/api/ride-compliance/tasks` | 월별 task carousel | manager+ |
| `PATCH` | `/api/ride-compliance/tasks/[id]/complete` | task 완료 처리 (evidence_notes + 자동 reviewed) | assignee / manager+ |
| `GET/POST` | `/api/ride-compliance/form-submissions` | 서식 작성 인스턴스 | 인증 사용자 (본인 작성건만 자유, manager+ 전체 조회) |

응답 포맷: `{ rows: [...], total: N, note?: 'migration_pending' }` (라이드 모듈 표준).

---

## 7. UI 매핑 (Phase 1.1 + 1.2)

### 메인 NavTabs 최종 7 탭

```
[📊 대시보드] [📦 정보자산] [🚨 침해사고] [👔 조직 매핑] [📚 자료실] [📅 연간 운영] [📝 서식 작성]
```

| 탭 | Phase | 핵심 컴포넌트 |
|---|---|---|
| 📊 대시보드 | 1.1 + 1.2 | DcStatStrip 5 stat + **📌 다가오는 일정 위젯 (Phase 1.2)** + **🔴 검수 대기 매뉴얼·서식 (Phase 1.2)** + **연간 진행률 carousel (Phase 1.2)** |
| 📦 정보자산 | 1.1 | NeuDataTable + 등록 모달 |
| 🚨 침해사고 | 1.1 | NeuDataTable + 24h SLA + 신고 폼 |
| 👔 조직 매핑 | 1.1 | NeuDataTable + 임명 등록 |
| 📚 자료실 (신규) | 1.2 | 매뉴얼·서식 카탈로그 + 필터 (type/status/verified) + 파일 업로드 + CPO 검수 액션 |
| 📅 연간 운영 (신규) | 1.2 | 12개월 task carousel + status 진행 + 카테고리별 mini gauge |
| 📝 서식 작성 (신규) | 1.2 | 작성 인스턴스 list + 보존만료 추적 + 누락 task 자동 발견 |

### 메인 대시보드 추가 위젯 (사용자 추가-A, 추가-B 통찰 반영)

1. **📌 다가오는 일정 (위 7일 이내)** — Rule 20 글래스 패널
   - D-7 (info, COLORS.info) / D-3 (warning, COLORS.warning) / D-day or overdue (danger, COLORS.danger)
   - 클릭 시 해당 task 상세
   - 사이드바 라이드 정보보안 항목에 미해결 카운트 badge

2. **🔴 검수 대기 매뉴얼·서식** — CPO 결재 영역
   - `documents.is_master_verified = 0 AND status = 'pending'` row
   - 클릭 시 자료실 탭의 해당 row 로 deep-link

3. **연간 운영 진행률 carousel** — 12개월 시각화
   - 카테고리별 mini gauge (교육 N/2 회, 감사 N/2 회, 파기 N/4 회 등)
   - 월별 status 진행 (완료/진행/지연/예정)

### Sub-route (deep-link)

- `/RideCompliance/assets/[id]` — 자산 상세 (Phase 1.1)
- `/RideCompliance/incidents/[id]` — 사고 상세 + 24h SLA 시계 (Phase 1.1)
- `/RideCompliance/documents/[id]` — 매뉴얼·서식 상세 + 버전 이력 + 검수 UI (Phase 1.2 — 신규)
- `/RideCompliance/tasks/[id]` — task 상세 + 작성 서식 가이드 (Phase 1.2 — 신규)

---

## 8. 출처 인용

본 데이터 모델의 모든 스키마 결정은 다음 매뉴얼 조항을 1차 근거로 함:

### Phase 1.1

| 테이블 | 매뉴얼 근거 |
|---|---|
| officers | 통합본 5.17 제6/7/9조 |
| assets | 통합본 5.17 제10~19조 / 취급단말기 반출관리 매뉴얼 |
| incidents | 통합본 5.17 제25~27조 / 유출대응 매뉴얼 (서식 F-M01-01~06) |

### Phase 1.2

| 테이블 | 매뉴얼 근거 |
|---|---|
| documents | 통합본 5.17 「파생서류 목차」 (별첨 1~6) + 별첨 7 (F-06/F-07) |
| document_versions | 통합본 5.17 「제·개정 이력」 (2019.07.01~2026.05.15 — 9건) |
| annual_plans | 통합본 5.17 별첨 7 RIDE-PLAN-2026-001 + 개인정보보호법 제29조 |
| tasks | 통합본 5.17 별첨 7 「2026년 상·하반기 월별 관리 일정」 (1~12월) |
| form_submissions | 별첨 1~6 의 18 서식 + 별첨 7 의 F-06/F-07 + 보존년수 (제33조 「파기대장 최소 3년」 등) |

물리적 매뉴얼: `~/WebstormProjects/정보보안/`
세션 작업 사본 (NFC 정규화): `outputs/security-docs/`
세션 추출 텍스트: `outputs/security-docs/extracted/통합본_517.txt` 외 4건
