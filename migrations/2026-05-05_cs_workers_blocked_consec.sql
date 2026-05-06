-- ═══════════════════════════════════════════════════════════════════
-- PR-2SS-c — cs_workers.max_consecutive_work_days + blocked_slot_ids
--
-- 운영 사실 (Rule 25):
--   · 연속 야간 한도: slot.max_consecutive_days 가 슬롯 차원 한도 (PR-2SS-b 신설, 야간 디폴트 3)
--   · 워커별 연속 근무 한도: NULL (운영 정책 X) — 향후 매니저가 직접 설정 가능
--   · 슬롯 거부: 특정 워커가 절대 안 들어가는 슬롯 ID 리스트 (예: 신입은 야간 X 보다 강한 hard 룰)
--
-- 알고리즘:
--   workerConsecutiveDays Map — 일자 루프 중 누적
--     · 선택되면 ++  /  미선택일 = 리셋 0
--     · 선택 직전 (counter, slot.max, worker.max) 셋 다 OK 검사
--   blocked_slot_ids — 후보 필터에서 hard exclude
--
-- 멱등 적용 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════════════

-- 1) max_consecutive_work_days
SET @c1 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'max_consecutive_work_days');
SET @s1 := IF(@c1 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN max_consecutive_work_days TINYINT NULL
    COMMENT '워커별 연속 근무 한도 (NULL=무제한, slot.max_consecutive_days 와 둘 중 작은 값 적용)'
    AFTER max_days_per_month",
  'SELECT 1');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- 2) blocked_slot_ids JSON
SET @c2 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'blocked_slot_ids');
SET @s2 := IF(@c2 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN blocked_slot_ids JSON NULL
    COMMENT '절대 안 들어가는 슬롯 ID 배열 (예: [\"L13-id\"] = 야간 거부)'
    AFTER max_consecutive_work_days",
  'SELECT 1');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- ─── 검증 SQL ────────────────────────────────────────────────────────
-- DESCRIBE cs_workers;
--   기대치: max_consecutive_work_days TINYINT NULL
--           blocked_slot_ids JSON NULL
-- SELECT name, max_consecutive_work_days, blocked_slot_ids FROM cs_workers WHERE name='박지훈';

-- ─── 롤백 ────────────────────────────────────────────────────────────
-- ALTER TABLE cs_workers DROP COLUMN blocked_slot_ids;
-- ALTER TABLE cs_workers DROP COLUMN max_consecutive_work_days;
