-- ─────────────────────────────────────────────────────────────────
-- migrations/2026-05-30_ride_compliance_phase22_deliverables_ai.sql
-- ─────────────────────────────────────────────────────────────────
-- RideCompliance Phase 2.2 — 산출물 AI 분류 메타 컬럼 추가
--
-- 도메인:
--   ride_compliance_deliverables 에 AI 분류 결과 저장 컬럼 추가.
--   사용자가 파일 → 텍스트 → AI 분류 (카테고리/제목/Playbook 매핑) → 검수 → 확정 등록.
--
-- 사용자 결정 (2026-05-28):
--   Q1 운영가이드: Playbook 9단계 매핑 (확정 내규 sections 활용)
--   Q2 deliverable_code: AI 자동 생성 (카테고리 prefix + 시퀀스)
--   Q3 다중 파일: 다수 동시 업로드 → 각각 검수
--   Q4 confidence: 추론 + UI 표시 (색상 배지)
--
-- 멱등 (Rule 23) — IF NOT EXISTS 패턴 (MySQL 8.0+ ALTER ADD COLUMN IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 멱등 컬럼 추가 (수동 IF NOT EXISTS — MySQL 8.0 호환)
-- ════════════════════════════════════════════════════════════════

-- 1) ai_classified_at — AI 분류 일시
SET @sql := IF(
  NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ride_compliance_deliverables'
       AND COLUMN_NAME = 'ai_classified_at'
  ),
  'ALTER TABLE ride_compliance_deliverables ADD COLUMN ai_classified_at DATETIME DEFAULT NULL AFTER created_by',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) ai_model — Gemini 모델 식별
SET @sql := IF(
  NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ride_compliance_deliverables'
       AND COLUMN_NAME = 'ai_model'
  ),
  'ALTER TABLE ride_compliance_deliverables ADD COLUMN ai_model VARCHAR(60) DEFAULT NULL AFTER ai_classified_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) ai_confidence — 0.00 ~ 1.00
SET @sql := IF(
  NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ride_compliance_deliverables'
       AND COLUMN_NAME = 'ai_confidence'
  ),
  'ALTER TABLE ride_compliance_deliverables ADD COLUMN ai_confidence DECIMAL(3,2) DEFAULT NULL AFTER ai_model',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) ai_raw_response — 디버깅 + 재추출용 raw JSON
SET @sql := IF(
  NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ride_compliance_deliverables'
       AND COLUMN_NAME = 'ai_raw_response'
  ),
  'ALTER TABLE ride_compliance_deliverables ADD COLUMN ai_raw_response MEDIUMTEXT DEFAULT NULL AFTER ai_confidence',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5) summary_md — AI 가 생성한 요약 (사용자 편집 가능)
SET @sql := IF(
  NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ride_compliance_deliverables'
       AND COLUMN_NAME = 'summary_md'
  ),
  'ALTER TABLE ride_compliance_deliverables ADD COLUMN summary_md TEXT DEFAULT NULL AFTER ai_raw_response',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6) playbook_step_codes — Playbook section_id 매핑 (JSON array)
--    확정 내규의 policy_sections 중 kind='playbook_step' 인 row 의 id 목록.
SET @sql := IF(
  NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ride_compliance_deliverables'
       AND COLUMN_NAME = 'playbook_step_codes'
  ),
  'ALTER TABLE ride_compliance_deliverables ADD COLUMN playbook_step_codes JSON DEFAULT NULL AFTER summary_md',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7) 인덱스 — AI 분류 조회용
SET @sql := IF(
  NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ride_compliance_deliverables'
       AND INDEX_NAME = 'idx_ride_comp_dlv_ai_classified'
  ),
  'ALTER TABLE ride_compliance_deliverables ADD KEY idx_ride_comp_dlv_ai_classified (ai_classified_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────
-- 검증 SQL (DBeaver / Cloud SQL Studio 에서 실행 후 확인)
-- ─────────────────────────────────────────────────────────────────
--
-- 1) 컬럼 추가 확인:
--    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
--      FROM INFORMATION_SCHEMA.COLUMNS
--     WHERE TABLE_SCHEMA = DATABASE()
--       AND TABLE_NAME = 'ride_compliance_deliverables'
--       AND COLUMN_NAME IN ('ai_classified_at','ai_model','ai_confidence',
--                            'ai_raw_response','summary_md','playbook_step_codes');
--    기대치: 6 row
--
-- 2) 인덱스 추가 확인:
--    SHOW INDEX FROM ride_compliance_deliverables WHERE Key_name = 'idx_ride_comp_dlv_ai_classified';
--
-- 3) 기존 데이터 무영향 확인:
--    SELECT COUNT(*) AS total,
--           COUNT(ai_classified_at) AS classified
--      FROM ride_compliance_deliverables;
--    기대치: total=N, classified=0 (기존 row 는 모두 NULL — 정상)
