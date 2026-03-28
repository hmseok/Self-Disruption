-- ============================================================
-- pgloader 실행 후 MySQL 후처리 스크립트
--
-- 실행 순서: 01_pgloader.load 완료 후
-- 실행 방법: mysql -h 127.0.0.1 -P 3307 -u USER -p MYSQL_DB < 02_mysql_post_fix.sql
-- ============================================================

USE fmi_op;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = '';

-- ============================================================
-- STEP 1: JSONB/JSON 컬럼 타입 수정 (LONGTEXT → JSON)
-- pgloader가 LONGTEXT로 저장한 JSON 데이터를 JSON 타입으로 변환
-- ============================================================

-- fmi_accidents: raw_data JSONB
ALTER TABLE fmi_accidents
  MODIFY COLUMN raw_data JSON COMMENT 'pgloader: JSONB → JSON';

-- fmi_claims: claim_documents JSONB
ALTER TABLE fmi_claims
  MODIFY COLUMN claim_documents JSON;

-- fmi_insurance_companies: daily_rate_standard JSONB
ALTER TABLE fmi_insurance_companies
  MODIFY COLUMN daily_rate_standard JSON;

-- accident_reports: form_data JSONB
ALTER TABLE accident_reports
  MODIFY COLUMN form_data JSON;

-- ============================================================
-- STEP 2: TEXT[] 배열 컬럼 수정 (LONGTEXT → JSON)
-- pgloader가 {val1,val2} 형식으로 저장한 배열을 JSON 배열로 변환
-- ============================================================

-- fmi_rentals: return_photos TEXT[]
-- pgloader 저장 형식: {url1,url2} → MySQL JSON: ["url1","url2"]
UPDATE fmi_rentals
SET return_photos = CASE
  WHEN return_photos IS NULL OR return_photos = '' OR return_photos = '{}' THEN '[]'
  WHEN LEFT(return_photos, 1) = '{' THEN
    CONCAT('["',
      REPLACE(
        REPLACE(
          REPLACE(
            SUBSTRING(return_photos, 2, LENGTH(return_photos) - 2),  -- {} 제거
            '"', '\\"'  -- 기존 따옴표 이스케이프
          ),
          ',', '","'  -- 콤마를 JSON 구분자로
        ),
        ' ', ''  -- 공백 제거
      ),
    '"]')
  ELSE return_photos
END
WHERE return_photos IS NOT NULL;

ALTER TABLE fmi_rentals
  MODIFY COLUMN return_photos JSON COMMENT 'pgloader: TEXT[] → JSON array';

-- accident_reports: photos TEXT[]
UPDATE accident_reports
SET photos = CASE
  WHEN photos IS NULL OR photos = '' OR photos = '{}' THEN '[]'
  WHEN LEFT(photos, 1) = '{' THEN
    CONCAT('["',
      REPLACE(
        REPLACE(
          SUBSTRING(photos, 2, LENGTH(photos) - 2),
          '"', '\\"'
        ),
        ',', '","'
      ),
    '"]')
  ELSE photos
END
WHERE photos IS NOT NULL;

ALTER TABLE accident_reports
  MODIFY COLUMN photos JSON;

-- ============================================================
-- STEP 3: BOOLEAN 컬럼 확인 및 정리
-- pgloader가 TINYINT(1)로 변환 (이미 정상이지만 확인)
-- ============================================================

-- fmi_vehicles
ALTER TABLE fmi_vehicles
  MODIFY COLUMN is_active TINYINT(1) DEFAULT 1 COMMENT 'boolean';

-- fmi_claims
ALTER TABLE fmi_claims
  MODIFY COLUMN return_damage_yn TINYINT(1) DEFAULT 0;

-- ============================================================
-- STEP 4: MySQL 트리거 생성 (PostgreSQL 트리거 대체)
-- pgloader는 트리거를 이전하지 않으므로 직접 생성
-- ============================================================

-- updated_at 자동갱신 트리거
DROP TRIGGER IF EXISTS trg_fmi_vehicles_updated;
CREATE TRIGGER trg_fmi_vehicles_updated
  BEFORE UPDATE ON fmi_vehicles
  FOR EACH ROW SET NEW.updated_at = NOW();

