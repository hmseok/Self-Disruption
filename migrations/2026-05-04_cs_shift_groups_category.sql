-- ═══════════════════════════════════════════════════════════════════
-- PR-2QQ-a — cs_shift_groups 카테고리 + 색상 다양화
--   (1) category 컬럼 추가 — '주간' / '야간' / '특수' / 'general' (기본)
--   (2) color_tone ENUM 확장 — 기존 7개 → 14개
--   (3) cs_workers.color_tone 도 동일하게 확장
--
-- 멱등 적용 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════════════

-- 1) cs_shift_groups.category 추가
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cs_shift_groups'
    AND column_name = 'category'
);

SET @add_sql := IF(@col_exists = 0,
  "ALTER TABLE cs_shift_groups
    ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT 'general'
    COMMENT '주간/야간/특수/general — 그룹 분류'
    AFTER name",
  'SELECT 1');
PREPARE stmt FROM @add_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1.1) category 인덱스
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'cs_shift_groups'
    AND index_name = 'idx_cs_grp_category'
);
SET @idx_sql := IF(@idx_exists = 0,
  'ALTER TABLE cs_shift_groups ADD INDEX idx_cs_grp_category (category, sort_order)',
  'SELECT 1');
PREPARE stmt2 FROM @idx_sql;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 2) color_tone ENUM 확장 — cs_shift_groups
--    기존: blue, gray, green, amber, violet, red, none (7)
--    변경: + indigo, sky, teal, lime, orange, pink, slate (총 14)
SET @cur_type := (
  SELECT column_type FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cs_shift_groups'
    AND column_name = 'color_tone'
);
SET @group_color_sql := IF(@cur_type LIKE '%indigo%',
  'SELECT 1',
  "ALTER TABLE cs_shift_groups MODIFY COLUMN color_tone
    ENUM('blue','gray','green','amber','violet','red','none',
         'indigo','sky','teal','lime','orange','pink','slate')
    NOT NULL DEFAULT 'none'");
PREPARE stmt3 FROM @group_color_sql;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- 3) color_tone ENUM 확장 — cs_workers (동일하게)
SET @worker_cur_type := (
  SELECT column_type FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cs_workers'
    AND column_name = 'color_tone'
);
SET @worker_color_sql := IF(@worker_cur_type LIKE '%indigo%',
  'SELECT 1',
  "ALTER TABLE cs_workers MODIFY COLUMN color_tone
    ENUM('blue','gray','green','amber','violet','red','none',
         'indigo','sky','teal','lime','orange','pink','slate')
    NOT NULL DEFAULT 'none'");
PREPARE stmt4 FROM @worker_color_sql;
EXECUTE stmt4;
DEALLOCATE PREPARE stmt4;

-- ─── 검증 SQL ────────────────────────────────────────────────────────
-- SHOW CREATE TABLE cs_shift_groups\G
-- 기대치: category VARCHAR(32) DEFAULT 'general'
--         color_tone ENUM 14개
-- SELECT category, COUNT(*) FROM cs_shift_groups GROUP BY category;
-- 기대치: 모든 기존 그룹은 'general' 로 마이그레이션됨

-- ─── 롤백 ────────────────────────────────────────────────────────────
-- ALTER TABLE cs_shift_groups DROP INDEX idx_cs_grp_category;
-- ALTER TABLE cs_shift_groups DROP COLUMN category;
-- ALTER TABLE cs_shift_groups MODIFY COLUMN color_tone
--   ENUM('blue','gray','green','amber','violet','red','none') NOT NULL DEFAULT 'none';
-- ALTER TABLE cs_workers MODIFY COLUMN color_tone
--   ENUM('blue','gray','green','amber','violet','red','none') NOT NULL DEFAULT 'none';
