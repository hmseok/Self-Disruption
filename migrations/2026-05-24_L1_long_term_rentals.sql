-- ════════════════════════════════════════════════════════════════════
-- PR-L1a — 장기렌트 전용 테이블
-- 2026-05-24 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 명시: 「장기렌트 나간 차량도 사용가능에서 빠져야 한다 — 새로 구현」
--   대차(fmi_rentals)와 별개. 사고 대차 = 단기·보험 / 장기렌트 = 고객 월계약.
--   기존 contracts 는 비어 있어 의존하지 않고 전용 테이블 신설.
--
-- 용도:
--   · 장기렌트 계약 원장 (차량·고객·기간·월렌트료)
--   · operations 「사용가능」 탭이 활성 장기렌트 차량을 제외하는 근거
--     (활성 = status='active' AND 오늘이 start_date~end_date 사이)
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행.
-- ⚠ Rule 24 — CREATE TABLE IF NOT EXISTS 멱등 (재실행 무해).
--
-- 실행:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-24_L1_long_term_rentals.sql
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS long_term_rentals (
  id                 CHAR(36)      NOT NULL                COMMENT '장기렌트 id',
  vehicle_id         CHAR(36)      NULL DEFAULT NULL        COMMENT '차량 cars.id',
  vehicle_car_number VARCHAR(191)  NULL DEFAULT NULL        COMMENT '차량번호 (표시용)',
  customer_name      VARCHAR(191)  NOT NULL                 COMMENT '고객명',
  customer_phone     VARCHAR(191)  NULL DEFAULT NULL        COMMENT '고객 연락처',
  contract_no        VARCHAR(191)  NULL DEFAULT NULL        COMMENT '계약번호 (선택)',
  start_date         DATE          NULL DEFAULT NULL        COMMENT '계약 시작일',
  end_date           DATE          NULL DEFAULT NULL        COMMENT '만기일',
  monthly_fee        DECIMAL(12,0) NULL DEFAULT NULL        COMMENT '월 렌트료',
  deposit            DECIMAL(12,0) NULL DEFAULT NULL        COMMENT '보증금',
  status             VARCHAR(20)   NOT NULL DEFAULT 'active' COMMENT 'active/expired/terminated',
  notes              TEXT          NULL DEFAULT NULL        COMMENT '메모',
  created_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ltr_vehicle (vehicle_id),
  KEY idx_ltr_status (status),
  KEY idx_ltr_period (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 검증 (단독 실행) ──
--   SHOW COLUMNS FROM long_term_rentals;   -- 기대: 14 컬럼
--   SELECT COUNT(*) FROM long_term_rentals; -- 기대: 0 (신규)
