-- 2026-05-08 PR-6.10: 라이드 고객사 데이터 통합 (캐피탈/금융 고객사)
-- 도메인: 라이드주식회사가 캐피탈/금융 고객사 차량을 정비/운영 → 고객사가 매일/주/월로 보고
-- 라이드 자체 운영 차량 없음. 전부 고객사 차량.
--
-- 테이블 3개:
--   1) ride_customer_companies   고객사 마스터 (iM/메리츠/MG/MG새마을금고 등 — 확장 가능)
--   2) ride_capital_reports      캐피탈 보고 통합 (iM Daily / 메리츠 / MG / 향후 추가)
--   3) ride_contracts            장기 계약 마스터 (B2B — 계약자/이용자 분리)
--
-- 모두 멱등 (IF NOT EXISTS / INSERT IGNORE) — 여러 번 실행 안전.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. 고객사 마스터
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_customer_companies (
  id                VARCHAR(36)  NOT NULL PRIMARY KEY,
  name              VARCHAR(200) NOT NULL,
  type              VARCHAR(50)  NULL,                  -- capital / finance / corp / etc
  report_frequency  VARCHAR(30)  NULL,                  -- daily / weekly / monthly / on-demand
  active            TINYINT(1)   NOT NULL DEFAULT 1,
  note              TEXT         NULL,
  created_by        VARCHAR(36)  NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_customer_company_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 시드 (멱등 — INSERT IGNORE) — 3개 업체 (사용자 정정 2026-05-08)
-- "mg랑 mg캐피탈 은 둘다 mg캐피탈" — MG새마을금고 보고도 MG캐피탈 하나로 관리
INSERT IGNORE INTO ride_customer_companies (id, name, type, report_frequency, active, note)
VALUES
  (UUID(), 'iM캐피탈',    'capital', 'daily',   1, '매일 정비 리스트 보고'),
  (UUID(), '메리츠캐피탈', 'capital', 'monthly', 1, '월 3-5회 보고 (영업/마감/해지 컬럼 풍부)'),
  (UUID(), 'MG캐피탈',    'capital', 'monthly', 1, '월 3-5회 보고 (MG새마을금고 계약 포함 — 통합 관리)');

-- ─────────────────────────────────────────────────────────────────────────
-- 2. 캐피탈 보고 (raw 누적 — 같은 exec_no 가 여러 날짜에 보고됨)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_capital_reports (
  id                  VARCHAR(36)   NOT NULL PRIMARY KEY,
  customer_id         VARCHAR(36)   NULL,                  -- FK ride_customer_companies.id
  customer_name_snap  VARCHAR(200)  NULL,                  -- 보고 당시 고객사명 스냅샷
  report_date         DATE          NULL,                  -- 보고일자 (파일명 또는 메일 receipt date)
  source_file         VARCHAR(300)  NULL,                  -- 업로드 원본 파일명
  -- 공통 필드
  exec_no             VARCHAR(50)   NULL,
  cust_name           VARCHAR(200)  NULL,
  car_number          VARCHAR(20)   NULL,
  car_model           VARCHAR(300)  NULL,
  car_reg_date        VARCHAR(20)   NULL,
  loan_start_date     VARCHAR(20)   NULL,
  loan_period         VARCHAR(20)   NULL,
  loan_end_date       VARCHAR(20)   NULL,
  exec_reason         VARCHAR(100)  NULL,
  car_options         TEXT          NULL,
  vin                 VARCHAR(50)   NULL,
  insurance_co        VARCHAR(100)  NULL,
  age_band            VARCHAR(50)   NULL,
  ins_start_date      VARCHAR(20)   NULL,
  ins_period          VARCHAR(20)   NULL,
  ins_di              VARCHAR(50)   NULL,                  -- 대인
  ins_dm              VARCHAR(50)   NULL,                  -- 대물
  ins_js              VARCHAR(50)   NULL,                  -- 자손/자기신체
  ins_uninsured       VARCHAR(50)   NULL,                  -- 무보험
  ins_deductible      VARCHAR(50)   NULL,                  -- 자기부담금
  emergency           VARCHAR(20)   NULL,                  -- 긴급출동
  monthly_fee         VARCHAR(20)   NULL,
  maint_product       VARCHAR(100)  NULL,
  snow_tire           VARCHAR(20)   NULL,
  snow_chain          VARCHAR(20)   NULL,
  cust_manager        VARCHAR(100)  NULL,
  cust_phone          VARCHAR(50)   NULL,
  cust_mobile         VARCHAR(50)   NULL,
  cust_address        TEXT          NULL,
  -- 메리츠 등 추가 컬럼 (nullable — 다른 캐피탈은 빈 값)
  bill_address        TEXT          NULL,                  -- 청구지 주소 (메리츠)
  maint_company       VARCHAR(200)  NULL,                  -- 정비업체명 (메리츠)
  closing_date        VARCHAR(20)   NULL,                  -- 마감일자 (메리츠)
  termination_date    VARCHAR(20)   NULL,                  -- 해지일자 (메리츠)
  sales_dept          VARCHAR(100)  NULL,                  -- 영업부서 (메리츠)
  sales_manager       VARCHAR(100)  NULL,                  -- 영업담당자 (메리츠)
  registered_by       VARCHAR(100)  NULL,                  -- 실행등록자 (메리츠)
  -- iM캐피탈 등 추가 컬럼
  rent_substitute     VARCHAR(20)   NULL,                  -- 렌트(대차) (iM)
  additional_driver   TEXT          NULL,                  -- 추가운전자 (iM)
  special_clause      VARCHAR(20)   NULL,                  -- 특약가입여부 (iM)
  note                TEXT          NULL,                  -- 비고
  raw_extra           JSON          NULL,                  -- 가변 추가 필드 (향후 확장)
  created_by          VARCHAR(36)   NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_capital_report (customer_id, report_date, exec_no, car_number),
  KEY idx_rcr_car (car_number),
  KEY idx_rcr_exec (exec_no),
  KEY idx_rcr_report_date (report_date),
  KEY idx_rcr_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. 장기 계약 마스터 (전산 등록 — 계약자/이용자 분리 B2B)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_contracts (
  id                  VARCHAR(36)   NOT NULL PRIMARY KEY,
  customer_id         VARCHAR(36)   NULL,                  -- FK ride_customer_companies.id (선택)
  source_file         VARCHAR(300)  NULL,
  exec_no             VARCHAR(50)   NULL,
  contractor          VARCHAR(200)  NULL,                  -- 계약자
  contract_product    VARCHAR(200)  NULL,                  -- 계약상품
  user_name           VARCHAR(200)  NULL,                  -- 이용자
  car_number          VARCHAR(20)   NULL,
  car_model           VARCHAR(300)  NULL,
  car_reg_date        VARCHAR(20)   NULL,
  contract_start      VARCHAR(20)   NULL,
  contract_period     VARCHAR(20)   NULL,
  contract_end        VARCHAR(20)   NULL,
  is_new              VARCHAR(20)   NULL,                  -- 신규/재렌탈
  car_options         TEXT          NULL,
  vin                 VARCHAR(50)   NULL,
  insurance_co        VARCHAR(100)  NULL,
  age_band            VARCHAR(50)   NULL,
  ins_start_date      VARCHAR(20)   NULL,
  ins_period          VARCHAR(20)   NULL,
  ins_di              VARCHAR(50)   NULL,
  ins_dm              VARCHAR(50)   NULL,
  ins_js              VARCHAR(50)   NULL,
  ins_uninsured       VARCHAR(50)   NULL,
  ins_deductible      VARCHAR(50)   NULL,
  emergency           VARCHAR(20)   NULL,
  monthly_fee         VARCHAR(20)   NULL,
  maint_product       VARCHAR(100)  NULL,
  snow_tire           VARCHAR(20)   NULL,
  snow_chain          VARCHAR(20)   NULL,
  cust_manager        VARCHAR(100)  NULL,
  office_phone        VARCHAR(50)   NULL,
  cust_mobile         VARCHAR(50)   NULL,
  cust_address        TEXT          NULL,
  status              VARCHAR(20)   NOT NULL DEFAULT 'active',
  note                TEXT          NULL,
  raw_extra           JSON          NULL,
  created_by          VARCHAR(36)   NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_contract_exec (exec_no),
  KEY idx_rc_car (car_number),
  KEY idx_rc_contractor (contractor),
  KEY idx_rc_user (user_name),
  KEY idx_rc_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 검증 SQL
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) FROM ride_customer_companies;        -- 4 (시드)
-- SELECT COUNT(*) FROM ride_capital_reports;           -- 0 (신규)
-- SELECT COUNT(*) FROM ride_contracts;                 -- 0 (신규)
-- SHOW CREATE TABLE ride_capital_reports \G
