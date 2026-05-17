-- ═══════════════════════════════════════════════════════════════════
-- N-32 — cs_shift_groups.include_holidays_extra 컬럼 추가
--   2026-05-17 sukhomin87@gmail.com
--
-- 사용자 의도: "기존 커스텀 요일 근무인데 거기서 공휴일도 근무하는걸로 둘 중 하나만
--               선택이 가능해서 별도로 그룹을 또 셋팅해야 하니"
--
-- 효과:
--   · 패턴 매칭 X 라도 공휴일이면 추가 매칭 → 출근
--   · 예: pattern='custom' (토일만) + include_holidays_extra=1 → 토일 + 모든 공휴일 출근
--   · skip_on_holidays=1 + include_holidays_extra=1 동시 설정 시 → include 우선 (휴일 출근)
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- [STEP 1] include_holidays_extra 컬럼 추가 (멱등)
-- ──────────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
               AND COLUMN_NAME = 'include_holidays_extra');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_shift_groups ADD COLUMN include_holidays_extra TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''공휴일 추가 출근 — 패턴 매칭 외에도 휴일이면 추가 매칭''',
  'SELECT ''include_holidays_extra already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT (적용 후)
-- ═══════════════════════════════════════════════════════════════════
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
--   AND COLUMN_NAME = 'include_holidays_extra';

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_shift_groups DROP COLUMN include_holidays_extra;
