-- ============================================================
-- profiles 테이블 — 인사 정보 (입사일 / 퇴사일 / 재직상태) 추가
-- 2026-05-06 PR-B3 (사용자 요청)
--
-- 컬럼:
--   hire_date    DATE NULL  — 입사일
--   resign_date  DATE NULL  — 퇴사일
--   resign_reason VARCHAR(200) NULL — 퇴사 사유
--   emp_status   VARCHAR(16) DEFAULT 'active' — 재직 상태
--                  active (재직) / on_leave (휴직) / resigned (퇴사)
--
-- 멱등 적용 — IF NOT EXISTS 체크 패턴
-- 검증: 하단 SELECT 주석으로 실행 후 컬럼 존재 확인
-- ============================================================

SET @col_exists := 0;

-- hire_date
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'hire_date';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE profiles ADD COLUMN hire_date DATE NULL COMMENT "입사일"',
  'SELECT "hire_date already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- resign_date
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'resign_date';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE profiles ADD COLUMN resign_date DATE NULL COMMENT "퇴사일"',
  'SELECT "resign_date already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- resign_reason
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'resign_reason';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE profiles ADD COLUMN resign_reason VARCHAR(200) NULL COMMENT "퇴사 사유"',
  'SELECT "resign_reason already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- emp_status (active|on_leave|resigned)
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'emp_status';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE profiles ADD COLUMN emp_status VARCHAR(16) NOT NULL DEFAULT "active" COMMENT "재직상태: active|on_leave|resigned"',
  'SELECT "emp_status already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 인덱스 (퇴사 직원 필터링 최적화)
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND INDEX_NAME = 'idx_profiles_emp_status';
SET @sql := IF(@col_exists = 0,
  'CREATE INDEX idx_profiles_emp_status ON profiles(emp_status)',
  'SELECT "idx_profiles_emp_status already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 검증 (적용 후 실행해서 확인)
-- ============================================================
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
--   FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles'
--     AND COLUMN_NAME IN ('hire_date', 'resign_date', 'resign_reason', 'emp_status');
-- 기대치: 4건
--
-- SELECT emp_status, COUNT(*) FROM profiles GROUP BY emp_status;
-- 기대치: 모든 row 가 'active' (default)
