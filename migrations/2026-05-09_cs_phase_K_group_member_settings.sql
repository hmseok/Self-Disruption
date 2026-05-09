-- ═══════════════════════════════════════════════════════════════════
-- Phase K — 그룹 중심 설정 재구성
--   워커별 글로벌 설정 → 그룹멤버별 설정으로 이동
--   같은 워커가 다른 그룹에선 다른 우선순위/요일/한도 가능
--
--   2026-05-09 sukhomin87@gmail.com
--   사용자 의도: "셋팅이 여기저기 가는게 불편 — 그룹에 인원 추가하면서 그 자리에서 셋팅"
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- [STEP 1] cs_group_members 에 멤버별 설정 컬럼 추가 (멱등)
-- ──────────────────────────────────────────────────────────────

-- priority_level (P1=1, P2=2, P3=3 — 워커 우선순위 등급)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'priority_level');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_group_members ADD COLUMN priority_level TINYINT NOT NULL DEFAULT 2 COMMENT ''P1=1 / P2=2 / P3=3''',
  'SELECT ''priority_level already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- preferred_dow_prefer
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'preferred_dow_prefer');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_group_members ADD COLUMN preferred_dow_prefer VARCHAR(16) NULL COMMENT ''CSV 0~6 (희망 요일)''',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- preferred_dow_avoid
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'preferred_dow_avoid');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_group_members ADD COLUMN preferred_dow_avoid VARCHAR(16) NULL COMMENT ''CSV 0~6 (비선호 요일)''',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- max_consecutive_work_days
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'max_consecutive_work_days');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_group_members ADD COLUMN max_consecutive_work_days TINYINT NULL COMMENT ''이 그룹 안 연속 근무 한도''',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- required_days_per_month
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'required_days_per_month');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_group_members ADD COLUMN required_days_per_month TINYINT NULL COMMENT ''이 그룹에서 채워야 할 월 필수 일수''',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- max_days_per_month
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'max_days_per_month');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_group_members ADD COLUMN max_days_per_month TINYINT NULL COMMENT ''이 그룹 월 최대 일수''',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- blocked_slot_ids (JSON — 이 그룹 안에서 절대 이 슬롯 X)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'blocked_slot_ids');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_group_members ADD COLUMN blocked_slot_ids JSON NULL COMMENT ''["L01","L02"] — 이 그룹 안 절대 거부 슬롯''',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- work_pattern_text (자유 메모 — 알고리즘 영향 X)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'work_pattern_text');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_group_members ADD COLUMN work_pattern_text VARCHAR(64) NULL COMMENT ''패턴 메모 (참고용)''',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ──────────────────────────────────────────────────────────────
-- [STEP 2] 기존 cs_workers 값 → 그룹 멤버십에 일회성 복사
--   가드: 멤버 모든 컬럼이 default/NULL 일 때만 (한 번도 편집 안 한 멤버)
--   → 두 번째 실행 시 사용자 편집값 보존 (멱등)
-- ──────────────────────────────────────────────────────────────

UPDATE cs_group_members gm
JOIN cs_workers w ON gm.worker_id = w.id
SET
  gm.priority_level             = w.priority_level,
  gm.preferred_dow_prefer       = w.preferred_dow_prefer,
  gm.preferred_dow_avoid        = w.preferred_dow_avoid,
  gm.max_consecutive_work_days  = w.max_consecutive_work_days,
  gm.required_days_per_month    = w.required_days_per_month,
  gm.max_days_per_month         = w.max_days_per_month,
  gm.blocked_slot_ids           = w.blocked_slot_ids,
  gm.work_pattern_text          = w.work_pattern_text
WHERE
  -- 한 번도 멤버 편집 안 한 row 만 (모두 default/NULL)
  gm.priority_level = 2  -- DEFAULT
  AND gm.preferred_dow_prefer IS NULL
  AND gm.preferred_dow_avoid IS NULL
  AND gm.max_consecutive_work_days IS NULL
  AND gm.required_days_per_month IS NULL
  AND gm.max_days_per_month IS NULL
  AND gm.blocked_slot_ids IS NULL
  AND gm.work_pattern_text IS NULL;

-- ──────────────────────────────────────────────────────────────
-- [STEP 3] cs_workers 의 옮긴 컬럼 삭제 (멱등 — IF EXISTS 가드)
-- ──────────────────────────────────────────────────────────────

