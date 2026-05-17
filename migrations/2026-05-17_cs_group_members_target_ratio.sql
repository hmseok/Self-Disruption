-- ═══════════════════════════════════════════════════════════════════
-- N-34 — cs_group_members.target_ratio 컬럼 추가
--   2026-05-17 sukhomin87@gmail.com
--
-- 사용자 의도: "전정연은 달빛 위주로만 처음에 하게 되는게 있어서 밸런스를
--               좀 맞출수있을까? 아니면 배정순위가 필요한가"
--
-- 의미: 한 워커가 여러 그룹에 소속됐을 때 어느 그룹에 더 자주 들어갈지 가중치
--   · 디폴트 1.0 (같은 비중)
--   · 0.5 / 0.5 → 50:50 균등
--   · 1.0 / 2.0 → 1:2 (두 번째 그룹 두 배)
--   · 0 / 1.0 → 두 번째 그룹 전담 (첫 번째 절대 안 감)
--
-- 알고리즘 사용:
--   정렬 시 「by_group.total / target_ratio」 우선 (비율 적게 채워진 사람 우선)
--   target_ratio=0 인 경우 hard exclude (그 그룹 절대 X)
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- [STEP 1] target_ratio 컬럼 추가 (멱등)
-- ──────────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'target_ratio');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_group_members ADD COLUMN target_ratio FLOAT NOT NULL DEFAULT 1.0 COMMENT ''그룹 분배 비율 가중치 — 1.0 디폴트, 0 = hard exclude''',
  'SELECT ''target_ratio already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ──────────────────────────────────────────────────────────────
-- [STEP 2] 버전 멤버 테이블에도 같은 컬럼 (timeline 일관성)
-- ──────────────────────────────────────────────────────────────
SET @tbl := (SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_member_versions');
SET @col2 := IF(@tbl = 0, 1,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_member_versions'
     AND COLUMN_NAME = 'target_ratio'));
SET @s2 := IF(@tbl > 0 AND @col2 = 0,
  'ALTER TABLE cs_group_member_versions ADD COLUMN target_ratio FLOAT NOT NULL DEFAULT 1.0 COMMENT ''그룹 분배 비율 가중치''',
  'SELECT ''cs_group_member_versions.target_ratio skip (table missing or column exists)''');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT (적용 후)
-- ═══════════════════════════════════════════════════════════════════
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
--   AND COLUMN_NAME = 'target_ratio';
--
-- -- 기본값 확인 (모든 row 1.0):
-- SELECT group_id, worker_id, target_ratio FROM cs_group_members LIMIT 20;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_group_members DROP COLUMN target_ratio;
-- ALTER TABLE cs_group_member_versions DROP COLUMN target_ratio;
