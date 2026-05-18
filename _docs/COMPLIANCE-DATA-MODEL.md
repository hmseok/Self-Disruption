# 정보보안 (RideCompliance) — 데이터 모델 도식 (1차 초안)

> **작성**: 2026-05-11 (sweet-amazing-galileo 메인 세션)
> **목적**: compliance 세션 인계 — 5개 영역 데이터 모델 placeholder.
> **상태**: 1차 초안 — 사용자 인터뷰 후 compliance 세션이 확정.
> **Rule**: Rule 22 (_docs) / Rule 23 (마이그 멱등) / Rule 24 (시드 멱등).

---

## 1. 5개 영역 테이블 (제안)

```
┌───────────────────────────────────────────────────────────────────┐
│                  RideCompliance — 5개 영역 통합                    │
└──────┬────────┬────────┬────────┬────────┬─────────────────────────┘
       │        │        │        │        │
       ▼        ▼        ▼        ▼        ▼
   assets   incidents trainings audits   privacy
   (자산)   (사고)    (교육)   (인증)   (개인정보)
```

---

## 2. 정보자산 — `ride_compliance_assets`

```sql
CREATE TABLE IF NOT EXISTS ride_compliance_assets (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  name            VARCHAR(128) NOT NULL,
  type            VARCHAR(32)  NOT NULL,  -- 'system' | 'database' | 'document' | 'device' | 'service'
  classification  VARCHAR(16)  NOT NULL DEFAULT 'internal',
                  -- 'public' | 'internal' | 'confidential' | 'restricted'
  owner_id        CHAR(36)     NULL,      -- ride_employees.id
  description     TEXT         NULL,
  location        VARCHAR(255) NULL,      -- 물리적/논리적 위치
  acquired_at     DATE         NULL,
  retired_at      DATE         NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'active',
  metadata        JSON         NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_compl_asset_type (type),
  KEY idx_compl_asset_classification (classification),
  KEY idx_compl_asset_owner (owner_id),
  KEY idx_compl_asset_status (status)
);
```

---

## 3. 침해사고 — `ride_compliance_incidents`

```sql
CREATE TABLE IF NOT EXISTS ride_compliance_incidents (
  id                 CHAR(36)     NOT NULL PRIMARY KEY,
  title              VARCHAR(255) NOT NULL,
  severity           VARCHAR(16)  NOT NULL DEFAULT 'low',  -- 'low'|'medium'|'high'|'critical'
  category           VARCHAR(32)  NULL,                    -- 'data_leak'|'malware'|'unauthorized_access'|'physical'|'other'
  affected_asset_id  CHAR(36)     NULL,                    -- ride_compliance_assets.id
  reporter_id        CHAR(36)     NULL,                    -- ride_employees.id
  occurred_at        DATETIME     NULL,
  discovered_at      DATETIME     NULL,
  stage              VARCHAR(32)  NOT NULL DEFAULT 'detected',
                     -- 'detected'|'contained'|'recovering'|'resolved'|'lessons_learned'
  description        TEXT         NULL,
  resolution         TEXT         NULL,
  resolved_at        DATETIME     NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_compl_inc_severity (severity),
  KEY idx_compl_inc_stage (stage),
  KEY idx_compl_inc_asset (affected_asset_id),
  KEY idx_compl_inc_reporter (reporter_id),
  KEY idx_compl_inc_occurred (occurred_at)
);
```

---

## 4. 직원 보안교육 — `ride_compliance_trainings` + `ride_compliance_training_records`

```sql
-- 교육 과정 마스터
CREATE TABLE IF NOT EXISTS ride_compliance_trainings (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  title           VARCHAR(255) NOT NULL,
  description     TEXT         NULL,
  category        VARCHAR(32)  NULL,  -- 'annual'|'onboarding'|'phishing'|'gdpr'|'pipa'|'other'
  duration_min    INT          NULL,
  is_mandatory    TINYINT(1)   NOT NULL DEFAULT 1,
  recur_months    INT          NULL,  -- 갱신 주기 (12 = 매년)
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_compl_train_category (category)
);

-- 직원별 이수 기록
CREATE TABLE IF NOT EXISTS ride_compliance_training_records (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  training_id   CHAR(36)     NOT NULL,
  employee_id   CHAR(36)     NOT NULL,
  completed_at  DATETIME     NULL,
  score         INT          NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending',
                -- 'pending'|'in_progress'|'completed'|'expired'
  expires_at    DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_compl_trec_training (training_id),
  KEY idx_compl_trec_employee (employee_id),
  KEY idx_compl_trec_status (status),
  KEY idx_compl_trec_expires (expires_at)
);
```

---

## 5. 인증 관리 — `ride_compliance_audits`

```sql
CREATE TABLE IF NOT EXISTS ride_compliance_audits (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  name          VARCHAR(128) NOT NULL,  -- 'ISMS', 'ISO27001', 'GDPR' 등
  cert_no       VARCHAR(64)  NULL,
  issuer        VARCHAR(128) NULL,
  issued_at     DATE         NULL,
  expires_at    DATE         NULL,
  scope         TEXT         NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'active',
                -- 'active'|'expiring'|'expired'|'renewal'
  responsible_id CHAR(36)    NULL,  -- ride_employees.id
  attachments   JSON         NULL,  -- 인증서 PDF 등
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_compl_audit_status (status),
  KEY idx_compl_audit_expires (expires_at)
);
```

---

## 6. 개인정보 처리 — `ride_compliance_privacy_*`

```sql
-- 처리방침 버전 관리
CREATE TABLE IF NOT EXISTS ride_compliance_privacy_policies (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  version      VARCHAR(16)  NOT NULL,
  effective_at DATE         NOT NULL,
  content      MEDIUMTEXT   NULL,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_compl_privacy_active (is_active, effective_at)
);

-- 동의 이력 (직원/고객)
CREATE TABLE IF NOT EXISTS ride_compliance_privacy_consents (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  policy_id    CHAR(36)     NOT NULL,
  subject_type VARCHAR(16)  NOT NULL,  -- 'employee'|'customer'
  subject_id   VARCHAR(64)  NOT NULL,  -- employee.id 또는 customer 식별자
  consented_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  withdrawn_at DATETIME     NULL,
  KEY idx_compl_consent_policy (policy_id),
  KEY idx_compl_consent_subject (subject_type, subject_id)
);
```

---

## 7. 마이그 적용 순서 (compliance 세션)

### Phase 1.1 — 자산 + 사고
1. `ride_compliance_assets` 신설
2. `ride_compliance_incidents` 신설
3. 검증 SELECT 4건

### Phase 1.2 — 교육 + 인증
1. `ride_compliance_trainings` + `ride_compliance_training_records`
2. `ride_compliance_audits`
3. 시드 데이터 (기존 인증서 등록 — 사용자 수동)

### Phase 1.3 — 개인정보
1. `ride_compliance_privacy_policies` + `ride_compliance_privacy_consents`
2. 현재 처리방침 v1.0 INSERT

---

## 8. 검증 SQL

```sql
-- 테이블 9개 생성 확인
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE()
   AND table_name LIKE 'ride_compliance_%'
 ORDER BY table_name;
-- 기대: 8 ~ 9 row
```

---

## 9. 연계 모듈

- `ride_employees.id` — owner / reporter / responsible / training_records
- `profiles.id` — admin 권한 체크
- `meetings` — 보안 회의 (이미 meetings 모듈)
- `app/admin/audit-logs` — 시스템 audit log (미구현 가능)

---

본 문서는 compliance 세션이 인터뷰 후 확정.
