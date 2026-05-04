-- ═══════════════════════════════════════════════════════════════════
-- PR-2QQ-d-3 — cs_workers 패턴 모델 (cycle + 요일 한정)
--
-- 운영 사실 (Rule 25):
--   외부 직원 정동민의 2-on-2-off 패턴을 자동 생성에 직접 반영.
--   요일 기반 패턴 (예: 월·수·금만 근무) 도 동일 모델로 지원.
--
-- 추가 컬럼:
--   cycle_days_on        ← 연속 근무일 (예: 2)
--   cycle_days_off       ← 연속 휴무일 (예: 2)
--   cycle_start_date     ← 사이클 1일차 (기준일)
--   preferred_dow_only   ← '1,3,5' = 월수금만 근무 (avoid 와 의미 다름)
--
-- 기존 preferred_dow_avoid: 후순위 (가능하면 피함)
-- 신규 preferred_dow_only: 절대 한정 (다른 요일 후보 X)
--
-- 멱등 적용 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════════════

-- 1) cycle_days_on
SET @c1 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'cycle_days_on');
SET @s1 := IF(@c1 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN cycle_days_on TINYINT NULL
    COMMENT '연속 근무일 (cycle 패턴)'
    AFTER work_pattern_text",
  'SELECT 1');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- 2) cycle_days_off
SET @c2 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'cycle_days_off');
SET @s2 := IF(@c2 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN cycle_days_off TINYINT NULL
    COMMENT '연속 휴무일 (cycle 패턴)'
    AFTER cycle_days_on",
  'SELECT 1');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- 3) cycle_start_date
SET @c3 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'cycle_start_date');
SET @s3 := IF(@c3 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN cycle_start_date DATE NULL
    COMMENT 'cycle 사이클 1일차 (기준일)'
    AFTER cycle_days_off",
  'SELECT 1');
PREPARE st3 FROM @s3; EXECUTE st3; DEALLOCATE PREPARE st3;

-- 4) preferred_dow_only
SET @c4 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'preferred_dow_only');
SET @s4 := IF(@c4 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN preferred_dow_only VARCHAR(16) NULL
    COMMENT '한정 요일 (예: 1,3,5 = 월수금만 근무)'
    AFTER cycle_start_date",
  'SELECT 1');
PREPARE st4 FROM @s4; EXECUTE st4; DEALLOCATE PREPARE st4;

-- ─── 검증 ────────────────────────────────────────────────────────────
-- DESCRIBE cs_workers;
--   기대치: cycle_days_on / cycle_days_off / cycle_start_date / preferred_dow_only
--
-- 정동민 패턴 입력 예시:
-- UPDATE cs_workers
--   SET cycle_days_on = 2, cycle_days_off = 2, cycle_start_date = '2026-05-01'
--   WHERE name = '정동민';

-- ─── 롤백 ────────────────────────────────────────────────────────────
-- ALTER TABLE cs_workers DROP COLUMN preferred_dow_only;
-- ALTER TABLE cs_workers DROP COLUMN cycle_start_date;
-- ALTER TABLE cs_workers DROP COLUMN cycle_days_off;
-- ALTER TABLE cs_workers DROP COLUMN cycle_days_on;
