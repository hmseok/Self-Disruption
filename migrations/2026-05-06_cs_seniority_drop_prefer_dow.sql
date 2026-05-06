-- ═══════════════════════════════════════════════════════════════════
-- PR-2SS-d revert + PR-2SS-g
--
-- 1) cs_shift_slots.min_seniority_months DROP — 매니저 직접 판단 (사용자 결정)
-- 2) cs_workers.preferred_dow_prefer 신설 — 희망 요일 (Hard ranking 가산)
--
-- 운영 사실:
--   매니저가 신입 야간 직접 판단하므로 hard rule (min_seniority_months) 폐기.
--   대신 워커 차원 "희망 근무일" 신설 — 매치 시 ranking 2순위로 우선 배정.
--   비희망 (preferred_dow_avoid) 와 대칭 — 둘 다 워커 차원 정책.
--
-- ranking 정렬 변경:
--   1. priority_level ASC
--   2. preferred_dow_prefer 매치 (NEW — 매치 우선)
--   3. preferred_dow_avoid 매치 (기존 — 후순위)
--   4. required 미달 우선
--   5. by_dow ASC
--   6. total ASC
--   7. last_date 거리 DESC
--
-- 멱등 적용 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════════════

-- 1) cs_shift_slots.min_seniority_months DROP
SET @c1 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_shift_slots' AND column_name = 'min_seniority_months');
SET @s1 := IF(@c1 > 0,
  'ALTER TABLE cs_shift_slots DROP COLUMN min_seniority_months',
  'SELECT 1');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- 2) cs_workers.preferred_dow_prefer 신설
SET @c2 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'preferred_dow_prefer');
SET @s2 := IF(@c2 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN preferred_dow_prefer VARCHAR(16) NULL
    COMMENT '희망 요일 (0=일,1=월...6=토 콤마 구분) — 매치 시 ranking 우선'
    AFTER preferred_dow_avoid",
  'SELECT 1');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- ─── 검증 SQL ────────────────────────────────────────────────────────
-- DESCRIBE cs_shift_slots;
--   기대치: min_seniority_months 컬럼 없음
-- DESCRIBE cs_workers;
--   기대치: preferred_dow_prefer VARCHAR(16) NULL

-- ─── 롤백 ────────────────────────────────────────────────────────────
-- ALTER TABLE cs_workers DROP COLUMN preferred_dow_prefer;
-- ALTER TABLE cs_shift_slots ADD COLUMN min_seniority_months TINYINT NOT NULL DEFAULT 0
--   COMMENT '최소 근무 경력 (개월) — 0=제약 없음, 야간 디폴트 6';
-- UPDATE cs_shift_slots SET min_seniority_months = 6 WHERE is_overnight = 1;
