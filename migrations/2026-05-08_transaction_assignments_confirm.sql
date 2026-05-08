-- ════════════════════════════════════════════════════════════════
-- transaction_assignments — 자동 매칭 확정 단계 추가 (PR-UX1.5)
-- 2026-05-08
-- ════════════════════════════════════════════════════════════════
--
-- 워크플로우:
--   1. 자동 매칭 → status='pending', source='auto', confirmed_at=NULL
--   2. 사용자 [✅ 일괄 확정] → status='confirmed', confirmed_at=NOW(), confirmed_by=user.id
--   3. 사용자 [❌ 거부] → status='rejected'
--
-- 이미 컬럼 존재 가능 (5/8 일찍 추가됨) — 멱등 적용

-- (1) confirmed_at
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'transaction_assignments'
     AND COLUMN_NAME = 'confirmed_at'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE transaction_assignments ADD COLUMN confirmed_at DATETIME NULL',
  'SELECT "confirmed_at already exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- (2) confirmed_by
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'transaction_assignments'
     AND COLUMN_NAME = 'confirmed_by'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE transaction_assignments ADD COLUMN confirmed_by CHAR(36) NULL',
  'SELECT "confirmed_by already exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- (3) status
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'transaction_assignments'
     AND COLUMN_NAME = 'status'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE transaction_assignments ADD COLUMN status VARCHAR(16) DEFAULT 'pending'",
  'SELECT "status already exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- (4) status NULL → 'pending' 마킹 (기존 row)
UPDATE transaction_assignments
   SET status = 'pending'
 WHERE status IS NULL OR status = '';

-- (5) status 인덱스 (검색 빠르게)
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'transaction_assignments'
     AND INDEX_NAME = 'idx_ta_status'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_ta_status ON transaction_assignments (status)',
  'SELECT "idx_ta_status already exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 검증 SQL (주석)
-- SELECT status, source, COUNT(*) AS cnt
--   FROM transaction_assignments
--  GROUP BY status, source
--  ORDER BY cnt DESC;
-- 기대치: status='pending', source='auto' 가 270건 (또는 그 이상)
