-- ─────────────────────────────────────────────────────────────────
-- migrations/2026-05-28_ride_compliance_phase15.sql
-- ─────────────────────────────────────────────────────────────────
-- RideCompliance Phase 1.5 — 산출물·외부 송부 트래커 (deliverables)
--
-- 도메인:
--   임명장 / 단말기 반출대장 / 파기 확인서 / 유출 통지서 / 자체감사 결과서 등
--   외부 기관·내부 부서 송부 추적 (기존 form_submissions = 내부 작성본과 별개).
--
-- 사용자 통찰 (2026-05-19): "산출물·외부 송부 통합 관리" 모듈 분리.
-- 운영 원칙 (_docs/COMPLIANCE-OPERATIONS.md): 데이터 영역 — 웹 UI 자유 CRUD.
--
-- 멱등 (Rule 23) — IF NOT EXISTS / @col_exists 패턴.
-- 시드 (Rule 24) — 없음 (운영 중 등록).
--
-- 검증 SQL (하단):
--   SELECT COUNT(*) FROM ride_compliance_deliverables;          -- 기대치 0 (시드 없음)
--   SHOW COLUMNS FROM ride_compliance_deliverables;             -- 17 컬럼
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ride_compliance_deliverables (
  id                    CHAR(36)     NOT NULL PRIMARY KEY,
  deliverable_code      VARCHAR(40)  NOT NULL,
  category              VARCHAR(30)  NOT NULL,
    -- appointment / device_logbook / destruction_cert / breach_notice / audit_report / other
  title                 VARCHAR(200) NOT NULL,
  source_document_id    CHAR(36)     DEFAULT NULL,
    -- 관련 매뉴얼 (옵션) — ride_compliance_documents.id (FK 미설정 — soft ref)
  source_submission_id  CHAR(36)     DEFAULT NULL,
    -- form_submission 에서 발전한 경우 (옵션)
  content_md            MEDIUMTEXT   DEFAULT NULL,
  gcs_object_path       VARCHAR(500) DEFAULT NULL,
  external_recipient    VARCHAR(200) DEFAULT NULL,
    -- 「개인정보보호위원회」 / 「영업본부」 등
  recipient_email       VARCHAR(200) DEFAULT NULL,
  prepared_by           CHAR(36)     DEFAULT NULL,  -- profiles.id
  approved_by           CHAR(36)     DEFAULT NULL,  -- CPO (profiles.id)
  approved_at           DATETIME     DEFAULT NULL,
  sent_at               DATETIME     DEFAULT NULL,
  sent_method           VARCHAR(30)  DEFAULT NULL,  -- email/post/courier/portal
  response_received_at  DATETIME     DEFAULT NULL,
  response_note         TEXT         DEFAULT NULL,
  status                VARCHAR(20)  NOT NULL DEFAULT 'draft',
    -- draft / approved / sent / responded / closed
  retention_until       DATE         DEFAULT NULL,
  notes                 TEXT         DEFAULT NULL,
  created_by            CHAR(36)     DEFAULT NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_dlv_code (deliverable_code),
  KEY idx_ride_comp_dlv_category (category),
  KEY idx_ride_comp_dlv_status (status),
  KEY idx_ride_comp_dlv_source_doc (source_document_id),
  KEY idx_ride_comp_dlv_source_sub (source_submission_id),
  KEY idx_ride_comp_dlv_sent (sent_at),
  KEY idx_ride_comp_dlv_retention (retention_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 검증 SQL (DBeaver 에서 실행 후 확인)
-- ─────────────────────────────────────────────────────────────────
--
-- 1) 테이블 생성 확인:
--    SHOW CREATE TABLE ride_compliance_deliverables\G
--
-- 2) 컬럼 17개 확인:
--    SELECT COUNT(*) AS col_count
--      FROM INFORMATION_SCHEMA.COLUMNS
--     WHERE TABLE_SCHEMA = DATABASE()
--       AND TABLE_NAME = 'ride_compliance_deliverables';
--    기대치: 22 (id + 18 + created_by + created_at + updated_at)
--
-- 3) Phase 1.5 통합 검증 (Phase 1.1~1.5 모두):
--    SELECT 'officers',     COUNT(*) FROM ride_compliance_officers
--    UNION ALL SELECT 'assets',         COUNT(*) FROM ride_compliance_assets
--    UNION ALL SELECT 'incidents',      COUNT(*) FROM ride_compliance_incidents
--    UNION ALL SELECT 'documents',      COUNT(*) FROM ride_compliance_documents
--    UNION ALL SELECT 'versions',       COUNT(*) FROM ride_compliance_document_versions
--    UNION ALL SELECT 'plans',          COUNT(*) FROM ride_compliance_annual_plans
--    UNION ALL SELECT 'tasks',          COUNT(*) FROM ride_compliance_tasks
--    UNION ALL SELECT 'submissions',    COUNT(*) FROM ride_compliance_form_submissions
--    UNION ALL SELECT 'deliverables',   COUNT(*) FROM ride_compliance_deliverables;
--    기대치: deliverables 0 (시드 없음, 운영 중 등록)
