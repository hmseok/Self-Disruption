# RideCompliance (라이드 정보보안) — 데이터 모델

> **작성**: 2026-05-18 (compliance 세션 신설)
> **목적**: Rule 22 — 모듈 _docs 갱신 의무 (DATA-MODEL).
> **모듈**: `app/(employees)/RideCompliance/*` + `app/api/ride-compliance/*`
> **인터뷰 출처**: `_docs/COMPLIANCE-PERSONAS.md` § 0 + 매뉴얼 통합본 5.17 § 1~9장
> **마이그레이션 (Phase 1.1)**: `migrations/2026-05-18_ride_compliance_phase11.sql`

---

## 1. 테이블 개요 — 14 도메인 (Phase 1.1~1.4)

본 모듈은 매뉴얼 통합본 5.17 의 9장 27조 + 별첨 7 (RIDE-PLAN-2026) 운영 항목을 1:1 매핑한 14 도메인.

**Phase 1.1 — 코어 3 테이블 (본 세션 GO 대상)**

| 테이블 | 용도 | 매뉴얼 출처 | 예상 row 수 |
|---|---|---|---|
| `ride_compliance_officers` | 책임자/관리자/취급자 매핑 (3-tier) | 제6조 + 제9조 | 50~500 (전사 직원 수) |
| `ride_compliance_assets` | 정보자산 본체 (서버/PC/문서/저장매체/CCTV/스마트기기) | 제10~18조 | 100~2,000 |
| `ride_compliance_incidents` | 침해사고 접수·대응 이력 | 제25~27조 + 유출대응 매뉴얼 (서식 F-M01-01~06) | 0~100/년 |

**Phase 1.2 — 운영 트래커 (다음 세션 또는 본 세션 연장)**

| 테이블 | 용도 | 매뉴얼 출처 |
|---|---|---|
| `ride_compliance_trainings` | 교육 차수 마스터 (연 2회+) | 제22~23조 + 별첨 7 (서식 F-06) |
| `ride_compliance_training_records` | 직원별 이수 기록 (3년 보존) | 제23조 + 서식 F-07 |
| `ride_compliance_audits` | 자체감사 회차 + 결과보고서 | 제20~21조 |
| `ride_compliance_annual_plans` | 연간 관리계획 + 월별 task | 별첨 7 RIDE-PLAN-2026 |

**Phase 1.3 — 확장**

| 테이블 | 용도 | 매뉴얼 출처 |
|---|---|---|
| `ride_compliance_processors` | 수탁사 마스터 + 점검 이력 | 제24조 |
| `ride_compliance_destructions` | 개인정보 파기 이력 (분기 1회) | 제9장 (제28~33조) + 파기관리 매뉴얼 |
| `ride_compliance_access_reviews` | 접근권한 적정성 검토 (반기) | 안전성 확보조치 기준 제5조 |
| `ride_compliance_drills` | 모의훈련 + 백업복구 테스트 | 별첨 7 (8월) |

**Phase 1.4 — 개인정보 처리방침 + 동의 + 서식**

| 테이블 | 용도 | 매뉴얼 출처 |
|---|---|---|
| `ride_compliance_privacy_policies` | 처리방침 버전 관리 | 제13조 + 별첨 |
| `ride_compliance_consents` | 정보주체 동의 이력 | 개인정보보호법 제15조 |
| `ride_compliance_documents` | 서식 12종 보존 (3년) | 통합본 + 부속 매뉴얼 |

**기존 테이블과의 관계 (라이드 모듈 스타일 — Rule 14 동형)**:
- ❌ `ride_employees`, `users` 와 FK 관계 없음 (string id 직접 참조)
- ✅ `users.id` (cuid) 참조 — `assigned_user_id`, `created_by`, `cpo_user_id` 등

---

## 2. 테이블 상세 — Phase 1.1

### 2.1 `ride_compliance_officers` — 3-tier 조직 매핑

매뉴얼 제6조 (책임자 지정) + 제9조 (취급자 범위). CPO·관리자·취급자 role 3 값. 임명일/해임일 이력 유지.

