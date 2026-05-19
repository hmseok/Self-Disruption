-- PR-COMPLIANCE-1.3 — 라이드 정보보안 Phase 1.3
--                     매뉴얼·서식별 종류 페이지 + 마크다운 본문 + GCS 통합
-- 2026-05-19 (compliance 세션, determined-charming-newton)
--
-- 사용자 통찰 (2026-05-19) 반영:
--   "매뉴얼은 종류별로 구분되어 있으면 좋겠다"      → /RideCompliance/manuals/[code] 매뉴얼별 페이지
--   "가장 안전하고 확실한 보존"                  → PDF 원본 (GCS) + 마크다운 본문 (DB) 동시
--   "서식관리·각양식은 실제 페이지로 종류별 다르게"  → /RideCompliance/forms/[category]/[code] 페이지 + form_fields_schema
--
-- 변경:
--   · ride_compliance_documents          + content_md (LONGTEXT)        — 마크다운 본문
--                                        + form_fields_schema (JSON)    — 서식 fields 스키마 (1.3-B 골격, 1.3-C 상세)
--                                        + gcs_object_path (VARCHAR)    — GCS object key (bucket 외부)
--   · ride_compliance_document_versions  + content_md (LONGTEXT)        — 버전별 본문 보존
--                                        + gcs_object_path (VARCHAR)    — 버전별 GCS 파일
--
-- 호환:
--   · 기존 file_url 컬럼 그대로 유지 (외부 link 옵션) — content_md 와 동시 보존 가능 (옵션 D)
--   · NULL 허용 — Phase 1.2 row 영향 없음
--
-- Rule 23 멱등: @col_exists 체크 (반복 실행 안전)
-- Rule 24 시드: 본 마이그 시드 없음 (마크다운 본문은 별도 import script 또는 UI 에디터로 입력)
-- FK 정책: 의도적 FK 미선언 (라이드 모듈 스타일 — Phase 1.1/1.2 동형)
--
-- 적용:
--   mysql -h <host> -u <user> -p <db> < migrations/2026-05-19_ride_compliance_phase13.sql
--
-- 검증 (파일 하단):
--   SELECT COLUMN_NAME FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME = 'ride_compliance_documents'
--      AND COLUMN_NAME IN ('content_md','form_fields_schema','gcs_object_path');
-- ============================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. ride_compliance_documents — content_md, form_fields_schema, gcs_object_path 추가
-- ─────────────────────────────────────────────────────────────────

-- 1.1 content_md LONGTEXT (마크다운 본문)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'ride_compliance_documents'
     AND COLUMN_NAME = 'content_md'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_documents ADD COLUMN content_md LONGTEXT NULL DEFAULT NULL',
  'SELECT "content_md already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.2 form_fields_schema JSON (서식 fields 스키마 — Phase 1.3-C 에서 활용)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'ride_compliance_documents'
     AND COLUMN_NAME = 'form_fields_schema'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_documents ADD COLUMN form_fields_schema JSON NULL DEFAULT NULL',
  'SELECT "form_fields_schema already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.3 gcs_object_path VARCHAR(500) (GCS object key — 버킷명 외부 env 관리)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'ride_compliance_documents'
     AND COLUMN_NAME = 'gcs_object_path'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_documents ADD COLUMN gcs_object_path VARCHAR(500) NULL DEFAULT NULL',
  'SELECT "gcs_object_path already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────
-- 2. ride_compliance_document_versions — content_md, gcs_object_path 추가
--    (버전별 본문 + GCS 파일 보존 — 개정 시 이전 버전도 조회 가능)
-- ─────────────────────────────────────────────────────────────────

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'ride_compliance_document_versions'
     AND COLUMN_NAME = 'content_md'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_document_versions ADD COLUMN content_md LONGTEXT NULL DEFAULT NULL',
  'SELECT "content_md already exists in versions" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'ride_compliance_document_versions'
     AND COLUMN_NAME = 'gcs_object_path'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_document_versions ADD COLUMN gcs_object_path VARCHAR(500) NULL DEFAULT NULL',
  'SELECT "gcs_object_path already exists in versions" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 검증 쿼리 (수동 실행)
-- ============================================================
-- 1) 신규 컬럼 5개 확인:
--   SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
--     FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME LIKE 'ride_compliance_%'
--      AND COLUMN_NAME IN ('content_md','form_fields_schema','gcs_object_path')
--    ORDER BY TABLE_NAME, COLUMN_NAME;
--   기대치: documents 3행 (content_md/form_fields_schema/gcs_object_path) + versions 2행 (content_md/gcs_object_path) = 5행
--
-- 2) 기존 Phase 1.2 데이터 무결성 (26 documents + 6 versions 그대로):
--   SELECT COUNT(*) FROM ride_compliance_documents;
--   SELECT COUNT(*) FROM ride_compliance_document_versions;
--   기대치: 26 / 6
--
-- 3) 새 컬럼은 모두 NULL (시드 X):
--   SELECT
--     SUM(CASE WHEN content_md IS NULL THEN 1 ELSE 0 END) AS null_content,
--     SUM(CASE WHEN form_fields_schema IS NULL THEN 1 ELSE 0 END) AS null_schema,
--     SUM(CASE WHEN gcs_object_path IS NULL THEN 1 ELSE 0 END) AS null_gcs
--   FROM ride_compliance_documents;
--   기대치: 26 / 26 / 26 (모두 NULL — 운영 입력 대기)
