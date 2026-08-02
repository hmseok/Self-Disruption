-- ════════════════════════════════════════════════════════════════════
-- 라이드(빌려타) 대차료 정산 내역 — 마감엑셀 건별 임포트 (2026-08-01)
-- ⚠ ride_settlement_items 는 구 cafe24 연동 테이블(37컬럼)이 선점 — 본 테이블은 별개.
-- 사용자 확정: 라이드 차량 대차 건은 라이드가 일괄 정산해 지급 — 건별 내역을
-- 본 테이블에 보관하고 fmi_rentals 와 매칭 (입금 탭 수납 합계에 합산).
-- ⚠ Rule 24 — CREATE TABLE IF NOT EXISTS 멱등.
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ride_settlement_deposits (
  id               CHAR(36)      NOT NULL,
  settle_month     CHAR(7)       NOT NULL COMMENT '정산월 YYYY-MM',
  vehicle_number   VARCHAR(20)   NULL COMMENT '라이드 대차 차량번호',
  deposit_date     DATE          NULL COMMENT '보험사→라이드 입금일',
  insurer          VARCHAR(40)   NULL COMMENT '보험사 (원문)',
  customer_car     VARCHAR(40)   NULL COMMENT '고객(사고) 차량번호',
  amount           DECIMAL(12,0) NOT NULL COMMENT '대차료 입금액',
  rental_id        CHAR(36)      NULL COMMENT '매칭된 fmi_rentals.id',
  match_by         VARCHAR(20)   NULL COMMENT 'car/insurer/manual/none',
  notes            VARCHAR(255)  NULL,
  created_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_ride_item (settle_month, vehicle_number, customer_car, deposit_date, amount),
  KEY idx_ride_rental (rental_id),
  KEY idx_ride_month (settle_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
