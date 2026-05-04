-- ═══════════════════════════════════════════════════════════════════
-- cs_leaves 시간 단위 (custom hours) — PR-2GG (2026-05-04)
--
-- 요구사항: 패밀리데이/반차/단축 사용 등 시간 단위 지정 필요
--
-- 신규 컬럼:
--   hours DECIMAL(4,2) — am_pm='custom' 일 때 사용 시간 (예: 4h, 2h, 6h)
--   am_pm 에 'custom' 값 추가 (enum 변경 없음 — VARCHAR)
--
-- 차감 환산:
--   am_pm='full' → 1일
--   am_pm='am'|'pm' → 0.5일 (4h 자동)
--   am_pm='custom' → hours / 8 일 (예: 4h=0.5, 2h=0.25)
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cs_leaves'
    AND COLUMN_NAME = 'hours'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE cs_leaves
     ADD COLUMN hours DECIMAL(4,2) NULL COMMENT ''am_pm=custom 일 때 사용 시간'' AFTER am_pm',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 기존 row hours 자동 채움 (full=8, am/pm=4)
UPDATE cs_leaves SET hours = 8 WHERE am_pm = 'full' AND hours IS NULL;
UPDATE cs_leaves SET hours = 4 WHERE am_pm IN ('am', 'pm') AND hours IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_leaves DROP COLUMN hours;