DROP TRIGGER IF EXISTS trg_fmi_accidents_updated;
CREATE TRIGGER trg_fmi_accidents_updated
  BEFORE UPDATE ON fmi_accidents
  FOR EACH ROW SET NEW.updated_at = NOW();

DROP TRIGGER IF EXISTS trg_fmi_rentals_updated;
CREATE TRIGGER trg_fmi_rentals_updated
  BEFORE UPDATE ON fmi_rentals
  FOR EACH ROW SET NEW.updated_at = NOW();

DROP TRIGGER IF EXISTS trg_fmi_claims_updated;
CREATE TRIGGER trg_fmi_claims_updated
  BEFORE UPDATE ON fmi_claims
  FOR EACH ROW SET NEW.updated_at = NOW();

DROP TRIGGER IF EXISTS trg_fmi_payments_updated;
CREATE TRIGGER trg_fmi_payments_updated
  BEFORE UPDATE ON fmi_payments
  FOR EACH ROW SET NEW.updated_at = NOW();

DROP TRIGGER IF EXISTS trg_codef_connections_updated;
CREATE TRIGGER trg_codef_connections_updated
  BEFORE UPDATE ON codef_connections
  FOR EACH ROW SET NEW.updated_at = NOW();

-- ============================================================
-- STEP 5: 대차일수 자동계산 트리거 (MySQL 버전)
-- PostgreSQL: EXTRACT(DAY FROM ...) → MySQL: DATEDIFF()
-- ============================================================
DROP TRIGGER IF EXISTS trg_calc_rental_days;
CREATE TRIGGER trg_calc_rental_days
  BEFORE INSERT ON fmi_rentals
  FOR EACH ROW
BEGIN
  IF NEW.actual_return_date IS NOT NULL AND NEW.dispatch_date IS NOT NULL THEN
    SET NEW.rental_days = GREATEST(1, DATEDIFF(NEW.actual_return_date, NEW.dispatch_date) + 1);
    SET NEW.total_rental_fee = NEW.rental_days * COALESCE(NEW.daily_rate, 0);
    SET NEW.final_claim_amount = NEW.total_rental_fee + COALESCE(NEW.additional_charges, 0) - COALESCE(NEW.deduction_amount, 0);
  END IF;
  IF NEW.return_mileage IS NOT NULL AND NEW.dispatch_mileage IS NOT NULL THEN
    SET NEW.driven_km = NEW.return_mileage - NEW.dispatch_mileage;
  END IF;
END;

DROP TRIGGER IF EXISTS trg_update_rental_days;
CREATE TRIGGER trg_update_rental_days
  BEFORE UPDATE ON fmi_rentals
  FOR EACH ROW
BEGIN
  IF NEW.actual_return_date IS NOT NULL AND NEW.dispatch_date IS NOT NULL THEN
    SET NEW.rental_days = GREATEST(1, DATEDIFF(NEW.actual_return_date, NEW.dispatch_date) + 1);
    SET NEW.total_rental_fee = NEW.rental_days * COALESCE(NEW.daily_rate, 0);
    SET NEW.final_claim_amount = NEW.total_rental_fee + COALESCE(NEW.additional_charges, 0) - COALESCE(NEW.deduction_amount, 0);
  END IF;
  IF NEW.return_mileage IS NOT NULL AND NEW.dispatch_mileage IS NOT NULL THEN
    SET NEW.driven_km = NEW.return_mileage - NEW.dispatch_mileage;
  END IF;
  SET NEW.updated_at = NOW();
END;

-- ============================================================
-- STEP 6: 대차관리번호 자동생성 (MySQL 버전)
-- PostgreSQL FUNCTION + TRIGGER → MySQL TRIGGER (직접 처리)
-- ============================================================
DROP TRIGGER IF EXISTS trg_generate_rental_no;
CREATE TRIGGER trg_generate_rental_no
  BEFORE INSERT ON fmi_rentals
  FOR EACH ROW
