-- ═══════════════════════════════════════════════════════════════
-- 과태료·통행료 미납 관리 (2026-08-08 사용자 요청)
-- 운행 중/반납 후 차량 앞으로 날아오는 과태료·미납 고지 → 당시 고객 자동 매칭 → 청구·납부 추적
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS vehicle_violations (
  id             VARCHAR(36)  NOT NULL PRIMARY KEY,
  car_number     VARCHAR(30)  NOT NULL,
  violation_at   DATETIME     NOT NULL,            -- 위반 일시
  vtype          VARCHAR(30)  NOT NULL,            -- 주정차위반/속도위반/신호위반/통행료미납/기타
  amount         DECIMAL(12,0) NOT NULL DEFAULT 0,
  notice_no      VARCHAR(60)  NULL,                -- 고지서 번호
  agency         VARCHAR(100) NULL,                -- 부과 기관 (지자체/도로공사 등)
  due_date       DATE         NULL,                -- 납부 기한
  -- 고객 매칭 (자동 제안 + 수동 수정)
  matched_source VARCHAR(20)  NULL,                -- fmi_rental / long_term / manual
  matched_id     VARCHAR(36)  NULL,
  customer_name  VARCHAR(100) NULL,
  customer_phone VARCHAR(30)  NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'open',  -- open(미처리)/billed(고객청구)/customer_paid(고객납부)/company_paid(회사부담)/dispute(이의신청)
  file_url       VARCHAR(500) NULL,                -- 고지서 사진
  memo           VARCHAR(500) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_vv_car (car_number),
  KEY idx_vv_at (violation_at),
  KEY idx_vv_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
