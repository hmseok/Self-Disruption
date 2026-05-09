-- 2026-05-08 PR-6.11.a: 라이드 정산서 등록 / 검수 / 매칭 / 미등록 고객 추출
-- 도메인: 캐피탈/위탁사가 라이드한테 보내는 정산서 (월 단위 통보)
--          또는 라이드가 위탁사들한테 청구하는 통합 마감지급 (multi-sheet)
-- 운영 의의:
--   1) 정산 포함 = 진행 중 / 미포함 = 종료  (vehicle_status 자동 판정)
--   2) 정산 검수 (라이드 측 확정/이의제기)
--   3) 차량번호/실행번호 → 카페24 + 자체 contracts/reports 매칭
--   4) 정산서에 등장하는 미등록 고객사 자동 추출 → 승인 후 등록

-- ─────────────────────────────────────────────────────────────────────────
-- 1. 위탁사 시드 추가 (총 9개 — 기존 3 + 신규 6)
-- ─────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO ride_customer_companies (id, name, type, report_frequency, active, note)
VALUES
  (UUID(), '우리금융캐피탈', 'capital', 'monthly', 1, '월 마감 — 라이드 통합 보고 메인'),
  (UUID(), 'JB우리캐피탈',   'capital', 'monthly', 1, '월 마감'),
  (UUID(), 'BNK캐피탈',      'capital', 'monthly', 1, '월 마감'),
  (UUID(), '퍼시픽렌터카',   'rental',  'monthly', 1, '렌터카 위탁사'),
  (UUID(), '케이카',         'rental',  'monthly', 1, '중고차 / 렌터카 위탁사'),
  (UUID(), '삼성카드',       'card',    'monthly', 1, '카드사 — 정산 위탁');

