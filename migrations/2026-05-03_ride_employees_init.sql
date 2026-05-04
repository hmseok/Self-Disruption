-- ═══════════════════════════════════════════════════════════════════
-- Ride Inc. 직원 마스터 — Employee of Ride Inc. 그룹 공통 마스터
-- 2026-05-03 (CallScheduler 신설 직후, 라이드 직원 마스터 분리)
--
-- 목적:
--   · CallScheduler 외 향후 추가될 직원 페이지들이 공유할 단일 source
--   · 부서/직급/입사일 등 마스터 데이터를 cs_workers 와 분리
--   · profiles(인증) ↔ ride_employees(인사) ↔ cs_workers(콜센터 특화)
--
-- 변경 사항:
--   1) ride_employees 테이블 신설
--   2) cs_workers.employee_id 컬럼 추가 (옵셔널 FK)
--   3) 기존 cs_workers 16명을 ride_employees 로 이전 (UUID 그대로)
--   4) cs_workers.employee_id 채우기
--
-- 주의:
--   · cs_workers 의 마스터 컬럼(name, phone, email, color_tone, group_label)은
--     점진 마이그레이션을 위해 당장 삭제하지 않음 (deprecated 표시)
--   · 향후 별도 PR 에서 cs_workers 의 마스터 컬럼 → ride_employees 로 일원화
--
-- 호환: MySQL 8.0 (Cloud SQL r-care-db)
-- 롤백: 본 파일 하단 ROLLBACK 섹션
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- (1) ride_employees — 라이드 주식회사 직원 마스터
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_employees (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  name              VARCHAR(64)  NOT NULL,
  profile_id        CHAR(36)     NULL COMMENT 'profiles.id 옵션 FK (인증 계정 연동)',

  -- 인사 기본
  department        VARCHAR(32)  NULL COMMENT '부서 (예: 콜센터, 운영, 정비)',
  position          VARCHAR(32)  NULL COMMENT '직급/직책 (예: 매니저, 사원)',
  employment_type   VARCHAR(16)  NULL COMMENT '정규|계약|파트|용역',
  hire_date         DATE         NULL,
  resign_date       DATE         NULL,

  -- 연락
  phone             VARCHAR(32)  NULL,
  email             VARCHAR(128) NULL,

  -- 표시/그룹핑 (CallScheduler 호환 기본값 — 다른 모듈에서도 활용 가능)
  color_tone        VARCHAR(16)  NOT NULL DEFAULT 'none'
                    COMMENT 'blue|gray|green|amber|violet|red|none',
  group_label       VARCHAR(32)  NULL COMMENT '주간|야간|저녁|관리|기타',

  -- 메타
  memo              VARCHAR(500) NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_ride_emp_active (is_active, department),
  KEY idx_ride_emp_profile (profile_id),
  KEY idx_ride_emp_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ───────────────────────────────────────────────────────────────────
-- (2) cs_workers.employee_id 컬럼 추가
-- ───────────────────────────────────────────────────────────────────
-- MySQL 8.0 호환: 컬럼 존재 여부 체크 후 ADD (멱등 적용 위해)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cs_workers'
    AND COLUMN_NAME = 'employee_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE cs_workers ADD COLUMN employee_id CHAR(36) NULL AFTER profile_id, ADD KEY idx_cs_worker_employee (employee_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ───────────────────────────────────────────────────────────────────
-- (3) 기존 cs_workers 16명 → ride_employees 로 이전 (UUID 그대로)
--     · 같은 UUID 사용 → 1:1 매핑 자명
--     · color_tone, group_label 보존
--     · 부서는 모두 '콜센터' 로 기본값
-- ───────────────────────────────────────────────────────────────────
INSERT IGNORE INTO ride_employees
  (id, name, profile_id, department, position, employment_type,
   phone, email, color_tone, group_label, is_active, created_at, updated_at)
SELECT
  w.id, w.name, w.profile_id, '콜센터', NULL, NULL,
  w.phone, w.email, w.color_tone, w.group_label, w.is_active, w.created_at, w.updated_at
FROM cs_workers w
WHERE w.is_active = 1
  AND NOT EXISTS (SELECT 1 FROM ride_employees re WHERE re.id = w.id);

-- ───────────────────────────────────────────────────────────────────
-- (4) cs_workers.employee_id 채우기 (UUID 동일하므로 셀프 매핑)
-- ───────────────────────────────────────────────────────────────────
UPDATE cs_workers
SET employee_id = id
WHERE employee_id IS NULL;

-- ───────────────────────────────────────────────────────────────────
-- (5) FK 제약 추가 (ride_employees 삭제 시 cs_workers.employee_id NULL)
-- ───────────────────────────────────────────────────────────────────
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cs_workers'
    AND CONSTRAINT_NAME = 'fk_cs_worker_employee'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE cs_workers ADD CONSTRAINT fk_cs_worker_employee FOREIGN KEY (employee_id) REFERENCES ride_employees(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 쿼리 (적용 후 직접 실행 — 결과 확인용)
-- ═══════════════════════════════════════════════════════════════════
-- SELECT COUNT(*) AS employees FROM ride_employees;       -- 16 이어야 함
-- SELECT COUNT(*) AS workers_linked FROM cs_workers WHERE employee_id IS NOT NULL;  -- 16
-- SELECT name, department, color_tone, group_label FROM ride_employees ORDER BY group_label DESC, name;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK (역순)
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_workers DROP FOREIGN KEY fk_cs_worker_employee;
-- ALTER TABLE cs_workers DROP COLUMN employee_id;
-- DROP TABLE IF EXISTS ride_employees;