BEGIN
  DECLARE v_year VARCHAR(4);
  DECLARE v_seq INT;
  IF NEW.rental_no IS NULL OR NEW.rental_no = '' THEN
    SET v_year = YEAR(NOW());
    SELECT COALESCE(MAX(
      CAST(SUBSTRING(rental_no, 10) AS UNSIGNED)
    ), 0) + 1 INTO v_seq
    FROM fmi_rentals
    WHERE rental_no LIKE CONCAT('FMI-', v_year, '-%');
    SET NEW.rental_no = CONCAT('FMI-', v_year, '-', LPAD(v_seq, 4, '0'));
  END IF;
END;

-- ============================================================
-- STEP 7: 청구번호 자동생성 (MySQL 버전)
-- ============================================================
DROP TRIGGER IF EXISTS trg_generate_claim_no;
CREATE TRIGGER trg_generate_claim_no
  BEFORE INSERT ON fmi_claims
  FOR EACH ROW
BEGIN
  DECLARE v_ym VARCHAR(6);
  DECLARE v_seq INT;
  IF NEW.claim_no IS NULL OR NEW.claim_no = '' THEN
    SET v_ym = DATE_FORMAT(NOW(), '%Y%m');
    SELECT COALESCE(MAX(
      CAST(SUBSTRING(claim_no, 12) AS UNSIGNED)
    ), 0) + 1 INTO v_seq
    FROM fmi_claims
    WHERE claim_no LIKE CONCAT('CLM-', v_ym, '-%');
    SET NEW.claim_no = CONCAT('CLM-', v_ym, '-', LPAD(v_seq, 4, '0'));
  END IF;
END;

-- ============================================================
-- STEP 8: MySQL 8.0 VIEW 생성 (PostgreSQL VIEW 대체)
-- ============================================================
CREATE OR REPLACE VIEW fmi_dashboard_summary AS
SELECT
  (SELECT COUNT(*) FROM fmi_vehicles WHERE status = 'available') AS vehicles_available,
  (SELECT COUNT(*) FROM fmi_vehicles WHERE status = 'dispatched') AS vehicles_dispatched,
  (SELECT COUNT(*) FROM fmi_vehicles WHERE status = 'maintenance') AS vehicles_maintenance,
  (SELECT COUNT(*) FROM fmi_vehicles) AS vehicles_total,
  (SELECT COUNT(*) FROM fmi_rentals WHERE status = 'pending') AS rentals_pending,
  (SELECT COUNT(*) FROM fmi_rentals WHERE status = 'dispatched') AS rentals_active,
  (SELECT COUNT(*) FROM fmi_rentals WHERE status = 'returned') AS rentals_returned,
  (SELECT COUNT(*) FROM fmi_rentals WHERE status IN ('claiming', 'claimed')) AS rentals_claiming,
  (SELECT COUNT(*) FROM fmi_claims WHERE status = 'draft') AS claims_draft,
  (SELECT COUNT(*) FROM fmi_claims WHERE status = 'sent') AS claims_sent,
  (SELECT COUNT(*) FROM fmi_claims WHERE status IN ('approved', 'partial_approved')) AS claims_approved,
  (SELECT COALESCE(SUM(total_claim_amount), 0) FROM fmi_claims WHERE status = 'sent') AS claims_pending_amount,
  (SELECT COALESCE(SUM(approved_amount), 0) FROM fmi_claims
    WHERE status = 'paid' AND DATE_FORMAT(claim_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')) AS claims_paid_this_month,
  (SELECT COALESCE(SUM(amount), 0) FROM fmi_settlements
    WHERE DATE_FORMAT(payment_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')) AS revenue_this_month,
  (SELECT COALESCE(SUM(total_amount), 0) FROM fmi_payments
    WHERE DATE_FORMAT(payment_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
    AND payment_status = 'paid') AS expense_this_month;

-- ============================================================
-- STEP 9: 문자셋 확인 및 통일
-- ============================================================
ALTER TABLE fmi_vehicles CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE fmi_accidents CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE fmi_rentals CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE fmi_claims CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE fmi_settlements CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE fmi_payments CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE fmi_rental_timeline CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE profiles CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE customers CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE cars CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================
-- 완료 확인
-- ============================================================
SELECT
  TABLE_NAME,
  TABLE_ROWS,
  DATA_LENGTH / 1024 / 1024 AS size_mb
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'fmi_erp'
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_ROWS DESC;

SET FOREIGN_KEY_CHECKS = 1;

SELECT '✅ 후처리 완료' AS result;
