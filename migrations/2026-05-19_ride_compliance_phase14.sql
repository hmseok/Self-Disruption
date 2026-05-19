-- PR-COMPLIANCE-1.4 — 자동 검토·정합성·승인·스케줄 자동화
-- 2026-05-19 (compliance 세션, determined-charming-newton)
--
-- 사용자 비전 (2026-05-19):
--   "업로드 서류의 기본 법적/보안 기준 검토 작동
--    단일 검토가 행동·진행 스케줄·액션 영역 요약 추출
--    단일 검토 완료 시 다른 서류 간 정합성 검수
--    최종 정정 또는 완료 승인 시 기준에 따라 스케줄·스텝별 자동 작동"
--
-- 변경 (ride_compliance_documents):
--   · review_results       JSON       — 자동 lint 결과 (법적/보안 기준 + 정합성)
--   · extracted_actions    JSON       — 추출된 액션 (운영 주기·서식·책임자·기한)
--   · last_reviewed_at     DATETIME   — 자동 검토 마지막 실행 시각
--   · review_score         INT        — 자동 검토 점수 (0~100)
--   · review_engine        VARCHAR    — 'regex' | 'llm' | 'hybrid' (추출 엔진)
--   · schedule_applied_at  DATETIME   — 스케줄 자동 적용 완료 시각 (tasks 생성 후)
--
-- 변경 (ride_compliance_tasks):
--   · source_document_id   CHAR(36)   — 액션이 추출된 원본 문서 (auto-applied task 추적)
--   · auto_generated       TINYINT(1) — 1: 자동 생성, 0: 시드/수동 (기본 0)
--
-- Rule 23 멱등: @col_exists 체크 (반복 실행 안전)
-- Rule 24 시드: 본 마이그 시드 없음 (운영 데이터)
-- Rule 1 풀 파이프라인 + Rule 3 외부 LLM 안전망:
--   · Gemini gemini-2.5-flash 모델 사용 (기존 ocr/route.ts 패턴)
--   · responseMimeType='application/json' 강제
--   · thinkingConfig: { thinkingBudget: 0 } (2.5 모델 thinking off)
--   · 정규식 1차 + LLM 2차 (review_engine='hybrid')
-- ============================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. ride_compliance_documents — 자동 검토 컬럼 추가
-- ─────────────────────────────────────────────────────────────────

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_documents' AND COLUMN_NAME = 'review_results');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_documents ADD COLUMN review_results JSON NULL DEFAULT NULL',
  'SELECT "review_results exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_documents' AND COLUMN_NAME = 'extracted_actions');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_documents ADD COLUMN extracted_actions JSON NULL DEFAULT NULL',
  'SELECT "extracted_actions exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_documents' AND COLUMN_NAME = 'last_reviewed_at');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_documents ADD COLUMN last_reviewed_at DATETIME NULL DEFAULT NULL',
  'SELECT "last_reviewed_at exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_documents' AND COLUMN_NAME = 'review_score');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_documents ADD COLUMN review_score INT NULL DEFAULT NULL',
  'SELECT "review_score exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_documents' AND COLUMN_NAME = 'review_engine');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_documents ADD COLUMN review_engine VARCHAR(20) NULL DEFAULT NULL',
  'SELECT "review_engine exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_documents' AND COLUMN_NAME = 'schedule_applied_at');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_documents ADD COLUMN schedule_applied_at DATETIME NULL DEFAULT NULL',
  'SELECT "schedule_applied_at exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────
-- 2. ride_compliance_tasks — 자동 생성 추적 컬럼
-- ─────────────────────────────────────────────────────────────────

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_tasks' AND COLUMN_NAME = 'source_document_id');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_tasks ADD COLUMN source_document_id CHAR(36) NULL DEFAULT NULL, ADD KEY idx_ride_comp_task_source (source_document_id)',
  'SELECT "source_document_id exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_tasks' AND COLUMN_NAME = 'auto_generated');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_tasks ADD COLUMN auto_generated TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT "auto_generated exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- 1) 신규 컬럼 8개 확인:
--   SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
--     FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND ((TABLE_NAME = 'ride_compliance_documents'
--            AND COLUMN_NAME IN ('review_results','extracted_actions','last_reviewed_at',
--                                'review_score','review_engine','schedule_applied_at'))
--       OR (TABLE_NAME = 'ride_compliance_tasks'
--           AND COLUMN_NAME IN ('source_document_id','auto_generated')))
--    ORDER BY TABLE_NAME, COLUMN_NAME;
--   기대치: documents 6 + tasks 2 = 8 행
