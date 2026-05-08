-- ───────────────────────────────────────────────────────────────────
-- PR-6.9 — 라이드 차량 등록 현황 (자체 DB)
-- ───────────────────────────────────────────────────────────────────
-- 카페24 ERP 의 pmccarsm 차량 마스터를 보면서 자체 DB 로 별도 관리/관제.
-- 카페24 측은 read-only — 본 테이블은 FMI 자체 차량 등록 정보.
-- 카페24 차량과 매칭 시 cafe24_idno (= pmccarsm.carsidno) 보관.
-- 멱등 (IF NOT EXISTS — 규칙 24).
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ride_vehicles (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  car_number    VARCHAR(20)  NOT NULL,                 -- 차량번호 (예: "47하9604")
  car_model     VARCHAR(200) DEFAULT NULL,             -- 차종/모델
  owner_name    VARCHAR(100) DEFAULT NULL,             -- 차주명
  owner_phone   VARCHAR(50)  DEFAULT NULL,             -- 차주 연락처
  cafe24_idno   VARCHAR(8)   DEFAULT NULL,             -- 카페24 carsidno 매칭 (선택)
  status        VARCHAR(20)  NOT NULL DEFAULT 'active',-- active / inactive / paused
  note          TEXT         DEFAULT NULL,             -- 자체 관제 메모
  created_by    VARCHAR(36)  DEFAULT NULL,             -- profiles.id 등록자
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_vehicles_car_number (car_number),
  KEY idx_ride_vehicles_cafe24       (cafe24_idno),
  KEY idx_ride_vehicles_status       (status),
  KEY idx_ride_vehicles_created_at   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 검증:
--   SELECT COUNT(*) FROM ride_vehicles;        -- 기대치 0 (신규 테이블)
--   SHOW CREATE TABLE ride_vehicles \G          -- 컬럼/인덱스 확인
