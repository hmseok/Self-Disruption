-- ═══════════════════════════════════════════════════════════════════
-- PR-2SS-e — 시간 분해 (day/night) + 가산율
--
-- 운영 사실 (Rule 25): 야간 가산율 없음 (현재). 향후 노동법 / 정책 변경 시
--   night_premium_rate > 0 으로 매니저가 직접 설정 가능. 지금은 KPI 보조용.
--
-- 추가 컬럼:
--   cs_shift_slots:
--     · night_period_start TIME — 가산 시간대 시작 (예: 22:00:00, NULL=가산 없음)
--     · night_period_end   TIME — 가산 시간대 종료 (예: 06:00:00, 자정 넘으면 익일)
--     · night_premium_rate DECIMAL(4,2) DEFAULT 0 — 가산율 (0.50 = 50%)
--   cs_assignments:
--     · day_hours     DECIMAL(4,2) NULL — 일반 시간
--     · night_hours   DECIMAL(4,2) NULL — 가산 시간대
--     · premium_hours DECIMAL(4,2) NULL — 가산 적용 후 (= night × rate)
--     기존 computed_hours = day + night 호환 유지.
--
-- 멱등 적용 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════════════

-- 1) cs_shift_slots.night_period_start
SET @c1 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_shift_slots' AND column_name = 'night_period_start');
SET @s1 := IF(@c1 = 0,
  "ALTER TABLE cs_shift_slots
    ADD COLUMN night_period_start TIME NULL
    COMMENT '가산 시간대 시작 (예: 22:00:00, NULL=가산 없음)'
    AFTER min_seniority_months",
  'SELECT 1');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- 2) cs_shift_slots.night_period_end
SET @c2 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_shift_slots' AND column_name = 'night_period_end');
SET @s2 := IF(@c2 = 0,
  "ALTER TABLE cs_shift_slots
    ADD COLUMN night_period_end TIME NULL
    COMMENT '가산 시간대 종료 (예: 06:00:00, NULL=가산 없음)'
    AFTER night_period_start",
  'SELECT 1');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- 3) cs_shift_slots.night_premium_rate
SET @c3 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_shift_slots' AND column_name = 'night_premium_rate');
SET @s3 := IF(@c3 = 0,
  "ALTER TABLE cs_shift_slots
    ADD COLUMN night_premium_rate DECIMAL(4,2) NOT NULL DEFAULT 0.00
    COMMENT '가산율 (0.50 = 50% 가산, 0=가산 없음)'
    AFTER night_period_end",
  'SELECT 1');
PREPARE st3 FROM @s3; EXECUTE st3; DEALLOCATE PREPARE st3;

-- 4) cs_assignments.day_hours
SET @c4 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_assignments' AND column_name = 'day_hours');
SET @s4 := IF(@c4 = 0,
  "ALTER TABLE cs_assignments
    ADD COLUMN day_hours DECIMAL(4,2) NULL
    COMMENT '일반 시간 (computed_hours 에서 야간 시간 분리)'
    AFTER computed_hours",
  'SELECT 1');
PREPARE st4 FROM @s4; EXECUTE st4; DEALLOCATE PREPARE st4;

-- 5) cs_assignments.night_hours
SET @c5 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_assignments' AND column_name = 'night_hours');
SET @s5 := IF(@c5 = 0,
  "ALTER TABLE cs_assignments
    ADD COLUMN night_hours DECIMAL(4,2) NULL
    COMMENT '가산 시간대 (slot.night_period_start ~ end 와 슬롯 시간 교집합)'
    AFTER day_hours",
  'SELECT 1');
PREPARE st5 FROM @s5; EXECUTE st5; DEALLOCATE PREPARE st5;

-- 6) cs_assignments.premium_hours
SET @c6 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_assignments' AND column_name = 'premium_hours');
SET @s6 := IF(@c6 = 0,
  "ALTER TABLE cs_assignments
    ADD COLUMN premium_hours DECIMAL(4,2) NULL
    COMMENT '가산 적용 후 시간 (= night_hours × slot.night_premium_rate)'
    AFTER night_hours",
  'SELECT 1');
PREPARE st6 FROM @s6; EXECUTE st6; DEALLOCATE PREPARE st6;

-- ─── 검증 SQL ────────────────────────────────────────────────────────
-- DESCRIBE cs_shift_slots;
--   기대치: night_period_start TIME / night_period_end TIME / night_premium_rate DECIMAL(4,2)
-- DESCRIBE cs_assignments;
--   기대치: day_hours / night_hours / premium_hours DECIMAL(4,2)

-- ─── 롤백 ────────────────────────────────────────────────────────────
-- ALTER TABLE cs_assignments DROP COLUMN premium_hours;
-- ALTER TABLE cs_assignments DROP COLUMN night_hours;
-- ALTER TABLE cs_assignments DROP COLUMN day_hours;
-- ALTER TABLE cs_shift_slots DROP COLUMN night_premium_rate;
-- ALTER TABLE cs_shift_slots DROP COLUMN night_period_end;
-- ALTER TABLE cs_shift_slots DROP COLUMN night_period_start;
