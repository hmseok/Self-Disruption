-- 2026-05-21 PR-6.14.b-1: MT팀 충전기 자산 + 유지보수
-- 도메인: MT팀이 운영하는 전기차 충전기 설비 자산 관리 + 유지보수 워크플로우
-- 운영 의의:
--   1) 충전기 자산 마스터 (자체 등록 — 카페24 pluglink_charger 와 무관)
--   2) 유지보수 워크플로우 (정기점검 / 고장수리 → 일정 → 작업 → 보고서 → 정산 → 종료)
--   3) 후속 PR: b-2 구글시트 연동, b-3 사진, b-4 보고서 템플릿, b-5 정산
-- 호환: MySQL 8.0 (Cloud SQL r-care-db, fmi_op)
-- 멱등: CREATE TABLE IF NOT EXISTS — 여러 번 실행 안전

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ride_chargers — 충전기 자산 마스터
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_chargers (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  charger_code    VARCHAR(64)  NOT NULL,                    -- 충전기 ID (사용자 정의 고유키)
  station_name    VARCHAR(128) NULL,                        -- 개소명 / 설치 위치명
  address         VARCHAR(255) NULL,                        -- 설치 주소
  model           VARCHAR(128) NULL,                        -- 충전기 모델
  charger_type    VARCHAR(32)  NULL,                        -- 급속 / 완속 등
  capacity_kw     DECIMAL(8,2) NULL,                        -- 충전 용량 (kW)
  installed_date  DATE         NULL,                        -- 설치일
  status          VARCHAR(16)  NOT NULL DEFAULT '정상',     -- 정상 / 점검중 / 고장 / 폐기
  memo            VARCHAR(500) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by      VARCHAR(36)  NULL,
  created_by_name VARCHAR(64)  NULL,
  UNIQUE KEY uq_ride_charger_code (charger_code),           -- 멱등성 (Rule 24)
  KEY idx_charger_status (status),
  KEY idx_charger_station (station_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. ride_charger_maintenance — 유지보수 이력 / 일정
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_charger_maintenance (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  charger_id      VARCHAR(36)  NOT NULL,                    -- ride_chargers.id FK
  maint_type      VARCHAR(16)  NOT NULL DEFAULT '정기점검', -- 정기점검 / 고장수리
  scheduled_date  DATE         NULL,                        -- 예정일
  maint_date      DATE         NULL,                        -- 실제 작업일
  title           VARCHAR(200) NULL,                        -- 작업 제목
  detail          TEXT         NULL,                        -- 작업 내용
  assignee        VARCHAR(64)  NULL,                        -- 담당자
  cost            DECIMAL(12,2) NULL,                       -- 비용
  status          VARCHAR(16)  NOT NULL DEFAULT '예정',     -- 예정 / 진행중 / 완료
  settled         TINYINT(1)   NOT NULL DEFAULT 0,          -- 정산 완료 여부 (b-5)
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by      VARCHAR(36)  NULL,
  created_by_name VARCHAR(64)  NULL,
  KEY idx_maint_charger (charger_id),
  KEY idx_maint_status (status),
  KEY idx_maint_sched (scheduled_date),
  KEY idx_maint_type (maint_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 검증 SQL (Rule 23 — 적용 후 확인)
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) AS chargers FROM ride_chargers;                  -- 기대치: 0 (신규)
-- SELECT COUNT(*) AS maintenance FROM ride_charger_maintenance;    -- 기대치: 0 (신규)
-- SHOW INDEX FROM ride_chargers;                                   -- uq_ride_charger_code 확인
