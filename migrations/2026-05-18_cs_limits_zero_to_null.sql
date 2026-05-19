-- ═══════════════════════════════════════════════════════════════════
-- N-58 — limit 컬럼 0 → NULL 정규화
--   2026-05-18 sukhomin87@gmail.com
--
-- 사용자 보고:
--   "빈 칸이면 미설정이죠 0이 되면 안 되죠"
--   → 정동민 max_days_per_month=0 으로 자동 생성 시 매월 1회만 출근 발생
--
-- 원인: 옛 마이그 또는 초기 데이터에서 limit 컬럼이 0 으로 셋팅
--       UI 「빈 칸 = 무제한」 이지만 DB 에 0 누적
--       알고리즘이 0 ≤ counter 비교 → 매번 hard exclude
--
-- 결정: 0 = NULL 동의어 (의미 없음). NULL 로 통일.
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- [STEP 1] cs_workers — 0 값 NULL 로 정규화
UPDATE cs_workers SET max_days_per_month       = NULL WHERE max_days_per_month       = 0;
UPDATE cs_workers SET max_consecutive_work_days = NULL WHERE max_consecutive_work_days = 0;

-- min_days_per_month 컬럼 graceful (N-36)
SET @has_min := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'cs_workers'
                   AND COLUMN_NAME = 'min_days_per_month');
SET @s := IF(@has_min > 0,
  'UPDATE cs_workers SET min_days_per_month = NULL WHERE min_days_per_month = 0',
  'SELECT ''min_days_per_month column absent — skip''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- [STEP 2] cs_group_members — 0 값 NULL 로 정규화
UPDATE cs_group_members SET max_days_per_month       = NULL WHERE max_days_per_month       = 0;
UPDATE cs_group_members SET max_consecutive_work_days = NULL WHERE max_consecutive_work_days = 0;

-- [STEP 3] DEFAULT 보장 (이미 NULL 이면 no-op)
SET @s := 'ALTER TABLE cs_workers MODIFY COLUMN max_days_per_month INT DEFAULT NULL';
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := 'ALTER TABLE cs_workers MODIFY COLUMN max_consecutive_work_days INT DEFAULT NULL';
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 검증
-- SELECT id, name,
--        max_days_per_month, max_consecutive_work_days
-- FROM cs_workers WHERE name = '정동민';
-- 기대치: 두 컬럼 모두 NULL
