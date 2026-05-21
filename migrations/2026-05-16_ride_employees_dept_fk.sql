-- ═══════════════════════════════════════════════════════════════════
-- ride_employees 부서 FK + 승진 대상 컬럼 추가 (V2-Dept-FK)
-- 2026-05-16 (hr 세션 PR-HR-1)
--
-- 변경:
--   1) department_id   CHAR(36) NULL — ride_departments.id 옵셔널 FK
--   2) promotion_target VARCHAR(16) NULL — 승진 대상 직급 ('주임'/'대리'/'과장' 등)
--   3) 기존 free text `department` → `department_id` 매핑 (UPDATE JOIN)
--   4) idx_ride_emp_dept_id 인덱스 추가
--
-- 주의:
--   · `department` 컬럼은 즉시 삭제 X (점진 마이그 — Rule 23)
--   · 본 마이그 적용 전에 ride_departments_init.sql 먼저 실행 필수
--   · 사용자가 SQL Studio 에서 직접 실행 — API 는 graceful fallback
--
-- 호환: MySQL 8.0 (Cloud SQL r-care-db)
-- 검증 SQL: 본 파일 하단
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- (1) department_id 컬럼 추가 (멱등)
-- ───────────────────────────────────────────────────────────────────
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ride_employees'
    AND COLUMN_NAME = 'department_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_employees ADD COLUMN department_id CHAR(36) NULL AFTER department, ADD KEY idx_ride_emp_dept_id (department_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ───────────────────────────────────────────────────────────────────
-- (2) promotion_target 컬럼 추가 (멱등)
-- ───────────────────────────────────────────────────────────────────
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ride_employees'
    AND COLUMN_NAME = 'promotion_target'
);
-- 주의: PREPARE 안 string 의 COMMENT 큰따옴표가 ANSI_QUOTES sql_mode 에서 식별자로 해석됨 (Error 1064).
-- → 작은따옴표 escape (' → '') 또는 COMMENT 제거. 본 줄은 COMMENT 제거 (메타정보만).
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_employees ADD COLUMN promotion_target VARCHAR(16) NULL AFTER position',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ───────────────────────────────────────────────────────────────────
-- (3) 기존 free text department → FK department_id 매핑
--     기존 ride_employees 16명 (cs_workers 이전분) 의 department='콜센터'
--     → ride_departments 안 'CX' 또는 'CX_주5' 와 매핑 검토 필요 (사용자 결정)
--     일단 정확히 같은 이름인 row 만 자동 매핑 (보수적)
-- ───────────────────────────────────────────────────────────────────
UPDATE ride_employees re
  JOIN ride_departments rd ON rd.name = re.department
   SET re.department_id = rd.id
 WHERE re.department IS NOT NULL
   AND re.department_id IS NULL;

-- ───────────────────────────────────────────────────────────────────
-- (4) 미매핑 row 확인 — 사용자 검수 후 수동 매핑 필요
--     '콜센터' 같은 한자릉 매칭 안 되는 케이스 식별
-- ───────────────────────────────────────────────────────────────────
-- SELECT id, name, department FROM ride_employees
--  WHERE department IS NOT NULL AND department_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SQL (적용 후 직접 실행)
-- ═══════════════════════════════════════════════════════════════════
-- 검증 1: 컬럼 존재
-- SELECT column_name, column_type FROM information_schema.columns
--  WHERE table_schema = DATABASE() AND table_name = 'ride_employees'
--    AND column_name IN ('department_id', 'promotion_target');
--
-- 검증 2: 매핑 통계
-- SELECT
--   (SELECT COUNT(*) FROM ride_employees WHERE department IS NOT NULL) AS has_dept_text,
--   (SELECT COUNT(*) FROM ride_employees WHERE department_id IS NOT NULL) AS has_dept_fk,
--   (SELECT COUNT(*) FROM ride_employees
--     WHERE department IS NOT NULL AND department_id IS NULL) AS unmapped;
--
-- 검증 3: 부서별 인원 분포
-- SELECT rd.name, COUNT(re.id) AS emp_count
--   FROM ride_departments rd
--   LEFT JOIN ride_employees re ON re.department_id = rd.id AND re.is_active = 1
--  GROUP BY rd.id, rd.name
--  ORDER BY rd.sort_order;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK (역순 — department 컬럼은 데이터 보존 위해 유지)
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE ride_employees DROP KEY idx_ride_emp_dept_id;
-- ALTER TABLE ride_employees DROP COLUMN department_id;
-- ALTER TABLE ride_employees DROP COLUMN promotion_target;
