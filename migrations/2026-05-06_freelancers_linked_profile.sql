-- ============================================================
-- freelancers.linked_profile_id 컬럼 신설 (PR-B11, 2026-05-06)
--
-- 사용자 명시: "직원이지만 별도 프리랜서 지급도 받음 / 구분 필요"
--
-- 컬럼:
--   linked_profile_id CHAR(36) NULL — profiles.id 와 옵션 FK
--                                     null = 외부 프리랜서
--                                     not null = 본 회사 직원이지만 별도 지급 받음
--
-- UI: 프리랜서 row 에 「🟢 FMI 직원 → 김준수」 배지 표시
-- 매칭 시: linked_profile_id 있으면 직원 매처가 우선 (동명이인 dedup)
--
-- 멱등 (IF NOT EXISTS 패턴)
-- ============================================================

SET @col_exists := 0;

-- linked_profile_id
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND COLUMN_NAME = 'linked_profile_id';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE freelancers ADD COLUMN linked_profile_id CHAR(36) NULL COMMENT "본 회사 직원 link (profiles.id) — null=외부 프리랜서"',
  'SELECT "linked_profile_id already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 인덱스 (조회 최적화)
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers' AND INDEX_NAME = 'idx_freelancers_linked_profile';
SET @sql := IF(@col_exists = 0,
  'CREATE INDEX idx_freelancers_linked_profile ON freelancers(linked_profile_id)',
  'SELECT "idx_freelancers_linked_profile already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 검증
-- ============================================================
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
--   FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancers'
--     AND COLUMN_NAME = 'linked_profile_id';
-- 기대치: 1건
