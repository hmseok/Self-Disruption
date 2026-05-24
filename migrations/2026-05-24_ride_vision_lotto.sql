-- 2026-05-24 PR-VISION-2: 로또 당첨추적 기능 (RideVision / 비전 그룹)
-- 도메인: 로또번호추출기에서 "구매함" 체크한 게임을 계정별로 저장하고,
--         동행복권 회차 결과로 당첨여부 / 투자금 / 손익을 표출.
-- 운영 의의:
--   1) ride_lotto_entries  — 사용자가 구매 기록한 게임 (계정별, 회차별)
--   2) ride_lotto_results  — 동행복권 회차 당첨번호 캐시 (외부 재호출 차단)
-- 호환: MySQL 8.0 (Cloud SQL r-care-db, fmi_op)
-- 멱등: CREATE TABLE IF NOT EXISTS — 여러 번 실행 안전. 시드 INSERT 없음.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ride_lotto_entries — 사용자 구매 게임 기록
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_lotto_entries (
  id          VARCHAR(36)      NOT NULL PRIMARY KEY,
  user_id     VARCHAR(36)      NOT NULL,                  -- 인증 사용자 (profiles.id)
  draw_no     INT              NOT NULL,                  -- 구매 대상 회차
  n1          TINYINT UNSIGNED NOT NULL,                  -- 구매 번호 6개 (오름차순 저장)
  n2          TINYINT UNSIGNED NOT NULL,
  n3          TINYINT UNSIGNED NOT NULL,
  n4          TINYINT UNSIGNED NOT NULL,
  n5          TINYINT UNSIGNED NOT NULL,
  n6          TINYINT UNSIGNED NOT NULL,
  amount      INT              NOT NULL DEFAULT 1000,     -- 게임당 투자금 (원)
  source      VARCHAR(16)      NOT NULL DEFAULT 'extractor', -- extractor / manual
  created_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lotto_entry_user (user_id),                     -- 내 기록 조회
  KEY idx_lotto_entry_user_draw (user_id, draw_no)        -- 회차별 그룹
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. ride_lotto_results — 동행복권 회차 당첨번호 캐시
--    당첨번호는 회차당 불변 → INSERT IGNORE 로 멱등 적재.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_lotto_results (
  draw_no     INT              NOT NULL PRIMARY KEY,      -- 동행복권 drwNo
  n1          TINYINT UNSIGNED NOT NULL,                  -- 당첨번호 6개
  n2          TINYINT UNSIGNED NOT NULL,
  n3          TINYINT UNSIGNED NOT NULL,
  n4          TINYINT UNSIGNED NOT NULL,
  n5          TINYINT UNSIGNED NOT NULL,
  n6          TINYINT UNSIGNED NOT NULL,
  bonus       TINYINT UNSIGNED NOT NULL,                  -- 보너스 번호
  draw_date   DATE             NULL,                      -- 추첨일 (drwNoDate)
  fetched_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lotto_result_date (draw_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 검증 SQL (Rule 23 — 적용 후 확인)
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) AS entries FROM ride_lotto_entries;   -- 기대치: 0 (신규)
-- SELECT COUNT(*) AS results FROM ride_lotto_results;   -- 기대치: 0 (신규)
-- SHOW INDEX FROM ride_lotto_entries;                   -- idx_lotto_entry_user_draw 확인