```sql
CREATE TABLE IF NOT EXISTS ride_compliance_officers (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,            -- UUID
  user_id         VARCHAR(36)  NOT NULL,                         -- users.id (cuid) — 직원 매핑
  role            VARCHAR(20)  NOT NULL,                         -- 'cpo' | 'manager' | 'handler' | 'incident_team'
  display_title   VARCHAR(60)  DEFAULT NULL,                     -- '라이드케어 개인정보보호 책임자' 등
  business_unit   VARCHAR(40)  DEFAULT NULL,                     -- '라이드케어' (사업부)
  appointed_at    DATE         NOT NULL,                         -- 임명일
  released_at     DATE         DEFAULT NULL,                     -- 해임일 (NULL=현직)
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  notes           VARCHAR(255) DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ride_comp_off_user (user_id),
  KEY idx_ride_comp_off_role (role),
  KEY idx_ride_comp_off_active (is_active, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**role enum (3-tier + α)**:
- `cpo` — 개인정보보호 책임자 (이사급, 1명) — 제6조
- `manager` — 개인정보보호 관리자 (부장급, N명) — 제6조
- `handler` — 개인정보취급자 (전 임·직원) — 제9조 (현황 문서화 의무)
- `incident_team` — 관리팀 침해사고 일선 (선택 — 제26조)

**초기 시드 (멱등 — Rule 24)**: ⚠️ user_id 매핑은 실제 `users` 테이블 cuid 가 필요 — Phase 1.1 마이그 시 사용자 직접 입력 (사용자 답변 후 시드 SQL 확정).

```sql
-- 매뉴얼 제6조 명시 인원 — user_id 는 마이그 적용 직전 확정
-- 임성민 이사 (CPO), 석호민 부장 (관리자, 본 모듈 사용자), 양재희 부장 (관리자)
INSERT IGNORE INTO ride_compliance_officers
  (id, user_id, role, display_title, business_unit, appointed_at, is_active, notes)
VALUES
  (UUID(), '<users.id of 임성민>', 'cpo',     '라이드케어 개인정보보호 책임자', '라이드케어', '2023-07-10', 1, '매뉴얼 통합본 5.17 제6조'),
  (UUID(), '<users.id of 석호민>', 'manager', '라이드케어 개인정보보호 관리자', '라이드케어', '2023-07-10', 1, '매뉴얼 통합본 5.17 제6조'),
  (UUID(), '<users.id of 양재희>', 'manager', '라이드케어 개인정보보호 관리자', '라이드케어', '2023-07-10', 1, '매뉴얼 통합본 5.17 제6조 (2023-07-10 추가 인사이력)');
