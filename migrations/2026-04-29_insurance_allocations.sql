-- ═══════════════════════════════════════════════════════════════════
-- 보험 청약서 기반 다중 차량 분배 시스템
-- 2026-04-29
--
-- 추가 사항:
--   1) insurance_contracts 컬럼 확장 — 계약형태/납입방식/회차/문서URL/OCR신뢰도
--   2) insurance_vehicle_allocations — 보험계약 ↔ 차량 N:N 분담
--   3) insurance_payment_schedule — 납입 회차 (일시납/분할납)
--   4) transaction_vehicle_allocations — 거래 ↔ 차량 N:N 범용 분배
--
-- 기존 데이터 영향: 없음 (모두 신규 컬럼/테이블, IF NOT EXISTS 방어)
-- 롤백: 본 파일 하단의 ROLLBACK 섹션 참조
-- ═══════════════════════════════════════════════════════════════════

-- ── (1) insurance_contracts 컬럼 확장 ────────────────────────────
ALTER TABLE insurance_contracts
  ADD COLUMN IF NOT EXISTS contract_type VARCHAR(32) NULL DEFAULT 'individual'
    COMMENT 'individual=차량별 / fleet=단체',
  ADD COLUMN IF NOT EXISTS payment_type VARCHAR(16) NULL DEFAULT 'lump'
    COMMENT 'lump=일시납 / installment=분할납',
  ADD COLUMN IF NOT EXISTS installment_count INT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS document_url VARCHAR(500) NULL
    COMMENT '청약서 이미지/PDF URL',
  ADD COLUMN IF NOT EXISTS ocr_confidence DECIMAL(5,2) NULL
    COMMENT 'OCR 추출 신뢰도 (0~100, NULL=수동입력)';

-- ── (2) insurance_vehicle_allocations ──────────────────────────────
CREATE TABLE IF NOT EXISTS insurance_vehicle_allocations (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  contract_id     CHAR(36)     NOT NULL COMMENT 'insurance_contracts.id',
  car_id          CHAR(36)     NOT NULL COMMENT 'cars.id',
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
  UNIQUE KEY uniq_iva_contract_car (contract_id, car_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='보험계약-차량 분담 매핑';

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
-- ALTER TABLE insurance_contracts
--   DROP COLUMN IF EXISTS contract_type,
--   DROP COLUMN IF EXISTS payment_type,
--   DROP COLUMN IF EXISTS installment_count,
--   DROP COLUMN IF EXISTS document_url,
--   DROP COLUMN IF EXISTS ocr_confidence;
