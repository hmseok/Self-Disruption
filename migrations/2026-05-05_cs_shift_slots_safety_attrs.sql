-- ═══════════════════════════════════════════════════════════════════
-- PR-2SS-b — cs_shift_slots 안전 가드 컬럼 추가
--
-- 운영 사실 (Rule 25 — 2026-05-05 사용자 인터뷰):
--   · 야간 가산율: 없음
--   · 연속 야간 한도: 회사 규정 X / 운영 기본 3일
--   · 야간 종료 후 휴식: 자연 16시간
--   · 휴일 야간 특수 인원: 구분 없음
--   · 신입 야간 금지: 운영 정책 (PR-2SS-d 에서 시드)
--
-- 본 PR (b): 익일 휴식 + 연속 한도 컬럼만 신설.
--   PR-2SS-c 에서 max_consecutive_days 알고리즘 활용.
--   PR-2SS-b 알고리즘은 next_day_blocking_hours 만 사용.
--
-- 멱등 적용 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════════════

-- 1) next_day_blocking_hours — 종료 후 N시간 안에 다른 슬롯 시작 금지
SET @c1 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_shift_slots' AND column_name = 'next_day_blocking_hours');
SET @s1 := IF(@c1 = 0,
  "ALTER TABLE cs_shift_slots
    ADD COLUMN next_day_blocking_hours TINYINT NOT NULL DEFAULT 0
    COMMENT '종료 후 N시간 안 다른 슬롯 시작 금지 (0=제약 없음, 야간 16h 권장)'
    AFTER is_overnight",
  'SELECT 1');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- 2) max_consecutive_days — 연속 N일 한도 (PR-2SS-c 활용 예정)
SET @c2 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_shift_slots' AND column_name = 'max_consecutive_days');
SET @s2 := IF(@c2 = 0,
  "ALTER TABLE cs_shift_slots
    ADD COLUMN max_consecutive_days TINYINT NULL
    COMMENT '연속 N일 한도 (NULL=무제한, 야간 3일 권장)'
    AFTER next_day_blocking_hours",
  'SELECT 1');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- 3) 시드 — 야간(overnight) 슬롯에 운영 디폴트 16h / 3일 적용
--    조건: is_overnight=1 AND 두 컬럼이 디폴트(0/NULL) 인 row 만 (이미 매니저가 손댔으면 보존)
UPDATE cs_shift_slots
   SET next_day_blocking_hours = 16
 WHERE is_overnight = 1
   AND (next_day_blocking_hours IS NULL OR next_day_blocking_hours = 0);

UPDATE cs_shift_slots
   SET max_consecutive_days = 3
 WHERE is_overnight = 1
   AND max_consecutive_days IS NULL;

-- ─── 검증 SQL ────────────────────────────────────────────────────────
-- DESCRIBE cs_shift_slots;
--   기대치: next_day_blocking_hours TINYINT NOT NULL DEFAULT 0
--           max_consecutive_days TINYINT NULL
-- SELECT code, label, is_overnight, next_day_blocking_hours, max_consecutive_days
--   FROM cs_shift_slots WHERE is_overnight = 1;
--   기대치: L13 (또는 야간 슬롯) → 16h / 3일

-- ─── 롤백 ────────────────────────────────────────────────────────────
-- ALTER TABLE cs_shift_slots DROP COLUMN max_consecutive_days;
-- ALTER TABLE cs_shift_slots DROP COLUMN next_day_blocking_hours;
