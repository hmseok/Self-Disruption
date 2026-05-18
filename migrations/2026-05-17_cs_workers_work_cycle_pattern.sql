-- ═══════════════════════════════════════════════════════════════════
-- N-56 — 워커별 비균등 cycle 패턴 (work_cycle_pattern CSV)
--   2026-05-17 sukhomin87@gmail.com
--
-- 사용자 결정:
--   "정동민씨를 1근무 2휴무 1근무 4휴무 로설정이 가능하게 해야할것같아"
--   → CSV 표현: '1,2,1,4'
--   - 짝수 index (0, 2, 4...) = 근무 일수
--   - 홀수 index (1, 3, 5...) = 휴무 일수
--   - 전체 cycle = sum(values)
--
-- 운영 예시:
--   정동민 work_cycle_pattern = '1,2,1,4' (전체 8일 cycle)
--   start_date 2026-06-01:
--     06-01 (1근무) → 06-02~03 (2휴무) → 06-04 (1근무) → 06-05~08 (4휴무) → 06-09 다시 시작
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- [STEP 1] cs_workers.work_cycle_pattern
SET @col1 := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
                AND COLUMN_NAME = 'work_cycle_pattern');
SET @s1 := IF(@col1 = 0,
  'ALTER TABLE cs_workers ADD COLUMN work_cycle_pattern VARCHAR(64) DEFAULT NULL COMMENT ''비균등 cycle CSV — 예: 1,2,1,4 (근무,휴무,근무,휴무)''',
  'SELECT ''work_cycle_pattern already exists''');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- [STEP 2] cs_workers.work_cycle_start_date
SET @col2 := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
                AND COLUMN_NAME = 'work_cycle_start_date');
SET @s2 := IF(@col2 = 0,
  'ALTER TABLE cs_workers ADD COLUMN work_cycle_start_date DATE DEFAULT NULL COMMENT ''cycle 기준 시작일''',
  'SELECT ''work_cycle_start_date already exists''');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- 검증
-- SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME = 'cs_workers'
--   AND COLUMN_NAME IN ('work_cycle_pattern', 'work_cycle_start_date');
