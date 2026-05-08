-- ============================================================
-- expense_receipts.image_hash 컬럼 신설 (PR-B13, 2026-05-08)
--
-- 사용자: "영수증 중복 자동으로 걸러야"
-- → 같은 영수증 이미지를 두 번 업로드 시 자동 차단
-- → 옛 (user_id, date, merchant, amount) dedup 은 AI OCR 변형 시 무력 (이사솔/이차돌)
-- → 이미지 sha256 hash 기반 dedup 이 가장 정확
--
-- 멱등 (IF NOT EXISTS)
-- ============================================================

SET @col_exists := 0;

-- image_hash
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expense_receipts' AND COLUMN_NAME = 'image_hash';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE expense_receipts ADD COLUMN image_hash CHAR(64) NULL COMMENT "영수증 이미지 sha256 — dedup"',
  'SELECT "image_hash exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 인덱스 (검색 최적화)
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expense_receipts' AND INDEX_NAME = 'idx_receipts_image_hash';
SET @sql := IF(@col_exists = 0,
  'CREATE INDEX idx_receipts_image_hash ON expense_receipts(user_id, image_hash)',
  'SELECT "idx_receipts_image_hash exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 검증
SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expense_receipts' AND COLUMN_NAME = 'image_hash';
