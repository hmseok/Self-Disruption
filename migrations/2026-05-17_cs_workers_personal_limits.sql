-- ═══════════════════════════════════════════════════════════════════
-- N-29-a — cs_workers 에 개인 한계 컬럼 추가 (워커 마스터 분리)
--   2026-05-17 sukhomin87@gmail.com
--
-- 사용자 의도: "그룹 하위에 워커별 셋팅은 여러 그룹에 소속된 경우 따로 적용되나요?
--               그룹에서 하는게 맞나? 개인 워커 설정에서 하는게 맞나"
--
-- 결정: 「개인 한계」 (연속 한도, 월 최대 일수, 슬롯 거부, 희망/비선호 요일) 는
--      워커 단위 (cs_workers) 로 이동. cs_group_members 의 「역할 / sequence 시작」 만 유지.
--
-- 마이그 전략:
--   1. cs_workers 에 5 컬럼 추가 (멱등)
--   2. 기존 cs_group_members 의 값 워커별 최대값 백필 (옵션 — 수동 실행)
--   3. cs_group_members 의 컬럼은 유지 — 알고리즘에서 워커 cfg 우선, 그룹 fallback (backward compat)
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- [STEP 1] cs_workers 에 개인 한계 5 컬럼 추가 (멱등)
-- ──────────────────────────────────────────────────────────────

-- max_consecutive_work_days
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'max_consecutive_work_days');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_workers ADD COLUMN max_consecutive_work_days INT NULL COMMENT ''연속 근무 한도 (개인 한계) — NULL=무제한''',
  'SELECT ''max_consecutive_work_days already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- max_days_per_month
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'max_days_per_month');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_workers ADD COLUMN max_days_per_month INT NULL COMMENT ''월 최대 일수 (개인 한계) — 모든 그룹 합산. NULL=무제한''',
  'SELECT ''max_days_per_month already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- blocked_slot_ids (JSON 배열 텍스트)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'blocked_slot_ids');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_workers ADD COLUMN blocked_slot_ids TEXT NULL COMMENT ''거부 슬롯 id 배열 JSON — 이 워커가 절대 안 들어가는 시프트''',
  'SELECT ''blocked_slot_ids already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- preferred_dow_prefer (CSV)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'preferred_dow_prefer');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_workers ADD COLUMN preferred_dow_prefer VARCHAR(32) NULL COMMENT ''희망 요일 CSV (0=일,1=월,...,6=토)''',
  'SELECT ''preferred_dow_prefer already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- preferred_dow_avoid (CSV)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'preferred_dow_avoid');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_workers ADD COLUMN preferred_dow_avoid VARCHAR(32) NULL COMMENT ''비선호 요일 CSV''',
  'SELECT ''preferred_dow_avoid already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ═══════════════════════════════════════════════════════════════════
-- [STEP 2] 데이터 백필 (옵션 — 수동 실행 권장)
-- ═══════════════════════════════════════════════════════════════════
-- 기존 cs_group_members 에 입력된 값을 cs_workers 로 복사.
-- 워커가 여러 그룹 멤버인 경우 최대값/공통 요일/병합 슬롯거부 사용.
--
-- 권장 절차:
--   1. 본 STEP 1 적용 (위 ALTER)
--   2. UI 에서 사용자가 워커별로 새 셋팅 입력 (clean start)
--   3. 또는 아래 백필 SQL 실행 (자동 추정)
--
-- 백필 SQL (주석 — 검토 후 실행):
-- UPDATE cs_workers w
-- SET
--   max_consecutive_work_days = (
--     SELECT MAX(m.max_consecutive_work_days)
--     FROM cs_group_members m WHERE m.worker_id = w.id
--   ),
--   max_days_per_month = (
--     SELECT MAX(m.max_days_per_month)
--     FROM cs_group_members m WHERE m.worker_id = w.id
--   )
-- WHERE w.is_active = 1;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT (적용 후)
-- ═══════════════════════════════════════════════════════════════════
-- 1) 5 컬럼 추가 확인 (기대: 5 rows)
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
--   AND COLUMN_NAME IN ('max_consecutive_work_days', 'max_days_per_month',
--                       'blocked_slot_ids', 'preferred_dow_prefer', 'preferred_dow_avoid');

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_workers DROP COLUMN preferred_dow_avoid;
-- ALTER TABLE cs_workers DROP COLUMN preferred_dow_prefer;
-- ALTER TABLE cs_workers DROP COLUMN blocked_slot_ids;
-- ALTER TABLE cs_workers DROP COLUMN max_days_per_month;
-- ALTER TABLE cs_workers DROP COLUMN max_consecutive_work_days;
