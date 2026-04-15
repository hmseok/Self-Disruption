-- ============================================================================
-- 시중 대기업 렌트 판매가 테이블
-- 목적: 견적 원가분석 UI의 "목표 렌트가 역산" 기능에 대기업 실판매 샘플 노출
-- 사용처: RentPricingBuilder.tsx > ReverseCalcBar
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_prices (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  brand           VARCHAR(64)  NOT NULL,
  model           VARCHAR(128) NOT NULL,
  year            INT          NOT NULL,
  trim_name       VARCHAR(128),
  company         VARCHAR(32)  NOT NULL COMMENT '롯데/SK/현대/KB/AJ/기타',
  product_name    VARCHAR(64)  COMMENT '신차장기/다이렉트/오토리스 등',
  term_months     INT          NOT NULL DEFAULT 60,
  annual_km       INT          NOT NULL DEFAULT 20000 COMMENT '연 약정 주행(km)',
  deposit_pct     DECIMAL(5,2) DEFAULT 30.00 COMMENT '보증금 비율(%)',
  prepay_pct      DECIMAL(5,2) DEFAULT 0.00,
  monthly_price   DECIMAL(20,6) NOT NULL COMMENT '월 렌트가 (VAT 포함)',
  source_url      VARCHAR(512),
  note            VARCHAR(256),
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mp_lookup (brand, model, year, term_months, annual_km, is_active),
  INDEX idx_mp_company (company, is_active),
  INDEX idx_mp_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 샘플 시드 (영업 테스트용 더미)
-- ※ 실제 운영 시 관리자 페이지에서 수동 입력 또는 크롤러 적재
INSERT INTO market_prices (brand, model, year, company, product_name, term_months, annual_km, monthly_price, note) VALUES
  ('현대', '아반떼', 2026, '롯데', '신차장기',    60, 20000, 475000, '샘플'),
  ('현대', '아반떼', 2026, 'SK',   '다이렉트',    60, 20000, 462000, '샘플'),
  ('현대', '아반떼', 2026, '현대', '오토리스',    60, 20000, 458000, '샘플'),
  ('현대', '아반떼', 2026, 'KB',   '장기렌터카',  60, 20000, 479000, '샘플'),
  ('현대', '아반떼', 2026, 'AJ',   '장기',        60, 20000, 468000, '샘플'),
  ('기아', '쏘렌토', 2026, '롯데', '신차장기',    60, 20000, 745000, '샘플'),
  ('기아', '쏘렌토', 2026, 'SK',   '다이렉트',    60, 20000, 729500, '샘플'),
  ('기아', '쏘렌토', 2026, '현대', '오토리스',    60, 20000, 712800, '샘플'),
  ('기아', '쏘렌토', 2026, 'KB',   '장기렌터카',  60, 20000, 758200, '샘플'),
  ('기아', '쏘렌토', 2026, 'AJ',   '장기',        60, 20000, 721000, '샘플');
