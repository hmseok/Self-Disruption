-- ═══════════════════════════════════════════════════════════════
-- 타이어 판매 모듈 (2026-08-07)
-- 흐름: 블랙서클 주문(매입, 우리3582 자동출금) → 판매내역 → 기간 청구서 → KB 516551 입금 매칭
-- ※ COLLATE utf8mb4_unicode_ci 필수 (2026-08-03 collation 1267 교훈)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tire_sales (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  sale_date     DATE         NOT NULL,
  customer_name VARCHAR(100) NULL,
  customer_phone VARCHAR(30) NULL,
  car_number    VARCHAR(30)  NULL,
  item_name     VARCHAR(200) NULL,          -- 상품명 (브랜드/모델)
  spec          VARCHAR(100) NULL,          -- 규격 (225/45R17 등)
  qty           INT          NOT NULL DEFAULT 1,
  unit_price    DECIMAL(12,0) NOT NULL DEFAULT 0,
  amount        DECIMAL(12,0) NOT NULL DEFAULT 0,   -- 판매금액 (qty*unit_price 기본, 수동조정 허용)
  purchase_cost DECIMAL(12,0) NULL,          -- 매입원가 (블랙서클 주문가)
  purchase_tx_id VARCHAR(36) NULL,           -- 매입 출금 거래 연결 (transactions.id)
  invoice_id    VARCHAR(36)  NULL,           -- 청구서 연결
  status        VARCHAR(20)  NOT NULL DEFAULT 'unbilled',  -- unbilled/billed/paid
  source        VARCHAR(20)  NOT NULL DEFAULT 'manual',    -- manual/sms/import
  memo          VARCHAR(500) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tire_sales_date (sale_date),
  KEY idx_tire_sales_invoice (invoice_id),
  KEY idx_tire_sales_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tire_invoices (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  invoice_no    VARCHAR(30)  NOT NULL,       -- TI-20260807-01 형식
  customer_name VARCHAR(100) NULL,
  period_from   DATE         NULL,
  period_to     DATE         NULL,
  line_count    INT          NOT NULL DEFAULT 0,
  total         DECIMAL(12,0) NOT NULL DEFAULT 0,
  status        VARCHAR(20)  NOT NULL DEFAULT 'issued',  -- issued/paid/void
  issued_at     DATETIME NULL,
  paid_at       DATETIME NULL,
  deposit_tx_id VARCHAR(36) NULL,             -- 입금 거래 연결 (transactions.id)
  memo          VARCHAR(500) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tire_invoice_no (invoice_no),
  KEY idx_tire_invoices_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 청구서 공급자(사업자) 정보 — 단일행 키밸류 (사업자등록증 오면 채움)
CREATE TABLE IF NOT EXISTS tire_settings (
  setting_key   VARCHAR(50)  NOT NULL PRIMARY KEY,
  setting_value TEXT         NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO tire_settings (setting_key, setting_value) VALUES
  ('supplier_name', ''),          -- 상호
  ('supplier_biz_no', ''),        -- 사업자등록번호
  ('supplier_ceo', ''),           -- 대표자
  ('supplier_address', ''),       -- 주소
  ('supplier_phone', ''),         -- 연락처
  ('bank_account', '국민은행 441501-01-516551'),  -- 입금계좌 안내
  ('stamp_url', '');              -- 날인 이미지
