-- ═══════════════════════════════════════════════════════════════
-- PR-HR-23d (2026-05-29, hr 세션 happy-busy-euler) — FMI departments 트리 마이그
--
-- 사용자 명령 (5/29): 「각 회사별 구조 동일」 → FMI 도 계층 트리 구조
-- ride_departments 와 동일한 컬럼 패턴 (parent_id / color_tone / sort_order)
--
-- 멱등 — 여러 번 실행 안전 (information_schema 체크 후 ALTER)
-- 검증 SQL — 파일 하단 주석 참조
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. parent_id 컬럼 추가 (멱등 — IF NOT EXISTS 패턴) ─────────
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'departments' AND column_name = 'parent_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE departments
     ADD COLUMN parent_id CHAR(36) NULL COMMENT ''부모 부서 (NULL=루트) — PR-HR-23d'',
     ADD KEY idx_dept_parent (parent_id)',
  'SELECT ''parent_id 이미 존재'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── 2. color_tone 컬럼 추가 ────────────────────────────────────
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'departments' AND column_name = 'color_tone'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE departments
     ADD COLUMN color_tone VARCHAR(20) NULL COMMENT ''트리 표시 색상 톤 (blue/green/red/amber/violet/slate)''',
  'SELECT ''color_tone 이미 존재'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── 3. sort_order 컬럼 추가 ────────────────────────────────────
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'departments' AND column_name = 'sort_order'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE departments
     ADD COLUMN sort_order INT NOT NULL DEFAULT 0 COMMENT ''트리 내 정렬 순서''',
  'SELECT ''sort_order 이미 존재'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ═══════════════════════════════════════════════════════════════
-- 검증 SQL (수동 실행)
--
-- 1) 컬럼 확인:
--    SHOW COLUMNS FROM departments LIKE 'parent_id';     -- 기대치: 1 row
--    SHOW COLUMNS FROM departments LIKE 'color_tone';    -- 기대치: 1 row
--    SHOW COLUMNS FROM departments LIKE 'sort_order';    -- 기대치: 1 row
--
-- 2) 데이터 보존 확인:
--    SELECT COUNT(*) FROM departments;                   -- 기대치: 마이그 전과 동일
--    SELECT COUNT(*) FROM departments WHERE parent_id IS NULL;  -- 기대치: 전체 (모두 루트)
--
-- 3) 인덱스 확인:
--    SHOW INDEX FROM departments WHERE Key_name = 'idx_dept_parent';
-- ═══════════════════════════════════════════════════════════════
