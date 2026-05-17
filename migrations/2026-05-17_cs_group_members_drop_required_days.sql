-- ═══════════════════════════════════════════════════════════════════
-- N-48 — cs_group_members.required_days_per_month 컬럼 제거
--   2026-05-17 sukhomin87@gmail.com
--
-- 사용자 결정: "워커에 최소, 최대 근무일수가 있는데 그룹에 월 필수일수가 필요할까요?"
--   → 워커 글로벌 min_days_per_month (N-36) 만으로 충분
--   → 그룹별 필수 일수 컬럼 제거
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- [STEP 1] cs_group_members.required_days_per_month DROP (멱등)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'required_days_per_month');
SET @s := IF(@col > 0,
  'ALTER TABLE cs_group_members DROP COLUMN required_days_per_month',
  'SELECT ''cs_group_members.required_days_per_month already dropped''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- [STEP 2] cs_group_member_versions 도 (timeline)
SET @tbl := (SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_member_versions');
SET @col2 := IF(@tbl = 0, 0,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_member_versions'
     AND COLUMN_NAME = 'required_days_per_month'));
SET @s2 := IF(@tbl > 0 AND @col2 > 0,
  'ALTER TABLE cs_group_member_versions DROP COLUMN required_days_per_month',
  'SELECT ''cs_group_member_versions.required_days_per_month skip''');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- ROLLBACK (긴급)
-- ALTER TABLE cs_group_members ADD COLUMN required_days_per_month TINYINT UNSIGNED DEFAULT NULL;
-- ALTER TABLE cs_group_member_versions ADD COLUMN required_days_per_month TINYINT UNSIGNED DEFAULT NULL;
