-- ─────────────────────────────────────────────────────────────────
-- migrations/2026-05-31_ride_compliance_phase19_versioning.sql
-- ─────────────────────────────────────────────────────────────────
-- RideCompliance Phase 19 — 내규 버전 관리 + 변경 히스토리
--
-- 사용자 통찰 (2026-05-28):
--   「내규도 변경될 수 있고 시기에 따른 변화 규정이나 히스토리가 관리도 되어야 한다」
--
-- 매뉴얼 매핑:
--   · 제4조: 내규의 수립 및 승인 (매년 검토 + 승인)
--   · 제5조: 내규의 공표 (전 임직원 + 변경 시 공지)
--   · (외부) 법령 개정 추적
--
-- 핵심 기능:
--   1. 변경 사유 + 카테고리 + 승인자/일시 (제4조 ④)
--   2. 공표 추적 (제5조)
--   3. 시점별 적용 내규 조회 (감사·소송 대응)
--   4. 산출물·결재의 「당시 내규 버전」 snapshot (감사 추적)
--   5. 법령 개정 → 내규 영향 추적
--
-- 멱등 (Rule 23) — IF NOT EXISTS / @col_exists 패턴.
-- ─────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 1. ride_compliance_policies — 버전 메타 컬럼 추가
-- ════════════════════════════════════════════════════════════════

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_policies' AND COLUMN_NAME = 'change_reason');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_policies
     ADD COLUMN change_reason TEXT DEFAULT NULL COMMENT "변경 사유 (법령/운영/감사)" AFTER ai_summary_md,
     ADD COLUMN change_category VARCHAR(20) DEFAULT NULL COMMENT "law/ops/audit/major/minor" AFTER change_reason,
     ADD COLUMN change_approved_by CHAR(36) DEFAULT NULL COMMENT "변경 승인자 — profiles.id (제4조 책임자)" AFTER change_category,
     ADD COLUMN change_approved_at DATETIME DEFAULT NULL COMMENT "변경 승인 일시 (제4조 ③)" AFTER change_approved_by,
     ADD COLUMN announced_at DATETIME DEFAULT NULL COMMENT "공표 일시 (제5조)" AFTER change_approved_at,
     ADD COLUMN announced_by CHAR(36) DEFAULT NULL COMMENT "공표 담당자" AFTER announced_at,
     ADD COLUMN annual_review_at DATETIME DEFAULT NULL COMMENT "매년 정기 검토 일시 (제4조 ④)" AFTER announced_by,
     ADD COLUMN annual_review_by CHAR(36) DEFAULT NULL COMMENT "정기 검토자" AFTER annual_review_at,
     ADD KEY idx_ride_comp_policy_announced (announced_at),
     ADD KEY idx_ride_comp_policy_annual_review (annual_review_at)',
  'SELECT "policies change_reason exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ════════════════════════════════════════════════════════════════
-- 2. ride_compliance_deliverables — 「당시 내규 버전」 snapshot
-- ════════════════════════════════════════════════════════════════

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_deliverables' AND COLUMN_NAME = 'source_policy_id');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_deliverables
     ADD COLUMN source_policy_id CHAR(36) DEFAULT NULL COMMENT "산출물 생성 시점의 적용 내규 ID" AFTER playbook_step_codes,
     ADD COLUMN source_policy_version VARCHAR(20) DEFAULT NULL COMMENT "적용 내규 버전 라벨 (snapshot)" AFTER source_policy_id,
     ADD KEY idx_ride_comp_dlv_src_policy (source_policy_id)',
  'SELECT "deliverables source_policy_id exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ════════════════════════════════════════════════════════════════
-- 3. ride_compliance_disposal_reviews — 「당시 내규 버전」 snapshot
-- ════════════════════════════════════════════════════════════════
-- (Phase 4.0 마이그가 사용자 적용 안 됐을 수도 — graceful — 테이블 없으면 skip)

SET @tbl_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_disposal_reviews');
SET @col_exists := IF(@tbl_exists > 0,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_disposal_reviews' AND COLUMN_NAME = 'source_policy_id'),
  1);
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE ride_compliance_disposal_reviews
     ADD COLUMN source_policy_id CHAR(36) DEFAULT NULL COMMENT "결재 시점의 적용 내규 ID",
     ADD COLUMN source_policy_version VARCHAR(20) DEFAULT NULL COMMENT "적용 내규 버전 (snapshot)",
     ADD KEY idx_ride_comp_disp_src_policy (source_policy_id)',
  'SELECT "disposal_reviews source_policy_id exists or table N/A" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ════════════════════════════════════════════════════════════════
-- 4. ride_compliance_law_revisions — 법령 개정 추적
-- ════════════════════════════════════════════════════════════════
-- 외부 법령 (개인정보보호법 등) 개정 → 내규 영향 분석 → 갱신 추적

