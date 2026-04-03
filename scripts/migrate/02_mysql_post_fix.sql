-- ============================================================
-- MySQL 후처리 스크립트 (Supabase SDK 마이그레이션용)
--
-- 실행: mysql -h 34.47.105.219 -u root -p'PASSWORD' fmi_op < 02_mysql_post_fix.sql
-- ============================================================

USE fmi_op;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = '';
SET time_zone = '+00:00';

-- ============================================================
-- STEP 1: 핵심 빈 테이블 생성 (Prisma 스키마 기준)
-- 마이그레이션에서 0건 테이블은 MySQL에 미생성 → 직접 생성
-- ============================================================

CREATE TABLE IF NOT EXISTS `fmi_vehicles` (
  `id`                    CHAR(36)       NOT NULL,
  `car_number`            VARCHAR(255)   NOT NULL,
  `car_type`              VARCHAR(255)   NULL,
  `car_brand`             VARCHAR(255)   NULL,
  `car_model`             VARCHAR(255)   NULL,
  `car_year`              INT            NULL,
  `car_color`             VARCHAR(255)   NULL,
  `vin`                   VARCHAR(255)   NULL,
  `ownership_type`        VARCHAR(50)    NOT NULL DEFAULT 'owned',
  `rental_company`        VARCHAR(255)   NULL,
  `rental_monthly_cost`   DECIMAL(12,0)  NULL,
  `rental_start_date`     DATE           NULL,
  `rental_end_date`       DATE           NULL,
  `rental_contract_no`    VARCHAR(255)   NULL,
  `purchase_date`         DATE           NULL,
  `purchase_price`        DECIMAL(12,0)  NULL,
  `depreciation_rate`     DECIMAL(5,2)   NULL,
  `investor`              VARCHAR(255)   NULL,
  `investment_amount`     DECIMAL(12,0)  NULL,
  `investment_return_rate` DECIMAL(5,2)  NULL,
  `investment_start_date` DATE           NULL,
  `investment_end_date`   DATE           NULL,
  `insurance_company`     VARCHAR(255)   NULL,
  `insurance_policy_no`   VARCHAR(255)   NULL,
  `insurance_expiry`      DATE           NULL,
  `inspection_expiry`     DATE           NULL,
  `status`                VARCHAR(50)    NOT NULL DEFAULT 'available',
  `current_location`      VARCHAR(255)   NULL,
  `mileage`               INT            NOT NULL DEFAULT 0,
  `notes`                 TEXT           NULL,
  `created_at`            DATETIME(6)    NOT NULL DEFAULT NOW(6),
  `updated_at`            DATETIME(6)    NOT NULL DEFAULT NOW(6) ON UPDATE NOW(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `fmi_vehicles_car_number_key` (`car_number`),
  INDEX `fmi_vehicles_status_idx` (`status`),
  INDEX `fmi_vehicles_ownership_type_idx` (`ownership_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fmi_accidents` (
  `id`                       CHAR(36)      NOT NULL,
  `cafe24_id`                VARCHAR(255)  NULL,
  `receipt_no`               VARCHAR(255)  NULL,
  `receipt_date`             DATETIME(6)   NULL,
  `accident_date`            DATETIME(6)   NULL,
  `accident_location`        VARCHAR(255)  NULL,
  `accident_description`     TEXT          NULL,
  `accident_region_sido`     VARCHAR(100)  NULL,
  `accident_region_sigungu`  VARCHAR(100)  NULL,
  `customer_name`            VARCHAR(255)  NULL,
  `customer_phone`           VARCHAR(50)   NULL,
  `customer_car_number`      VARCHAR(50)   NULL,
  `customer_car_type`        VARCHAR(100)  NULL,
  `counterpart_name`         VARCHAR(255)  NULL,
  `counterpart_phone`        VARCHAR(50)   NULL,
  `counterpart_car_number`   VARCHAR(50)   NULL,
  `counterpart_insurance`    VARCHAR(255)  NULL,
  `counterpart_claim_no`     VARCHAR(255)  NULL,
  `insurance_company`        VARCHAR(255)  NULL,
  `insurance_claim_no`       VARCHAR(255)  NULL,
  `adjuster_name`            VARCHAR(255)  NULL,
  `adjuster_phone`           VARCHAR(50)   NULL,
  `fault_type`               VARCHAR(100)  NULL,
  `fault_rate`               INT           NULL,
  `repair_needed`            TINYINT(1)    NOT NULL DEFAULT 0,
  `repair_shop`              VARCHAR(255)  NULL,
  `estimated_repair_days`    INT           NULL,
  `estimated_repair_cost`    DECIMAL(12,0) NULL,
  `rental_needed`            TINYINT(1)    NOT NULL DEFAULT 0,
  `rental_status`            VARCHAR(50)   NOT NULL DEFAULT 'none',
  `status`                   VARCHAR(50)   NOT NULL DEFAULT 'received',
  `handler_id`               CHAR(36)      NULL,
  `handler_name`             VARCHAR(255)  NULL,
  `source`                   VARCHAR(50)   NOT NULL DEFAULT 'manual',
  `raw_data`                 JSON          NULL,
  `notes`                    TEXT          NULL,
  `created_at`               DATETIME(6)   NOT NULL DEFAULT NOW(6),
  `updated_at`               DATETIME(6)   NOT NULL DEFAULT NOW(6) ON UPDATE NOW(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `fmi_accidents_cafe24_id_key` (`cafe24_id`),
  INDEX `fmi_accidents_status_idx` (`status`),
  INDEX `fmi_accidents_rental_status_idx` (`rental_status`),
  INDEX `fmi_accidents_receipt_date_idx` (`receipt_date`),
  INDEX `fmi_accidents_insurance_company_idx` (`insurance_company`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fmi_rentals` (
  `id`                   CHAR(36)      NOT NULL,
  `accident_id`          CHAR(36)      NULL,
  `rental_no`            VARCHAR(255)  NULL,
  `customer_name`        VARCHAR(255)  NOT NULL,
  `customer_phone`       VARCHAR(50)   NULL,
  `customer_car_number`  VARCHAR(50)   NULL,
  `customer_car_type`    VARCHAR(100)  NULL,
  `vehicle_id`           CHAR(36)      NULL,
  `vehicle_car_number`   VARCHAR(50)   NULL,
  `vehicle_car_type`     VARCHAR(100)  NULL,
  `insurance_company`    VARCHAR(255)  NULL,
  `insurance_claim_no`   VARCHAR(255)  NULL,
  `adjuster_name`        VARCHAR(255)  NULL,
  `adjuster_phone`       VARCHAR(50)   NULL,
  `dispatch_date`        DATETIME(6)   NULL,
  `dispatch_location`    VARCHAR(255)  NULL,
  `expected_return_date` DATETIME(6)   NULL,
  `actual_return_date`   DATETIME(6)   NULL,
  `rental_days`          INT           NULL,
  `dispatch_mileage`     INT           NULL,
  `return_mileage`       INT           NULL,
  `driven_km`            INT           NULL,
  `daily_rate`           DECIMAL(10,0) NULL,
  `total_rental_fee`     DECIMAL(12,0) NULL,
  `additional_charges`   DECIMAL(12,0) NULL DEFAULT 0,
  `deduction_amount`     DECIMAL(12,0) NULL DEFAULT 0,
  `final_claim_amount`   DECIMAL(12,0) NULL,
  `return_condition`     VARCHAR(255)  NULL,
  `return_fuel_level`    VARCHAR(50)   NULL,
  `return_damage_yn`     TINYINT(1)    NOT NULL DEFAULT 0,
  `return_damage_memo`   TEXT          NULL,
  `return_photos`        JSON          NULL,
  `status`               VARCHAR(50)   NOT NULL DEFAULT 'pending',
  `handler_id`           CHAR(36)      NULL,
  `handler_name`         VARCHAR(255)  NULL,
  `dispatcher_name`      VARCHAR(255)  NULL,
  `notes`                TEXT          NULL,
  `created_at`           DATETIME(6)   NOT NULL DEFAULT NOW(6),
  `updated_at`           DATETIME(6)   NOT NULL DEFAULT NOW(6) ON UPDATE NOW(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `fmi_rentals_rental_no_key` (`rental_no`),
  INDEX `fmi_rentals_status_idx` (`status`),
  INDEX `fmi_rentals_accident_id_idx` (`accident_id`),
  INDEX `fmi_rentals_vehicle_id_idx` (`vehicle_id`),
  INDEX `fmi_rentals_insurance_company_idx` (`insurance_company`),
  INDEX `fmi_rentals_dispatch_date_idx` (`dispatch_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fmi_claims` (
  `id`                 CHAR(36)      NOT NULL,
  `rental_id`          CHAR(36)      NOT NULL,
  `accident_id`        CHAR(36)      NULL,
  `claim_no`           VARCHAR(255)  NULL,
  `insurance_company`  VARCHAR(255)  NOT NULL,
  `insurance_claim_no` VARCHAR(255)  NULL,
  `rental_fee`         DECIMAL(12,0) NULL,
  `additional_charges` DECIMAL(12,0) NULL DEFAULT 0,
  `total_claim_amount` DECIMAL(12,0) NULL,
  `claim_method`       VARCHAR(100)  NULL,
  `claim_date`         DATETIME(6)   NULL,
  `claim_documents`    JSON          NULL,
  `claim_pdf_url`      VARCHAR(500)  NULL,
  `fax_number`         VARCHAR(50)   NULL,
  `fax_sent_at`        DATETIME(6)   NULL,
  `response_date`      DATETIME(6)   NULL,
  `approved_amount`    DECIMAL(12,0) NULL,
  `rejected_amount`    DECIMAL(12,0) NULL,
  `rejection_reason`   TEXT          NULL,
  `negotiation_memo`   TEXT          NULL,
  `status`             VARCHAR(50)   NOT NULL DEFAULT 'draft',
  `handler_id`         CHAR(36)      NULL,
  `handler_name`       VARCHAR(255)  NULL,
  `notes`              TEXT          NULL,
  `created_at`         DATETIME(6)   NOT NULL DEFAULT NOW(6),
  `updated_at`         DATETIME(6)   NOT NULL DEFAULT NOW(6) ON UPDATE NOW(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `fmi_claims_claim_no_key` (`claim_no`),
  INDEX `fmi_claims_status_idx` (`status`),
  INDEX `fmi_claims_rental_id_idx` (`rental_id`),
  INDEX `fmi_claims_insurance_company_idx` (`insurance_company`),
  INDEX `fmi_claims_claim_date_idx` (`claim_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fmi_settlements` (
  `id`               CHAR(36)      NOT NULL,
  `claim_id`         CHAR(36)      NULL,
  `rental_id`        CHAR(36)      NULL,
  `settlement_type`  VARCHAR(100)  NULL,
  `amount`           DECIMAL(12,0) NOT NULL,
  `payment_date`     DATE          NULL,
  `payment_method`   VARCHAR(100)  NULL,
  `bank_name`        VARCHAR(100)  NULL,
  `account_no`       VARCHAR(100)  NULL,
  `depositor`        VARCHAR(255)  NULL,
  `transaction_no`   VARCHAR(255)  NULL,
  `matched`          TINYINT(1)    NOT NULL DEFAULT 0,
  `match_difference` DECIMAL(12,0) NULL,
  `notes`            TEXT          NULL,
  `created_at`       DATETIME(6)   NOT NULL DEFAULT NOW(6),
  PRIMARY KEY (`id`),
  INDEX `fmi_settlements_claim_id_idx` (`claim_id`),
  INDEX `fmi_settlements_rental_id_idx` (`rental_id`),
  INDEX `fmi_settlements_payment_date_idx` (`payment_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fmi_payments` (
  `id`                  CHAR(36)      NOT NULL,
  `payment_category`    VARCHAR(100)  NOT NULL,
  `payee_name`          VARCHAR(255)  NOT NULL,
  `payee_bank`          VARCHAR(100)  NULL,
  `payee_account`       VARCHAR(100)  NULL,
  `payee_business_no`   VARCHAR(50)   NULL,
  `vehicle_id`          CHAR(36)      NULL,
  `rental_id`           CHAR(36)      NULL,
  `amount`              DECIMAL(12,0) NOT NULL,
  `tax_amount`          DECIMAL(12,0) NULL DEFAULT 0,
  `total_amount`        DECIMAL(12,0) NULL,
  `payment_date`        DATE          NULL,
  `due_date`            DATE          NULL,
  `payment_method`      VARCHAR(100)  NULL,
  `payment_status`      VARCHAR(50)   NOT NULL DEFAULT 'pending',
  `is_recurring`        TINYINT(1)    NOT NULL DEFAULT 0,
  `recurring_period`    VARCHAR(50)   NULL,
  `recurring_start`     DATE          NULL,
  `recurring_end`       DATE          NULL,
  `notes`               TEXT          NULL,
  `created_at`          DATETIME(6)   NOT NULL DEFAULT NOW(6),
  `updated_at`          DATETIME(6)   NOT NULL DEFAULT NOW(6) ON UPDATE NOW(6),
  PRIMARY KEY (`id`),
  INDEX `fmi_payments_payment_category_idx` (`payment_category`),
  INDEX `fmi_payments_payment_status_idx` (`payment_status`),
  INDEX `fmi_payments_payment_date_idx` (`payment_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fmi_rental_timeline` (
  `id`              CHAR(36)     NOT NULL,
  `rental_id`       CHAR(36)     NOT NULL,
  `accident_id`     CHAR(36)     NULL,
  `event_type`      VARCHAR(100) NOT NULL,
  `event_title`     VARCHAR(255) NOT NULL,
  `event_detail`    TEXT         NULL,
  `old_status`      VARCHAR(100) NULL,
  `new_status`      VARCHAR(100) NULL,
  `created_by`      CHAR(36)     NULL,
  `created_by_name` VARCHAR(255) NULL,
  `created_at`      DATETIME(6)  NOT NULL DEFAULT NOW(6),
  PRIMARY KEY (`id`),
  INDEX `fmi_rental_timeline_rental_id_idx` (`rental_id`),
  INDEX `fmi_rental_timeline_created_at_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `codef_connections` (
  `id`             CHAR(36)     NOT NULL,
  `connected_id`   VARCHAR(255) NOT NULL,
  `org_type`       VARCHAR(100) NOT NULL,
  `org_code`       VARCHAR(100) NOT NULL,
  `org_name`       VARCHAR(255) NOT NULL,
  `account_number` VARCHAR(255) NULL,
  `is_active`      TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`     DATETIME(6)  NOT NULL DEFAULT NOW(6),
  `updated_at`     DATETIME(6)  NOT NULL DEFAULT NOW(6) ON UPDATE NOW(6),
  PRIMARY KEY (`id`),
  INDEX `codef_connections_connected_id_idx` (`connected_id`),
  INDEX `codef_connections_org_code_idx` (`org_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `codef_sync_logs` (
  `id`            CHAR(36)     NOT NULL,
  `sync_type`     VARCHAR(100) NOT NULL,
  `org_name`      VARCHAR(255) NULL,
  `fetched`       INT          NOT NULL DEFAULT 0,
  `inserted`      INT          NOT NULL DEFAULT 0,
  `status`        VARCHAR(50)  NOT NULL DEFAULT 'success',
  `error_message` TEXT         NULL,
  `synced_at`     DATETIME(6)  NOT NULL DEFAULT NOW(6),
  PRIMARY KEY (`id`),
  INDEX `codef_sync_logs_sync_type_idx` (`sync_type`),
  INDEX `codef_sync_logs_synced_at_idx` (`synced_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `openbanking_accounts` (
  `id`              CHAR(36)     NOT NULL,
  `user_seq_no`     VARCHAR(255) NULL,
  `fintech_use_num` VARCHAR(255) NULL,
  `account_alias`   VARCHAR(255) NULL,
  `bank_name`       VARCHAR(100) NULL,
  `account_num`     VARCHAR(100) NULL,
  `account_holder`  VARCHAR(255) NULL,
  `is_active`       TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`      DATETIME(6)  NOT NULL DEFAULT NOW(6),
  `updated_at`      DATETIME(6)  NOT NULL DEFAULT NOW(6) ON UPDATE NOW(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `openbanking_accounts_fintech_use_num_key` (`fintech_use_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `openbanking_transactions` (
  `id`              CHAR(36)      NOT NULL,
  `account_id`      CHAR(36)      NULL,
  `fintech_use_num` VARCHAR(255)  NULL,
  `tran_date`       VARCHAR(20)   NULL,
  `tran_time`       VARCHAR(20)   NULL,
  `tran_type`       VARCHAR(50)   NULL,
  `tran_amt`        DECIMAL(15,0) NULL,
  `balance_amt`     DECIMAL(15,0) NULL,
  `print_content`   VARCHAR(255)  NULL,
  `branch_name`     VARCHAR(255)  NULL,
  `created_at`      DATETIME(6)   NOT NULL DEFAULT NOW(6),
  PRIMARY KEY (`id`),
  INDEX `openbanking_transactions_account_id_idx` (`account_id`),
  INDEX `openbanking_transactions_tran_date_idx` (`tran_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- STEP 2: JSON 컬럼 타입 수정 (기존 마이그레이션된 테이블)
-- ============================================================

-- fmi_insurance_companies: daily_rate_standard JSONB
ALTER TABLE fmi_insurance_companies
  MODIFY COLUMN daily_rate_standard LONGTEXT NULL;

-- ============================================================
-- STEP 3: 트리거 생성 (updated_at 자동갱신)
-- ============================================================

DROP TRIGGER IF EXISTS trg_fmi_vehicles_updated;
CREATE TRIGGER trg_fmi_vehicles_updated
  BEFORE UPDATE ON fmi_vehicles
  FOR EACH ROW SET NEW.updated_at = NOW(6);

DROP TRIGGER IF EXISTS trg_fmi_accidents_updated;
CREATE TRIGGER trg_fmi_accidents_updated
  BEFORE UPDATE ON fmi_accidents
  FOR EACH ROW SET NEW.updated_at = NOW(6);

DROP TRIGGER IF EXISTS trg_fmi_rentals_updated;
CREATE TRIGGER trg_fmi_rentals_updated
  BEFORE UPDATE ON fmi_rentals
  FOR EACH ROW SET NEW.updated_at = NOW(6);

DROP TRIGGER IF EXISTS trg_fmi_claims_updated;
CREATE TRIGGER trg_fmi_claims_updated
  BEFORE UPDATE ON fmi_claims
  FOR EACH ROW SET NEW.updated_at = NOW(6);

DROP TRIGGER IF EXISTS trg_fmi_payments_updated;
CREATE TRIGGER trg_fmi_payments_updated
  BEFORE UPDATE ON fmi_payments
  FOR EACH ROW SET NEW.updated_at = NOW(6);

DROP TRIGGER IF EXISTS trg_codef_connections_updated;
CREATE TRIGGER trg_codef_connections_updated
  BEFORE UPDATE ON codef_connections
  FOR EACH ROW SET NEW.updated_at = NOW(6);

-- ============================================================
-- STEP 4: 대차 비즈니스 트리거 (DELIMITER 변경 필요)
-- ============================================================

DELIMITER //

DROP TRIGGER IF EXISTS trg_calc_rental_days //
CREATE TRIGGER trg_calc_rental_days
  BEFORE INSERT ON fmi_rentals
  FOR EACH ROW
BEGIN
  IF NEW.actual_return_date IS NOT NULL AND NEW.dispatch_date IS NOT NULL THEN
    SET NEW.rental_days = GREATEST(1, DATEDIFF(NEW.actual_return_date, NEW.dispatch_date) + 1);
    SET NEW.total_rental_fee = NEW.rental_days * COALESCE(NEW.daily_rate, 0);
    SET NEW.final_claim_amount = NEW.total_rental_fee
      + COALESCE(NEW.additional_charges, 0)
      - COALESCE(NEW.deduction_amount, 0);
  END IF;
  IF NEW.return_mileage IS NOT NULL AND NEW.dispatch_mileage IS NOT NULL THEN
    SET NEW.driven_km = NEW.return_mileage - NEW.dispatch_mileage;
  END IF;
END //

DROP TRIGGER IF EXISTS trg_update_rental_days //
CREATE TRIGGER trg_update_rental_days
  BEFORE UPDATE ON fmi_rentals
  FOR EACH ROW
BEGIN
  IF NEW.actual_return_date IS NOT NULL AND NEW.dispatch_date IS NOT NULL THEN
    SET NEW.rental_days = GREATEST(1, DATEDIFF(NEW.actual_return_date, NEW.dispatch_date) + 1);
    SET NEW.total_rental_fee = NEW.rental_days * COALESCE(NEW.daily_rate, 0);
    SET NEW.final_claim_amount = NEW.total_rental_fee
      + COALESCE(NEW.additional_charges, 0)
      - COALESCE(NEW.deduction_amount, 0);
  END IF;
  IF NEW.return_mileage IS NOT NULL AND NEW.dispatch_mileage IS NOT NULL THEN
    SET NEW.driven_km = NEW.return_mileage - NEW.dispatch_mileage;
  END IF;
  SET NEW.updated_at = NOW(6);
END //

-- ============================================================
-- STEP 5: 대차관리번호 자동생성 트리거
-- ============================================================

DROP TRIGGER IF EXISTS trg_generate_rental_no //
CREATE TRIGGER trg_generate_rental_no
  BEFORE INSERT ON fmi_rentals
  FOR EACH ROW
BEGIN
  DECLARE v_year VARCHAR(4);
  DECLARE v_seq  INT;
  IF NEW.rental_no IS NULL OR NEW.rental_no = '' THEN
    SET v_year = YEAR(NOW());
    SELECT COALESCE(MAX(CAST(SUBSTRING(rental_no, 10) AS UNSIGNED)), 0) + 1
      INTO v_seq
      FROM fmi_rentals
      WHERE rental_no LIKE CONCAT('FMI-', v_year, '-%');
    SET NEW.rental_no = CONCAT('FMI-', v_year, '-', LPAD(v_seq, 4, '0'));
  END IF;
END //

-- ============================================================
-- STEP 6: 청구번호 자동생성 트리거
-- ============================================================

DROP TRIGGER IF EXISTS trg_generate_claim_no //
CREATE TRIGGER trg_generate_claim_no
  BEFORE INSERT ON fmi_claims
  FOR EACH ROW
BEGIN
  DECLARE v_ym  VARCHAR(6);
  DECLARE v_seq INT;
  IF NEW.claim_no IS NULL OR NEW.claim_no = '' THEN
    SET v_ym = DATE_FORMAT(NOW(), '%Y%m');
    SELECT COALESCE(MAX(CAST(SUBSTRING(claim_no, 12) AS UNSIGNED)), 0) + 1
      INTO v_seq
      FROM fmi_claims
      WHERE claim_no LIKE CONCAT('CLM-', v_ym, '-%');
    SET NEW.claim_no = CONCAT('CLM-', v_ym, '-', LPAD(v_seq, 4, '0'));
  END IF;
END //

DELIMITER ;

-- ============================================================
-- STEP 7: 대시보드 VIEW 생성
-- ============================================================

CREATE OR REPLACE VIEW fmi_dashboard_summary AS
SELECT
  (SELECT COUNT(*) FROM fmi_vehicles WHERE status = 'available')   AS vehicles_available,
  (SELECT COUNT(*) FROM fmi_vehicles WHERE status = 'dispatched')  AS vehicles_dispatched,
  (SELECT COUNT(*) FROM fmi_vehicles WHERE status = 'maintenance') AS vehicles_maintenance,
  (SELECT COUNT(*) FROM fmi_vehicles)                               AS vehicles_total,
  (SELECT COUNT(*) FROM fmi_rentals WHERE status = 'pending')      AS rentals_pending,
  (SELECT COUNT(*) FROM fmi_rentals WHERE status = 'dispatched')   AS rentals_active,
  (SELECT COUNT(*) FROM fmi_rentals WHERE status = 'returned')     AS rentals_returned,
  (SELECT COUNT(*) FROM fmi_rentals WHERE status IN ('claiming','claimed')) AS rentals_claiming,
  (SELECT COUNT(*) FROM fmi_claims WHERE status = 'draft')         AS claims_draft,
  (SELECT COUNT(*) FROM fmi_claims WHERE status = 'sent')          AS claims_sent,
  (SELECT COUNT(*) FROM fmi_claims WHERE status IN ('approved','partial_approved')) AS claims_approved,
  (SELECT COALESCE(SUM(total_claim_amount), 0) FROM fmi_claims WHERE status = 'sent') AS claims_pending_amount,
  (SELECT COALESCE(SUM(approved_amount), 0) FROM fmi_claims
    WHERE status = 'paid'
    AND DATE_FORMAT(claim_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')) AS claims_paid_this_month,
  (SELECT COALESCE(SUM(amount), 0) FROM fmi_settlements
    WHERE DATE_FORMAT(payment_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')) AS revenue_this_month,
  (SELECT COALESCE(SUM(total_amount), 0) FROM fmi_payments
    WHERE DATE_FORMAT(payment_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
    AND payment_status = 'paid') AS expense_this_month;

-- ============================================================
-- 완료 확인
-- ============================================================

SELECT
  TABLE_NAME,
  TABLE_ROWS,
  ROUND(DATA_LENGTH / 1024 / 1024, 2) AS size_mb
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'fmi_op'
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_ROWS DESC
LIMIT 30;

SET FOREIGN_KEY_CHECKS = 1;

SELECT '✅ 후처리 완료' AS result;
