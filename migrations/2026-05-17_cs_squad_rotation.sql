-- ═══════════════════════════════════════════════════════════════════
-- N-55 — A/B조 cycle 로테이션 (조원수 × N일)
--   2026-05-17 sukhomin87@gmail.com
--
-- 사용자 결정:
--   "A조 워커 한바퀴 돌면 B조 스타트"
--   "조원수 × N일 (각자 N일씩)"
--
-- 운영 예시 (부엉이):
--   A조: [윤민진(5일), 전유하(5일), 전정연(5일)] = 15일
--   B조: [정동민(5일), 백업(5일)] = 10일
--   전체 cycle = 25일 → 반복
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- [STEP 1] cs_shift_groups.cycle_kind (이미 존재 시 skip)
SET @col1 := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
                AND COLUMN_NAME = 'cycle_kind');
SET @s1 := IF(@col1 = 0,
  'ALTER TABLE cs_shift_groups ADD COLUMN cycle_kind VARCHAR(20) DEFAULT NULL COMMENT ''cycle 종류 — squad_rotation | NULL''',
  'SELECT ''cycle_kind already exists''');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- [STEP 2] cs_shift_groups.cycle_days_per_member
SET @col2 := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
                AND COLUMN_NAME = 'cycle_days_per_member');
SET @s2 := IF(@col2 = 0,
  'ALTER TABLE cs_shift_groups ADD COLUMN cycle_days_per_member INT DEFAULT NULL COMMENT ''A/B조 cycle 시 각 멤버 연속 일수''',
  'SELECT ''cycle_days_per_member already exists''');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- [STEP 3] cs_shift_groups.cycle_start_date
SET @col3 := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
                AND COLUMN_NAME = 'cycle_start_date');
SET @s3 := IF(@col3 = 0,
  'ALTER TABLE cs_shift_groups ADD COLUMN cycle_start_date DATE DEFAULT NULL COMMENT ''cycle 기준 시작일 (없으면 created_at)''',
  'SELECT ''cycle_start_date already exists''');
PREPARE st3 FROM @s3; EXECUTE st3; DEALLOCATE PREPARE st3;

-- [STEP 4] cs_group_members.squad (이미 존재 시 skip)
SET @col4 := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
                AND COLUMN_NAME = 'squad');
SET @s4 := IF(@col4 = 0,
  'ALTER TABLE cs_group_members ADD COLUMN squad VARCHAR(1) DEFAULT NULL COMMENT ''소속 조 A/B (squad_rotation 시)''',
  'SELECT ''squad already exists''');
PREPARE st4 FROM @s4; EXECUTE st4; DEALLOCATE PREPARE st4;

-- [STEP 5] cs_group_members.squad_order
SET @col5 := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
                AND COLUMN_NAME = 'squad_order');
SET @s5 := IF(@col5 = 0,
  'ALTER TABLE cs_group_members ADD COLUMN squad_order INT DEFAULT NULL COMMENT ''조 안 순서 (1, 2, 3...)''',
  'SELECT ''squad_order already exists''');
PREPARE st5 FROM @s5; EXECUTE st5; DEALLOCATE PREPARE st5;

-- 검증
-- SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND ((TABLE_NAME = 'cs_shift_groups' AND COLUMN_NAME IN ('cycle_kind','cycle_days_per_member','cycle_start_date'))
--     OR (TABLE_NAME = 'cs_group_members' AND COLUMN_NAME IN ('squad','squad_order')));
