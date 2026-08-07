-- ═══════════════════════════════════════════════════════════════
-- 타이어 고객 포털 (2026-08-07 3차) — 거래처 전용 링크 + 배송지 + 이행 상태
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tire_customers (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  token      VARCHAR(24)  NOT NULL,             -- 전용 링크 코드 (/t/{token})
  name       VARCHAR(100) NOT NULL,             -- 거래처명 (우리모터스 등)
  phone      VARCHAR(30)  NULL,
  memo       VARCHAR(300) NULL,
  status     VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active/disabled
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tire_customer_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tire_addresses (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  customer_id   VARCHAR(36)  NOT NULL,
  label         VARCHAR(100) NULL,               -- 본점/성남점/제휴 장착점 등
  address       VARCHAR(300) NOT NULL,
  contact_name  VARCHAR(50)  NULL,
  contact_phone VARCHAR(30)  NULL,
  is_default    TINYINT      NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tire_addr_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 판매내역: 거래처 연결 + 이행 상태 (청구 상태와 별도)
ALTER TABLE tire_sales ADD COLUMN customer_id VARCHAR(36) NULL AFTER customer_phone;
ALTER TABLE tire_sales ADD COLUMN fulfill_status VARCHAR(20) NULL AFTER status;
-- fulfill_status: received(접수)/confirmed(확정)/ordered(주문완료)/shipping(배송중)/done(완료)

-- 카탈로그: 재고·도착예정 (블랙서클 연동 2단계에서 채움)
ALTER TABLE tire_catalog ADD COLUMN stock_note VARCHAR(50) NULL AFTER sale_price;
ALTER TABLE tire_catalog ADD COLUMN delivery_note VARCHAR(80) NULL AFTER stock_note;
ALTER TABLE tire_catalog ADD COLUMN scraped_at DATETIME NULL AFTER delivery_note;
