-- ═══════════════════════════════════════════════════════════════════
-- CallScheduler 휴가 발급량 — PR-2AA (2026-05-04)
--
-- 발급 주기 (사용자 정의):
--   · 연차 (annual)        — 연 1회 (year=2026, month=NULL, granted=15)
--   · 패밀리데이 (familyday) — 월 1회 (year=2026, month=1..12, granted=1)
--   · 병가 (sick)          — 연 단위 (선택)
--   · 공휴일 (holiday)      — quota 없음 (직원별 시프트마다 셋팅)
--   · 무급/경조/기타        — quota 없음
--
-- 잔여 = (granted_days + carried_over_days) - (cs_leaves 같은 worker/year/month/type 합산)
--   · 반차 0.5 일 차감
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cs_leave_quotas (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  worker_id           CHAR(36)     NOT NULL,
  year                SMALLINT     NOT NULL,
  month               TINYINT      NULL COMMENT 'NULL=연 단위 / 1-12=특정 월 (패밀리데이)',
  leave_type          VARCHAR(16)  NOT NULL
                      COMMENT 'annual|familyday|sick|unpaid|family|other',
  granted_days        DECIMAL(4,1) NOT NULL DEFAULT 0,
  carried_over_days   DECIMAL(4,1) NOT NULL DEFAULT 0,
  memo                VARCHAR(255) NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- (worker, year, month, type) 유니크 — month NULL 도 따로 들어감 (NULL 비교는 MySQL 에서 항상 NOT EQUAL 이지만,
  --  실제 운영에선 같은 type 의 NULL 중복은 INSERT IGNORE 또는 애플리케이션 레벨에서 방지)
  UNIQUE KEY uq_cs_quota_main (worker_id, year, month, leave_type),
  KEY idx_cs_quota_year_type (year, leave_type),
  CONSTRAINT fk_cs_quota_worker
    FOREIGN KEY (worker_id) REFERENCES cs_workers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS cs_leave_quotas;