```

---

### 2.2 `ride_compliance_assets` — 정보자산 본체

매뉴얼 제10~18조 (물리적·기술적 보호조치). 자산 등급 3단계 (사용자 답변 [C] 유지).

```sql
CREATE TABLE IF NOT EXISTS ride_compliance_assets (
  id                    VARCHAR(36)  NOT NULL PRIMARY KEY,        -- UUID
  asset_code            VARCHAR(20)  NOT NULL,                     -- 'RC-SVR-2026-0001' 등 (prefix-자산유형-연도-시퀀스)
  name                  VARCHAR(120) NOT NULL,                     -- '인사DB 서버', '석호민 노트북' 등
  asset_type            VARCHAR(20)  NOT NULL,                     -- enum 아래 참조
  classification        VARCHAR(20)  NOT NULL DEFAULT 'internal',  -- 'public'|'internal'|'confidential'
  owner_user_id         VARCHAR(36)  DEFAULT NULL,                 -- users.id (보유자, 단말기 반출시 본인)
  responsible_user_id   VARCHAR(36)  DEFAULT NULL,                 -- users.id (관리책임자 — 관리자 부장급)
  location              VARCHAR(120) DEFAULT NULL,                 -- '본사 서버실 3F', '관리자 데스크' 등
  os_or_spec            VARCHAR(120) DEFAULT NULL,                 -- 'Ubuntu 24.04 / 32GB RAM' 또는 'Windows 11 Pro'
  contains_pii          TINYINT(1)   NOT NULL DEFAULT 0,           -- 개인정보 포함 여부 (1=대상 자산)
  access_control        VARCHAR(255) DEFAULT NULL,                 -- 접근통제 요약 — '2FA + IP 화이트리스트' 등 (제12조)
  encryption_status     VARCHAR(20)  NOT NULL DEFAULT 'none',      -- 'none'|'partial'|'full' (제13조)
  acquired_at           DATE         DEFAULT NULL,
  decommissioned_at     DATE         DEFAULT NULL,                 -- 폐기일 (NULL=운영중)
  status                VARCHAR(20)  NOT NULL DEFAULT 'active',    -- 'active'|'repair'|'disposed'|'lost'
  notes                 TEXT         DEFAULT NULL,
  created_by            VARCHAR(36)  DEFAULT NULL,                 -- users.id
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_assets_code (asset_code),
  KEY idx_ride_comp_assets_type (asset_type),
  KEY idx_ride_comp_assets_classification (classification),
  KEY idx_ride_comp_assets_pii (contains_pii),
  KEY idx_ride_comp_assets_status (status),
  KEY idx_ride_comp_assets_owner (owner_user_id),
  KEY idx_ride_comp_assets_resp (responsible_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**asset_type enum** (매뉴얼 출처):
- `server` — 서버 (제10조 물리적 접근제한 대상)
- `pc` — PC/노트북 (제18조 스마트기기 통제 + 취급단말기 반출 매뉴얼)
- `document` — 문서·서류 (제10조 ④ — 잠금장치 안전 보관)
- `storage` — 보조저장매체 (제10조 ④, 제11조 출력·복사 보호)
- `cctv` — CCTV (제17조 설치·운영·관리)
- `mobile` — 스마트기기 (제18조)
- `software` — 보안프로그램 (제16조 설치·운영)
- `network` — 네트워크 장비 (제14조 접근통제)
- `other`

**classification enum** ([C] 3단계 확정):
- `public` — 공개 (외부 공개 가능)
- `internal` — 내부 (사내 공유, 기본값)
- `confidential` — 대외비 (매뉴얼 본문 분류 등급 — CPO·관리자만 열람)

**자산코드 패턴**: `RC-{타입}-{YYYY}-{4자리}` 예: `RC-SVR-2026-0001`, `RC-PC-2026-0007`.

**status 값**:
- `active` — 운영 중 (할당/미할당 무관)
- `repair` — 정비/수리
- `disposed` — 폐기 (decommissioned_at 기록)
- `lost` — 분실 (보안사고 자동 연계)

---

### 2.3 `ride_compliance_incidents` — 침해사고 접수·대응

매뉴얼 제25~27조 + 유출대응 매뉴얼 서식 F-M01-01~06. 4가지 유형 + 24시간 통지 의무 추적.

```sql
CREATE TABLE IF NOT EXISTS ride_compliance_incidents (
  id                      VARCHAR(36)  NOT NULL PRIMARY KEY,        -- UUID
  incident_code           VARCHAR(20)  NOT NULL,                     -- 'INC-2026-0001'
  title                   VARCHAR(200) NOT NULL,                     -- 사고 제목
  incident_type           VARCHAR(30)  NOT NULL,                     -- enum 아래
  severity                VARCHAR(20)  NOT NULL DEFAULT 'medium',    -- 'low'|'medium'|'high'|'critical'
  occurred_at             DATETIME     DEFAULT NULL,                 -- 발생 시점 (추정)
  detected_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 감지·접수 시점
  notified_at             DATETIME     DEFAULT NULL,                 -- 정보주체 통지 발송 시점 (제25조 24시간 의무)
  resolved_at             DATETIME     DEFAULT NULL,                 -- 종결 시점
  reporter_user_id        VARCHAR(36)  DEFAULT NULL,                 -- 최초 보고자 (취급자 — 제27조 "즉시 모든 직원")
  assignee_user_id        VARCHAR(36)  DEFAULT NULL,                 -- 현재 담당자 (관리자/관리팀)
  affected_pii_items      TEXT         DEFAULT NULL,                 -- 유출 개인정보 항목 (제25조 ①-1)
  affected_subjects_count INT          DEFAULT NULL,                 -- 영향 정보주체 수 (추정)
  cause_summary           TEXT         DEFAULT NULL,                 -- 시점과 경위 (제25조 ①-2)
  containment_actions     TEXT         DEFAULT NULL,                 -- 접속경로 차단·취약점 점검 등 긴급조치 (제25조 ① 단서)
  notification_method     VARCHAR(40)  DEFAULT NULL,                 -- '서면 통지', '홈페이지 공지' 등
  response_details        TEXT         DEFAULT NULL,                 -- 대응조치 (제25조 ①-4) + 피해구제 절차
  related_asset_id        VARCHAR(36)  DEFAULT NULL,                 -- ride_compliance_assets.id (소프트 FK)
  related_processor_id    VARCHAR(36)  DEFAULT NULL,                 -- 수탁사 관련 시 (Phase 1.3)
  status                  VARCHAR(20)  NOT NULL DEFAULT 'reported',  -- enum 아래
  cpo_reviewed_at         DATETIME     DEFAULT NULL,                 -- CPO 검토 시점
  cpo_review_note         TEXT         DEFAULT NULL,
  retention_until         DATE         DEFAULT NULL,                 -- 3년 보존 만료일 (계산: resolved_at + 3y)
  created_by              VARCHAR(36)  DEFAULT NULL,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_inc_code (incident_code),
  KEY idx_ride_comp_inc_type (incident_type),
  KEY idx_ride_comp_inc_severity (severity),
  KEY idx_ride_comp_inc_status (status),
  KEY idx_ride_comp_inc_detected (detected_at),
  KEY idx_ride_comp_inc_assignee (assignee_user_id),
  KEY idx_ride_comp_inc_asset (related_asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**incident_type enum** (제26조 ② 4가지 + α):
- `external_hacking` — 외부해킹·바이러스·악성코드에 의한 유출 (제26조 ②-1)
- `internal_leak` — 내부 임직원·수탁업체 직원에 의한 유출 (제26조 ②-2)
- `unauthorized_modification` — 임의 변조·도난·분실·수정·삭제 (제26조 ②-3)
- `compliance_violation` — 법규 위반 클레임·분쟁 (제26조 ②-4)
- `device_loss` — 단말기 분실 (취급단말기 반출관리 매뉴얼 연계)
- `other`

**status enum (워크플로우)**:
- `reported` — 취급자 접수 (관리팀·관리자 알림 발송)
- `triaging` — 관리팀 1차 분류·영향 분석
- `containing` — 긴급조치 진행 (접속차단·취약점 보완)
- `notifying` — 정보주체 통지 단계 (24시간 의무 추적)
- `investigating` — 원인 조사 (관리자·CPO 협업)
- `resolved` — 대응 종결 (CPO 승인 후)
- `closed` — 보고서 작성·보존 완료 (3년 retention 시작)

**24시간 통지 의무 SLA**: `notified_at IS NULL AND detected_at + 24h < NOW()` → 빨강 경고. 단 긴급조치 우선 처리 시 예외 인정 (제25조 ① 단서) — `containment_actions` 입력 시 SLA 시계 일시 정지.

**incident_code 패턴**: `INC-{YYYY}-{4자리}` 예: `INC-2026-0001`.

---

## 3. Phase 1.1 마이그레이션 단계 (Rule 1 풀 파이프라인 + Rule 23 graceful fallback)

```sql
-- migrations/2026-05-18_ride_compliance_phase11.sql
START TRANSACTION;

-- 2.1
CREATE TABLE IF NOT EXISTS ride_compliance_officers (...);

-- 2.2
CREATE TABLE IF NOT EXISTS ride_compliance_assets (...);

-- 2.3
CREATE TABLE IF NOT EXISTS ride_compliance_incidents (...);

-- 시드 (Rule 24 멱등) — officers 만 (assets/incidents 는 운영 데이터)
-- ⚠️ users.id 매핑 사전 확인 필요
INSERT IGNORE INTO ride_compliance_officers (...) VALUES (...);

COMMIT;
```

**Rule 23 graceful fallback**: API 측 — table 존재 여부 catch → 500 대신 빈 array `{ rows: [], note: 'migration_pending' }` 반환. UI 측 — banner "마이그 적용 대기" 노출 후 진행 가능.

**Rule 11 검증 사전 체크리스트**:
- [ ] 컬럼명 모두 snake_case
- [ ] enum 값 SQL string literal
- [ ] FK 컬럼명 `<table>_id` 패턴
- [ ] UTF8MB4 collation 일치
- [ ] 시드 INSERT IGNORE (멱등)

---

## 4. API 매핑 (Phase 1.1)

| 메서드 | 경로 | 역할 | 권한 |
|---|---|---|---|
| `GET` | `/api/ride-compliance/officers` | role 별 list | manager+ |
| `POST` | `/api/ride-compliance/officers` | 신규 임명·해임 변경 | cpo, admin |
| `GET` | `/api/ride-compliance/assets` | list (필터: type, classification, status) | manager+ |
| `POST` | `/api/ride-compliance/assets` | 자산 등록 + asset_code 생성 | manager+ |
| `GET` | `/api/ride-compliance/incidents` | list (필터: type, severity, status) | manager+ / 본인 보고건은 handler |
| `POST` | `/api/ride-compliance/incidents` | 사고 보고 (취급자 누구나) | handler+ |

응답 포맷: `{ rows: [...], total: N, note?: 'migration_pending' }` (라이드 모듈 표준).

---

## 5. UI 매핑 (Phase 1.1)

| 라우트 | 페이지 유형 | 컴포넌트 |
|---|---|---|
| `/RideCompliance` | 메인 대시보드 | DcStatStrip (5 stat) + NavTabs (Phase 1.1: 자산/사고/조직, 1.2+ 추가) + Rule 20 글래스 패널 |
| `/RideCompliance` (자산 탭) | 자산 list | NeuDataTable (Rule 18 sortBy 의무) + 등록 모달 |
| `/RideCompliance/assets/[id]` | 자산 상세 (deep-link) | 변경 이력 + 접근권한 매트릭스 |
| `/RideCompliance` (사고 탭) | 사고 list | NeuDataTable + 24h SLA 경고 chip |
| `/RideCompliance/incidents/[id]` | 사고 상세 (deep-link) | 단계별 status 진행 + CPO 결재 영역 |
| `/RideCompliance` (조직 탭) | 3-tier 매핑 | CPO/Manager 목록 + 취급자 통계 |

**DcStatStrip 5 stat (Phase 1.1)**:
1. 자산 총수 (등급별 미니 막대)
2. 미해결 사고 (24h SLA 경고 카운트)
3. CPO/관리자 현직 수
4. 본 분기 신규 자산 등록 수
5. (Phase 1.2 합류 시) 교육 이수율

---

## 6. 출처 인용

본 데이터 모델의 모든 스키마 결정은 다음 매뉴얼 조항을 1차 근거로 함:

| 테이블 | 매뉴얼 근거 |
|---|---|
| `ride_compliance_officers` | 통합본 5.17 제6조·제7조·제9조 |
| `ride_compliance_assets` | 통합본 5.17 제10~19조 / 취급단말기 반출관리 매뉴얼 |
| `ride_compliance_incidents` | 통합본 5.17 제25~27조 / 유출대응 매뉴얼 (서식 F-M01-01~06) |

물리적 매뉴얼: `~/WebstormProjects/정보보안/`
세션 작업 사본: `outputs/security-docs/extracted/통합본_517.txt` 등.
