-- ═══════════════════════════════════════════════════════════════
-- 타이어 카탈로그 + 매입 원장 + 신청 페이지 (2026-08-07 2차)
-- 카탈로그: 거래명세서(매입) → 품목·매입단가 자동 축적, 판매단가는 대표 설정
-- 신청: 공개 페이지(/tire/apply)에서 고객이 차량·배송지 입력 → status='requested'
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tire_purchases (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  order_no     VARCHAR(30)  NOT NULL,          -- 블랙서클 주문번호 (일시 인코딩)
  ordered_at   DATETIME     NULL,
  item_name    VARCHAR(300) NULL,               -- 품목명 원문
  brand        VARCHAR(30)  NULL,
  model        VARCHAR(100) NULL,
  spec         VARCHAR(30)  NULL,               -- 235/55R19
  unit_price   DECIMAL(12,0) NOT NULL DEFAULT 0, -- 매입단가 (VAT포함)
  qty          INT          NOT NULL DEFAULT 1,
  supply_amount DECIMAL(12,0) NULL,
  vat          DECIMAL(12,0) NULL,
  source       VARCHAR(20)  NOT NULL DEFAULT 'stmt',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tire_purchase (order_no, item_name),
  KEY idx_tire_purchases_at (ordered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tire_catalog (
  id             VARCHAR(36)  NOT NULL PRIMARY KEY,
  brand          VARCHAR(30)  NOT NULL,
  model          VARCHAR(100) NOT NULL,
  spec           VARCHAR(30)  NOT NULL,
  purchase_price DECIMAL(12,0) NULL,            -- 최근 매입단가 (내부용 — 공개 금지)
  sale_price     DECIMAL(12,0) NULL,            -- 판매단가 (신청 페이지 참고가)
  times_purchased INT         NOT NULL DEFAULT 0,
  last_purchased_at DATETIME  NULL,
  active         TINYINT      NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tire_catalog (brand, model, spec)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tire_sales ADD COLUMN delivery_address VARCHAR(300) NULL AFTER car_number;
