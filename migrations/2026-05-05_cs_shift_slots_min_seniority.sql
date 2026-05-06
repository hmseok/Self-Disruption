-- ═══════════════════════════════════════════════════════════════════
-- PR-2SS-d — cs_shift_slots.min_seniority_months
--
-- 운영 사실 (Rule 25): 신입은 야간 안 보냄 (운영 정책).
--   slot.min_seniority_months 가 있으면, 그 슬롯에 들어가려면
--   ride_employees.hire_date 기준 경력이 N개월 이상이어야 함.
--   경력 모르면 (hire_date NULL) 후보 X (안전).
--
-- 시드: is_overnight=1 슬롯 → 디폴트 6개월
-- 멱등 적용 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════════════

SET @c1 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_shift_slots' AND column_name = 'min_seniority_months');
SET @s1 := IF(@c1 = 0,
  "ALTER TABLE cs_shift_slots
    ADD COLUMN min_seniority_months TINYINT NOT NULL DEFAULT 0
    COMMENT '최소 근무 경력 (개월) — 0=제약 없음, 야간 디폴트 6'
    AFTER max_consecutive_days",
  'SELECT 1');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- 시드 — 야간 슬롯에 6개월 디폴트 (이미 손댄 row 보존)
UPDATE cs_shift_slots
   SET min_seniority_months = 6
 WHERE is_overnight = 1
   AND (min_seniority_months IS NULL OR min_seniority_months = 0);

-- ─── 검증 SQL ────────────────────────────────────────────────────────
-- DESCRIBE cs_shift_slots;
--   기대치: min_seniority_months TINYINT NOT NULL DEFAULT 0
-- SELECT code, label, is_overnight, min_seniority_months
--   FROM cs_shift_slots WHERE is_overnight = 1;
--   기대치: 야간 슬롯 → 6

-- ─── 롤백 ────────────────────────────────────────────────────────────
-- ALTER TABLE cs_shift_slots DROP COLUMN min_seniority_months;
