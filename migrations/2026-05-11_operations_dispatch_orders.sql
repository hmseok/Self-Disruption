-- PR-OPS-REDESIGN Phase 1 — 차량운영 접수/오더 + 보험청구 통합
-- 2026-05-11 (sweet-amazing-galileo)
--
-- 신설:
--   operations_dispatch_orders — RideAccidents 대차요청 → 상담/일정 입력 + 배차연결
--
-- 변경:
--   fmi_rentals 청구 입력 추적 컬럼 (billed_at / billed_by)
--
-- Rule 23 멱등성: 모든 변경 IF NOT EXISTS 가드. 여러 번 실행 안전.
-- Rule 24 시드 데이터: 본 마이그는 시드 없음 (테이블 신설만).

-- ─────────────────────────────────────────────────────────────────
-- 1. operations_dispatch_orders — 신설
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operations_dispatch_orders (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  ride_accident_id  INT          NOT NULL,
  consultation_note TEXT         NULL,
  customer_request  TEXT         NULL,
  expected_dispatch_date DATE    NULL,
  expected_return_date   DATE    NULL,
  status            ENUM('new','consulting','scheduled','dispatched','done','cancelled')
                    NOT NULL DEFAULT 'new',
  assigned_to       VARCHAR(64)  NULL,
  fmi_rental_id     CHAR(36)     NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,
  created_by        VARCHAR(64)  NULL,
  updated_by        VARCHAR(64)  NULL,
  INDEX idx_ops_dispatch_ride_acc (ride_accident_id),
  INDEX idx_ops_dispatch_status (status),
  INDEX idx_ops_dispatch_fmi_rental (fmi_rental_id),
  INDEX idx_ops_dispatch_assigned (assigned_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 비즈니스 UNIQUE: 한 사고에 active dispatch_order 1개만
-- (cancelled / done 은 여러개 가능 — partial unique 는 MySQL 미지원이라 app 레벨 가드)
-- ALTER TABLE operations_dispatch_orders
--   ADD UNIQUE KEY uq_ride_acc_active (ride_accident_id) WHERE status NOT IN ('cancelled','done');
-- → MySQL 미지원, app 레벨 INSERT 시 SELECT 후 INSERT 패턴 사용

-- ─────────────────────────────────────────────────────────────────
-- 2. fmi_rentals — 청구 입력 추적 컬럼 (멱등성 가드)
-- ─────────────────────────────────────────────────────────────────
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'fmi_rentals'
     AND column_name = 'billed_at'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE fmi_rentals ADD COLUMN billed_at TIMESTAMP NULL DEFAULT NULL',
  'SELECT "fmi_rentals.billed_at already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'fmi_rentals'
     AND column_name = 'billed_by'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE fmi_rentals ADD COLUMN billed_by VARCHAR(64) NULL DEFAULT NULL',
  'SELECT "fmi_rentals.billed_by already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────
-- 3. 검증 SELECT (Rule 23 의무)
-- ─────────────────────────────────────────────────────────────────
-- 검증 1: operations_dispatch_orders 테이블 생성 확인
-- SELECT COUNT(*) AS table_exists FROM information_schema.tables
--   WHERE table_schema = DATABASE() AND table_name = 'operations_dispatch_orders';
-- 기대치: 1

-- 검증 2: 컬럼 13개 확인
-- SELECT COUNT(*) AS col_count FROM information_schema.columns
--   WHERE table_schema = DATABASE() AND table_name = 'operations_dispatch_orders';
-- 기대치: 13

-- 검증 3: fmi_rentals 신규 컬럼 확인
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema = DATABASE() AND table_name = 'fmi_rentals'
--     AND column_name IN ('billed_at', 'billed_by');
-- 기대치: 2 rows

-- 검증 4: dispatch_orders 빈 테이블 확인 (시드 없음)
-- SELECT COUNT(*) AS row_count FROM operations_dispatch_orders;
-- 기대치: 0
