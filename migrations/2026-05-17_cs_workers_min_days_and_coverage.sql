-- ═══════════════════════════════════════════════════════════════════
-- N-36 — 워커 글로벌 min_days + 그룹 coverage_priority 컬럼 추가
--   2026-05-17 sukhomin87@gmail.com
--
-- 사용자 의도:
-- 1) "정동민은 8일 근무로 보여지는데 외부인력이라 최소근무가 없어서 그런가?
--     그 기준도 있어야 하나" → cs_workers.min_days_per_month (글로벌 최소)
-- 2) "휴가자 발생시에 1순위로도 넣으려고 하는데 그 기준도 그룹에서
--     휴가 커버 순위도 지정해야 하나" → cs_group_members.coverage_priority
--
-- 효과:
--   · min_days_per_month: 워커 차원 글로벌 (모든 그룹 합산) 최소 보장
--     - 외부인력 = 의도된 적은 출근 (예: 8) — 자동 생성이 8일까지 보장
--   · coverage_priority: priority_level 과 독립
--     - 정동민 priority_level=3 (평소 백업) + coverage_priority=1
--     - → 평소 후순위 + 휴가 결원 발생 시 1순위로 메움
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- [STEP 1] cs_workers.min_days_per_month
-- ──────────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'min_days_per_month');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_workers ADD COLUMN min_days_per_month TINYINT UNSIGNED DEFAULT NULL COMMENT ''월 최소 근무일수 (모든 그룹 합산) — NULL=무제한''',
  'SELECT ''cs_workers.min_days_per_month already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ──────────────────────────────────────────────────────────────
-- [STEP 2] cs_group_members.coverage_priority
--   1 = 휴가 커버 1순위 (최우선)
--   2 = 2순위
--   3 = 3순위
--   NULL = priority_level 따라감 (디폴트)
-- ──────────────────────────────────────────────────────────────
SET @col2 := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
                AND COLUMN_NAME = 'coverage_priority');
SET @s2 := IF(@col2 = 0,
  'ALTER TABLE cs_group_members ADD COLUMN coverage_priority TINYINT UNSIGNED DEFAULT NULL COMMENT ''휴가 커버 우선순위 1~3 — NULL=priority_level 따라감''',
  'SELECT ''cs_group_members.coverage_priority already exists''');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- ──────────────────────────────────────────────────────────────
-- [STEP 3] cs_group_member_versions 도 같은 컬럼 (timeline 일관)
-- ──────────────────────────────────────────────────────────────
SET @tbl := (SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_member_versions');
SET @col3 := IF(@tbl = 0, 1,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_member_versions'
     AND COLUMN_NAME = 'coverage_priority'));
SET @s3 := IF(@tbl > 0 AND @col3 = 0,
  'ALTER TABLE cs_group_member_versions ADD COLUMN coverage_priority TINYINT UNSIGNED DEFAULT NULL COMMENT ''휴가 커버 우선순위 — version timeline''',
  'SELECT ''cs_group_member_versions.coverage_priority skip''');
PREPARE st3 FROM @s3; EXECUTE st3; DEALLOCATE PREPARE st3;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT (적용 후)
-- ═══════════════════════════════════════════════════════════════════
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('cs_workers','cs_group_members','cs_group_member_versions')
--   AND COLUMN_NAME IN ('min_days_per_month','coverage_priority');

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_workers DROP COLUMN min_days_per_month;
-- ALTER TABLE cs_group_members DROP COLUMN coverage_priority;
-- ALTER TABLE cs_group_member_versions DROP COLUMN coverage_priority;
