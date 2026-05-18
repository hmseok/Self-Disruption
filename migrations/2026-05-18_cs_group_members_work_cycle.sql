-- ═══════════════════════════════════════════════════════════════════
-- N-56-b — work_cycle_pattern 그룹멤버 레벨로 이동
--   2026-05-18 sukhomin87@gmail.com
--
-- 사용자 결정:
--   "워커 로 불규칙 셋팅하면 안되고 그룹으로 해야할것같은데
--    정동민은 부엉이,달빛 둘다 들어가고 패턴은 같지만 출발일을 다르게 가져갈거라서
--    워커에는 2&2 외부패턴만 남아있는게 맞네"
--   "외부일정은 2^2 고정이면 나머지 근무가능일에 일하면서
--    그안에서 새로운 패턴을 그룹에 셋팅하는거고"
--
-- 결과: 워커 글로벌 cycle (외부 2,2) + 그룹멤버 cycle (당사 1,2,1,4) 분리
--   - 외부 cycle (cs_workers.cycle_days_on/off) — 다른 회사 일정, 글로벌 hard exclude
--   - 그룹 cycle (cs_group_members.work_cycle_pattern) — 당사 가능일 내 그룹별 패턴
--   - 같은 워커가 부엉이/달빛 등 여러 그룹에 들어가도 그룹마다 다른 출발일 가능
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- [STEP 1] cs_group_members.work_cycle_pattern (멱등)
SET @col1 := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
                AND COLUMN_NAME = 'work_cycle_pattern');
SET @s1 := IF(@col1 = 0,
  'ALTER TABLE cs_group_members ADD COLUMN work_cycle_pattern VARCHAR(64) DEFAULT NULL COMMENT ''N-56-b 그룹멤버 비균등 cycle — 예: 1,2,1,4 (근무,휴무,근무,휴무)''',
  'SELECT ''work_cycle_pattern (group_members) already exists''');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- [STEP 2] cs_group_members.work_cycle_start_date
SET @col2 := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
                AND COLUMN_NAME = 'work_cycle_start_date');
SET @s2 := IF(@col2 = 0,
  'ALTER TABLE cs_group_members ADD COLUMN work_cycle_start_date DATE DEFAULT NULL COMMENT ''N-56-b cycle 기준 시작일 (그룹마다 다른 출발일 가능)''',
  'SELECT ''work_cycle_start_date (group_members) already exists''');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- N-56 (워커 레벨) 컬럼은 graceful 유지 — 즉시 drop X
--   향후 N-56-c 에서 데이터 마이그 확인 후 drop 결정
--   cs_workers.work_cycle_pattern / work_cycle_start_date 는 사용 안 됨 (API/UI 에서 제거)

-- 검증
-- SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME = 'cs_group_members'
--   AND COLUMN_NAME IN ('work_cycle_pattern', 'work_cycle_start_date');
