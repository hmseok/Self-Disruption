-- ═══════════════════════════════════════════════════════════════════
-- 배차 보드 + 탁송 요청 시스템
-- 2026-04-30
--
-- 신규 테이블:
--   1) location_codes        — 차량 위치 표준 코드 (차고지/지점/정비소/협력사)
--   2) transport_requests    — 탁송 요청 마스터
--   3) transport_stops       — 탁송 stops (출발/경유/도착, 차량 교체 지원)
--
-- 기존 테이블 확장:
--   1) cars.location_code    — VARCHAR(32) NULL (location_codes.code 참조, FK 안 검)
--                               기존 cars.location 컬럼은 "상세 위치"로 의미 변경
--                               (예: "본사 2층 25번 자리")
--
-- 권한:
--   · 위치 코드 관리: admin only
--   · 탁송 요청: 전 직원 등록/조회 가능, 삭제는 작성자/admin
--
-- 롤백: 본 파일 하단 ROLLBACK 섹션
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- (1) location_codes — 차량 위치 표준 코드
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS location_codes (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  code        VARCHAR(32)  NOT NULL UNIQUE COMMENT '예: HQ, GANGNAM, REPAIR_A',
  label       VARCHAR(64)  NOT NULL COMMENT '예: 본사 차고, 강남지점, 정비소 A',
  address     VARCHAR(255) NULL     COMMENT '실제 주소 (네비/안내용)',
  phone       VARCHAR(32)  NULL     COMMENT '대표 연락처',
  category    VARCHAR(16)  NOT NULL DEFAULT 'garage'
    COMMENT 'garage|branch|repair|partner|customer|other',
  sort_order  INT          NOT NULL DEFAULT 100,
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  notes       VARCHAR(255) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_lc_active (active),
  KEY idx_lc_category (category),
  KEY idx_lc_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='차량 위치 표준 코드';

-- ─────────────────────────────────────────────────────────────
-- (2) cars.location_code 컬럼 추가 (MySQL 8 — IF NOT EXISTS 미지원)
--     information_schema 체크 → 없으면 ADD
-- ─────────────────────────────────────────────────────────────
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'cars'
     AND column_name = 'location_code'
);
SET @sql := IF(@col_exists = 0,
  "ALTER TABLE cars ADD COLUMN location_code VARCHAR(32) NULL AFTER location, ADD KEY idx_cars_location_code (location_code)",
  "SELECT 'cars.location_code 이미 존재 — skip' AS msg"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────
-- (3) transport_requests — 탁송 요청 마스터
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport_requests (
  id                    CHAR(36)     NOT NULL PRIMARY KEY,
  service_type          VARCHAR(32)  NOT NULL DEFAULT 'general'
    COMMENT 'accident_repair|dispatch|return|maint_in|maint_out|sale|general',
  trip_type             VARCHAR(16)  NOT NULL DEFAULT 'one_way'
    COMMENT 'one_way|round_trip',

  -- 자동 요약 (출발지명 → 경유지명 → 도착지명)
  route_summary         VARCHAR(255) NULL COMMENT '예: 문정동→하남시→영등포',

  -- 일정
  scheduled_at          DATETIME     NULL,
  started_at            DATETIME     NULL,
  completed_at          DATETIME     NULL,

  -- 담당 기사
  driver_type           VARCHAR(16)  NULL COMMENT 'employee|freelancer|external',
  driver_id             CHAR(36)     NULL COMMENT 'profiles.id 또는 freelancers.id',
  driver_name           VARCHAR(64)  NULL,
  driver_phone          VARCHAR(32)  NULL,

  -- 사진 인증
  photo_required        TINYINT(1)   NOT NULL DEFAULT 0,
  photo_target_phone    VARCHAR(32)  NULL COMMENT '사진 받을 번호',
  photo_received        TINYINT(1)   NOT NULL DEFAULT 0,
  photo_received_at     DATETIME     NULL,

  -- 비용
  estimated_fee         INT          NULL,
  actual_fee            INT          NULL,
  fee_paid              TINYINT(1)   NOT NULL DEFAULT 0,
  fee_transaction_id    CHAR(36)     NULL COMMENT '연결된 transactions.id',

  -- 상태
  status                VARCHAR(16)  NOT NULL DEFAULT 'requested'
    COMMENT 'requested|assigned|in_progress|completed|cancelled',

  -- 외부 연결
  related_type          VARCHAR(16)  NULL COMMENT 'accident|contract|maintenance|fmi_rental',
  related_id            VARCHAR(36)  NULL,

  -- 원본 텍스트 (paste 입력 보존)
  raw_text              TEXT         NULL,
  notes                 TEXT         NULL,

  created_by            CHAR(36)     NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at            DATETIME     NULL,

  KEY idx_tr_status (status),
  KEY idx_tr_scheduled (scheduled_at),
  KEY idx_tr_driver (driver_id),
  KEY idx_tr_related (related_type, related_id),
  KEY idx_tr_service (service_type),
  KEY idx_tr_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='탁송 요청 마스터';

-- ─────────────────────────────────────────────────────────────
-- (4) transport_stops — 출발/경유/도착 (ordered)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport_stops (
  id                    CHAR(36)     NOT NULL PRIMARY KEY,
  request_id            CHAR(36)     NOT NULL,
  stop_order            INT          NOT NULL COMMENT '1=출발, 마지막=도착, 사이=경유',
  stop_type             VARCHAR(16)  NOT NULL
    COMMENT 'departure|waypoint|destination',

  -- 위치
  location_code         VARCHAR(32)  NULL COMMENT 'location_codes.code 매칭',
  location_name         VARCHAR(255) NULL COMMENT '예: 문정현대지식산업센터 B동 지하4층',
  address               VARCHAR(255) NULL COMMENT '예: 서울 송파구 법원로 11길 11',
  contact_name          VARCHAR(64)  NULL,
  contact_phone         VARCHAR(32)  NULL,

  -- 차량 액션 (이 stop에서 어떤 차량을 어떻게 처리하나)
  -- 일반 케이스: pickup만(출발) 또는 dropoff만(도착)
  -- 차량 교체 케이스(경유): drop A + pickup B
  car_pickup_id         CHAR(36)     NULL COMMENT '회사 차량 pickup',
  car_pickup_external   VARCHAR(64)  NULL COMMENT '외부 차량 pickup (차량번호 자유 입력)',
  car_dropoff_id        CHAR(36)     NULL,
  car_dropoff_external  VARCHAR(64)  NULL,

  -- 시각
  arrival_planned       DATETIME     NULL,
  arrival_actual        DATETIME     NULL,

  notes                 VARCHAR(255) NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_ts_request_order (request_id, stop_order),
  KEY idx_ts_request (request_id),
  KEY idx_ts_pickup (car_pickup_id),
  KEY idx_ts_dropoff (car_dropoff_id),
  KEY idx_ts_planned (arrival_planned)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='탁송 stops (출발/경유/도착)';

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK (필요 시 수동 실행)
-- ═══════════════════════════════════════════════════════════════════
--
-- DROP TABLE IF EXISTS transport_stops;
-- DROP TABLE IF EXISTS transport_requests;
-- ALTER TABLE cars DROP KEY idx_cars_location_code;
-- ALTER TABLE cars DROP COLUMN location_code;
-- DROP TABLE IF EXISTS location_codes;
