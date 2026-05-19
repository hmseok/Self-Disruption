-- PR-COMPLIANCE-1.1 — 라이드 정보보안 (RideCompliance) Phase 1.1 코어 3 테이블
-- 2026-05-18 (compliance 세션 신설, determined-charming-newton)
--
-- 신설 테이블 3개:
--   ride_compliance_officers   — 3-tier 조직 매핑 (cpo / manager / handler / incident_team)
--   ride_compliance_assets     — 정보자산 본체 (서버/PC/문서/저장매체/CCTV/스마트기기/소프트웨어/네트워크/기타)
--   ride_compliance_incidents  — 침해사고 접수·대응 이력 (24h 통지 의무 추적)
--
-- 상위 설계:
--   _docs/COMPLIANCE-PERSONAS.md   (페르소나·시나리오 — 8 섹션)
--   _docs/COMPLIANCE-DATA-MODEL.md (데이터 모델 + API + UI 매핑 — 14 도메인 중 Phase 1.1)
--
-- 단일 진실 원본 (매뉴얼):
--   라이드케어 「개인정보보호 내부관리계획서 (매뉴얼 통합본)」 V1.0
--   문서번호 RIDE-PMP-2026-001 · 시행일 2026.05.20 · 문서분류 내부관리용 (대외비)
--   인용 조항: 제6/7/9조 (officers) · 제10~19조 (assets) · 제25~27조 (incidents)
--
-- 사이드바: 메인 세션 위탁 (lib/menu-registry.ts + app/components/PageTitle.tsx)
--          — 본 마이그 적용 후 메인 세션이 mod-ride-compliance entry 등록
-- 메인 페이지: app/(employees)/RideCompliance/page.tsx
-- API:        app/api/ride-compliance/{officers,assets,incidents}/route.ts
--
-- Rule 23 멱등성: 모든 CREATE TABLE IF NOT EXISTS. 시드는 본 마이그에 포함하지 않음
--                 (officers user_id 매핑은 운영 환경에서 직접 등록 — UI 가이드).
-- Rule 24 시드:   본 Phase 1.1 시드 없음. ride_compliance_officers 의 임성민/석호민/양재희
--                 임명은 운영 UI 에서 사용자 직접 등록.
-- FK 정책:        의도적 FK 미선언 (라이드 모듈 스타일 — RideAssets 동형, Rule 14).
--                 app 레벨 무결성 보장 (related_asset_id, owner_user_id, reporter_user_id 등).
--
-- 적용:
--   mysql -h <host> -u <user> -p <db> < migrations/2026-05-18_ride_compliance_phase11.sql
--
-- 검증 (파일 하단):
--   SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME LIKE 'ride_compliance_%';
-- ============================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. ride_compliance_officers — 3-tier 조직 매핑
-- ─────────────────────────────────────────────────────────────────
-- 매뉴얼 제6조 (책임자 지정) + 제9조 (취급자 범위 및 의무·책임)
-- role:
--   'cpo'           — 개인정보보호 책임자 (이사급, 임성민)
--   'manager'       — 개인정보보호 관리자 (부장급, 석호민·양재희)
--   'handler'       — 개인정보취급자 (전 임·직원, 정규/임시/계약직 포함)
--   'incident_team' — 관리팀 침해사고 일선 (제26조 ①)
CREATE TABLE IF NOT EXISTS ride_compliance_officers (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  user_id         CHAR(36)     NOT NULL,
  role            VARCHAR(20)  NOT NULL,
  display_title   VARCHAR(60)  DEFAULT NULL,
  business_unit   VARCHAR(40)  DEFAULT NULL,
  appointed_at    DATE         NOT NULL,
  released_at     DATE         DEFAULT NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  notes           VARCHAR(255) DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ride_comp_off_user (user_id),
  KEY idx_ride_comp_off_role (role),
  KEY idx_ride_comp_off_active (is_active, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 2. ride_compliance_assets — 정보자산 본체
-- ─────────────────────────────────────────────────────────────────
-- 매뉴얼 제10조 (물리적 접근제한) · 제11조 (출력·복사·저장매체 파기) ·
--       제12조 (접근권한 관리·인증) · 제13조 (암호화·마스킹) ·
--       제14조 (접근통제) · 제16조 (보안프로그램) · 제17조 (CCTV) ·
--       제18조 (스마트기기 통제) · 제19조 (주민번호 처리 제한)
-- asset_type:
--   'server' · 'pc' · 'document' · 'storage' · 'cctv' ·
--   'mobile' · 'software' · 'network' · 'other'
-- classification: 'public' · 'internal' · 'confidential' (3단계 — 사용자 답변 [C])
-- encryption_status: 'none' · 'partial' · 'full' (제13조)
-- status: 'active' · 'repair' · 'disposed' · 'lost'
CREATE TABLE IF NOT EXISTS ride_compliance_assets (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  asset_code          VARCHAR(20)  NOT NULL,
  name                VARCHAR(120) NOT NULL,
  asset_type          VARCHAR(20)  NOT NULL,
  classification      VARCHAR(20)  NOT NULL DEFAULT 'internal',
  owner_user_id       CHAR(36)     DEFAULT NULL,
  responsible_user_id CHAR(36)     DEFAULT NULL,
  location            VARCHAR(120) DEFAULT NULL,
  os_or_spec          VARCHAR(120) DEFAULT NULL,
  contains_pii        TINYINT(1)   NOT NULL DEFAULT 0,
  access_control      VARCHAR(255) DEFAULT NULL,
  encryption_status   VARCHAR(20)  NOT NULL DEFAULT 'none',
  acquired_at         DATE         DEFAULT NULL,
  decommissioned_at   DATE         DEFAULT NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'active',
  notes               TEXT         DEFAULT NULL,
  created_by          CHAR(36)     DEFAULT NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_assets_code (asset_code),
  KEY idx_ride_comp_assets_type (asset_type),
  KEY idx_ride_comp_assets_classification (classification),
  KEY idx_ride_comp_assets_pii (contains_pii),
  KEY idx_ride_comp_assets_status (status),
  KEY idx_ride_comp_assets_owner (owner_user_id),
  KEY idx_ride_comp_assets_resp (responsible_user_id),
  KEY idx_ride_comp_assets_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 3. ride_compliance_incidents — 침해사고 접수·대응 이력
-- ─────────────────────────────────────────────────────────────────
-- 매뉴얼 제25조 (유출통지 — 24시간 의무) · 제26조 (침해대응 조직 — 관리팀 일선)
--       · 제27조 (침해대응 절차) + 유출대응 매뉴얼 서식 F-M01-01~06
-- incident_type:
--   'external_hacking'           — 외부해킹·바이러스·악성코드 (제26조 ②-1)
--   'internal_leak'              — 내부 임직원·수탁업체 직원 (제26조 ②-2)
--   'unauthorized_modification'  — 임의 변조·도난·분실·수정·삭제 (제26조 ②-3)
--   'compliance_violation'       — 법규 위반 클레임·분쟁 (제26조 ②-4)
--   'device_loss'                — 단말기 분실 (취급단말기 반출관리 매뉴얼 연계)
--   'other'
-- status: 'reported' · 'triaging' · 'containing' · 'notifying' · 'investigating' · 'resolved' · 'closed'
-- severity: 'low' · 'medium' · 'high' · 'critical'
-- 24h SLA: notified_at IS NULL AND detected_at + 24h < NOW() → 빨강 경고
--          단 containment_actions 입력 시 SLA 시계 일시 정지 (제25조 ① 단서)
-- retention_until: resolved_at + 3년 (개인정보 사고 기록 3년 보존 의무)
CREATE TABLE IF NOT EXISTS ride_compliance_incidents (
  id                      CHAR(36)     NOT NULL PRIMARY KEY,
  incident_code           VARCHAR(20)  NOT NULL,
  title                   VARCHAR(200) NOT NULL,
  incident_type           VARCHAR(30)  NOT NULL,
  severity                VARCHAR(20)  NOT NULL DEFAULT 'medium',
  occurred_at             DATETIME     DEFAULT NULL,
  detected_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notified_at             DATETIME     DEFAULT NULL,
  resolved_at             DATETIME     DEFAULT NULL,
  reporter_user_id        CHAR(36)     DEFAULT NULL,
  assignee_user_id        CHAR(36)     DEFAULT NULL,
  affected_pii_items      TEXT         DEFAULT NULL,
  affected_subjects_count INT          DEFAULT NULL,
  cause_summary           TEXT         DEFAULT NULL,
  containment_actions     TEXT         DEFAULT NULL,
  notification_method     VARCHAR(40)  DEFAULT NULL,
  response_details        TEXT         DEFAULT NULL,
  related_asset_id        CHAR(36)     DEFAULT NULL,
  related_processor_id    CHAR(36)     DEFAULT NULL,
  status                  VARCHAR(20)  NOT NULL DEFAULT 'reported',
  cpo_reviewed_at         DATETIME     DEFAULT NULL,
  cpo_review_note         TEXT         DEFAULT NULL,
  retention_until         DATE         DEFAULT NULL,
  created_by              CHAR(36)     DEFAULT NULL,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_inc_code (incident_code),
  KEY idx_ride_comp_inc_type (incident_type),
  KEY idx_ride_comp_inc_severity (severity),
  KEY idx_ride_comp_inc_status (status),
  KEY idx_ride_comp_inc_detected (detected_at),
  KEY idx_ride_comp_inc_notified (notified_at),
  KEY idx_ride_comp_inc_assignee (assignee_user_id),
  KEY idx_ride_comp_inc_reporter (reporter_user_id),
  KEY idx_ride_comp_inc_asset (related_asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 검증 쿼리 (수동 실행)
-- ============================================================
-- 1) 테이블 3개 생성 확인:
--   SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
--     FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME LIKE 'ride_compliance_%';
--
-- 2) 컬럼 갯수 확인 (officers=11, assets=20, incidents=24):
--   SELECT TABLE_NAME, COUNT(*) AS col_count
--     FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME LIKE 'ride_compliance_%'
--    GROUP BY TABLE_NAME;
--
-- 3) 인덱스 확인:
--   SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME
--     FROM information_schema.STATISTICS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME LIKE 'ride_compliance_%'
--    ORDER BY TABLE_NAME, INDEX_NAME;
--
-- 4) 초기 row 수 (모두 0 — 시드 없음):
--   SELECT 'officers' AS t, COUNT(*) FROM ride_compliance_officers
--   UNION ALL
--   SELECT 'assets',     COUNT(*) FROM ride_compliance_assets
--   UNION ALL
--   SELECT 'incidents',  COUNT(*) FROM ride_compliance_incidents;
