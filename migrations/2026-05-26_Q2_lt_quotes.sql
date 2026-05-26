-- ════════════════════════════════════════════════════════════════════
-- PR-Q2-3 — lt_quotes 테이블 (장기렌트 견적 V3)
-- 2026-05-26 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 명시: 「설정 및 구성이 너무 복잡하여 리뉴얼 / 분석 후 재구성」
--   → 기존 quotes / long_term_quotes (PR-Q1) 폐기, lt_quotes 신설
--   → 원가 자동 산출 (cost_breakdown_json + suggested_rent + margin/IRR)
--   → 신차 입력 3가지: 기존 차량 / 신차 카탈로그 / 신차 AI 캡쳐
--
-- 라이프사이클:
--   draft → sent → accepted → converted (long_term_rentals 생성)
--                ↘ rejected
--                ↘ expired (valid_until 지남)
--
-- 신차 흐름: 신차구입 + 차량 미지정 → contracted: 'pending_delivery'
-- 기존차량: 즉시 contracted: 'contracted'
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행 (DBeaver).
-- ⚠ Rule 24 — 멱등 (CREATE TABLE IF NOT EXISTS).
--
-- 실행:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-26_Q2_lt_quotes.sql
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lt_quotes (
  id                       VARCHAR(36) PRIMARY KEY,

  -- 식별
  quote_no                 VARCHAR(40) NULL COMMENT '견적번호 (수동/자동)',
  status                   VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft|sent|accepted|rejected|expired|converted',
  contract_type            VARCHAR(20) NOT NULL DEFAULT '기존차량' COMMENT '신차구입|기존차량',
  rent_type                VARCHAR(20) NOT NULL DEFAULT 'return' COMMENT 'return(반납형)|buyout(인수형)',

  -- 고객
  customer_name            VARCHAR(100) NOT NULL,
  customer_phone           VARCHAR(30)  NULL,
  customer_email           VARCHAR(100) NULL,
  customer_company         VARCHAR(100) NULL,

  -- 차량 — 기존: vehicle_id / 신차: vehicle_* 스펙 직접 입력 또는 new_car_prices 참조
  vehicle_id               VARCHAR(36)  NULL COMMENT 'cars.id (기존차량)',
  vehicle_car_number       VARCHAR(30)  NULL,
  vehicle_brand            VARCHAR(50)  NULL,
  vehicle_model            VARCHAR(100) NULL,
  vehicle_trim             VARCHAR(100) NULL,
  vehicle_year             INT          NULL,
  vehicle_fuel             VARCHAR(20)  NULL COMMENT '가솔린|디젤|하이브리드|전기',
  vehicle_engine_cc        INT          NULL,
  vehicle_color_ext        VARCHAR(50)  NULL COMMENT '외장 색상',
  vehicle_color_int        VARCHAR(50)  NULL COMMENT '내장 색상',
  vehicle_options_text     VARCHAR(500) NULL COMMENT '옵션 패키지 메모',
  new_car_price_id         VARCHAR(36)  NULL COMMENT 'new_car_prices.id (카탈로그 참조)',

  -- 매입가 / 시장가
  purchase_price           DECIMAL(12,0) NULL COMMENT '매입가 (할인 후, 원가 산출의 핵심 입력)',
  market_price             DECIMAL(12,0) NULL COMMENT '시장가 (참조용)',

  -- 계약 조건
  start_date               DATE         NULL,
  months                   INT          NULL COMMENT '24|36|48|60',
  end_date                 DATE         NULL COMMENT '계산값 (months 기반)',
  annual_km                INT          NULL COMMENT '15000|20000|30000',
  residual_rate            DECIMAL(5,2) NULL COMMENT '인수형 잔존가율 %',

  -- 영업 입력 (협상가 / 보증금 / 선납 / 부대비)
  monthly_fee              DECIMAL(12,0) NULL COMMENT '최종 월 렌트료 (VAT 포함)',
  deposit                  DECIMAL(12,0) NULL COMMENT '보증금',
  upfront_months           INT           NULL COMMENT '선납월수',
  delivery_fee             DECIMAL(12,0) NULL COMMENT '인도비',
  insurance_option         VARCHAR(100)  NULL COMMENT '보험 옵션 텍스트',

  -- 자동 산출 결과 (rent-calc-engine via lib/quote-cost.ts)
  cost_breakdown_json      JSON          NULL COMMENT '{depreciation,finance,insurance,maintenance,tax_inspection,risk,overhead,discount,total}',
  suggested_rent           DECIMAL(12,0) NULL COMMENT '엔진 산출 적정가 (VAT 별도)',
  suggested_rent_with_vat  DECIMAL(12,0) NULL COMMENT '엔진 산출 적정가 (VAT 포함)',
  margin_rate              DECIMAL(5,2)  NULL COMMENT '마진율 %',
  irr_annual               DECIMAL(5,2)  NULL COMMENT '연 IRR %',
  breakeven_months         INT           NULL,
  competitive_index        DECIMAL(5,2)  NULL COMMENT '시장 경쟁력 (1.0=평균)',
  acquisition_total        DECIMAL(12,0) NULL COMMENT '취득원가 합계 (매입가+취득세+공채+탁송)',

  -- 발송 / 유효 / 공유
  sent_at                  DATETIME     NULL,
  valid_until              DATE         NULL,
  owner_id                 VARCHAR(36)  NULL COMMENT '영업 담당 (users.id)',
  owner_name               VARCHAR(50)  NULL COMMENT '담당자 명 (표시용)',
  share_token              VARCHAR(64)  NULL,
  share_views              INT          NOT NULL DEFAULT 0,
  share_last_viewed_at     DATETIME     NULL,

  -- 전환
  converted_to_rental_id   VARCHAR(36)  NULL COMMENT 'long_term_rentals.id',
  converted_at             DATETIME     NULL,

  -- 메타
  memo                     TEXT         NULL,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_ltq2_share_token (share_token),
  KEY idx_ltq2_status (status),
  KEY idx_ltq2_customer (customer_name),
  KEY idx_ltq2_owner (owner_id),
  KEY idx_ltq2_converted (converted_to_rental_id),
  KEY idx_ltq2_vehicle (vehicle_id),
  KEY idx_ltq2_new_car_price (new_car_price_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='장기렌트 견적 V3 (PR-Q2) — 원가 자동 산출 통합';

-- ── 검증 ──────────────────────────────────────────────────
--   SELECT COUNT(*) FROM information_schema.tables
--    WHERE table_schema=DATABASE() AND table_name='lt_quotes';
--   -- 기대: 1
--
--   SHOW INDEX FROM lt_quotes;
--   -- 기대: PRIMARY + uq_ltq2_share_token + 6 idx
--
--   SHOW COLUMNS FROM lt_quotes;
--   -- 기대: 45 컬럼