CREATE TABLE IF NOT EXISTS ride_compliance_law_revisions (
  id                   CHAR(36)     NOT NULL PRIMARY KEY,

  -- 법령 식별
  law_code             VARCHAR(60)  NOT NULL,  -- 'PIPA'(개인정보보호법) / 'CIA'(신용정보법) / 등
  law_name             VARCHAR(200) NOT NULL,  -- '개인정보 보호법'
  revision_no          VARCHAR(40)  DEFAULT NULL,  -- '법률 제19234호'
  revision_date        DATE         DEFAULT NULL,  -- 공포일
  effective_date       DATE         NOT NULL,  -- 시행일

  -- 요약
  summary              TEXT         DEFAULT NULL,
  full_text_url        VARCHAR(500) DEFAULT NULL,  -- 법제처 등 원문 link

  -- 우리 내규 영향 분석
  impacted_policy_id   CHAR(36)     DEFAULT NULL,  -- 영향받는 우리 내규 (현행)
  impacted_articles    JSON         DEFAULT NULL,  -- ["제6조","제12조","제25조"] — 영향 조항
  impact_severity      VARCHAR(10)  DEFAULT 'medium',  -- low/medium/high/critical
  impact_summary       TEXT         DEFAULT NULL,  -- AI 또는 수동 분석 결과

  -- 처리 상태
  status               VARCHAR(20)  NOT NULL DEFAULT 'pending',
    -- pending          : 신규 감지 / 검토 대기
    -- reviewing        : CPO 검토중
    -- requires_update  : 내규 갱신 필요 (확정)
    -- applied          : 새 내규 버전에 반영됨
    -- ignored          : 영향 없음 — skip
  reviewed_by          CHAR(36)     DEFAULT NULL,
  reviewed_at          DATETIME     DEFAULT NULL,
  applied_in_policy_id CHAR(36)     DEFAULT NULL,  -- 어느 내규 새 버전에서 반영됐는지

  -- audit
  source               VARCHAR(20)  DEFAULT 'manual',  -- manual/rss/api/ai_alert
  created_by           CHAR(36)     DEFAULT NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_ride_comp_law_code_rev (law_code, revision_no),
  KEY idx_ride_comp_law_status (status),
  KEY idx_ride_comp_law_effective (effective_date),
  KEY idx_ride_comp_law_severity (impact_severity),
  KEY idx_ride_comp_law_policy (impacted_policy_id),
  KEY idx_ride_comp_law_applied (applied_in_policy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════════════════════════════════════════════════════════════════
-- 5. ride_compliance_policy_change_log — 자동 변경 이력
-- ════════════════════════════════════════════════════════════════
-- 내규 sections 의 변경을 자동 기록 (UPDATE 시점 → 새 row)
-- 직접 사용자 작업 없이 audit log 역할

CREATE TABLE IF NOT EXISTS ride_compliance_policy_change_log (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  policy_id         CHAR(36)     NOT NULL,
  policy_version    VARCHAR(20)  NOT NULL,
  change_kind       VARCHAR(30)  NOT NULL,
    -- created / status_changed / section_confirmed / section_rejected / section_edited /
    -- finalized / announced / superseded / annual_reviewed
  changed_by        CHAR(36)     DEFAULT NULL,
  changed_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  before_value      JSON         DEFAULT NULL,
  after_value       JSON         DEFAULT NULL,
  note              TEXT         DEFAULT NULL,
  KEY idx_ride_comp_pcl_policy (policy_id),
  KEY idx_ride_comp_pcl_at (changed_at),
  KEY idx_ride_comp_pcl_kind (change_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 검증 SQL
-- ─────────────────────────────────────────────────────────────────
--
-- 1) policies 신규 컬럼 8개:
--    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
--     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_policies'
--       AND COLUMN_NAME IN ('change_reason','change_category','change_approved_by',
--                            'change_approved_at','announced_at','announced_by',
--                            'annual_review_at','annual_review_by');
--    기대치: 8 row
--
-- 2) deliverables 신규 컬럼 2개:
--    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
--     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_deliverables'
--       AND COLUMN_NAME IN ('source_policy_id','source_policy_version');
--    기대치: 2 row
--
-- 3) 신규 테이블 2개:
--    SHOW CREATE TABLE ride_compliance_law_revisions\G
--    SHOW CREATE TABLE ride_compliance_policy_change_log\G
--
-- 4) 시점별 적용 내규 조회 패턴 테스트:
--    SELECT id, policy_code, version, effective_date, status
--      FROM ride_compliance_policies
--     WHERE status IN ('active', 'superseded')
--       AND effective_date <= '2024-03-15'
--       AND (superseded_by_id IS NULL OR (
--             SELECT effective_date FROM ride_compliance_policies p2
--              WHERE p2.id = ride_compliance_policies.superseded_by_id
--           ) > '2024-03-15')
--     ORDER BY effective_date DESC LIMIT 1;