-- priority_level
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'priority_level');
SET @s := IF(@col = 1,
  'ALTER TABLE cs_workers DROP COLUMN priority_level',
  'SELECT ''cs_workers.priority_level already removed''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 인덱스도 같이 (priority_level 기반)
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND INDEX_NAME = 'idx_cs_w_priority');
SET @s := IF(@idx = 1,
  'ALTER TABLE cs_workers DROP INDEX idx_cs_w_priority',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- preferred_dow_prefer
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'preferred_dow_prefer');
SET @s := IF(@col = 1, 'ALTER TABLE cs_workers DROP COLUMN preferred_dow_prefer', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- preferred_dow_avoid
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'preferred_dow_avoid');
SET @s := IF(@col = 1, 'ALTER TABLE cs_workers DROP COLUMN preferred_dow_avoid', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- required_days_per_month
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'required_days_per_month');
SET @s := IF(@col = 1, 'ALTER TABLE cs_workers DROP COLUMN required_days_per_month', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- max_days_per_month
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'max_days_per_month');
SET @s := IF(@col = 1, 'ALTER TABLE cs_workers DROP COLUMN max_days_per_month', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- max_consecutive_work_days
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'max_consecutive_work_days');
SET @s := IF(@col = 1, 'ALTER TABLE cs_workers DROP COLUMN max_consecutive_work_days', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- blocked_slot_ids
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'blocked_slot_ids');
SET @s := IF(@col = 1, 'ALTER TABLE cs_workers DROP COLUMN blocked_slot_ids', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- work_pattern_text
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'work_pattern_text');
SET @s := IF(@col = 1, 'ALTER TABLE cs_workers DROP COLUMN work_pattern_text', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 쿼리 (적용 후 실행 — 기대 결과 주석 참고)
-- ═══════════════════════════════════════════════════════════════════

-- 1) cs_group_members 새 컬럼 추가 확인 (기대: 8 row)
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
--   AND COLUMN_NAME IN ('priority_level','preferred_dow_prefer','preferred_dow_avoid',
--                       'max_consecutive_work_days','required_days_per_month','max_days_per_month',
--                       'blocked_slot_ids','work_pattern_text');

-- 2) cs_workers 옮긴 컬럼 삭제 확인 (기대: 0 row)
-- SELECT COLUMN_NAME FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
--   AND COLUMN_NAME IN ('priority_level','preferred_dow_prefer','preferred_dow_avoid',
--                       'max_consecutive_work_days','required_days_per_month','max_days_per_month',
--                       'blocked_slot_ids','work_pattern_text');

-- 3) 데이터 복사 검증 — 그룹 멤버 개수 (기대: 워커 그룹 멤버십 수)
-- SELECT COUNT(*) AS total_memberships,
--        SUM(CASE WHEN priority_level <> 2 THEN 1 ELSE 0 END) AS p1_or_p3_count,
--        SUM(CASE WHEN preferred_dow_prefer IS NOT NULL THEN 1 ELSE 0 END) AS prefer_set_count,
--        SUM(CASE WHEN preferred_dow_avoid IS NOT NULL THEN 1 ELSE 0 END) AS avoid_set_count
-- FROM cs_group_members;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK (필요 시 — 데이터 복사된 멤버 설정은 유지)
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_workers ADD COLUMN priority_level TINYINT NOT NULL DEFAULT 2;
-- ALTER TABLE cs_workers ADD COLUMN preferred_dow_prefer VARCHAR(16) NULL;
-- ALTER TABLE cs_workers ADD COLUMN preferred_dow_avoid VARCHAR(16) NULL;
-- ALTER TABLE cs_workers ADD COLUMN max_consecutive_work_days TINYINT NULL;
-- ALTER TABLE cs_workers ADD COLUMN required_days_per_month TINYINT NULL;
-- ALTER TABLE cs_workers ADD COLUMN max_days_per_month TINYINT NULL;
-- ALTER TABLE cs_workers ADD COLUMN blocked_slot_ids JSON NULL;
-- ALTER TABLE cs_workers ADD COLUMN work_pattern_text VARCHAR(64) NULL;
-- -- (값 복원: cs_group_members 의 첫 그룹 값 등 비즈니스 정책에 따라)
-- ALTER TABLE cs_group_members DROP COLUMN priority_level;
-- ALTER TABLE cs_group_members DROP COLUMN preferred_dow_prefer;
-- ... (8 컬럼 동일)