-- ─────────────────────────────────────────────────────────────────────────
-- 2. 정산서 메타 (parent / child / single 구조)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_settlements (
  id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
  customer_id           VARCHAR(36)  NULL,                  -- 위탁사 (null = 통합 parent)
  customer_name_snap    VARCHAR(200) NULL,                  -- 스냅샷 (조회 편의)
  parent_settlement_id  VARCHAR(36)  NULL,                  -- 다중 시트: 1 parent + N children
  layout_type           VARCHAR(20)  NOT NULL DEFAULT 'single', -- parent / child / single
  layout_signature      VARCHAR(50)  NULL,                  -- meritz / im / mg / ride-integrated
  category              VARCHAR(50)  NULL,                  -- 위탁사정산 / 정비비 / 사고비 / 정기검사 / 테슬라사고비
  source_file           VARCHAR(300) NULL,
  sheet_name            VARCHAR(200) NULL,
  period_label          VARCHAR(20)  NULL,                  -- '2026-04' / '2026-03'
  period_start          DATE         NULL,
  period_end            DATE         NULL,
  item_count            INT          NOT NULL DEFAULT 0,
  total_supply          DECIMAL(18,2) NULL,                 -- 공급가액
  total_vat             DECIMAL(18,2) NULL,                 -- 부가세
  total_amount          DECIMAL(18,2) NULL,                 -- 합계
  status                VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending/reviewing/confirmed/disputed
  reviewed_by           VARCHAR(36)  NULL,                  -- 라이드 검수자
  reviewed_by_name      VARCHAR(100) NULL,
  reviewed_at           DATETIME     NULL,
  dispute_reason        TEXT         NULL,
  raw_summary           JSON         NULL,                  -- 요약 시트 raw
  note                  TEXT         NULL,
  created_by            VARCHAR(36)  NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rsl_customer (customer_id),
  KEY idx_rsl_parent (parent_settlement_id),
  KEY idx_rsl_period (period_label),
  KEY idx_rsl_status (status),
  KEY idx_rsl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. 정산서 row (차량별 정산 detail)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_settlement_items (
  id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
  settlement_id         VARCHAR(36)  NOT NULL,              -- FK ride_settlements
  layout_type           VARCHAR(20)  NULL,                  -- meritz / im / mg / ride-integrated
  category              VARCHAR(50)  NULL,                  -- 위탁사정산 / 정비비 / 사고비 / ...
  -- 핵심 식별
  exec_no               VARCHAR(50)  NULL,                  -- 실행번호 / 대출번호
  car_number            VARCHAR(20)  NULL,
  car_model             VARCHAR(300) NULL,
  vin                   VARCHAR(50)  NULL,
  -- 거래처
  cust_name             VARCHAR(300) NULL,                  -- 거래처명/임차인명/고객명
  sub_customer          VARCHAR(300) NULL,                  -- 통합 정산서 시 sub
  product_name          VARCHAR(200) NULL,                  -- Self/Premium/Platinum/Basic+/VIP Standard
  -- 금액
  base_fee              DECIMAL(15,2) NULL,                 -- 기본 정비료
  additional_fee        DECIMAL(15,2) NULL,                 -- 추가 정비
  supply_amount         DECIMAL(15,2) NULL,                 -- 공급가액
  vat_amount            DECIMAL(15,2) NULL,
  total_amount          DECIMAL(15,2) NULL,                 -- 합계
  payment_amount        DECIMAL(15,2) NULL,                 -- 지급처리금액
  fee_breakdown         JSON         NULL,                  -- 항목별 detail
  -- 일자/상태
  exec_date             VARCHAR(20)  NULL,
  loan_end_date         VARCHAR(20)  NULL,
  closing_date          VARCHAR(20)  NULL,
  termination_date      VARCHAR(20)  NULL,
  exec_status           VARCHAR(20)  NULL,                  -- 정상/마감/...
  exec_reason           VARCHAR(50)  NULL,                  -- 신규/...
  closing_reason        VARCHAR(100) NULL,
  -- 회차
  installment_no        INT          NULL,
  installment_total     INT          NULL,
  installments_remaining INT         NULL,
  -- 매칭
  matched_cafe24_idno   VARCHAR(8)   NULL,                  -- 카페24 carsidno
  matched_contract_id   VARCHAR(36)  NULL,                  -- ride_contracts.id
  matched_report_id     VARCHAR(36)  NULL,                  -- ride_capital_reports.id
  match_status          VARCHAR(20)  NULL,                  -- matched / partial / unmatched
  match_score           DECIMAL(4,2) NULL,                  -- 0.00 ~ 1.00
  match_notes           TEXT         NULL,
  -- 가변
  raw_extra             JSON         NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rsi_settlement (settlement_id),
  KEY idx_rsi_car (car_number),
  KEY idx_rsi_exec (exec_no),
  KEY idx_rsi_match (match_status),
  KEY idx_rsi_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. 차량 운행 여부 (메리츠 등 별도 시트 보존 — 진행/마감 진실 source)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_settlement_vehicle_status (
  id                VARCHAR(36)  NOT NULL PRIMARY KEY,
  settlement_id     VARCHAR(36)  NOT NULL,
  car_number        VARCHAR(20)  NOT NULL,
  status            VARCHAR(50)  NULL,                      -- 정상 / 마감 / 해지 / ...
  raw_extra         JSON         NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rsvs_settlement (settlement_id),
  KEY idx_rsvs_car (car_number),
  KEY idx_rsvs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. 미등록 고객사 후보 (정산서 → 신규 거래처 자동 추출)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_settlement_customer_candidates (
  id                       VARCHAR(36) NOT NULL PRIMARY KEY,
  settlement_id            VARCHAR(36) NULL,
  settlement_item_id       VARCHAR(36) NULL,
  candidate_name           VARCHAR(300) NOT NULL,
  candidate_type           VARCHAR(20) NOT NULL,            -- capital / customer / unknown
  occurrence_count         INT         NOT NULL DEFAULT 1,  -- 같은 이름 반복 횟수
  status                   VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending / approved / rejected
  promoted_to_company_id   VARCHAR(36) NULL,
  reviewed_by              VARCHAR(36) NULL,
  reviewed_at              DATETIME    NULL,
  note                     TEXT        NULL,
  created_at               DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rscc_name (candidate_name),
  KEY idx_rscc_status (status),
  KEY idx_rscc_settlement (settlement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 검증 SQL
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) FROM ride_customer_companies;        -- 9 (기존 3 + 신규 6)
-- SELECT name, type, report_frequency FROM ride_customer_companies ORDER BY name;
-- SELECT COUNT(*) FROM ride_settlements;               -- 0 (신규)
-- SELECT COUNT(*) FROM ride_settlement_items;          -- 0
-- SELECT COUNT(*) FROM ride_settlement_vehicle_status; -- 0
-- SELECT COUNT(*) FROM ride_settlement_customer_candidates; -- 0
