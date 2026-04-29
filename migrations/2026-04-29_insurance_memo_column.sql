-- ═══════════════════════════════════════════════════════════════════
-- insurance_contracts.memo 컬럼 추가
-- 2026-04-29 (보충)
--
-- 사유: /api/insurance POST 가 memo 컬럼 INSERT 사용했으나 테이블에 미존재
-- 증상: Error 1054: Unknown column 'memo' in 'field list'
-- ═══════════════════════════════════════════════════════════════════

SET @c := (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_schema=DATABASE() AND table_name='insurance_contracts' AND column_name='memo');
SET @s := IF(@c=0,
  'ALTER TABLE insurance_contracts ADD COLUMN memo TEXT NULL COMMENT "사용자 메모 / OCR 출처 등"',
  'SELECT "memo column already exists" AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
