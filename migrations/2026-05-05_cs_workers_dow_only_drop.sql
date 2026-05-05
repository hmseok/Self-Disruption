-- ═══════════════════════════════════════════════════════════════════
-- PR-2QQ-d-revert — preferred_dow_only 컬럼 폐기
--
-- 운영 사실 (Rule 25): 17개월 데이터 분석 결과 dow_only (요일 한정)
-- 사용 사례 없음. 정동민 같은 외부 워커도 cycle 모델로 충분.
-- 컬럼 데이터 비어있어 안전하게 DROP.
--
-- 또 cycle 의미는 코드에서 반전 (외부 근무 일정으로 의미 변경):
--   cycle on phase = 외부 근무 (당사 X)
--   cycle off phase = 외부 휴무 (당사 가능)
-- 컬럼 자체는 그대로 사용.
--
-- 멱등 적용 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════════════

SET @c1 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'preferred_dow_only');
SET @s1 := IF(@c1 > 0,
  'ALTER TABLE cs_workers DROP COLUMN preferred_dow_only',
  'SELECT 1');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- ─── 검증 ────────────────────────────────────────────────────────────
-- DESCRIBE cs_workers;
-- 기대치: preferred_dow_only 없음
-- cycle_days_on / cycle_days_off / cycle_start_date 는 그대로 (의미 반전은 코드만)

-- ─── 롤백 ────────────────────────────────────────────────────────────
-- ALTER TABLE cs_workers ADD COLUMN preferred_dow_only VARCHAR(16) NULL
--   COMMENT '한정 요일' AFTER cycle_start_date;
