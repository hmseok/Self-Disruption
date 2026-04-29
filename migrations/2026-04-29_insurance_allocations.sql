-- ═══════════════════════════════════════════════════════════════════
-- 보험 청약서 기반 다중 차량 분배 시스템
-- 2026-04-29 (MySQL 8 호환 — information_schema 체크 + dynamic SQL)
--
-- 추가 사항:
--   1) cars.vin (VIN 컬럼 + 인덱스)
--   2) insurance_contracts 5개 컬럼 확장
--   3) insurance_vehicle_allocations (신규)
--   4) insurance_payment_schedule (신규)
--   5) transaction_vehicle_allocations (신규)
--
-- MySQL 호환성 노트:
--   ALTER TABLE ADD COLUMN IF NOT EXISTS — MySQL 미지원 (MariaDB만)
--   → information_schema.columns 체크 + PREPARE/EXECUTE 패턴 사용
--
-- 롤백: 본 파일 하단 ROLLBACK 섹션 참조
-- ═══════════════════════════════════════════════════════════════════

-- ── (0) cars.vin 컬럼 추가 ───────────────────────────────────────
SET @c := (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_schema=DATABASE() AND table_name='cars' AND column_name='vin');
SET @s := IF(@c=0,
  'ALTER TABLE cars ADD COLUMN vin VARCHAR(17) NULL COMMENT "차대번호 (VIN, 17자리)"',
  'SELECT "cars.vin already exists" AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- cars.vin 인덱스
SET @i := (SELECT COUNT(*) FROM information_schema.statistics
           WHERE table_schema=DATABASE() AND table_name='cars' AND index_name='idx_cars_vin');
SET @s := IF(@i=0,
  'CREATE INDEX idx_cars_vin ON cars(vin)',
  'SELECT "idx_cars_vin already exists" AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── (1) insurance_contracts 컬럼 확장 (5개) ──────────────────────
SET @c := (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_schema=DATABASE() AND table_name='insurance_contracts' AND column_name='contract_type');
SET @s := IF(@c=0,
  'ALTER TABLE insurance_contracts ADD COLUMN contract_type VARCHAR(32) NULL DEFAULT "individual" COMMENT "individual=차량별/fleet=단체"',
  'SELECT "contract_type exists" AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_schema=DATABASE() AND table_name='insurance_contracts' AND column_name='payment_type');
SET @s := IF(@c=0,
  'ALTER TABLE insurance_contracts ADD COLUMN payment_type VARCHAR(16) NULL DEFAULT "lump" COMMENT "lump=일시납/installment=분할납"',
  'SELECT "payment_type exists" AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_schema=DATABASE() AND table_name='insurance_contracts' AND column_name='installment_count');
SET @s := IF(@c=0,
  'ALTER TABLE insurance_contracts ADD COLUMN installment_count INT NULL DEFAULT 1',
  'SELECT "installment_count exists" AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_schema=DATABASE() AND table_name='insurance_contracts' AND column_name='document_url');
SET @s := IF(@c=0,
  'ALTER TABLE insurance_contracts ADD COLUMN document_url VARCHAR(500) NULL COMMENT "청약서 이미지/PDF URL"',
  'SELECT "document_url exists" AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_schema=DATABASE() AND table_name='insurance_contracts' AND column_name='ocr_confidence');
SET @s := IF(@c=0,
  'ALTER TABLE insurance_contracts ADD COLUMN ocr_confidence DECIMAL(5,2) NULL COMMENT "OCR 추출 신뢰도 (0~100)"',
  'SELECT "ocr_confidence exists" AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_schema=DATABASE() AND table_name='insurance_contracts' AND column_name='design_number');
SET @s := IF(@c=0,
  'ALTER TABLE insurance_contracts ADD COLUMN design_number VARCHAR(64) NULL COMMENT "KRMA 설계번호 등 외부 보험사 식별번호"',
  'SELECT "design_number exists" AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_schema=DATABASE() AND table_name='insurance_contracts' AND column_name='vehicle_class');
SET @s := IF(@c=0,
  'ALTER TABLE insurance_contracts ADD COLUMN vehicle_class VARCHAR(64) NULL COMMENT "청약서상 차종 (EV6 소형A 등)"',
  'SELECT "vehicle_class exists" AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── (2) insurance_vehicle_allocations ──────────────────────────────
CREATE TABLE IF NOT EXISTS insurance_vehicle_allocations (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  contract_id     CHAR(36)     NOT NULL COMMENT 'insurance_contracts.id',
  car_id          CHAR(36)     NULL COMMENT 'cars.id (VIN 매칭 안된 경우 NULL 허용)',
  vin             VARCHAR(17)  NULL COMMENT '차대번호 (cars 미매칭 시 보존용)',
  vehicle_label   VARCHAR(128) NULL COMMENT '청약서 표기 (EV6 소형A 등)',
  premium_amount  DECIMAL(12,0) NOT NULL DEFAULT 0
    COMMENT '차량당 분담 보험료',
  ratio           DECIMAL(5,4) NULL
    COMMENT '자동 계산 비율 (참고용)',
  coverage_note   VARCHAR(255) NULL
    COMMENT '담보 메모 (자차 800만, 대인무한 등)',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_iva_contract (contract_id),
  KEY idx_iva_car (car_id),
  KEY idx_iva_vin (vin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='보험계약-차량 분담 매핑 (VIN 우선 매칭, 미매칭 보존)';

-- ── (3) insurance_payment_schedule ──────────────────────────────────
CREATE TABLE IF NOT EXISTS insurance_payment_schedule (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  contract_id     CHAR(36)     NOT NULL,
  installment_no  INT          NOT NULL DEFAULT 1
    COMMENT '회차 (1, 2, 3...)',
  due_date        DATE         NOT NULL,
  amount          DECIMAL(12,0) NOT NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'pending'
    COMMENT 'pending|matched|overdue|cancelled',
  matched_tx_id   CHAR(36)     NULL
    COMMENT '매칭된 transactions.id',
  matched_at      DATETIME     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ips_contract (contract_id),
  KEY idx_ips_due (due_date),
  KEY idx_ips_status (status),
  UNIQUE KEY uniq_ips_contract_inst (contract_id, installment_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='보험 납입 회차 스케줄';

-- ── (4) transaction_vehicle_allocations ─────────────────────────────
CREATE TABLE IF NOT EXISTS transaction_vehicle_allocations (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  transaction_id  CHAR(36)     NOT NULL,
  car_id          CHAR(36)     NOT NULL,
  amount          DECIMAL(15,0) NOT NULL,
  source_type     VARCHAR(32)  NOT NULL DEFAULT 'manual'
    COMMENT 'manual|insurance|auto',
  source_ref_id   CHAR(36)     NULL
    COMMENT 'insurance_vehicle_allocations.id 등 출처 참조',
  note            VARCHAR(255) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tva_tx (transaction_id),
  KEY idx_tva_car (car_id),
  UNIQUE KEY uniq_tva_tx_car_source (transaction_id, car_id, source_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='거래-차량 분배 매핑 (범용)';

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK (필요 시 수동 실행)
-- ═══════════════════════════════════════════════════════════════════
--
-- DROP TABLE IF EXISTS transaction_vehicle_allocations;
-- DROP TABLE IF EXISTS insurance_payment_schedule;
-- DROP TABLE IF EXISTS insurance_vehicle_allocations;
-- ALTER TABLE insurance_contracts DROP COLUMN vehicle_class;
-- ALTER TABLE insurance_contracts DROP COLUMN design_number;
-- ALTER TABLE insurance_contracts DROP COLUMN ocr_confidence;
-- ALTER TABLE insurance_contracts DROP COLUMN document_url;
-- ALTER TABLE insurance_contracts DROP COLUMN installment_count;
-- ALTER TABLE insurance_contracts DROP COLUMN payment_type;
-- ALTER TABLE insurance_contracts DROP COLUMN contract_type;
-- DROP INDEX idx_cars_vin ON cars;
-- ALTER TABLE cars DROP COLUMN vin;
