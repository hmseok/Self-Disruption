-- 지입료(월렌트료) 저장 (2026-08-03 사용자 승인 — 고정비 연결 ②)
-- 빌려타 월 정산서의 차량별 월렌트료. 정산 상계 구조라 통장 지출이 없어
-- 손익 반영은 이 테이블이 유일한 원천. 업로드 시 upsert.
CREATE TABLE IF NOT EXISTS ride_settlement_fees (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  settle_month  CHAR(7)       NOT NULL,
  vehicle_number VARCHAR(20)  NOT NULL,
  monthly_fee   DECIMAL(12,0) NOT NULL DEFAULT 0,
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_ride_fee (settle_month, vehicle_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
