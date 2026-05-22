-- ════════════════════════════════════════════════════════════════════
-- PR-N3b — fmi_rentals 플릿 그룹 컬럼
-- 2026-05-22 (trusting-relaxed-keller / operations 세션)
--
-- 배경: 현재 fleet_group 은 API 에서 cars.ownership_type 별칭으로 파생.
--   엑셀 「빌려타」 import 행은 별도 ledger 구분이 필요한데, 차량의
--   ownership_type 과는 별개 개념(어느 장부 소속인가) 이라 rental 자체에
--   저장하는 것이 정합. API 는 COALESCE(r.fleet_group, v.ownership_type) 로
--   기존 행 하위호환 유지.
--
-- 추가 컬럼:
--   fleet_group  VARCHAR(30)  — 장부 그룹 (빌려타 등)
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행.
-- ⚠ Rule 24 — 멱등 가드 (information_schema 체크).
--
-- 실행:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-22_N3b_fmi_rentals_fleet_group.sql
-- ════════════════════════════════════════════════════════════════════

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'fmi_rentals'
     AND column_name = 'fleet_group'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE fmi_rentals ADD COLUMN fleet_group VARCHAR(30) NULL DEFAULT NULL COMMENT ''장부 그룹: 빌려타 등''',
  'SELECT "fmi_rentals.fleet_group already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 검증 (단독 실행) ──
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = DATABASE() AND table_name = 'fmi_rentals'
--      AND column_name = 'fleet_group';
--   -- 기대: 1 row
