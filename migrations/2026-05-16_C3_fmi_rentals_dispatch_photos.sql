-- ════════════════════════════════════════════════════════════════════
-- PR-C3 — fmi_rentals 출고 정보 컬럼 추가
-- 2026-05-16 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 명시 (2026-05-16):
--   「출고시에는 차량사진들과 특이사항메모가 꼭필요하고」
--
-- 추가 컬럼:
--   dispatch_photos       JSON  — 출고 차량 사진 URL 배열 (GCS public URL)
--   dispatch_memo         TEXT  — 출고 특이사항 메모
--
-- 기존 컬럼 활용:
--   dispatch_mileage      INT   — 출고 주행거리 (이미 존재)
--   return_photos         JSON  — 반납 사진 (이미 존재 — 출고와 별개)
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행.
-- ⚠ Rule 24 — 멱등 가드 (information_schema 체크).
-- ════════════════════════════════════════════════════════════════════

-- ── dispatch_photos (JSON) ──
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'fmi_rentals'
     AND column_name = 'dispatch_photos'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE fmi_rentals ADD COLUMN dispatch_photos JSON NULL DEFAULT NULL',
  'SELECT "fmi_rentals.dispatch_photos already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── dispatch_memo (TEXT) ──
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'fmi_rentals'
     AND column_name = 'dispatch_memo'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE fmi_rentals ADD COLUMN dispatch_memo TEXT NULL DEFAULT NULL',
  'SELECT "fmi_rentals.dispatch_memo already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 검증 (단독 실행) ──
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = DATABASE() AND table_name = 'fmi_rentals'
--      AND column_name IN ('dispatch_photos', 'dispatch_memo');
--   -- 기대: 2 rows
