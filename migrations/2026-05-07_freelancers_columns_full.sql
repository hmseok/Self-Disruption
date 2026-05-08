-- ============================================================
-- freelancers 테이블 — 누락된 컬럼 일괄 추가 (PR-B12 hotfix, 2026-05-07)
--
-- 사용자 SQL 적용 시 'Unknown column phone' 에러 발견
-- → schema 가 stale 한 상태. 필요 컬럼 모두 추가.
--
-- 멱등 (IF NOT EXISTS 패턴)
-- ============================================================

SET @col_exists := 0;

-- phone
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND COLUMN_NAME = 'phone';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE freelancers ADD COLUMN phone VARCHAR(32) NULL',
  'SELECT "phone exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- email
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND COLUMN_NAME = 'email';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE freelancers ADD COLUMN email VARCHAR(128) NULL',
  'SELECT "email exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- bank_name
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND COLUMN_NAME = 'bank_name';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE freelancers ADD COLUMN bank_name VARCHAR(32) NULL',
  'SELECT "bank_name exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- account_number
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND COLUMN_NAME = 'account_number';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE freelancers ADD COLUMN account_number VARCHAR(64) NULL',
  'SELECT "account_number exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- account_holder
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND COLUMN_NAME = 'account_holder';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE freelancers ADD COLUMN account_holder VARCHAR(64) NULL',
  'SELECT "account_holder exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- reg_number
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND COLUMN_NAME = 'reg_number';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE freelancers ADD COLUMN reg_number VARCHAR(32) NULL',
  'SELECT "reg_number exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tax_type
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND COLUMN_NAME = 'tax_type';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE freelancers ADD COLUMN tax_type VARCHAR(32) NULL DEFAULT "사업소득(3.3%)"',
  'SELECT "tax_type exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- service_type
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND COLUMN_NAME = 'service_type';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE freelancers ADD COLUMN service_type VARCHAR(32) NULL DEFAULT "기타"',
  'SELECT "service_type exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- is_active
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND COLUMN_NAME = 'is_active';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE freelancers ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT "is_active exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- memo
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND COLUMN_NAME = 'memo';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE freelancers ADD COLUMN memo VARCHAR(500) NULL',
  'SELECT "memo exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- linked_profile_id (PR-B11 에서 별도 마이그레이션 — 안전하게 한 번 더 멱등)
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND COLUMN_NAME = 'linked_profile_id';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE freelancers ADD COLUMN linked_profile_id CHAR(36) NULL',
  'SELECT "linked_profile_id exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 검증
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers'
  ORDER BY ORDINAL_POSITION;
