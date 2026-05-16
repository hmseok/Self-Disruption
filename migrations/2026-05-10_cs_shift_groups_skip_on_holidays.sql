-- ═══════════════════════════════════════════════════════════════════
-- cs_shift_groups — 그룹별 휴일 제외 옵션 (skip_on_holidays)
--   2026-05-10 sukhomin87@gmail.com
--
-- 사용자 의도: "주중 근무자들이 휴일은 빠져야 되는데 설정이 없다.
--               휴일 설정에서 휴일로 들어간 것에는 빠지도록 추가.
--               다른 근무 그룹은 휴일에도 일할 수 있게 셋팅."
--
-- 효과:
--   · 주중 그룹 (예: 09:00~18:00 주4) → skip_on_holidays=1 → 자동 생성 시 cs_holidays 일자 후보 제외
--   · 야간 / 특수 그룹 → skip_on_holidays=0 → 휴일에도 정상 배정 (24/365 콜센터)
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- [STEP 1] cs_shift_groups.skip_on_holidays 컬럼 추가 (멱등)
-- ──────────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
               AND COLUMN_NAME = 'skip_on_holidays');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_shift_groups ADD COLUMN skip_on_holidays TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''휴일(cs_holidays) 자동 제외 여부 — 주중 근무 그룹은 1''',
  'SELECT ''skip_on_holidays already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT (적용 후)
-- ═══════════════════════════════════════════════════════════════════
-- 1) 컬럼 추가 확인 (기대: 1 row)
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
--   AND COLUMN_NAME = 'skip_on_holidays';

-- 2) 디폴트 값 확인 (기대: 모두 0)
-- SELECT name, skip_on_holidays FROM cs_shift_groups LIMIT 20;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_shift_groups DROP COLUMN skip_on_holidays;
