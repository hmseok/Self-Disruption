-- ════════════════════════════════════════════════════════════════════
-- PR-Q1 — long_term_quotes (장기렌트 견적 모듈)
-- 2026-05-26 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 명시: 「렌트 견적자체도 여기서 진행하고… 지금 장기 플로우에서
--   견적이 추가 되는 게 좋을것같아요」
--   → 견적은 별도 테이블 (영업용/여러 안/채택률/권한 분리 가능)
--   → 채택 시 long_term_rentals 로 convert (FK converted_to_rental_id)
--
-- 라이프사이클:
--   draft → sent → accepted → converted (long_term_rentals 생성)
--                ↘ rejected
--                ↘ expired (valid_until 지남)
--
-- 컬럼 그룹:
--   [식별]   id, quote_no, status, contract_type
--   [고객]   customer_name/phone/email/company
--   [차량]   vehicle_id | vehicle_car_number | vehicle_spec
--   [기간]   start_date, months, end_date
--   [금액]   monthly_fee (VAT 포함 단일가), deposit, upfront_months,
--           annual_km, insurance_option, delivery_fee, options_json
--   [발송]   sent_at, valid_until, owner_id, owner_name
--   [공유]   share_token UNIQUE, share_views, share_last_viewed_at
--   [전환]   converted_to_rental_id, converted_at
--   [메타]   memo, created_at, updated_at
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행 (DBeaver 또는 mysql CLI).
-- ⚠ Rule 24 — 멱등 (CREATE TABLE IF NOT EXISTS + 컬럼 가드).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS long_term_quotes (
  id                       VARCHAR(36) PRIMARY KEY,

  -- 식별
  quote_no                 VARCHAR(40) NULL COMMENT '견적번호 (수동 또는 자동)',
  status                   VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft|sent|accepted|rejected|expired|converted',
  contract_type            VARCHAR(20) NOT NULL DEFAULT '기존차량' COMMENT '신차구입|기존차량',

  -- 고객
  customer_name            VARCHAR(100) NOT NULL,
  customer_phone           VARCHAR(30)  NULL,
  customer_email           VARCHAR(100) NULL,
  customer_company         VARCHAR(100) NULL,

  -- 차량 (기존차량 시 vehicle_id/vehicle_car_number, 신차 시 vehicle_spec)
  vehicle_id               VARCHAR(36)  NULL COMMENT 'cars.id (기존차량)',
  vehicle_car_number       VARCHAR(30)  NULL,
  vehicle_spec             VARCHAR(255) NULL COMMENT '신차 차종/트림',

  -- 기간
  start_date               DATE         NULL,
  months                   INT          NULL COMMENT '36/48/60',
  end_date                 DATE         NULL,

  -- 금액 (VAT 포함 단일가 — 사용자 결정)
  monthly_fee              DECIMAL(12,0) NULL COMMENT '월 렌트료 (VAT 포함)',
  deposit                  DECIMAL(12,0) NULL COMMENT '보증금',
  upfront_months           INT           NULL COMMENT '선납월수',
  annual_km                INT           NULL COMMENT '연 주행거리 (15000/20000)',
  insurance_option         VARCHAR(100)  NULL COMMENT '보험 옵션 텍스트',
  delivery_fee             DECIMAL(12,0) NULL COMMENT '인도비',
  options_json             JSON          NULL COMMENT '확장 옵션',

  -- 발송 / 유효
  sent_at                  DATETIME     NULL,
  valid_until              DATE         NULL,
  owner_id                 VARCHAR(36)  NULL COMMENT '담당 영업 (users.id)',
  owner_name               VARCHAR(50)  NULL COMMENT '담당자명 (표시용)',

  -- 공유 링크
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

  UNIQUE KEY uq_ltq_share_token (share_token),
  KEY idx_ltq_status (status),
  KEY idx_ltq_customer (customer_name),
  KEY idx_ltq_sent_at (sent_at),
  KEY idx_ltq_owner (owner_id),
  KEY idx_ltq_converted (converted_to_rental_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='장기렌트 견적 (PR-Q1) — 채택 시 long_term_rentals 로 convert';

-- ── 검증 ──
--   SELECT COUNT(*) FROM information_schema.tables
--    WHERE table_schema=DATABASE() AND table_name='long_term_quotes';
--   -- 기대: 1
--
--   SHOW INDEX FROM long_term_quotes;
--   -- 기대: PRIMARY + uq_ltq_share_token + 4 idx
