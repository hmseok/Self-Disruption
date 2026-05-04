-- ═══════════════════════════════════════════════════════════════════
-- CallScheduler 시프트 교체 요청 — PR-2Y (2026-05-04)
--
-- 목적:
--   · 직원이 본인 일정 중 "이 날 못 나와요" 신청 → 매니저가 처리
--   · 매니저는 [⋯ 더보기] 또는 알림 영역에서 보고 → swap/대체 처리
--
-- 신규 테이블:
--   cs_swap_requests
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cs_swap_requests (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  schedule_id     CHAR(36)     NOT NULL,
  assignment_id   CHAR(36)     NULL COMMENT '본인 셀 — cs_assignments.id (null=직원이 막연한 대체 요청)',
  worker_id       CHAR(36)     NOT NULL COMMENT '신청 워커 cs_workers.id',
  request_date    DATE         NOT NULL COMMENT '교체 대상 일자',
  reason          VARCHAR(255) NULL,
  preferred_swap  CHAR(36)     NULL COMMENT '교체 희망 동료 cs_workers.id (옵션)',
  status          VARCHAR(16)  NOT NULL DEFAULT 'pending'
                  COMMENT 'pending|approved|rejected|canceled',
  resolution_note VARCHAR(255) NULL,
  resolved_at     DATETIME     NULL,
  resolved_by     CHAR(36)     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cs_swap_status (status, created_at),
  KEY idx_cs_swap_schedule (schedule_id, request_date),
  KEY idx_cs_swap_worker (worker_id, request_date),
  CONSTRAINT fk_cs_swap_schedule
    FOREIGN KEY (schedule_id) REFERENCES cs_schedules(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_swap_worker
    FOREIGN KEY (worker_id) REFERENCES cs_workers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS cs_swap_requests;
