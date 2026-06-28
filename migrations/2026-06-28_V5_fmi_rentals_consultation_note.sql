-- V5 (2026-06-28) — fmi_rentals.consultation_note 추가
-- 상담 내용(메모와 분리). 배차 상세페이지 '💬 상담 내용' 섹션에서 편집.
-- 멱등: 이미 있으면 skip (재실행 안전). MySQL 8.x (ADD COLUMN IF NOT EXISTS 미지원 → @col_exists 패턴).

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fmi_rentals'
    AND COLUMN_NAME = 'consultation_note'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE fmi_rentals ADD COLUMN consultation_note TEXT NULL COMMENT ''상담 내용(메모와 분리)''',
  'SELECT ''consultation_note already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 검증: 아래가 1 이면 적용 완료
-- SELECT COUNT(*) FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='fmi_rentals' AND COLUMN_NAME='consultation_note';
