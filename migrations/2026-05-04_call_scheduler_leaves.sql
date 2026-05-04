-- ═══════════════════════════════════════════════════════════════════
-- CallScheduler 연차 — PR-2P (2026-05-04)
--
-- 목적:
--   · 워커별 연차 / 병가 / 무급휴가 등 사전 등록
--   · 자동 생성 시 해당 워커의 해당 일자 제외
--   · 캘린더에서 special_code='off' 또는 반차 자동 반영 가능
--
-- 신규 테이블:
--   cs_leaves — 연차 마스터 (워커 + 시작/종료 + 종류 + 반차 여부)
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cs_leaves (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  worker_id     CHAR(36)     NOT NULL,
  leave_type    VARCHAR(16)  NOT NULL DEFAULT 'annual'
                COMMENT 'annual(연차)|sick(병가)|unpaid(무급)|family(경조)|other',
  start_date    DATE         NOT NULL,
  end_date      DATE         NOT NULL COMMENT '단일 일자면 start_date 와 동일',
  am_pm         VARCHAR(8)   NOT NULL DEFAULT 'full'
                COMMENT 'full(종일)|am(오전반차)|pm(오후반차)',
  reason        VARCHAR(255) NULL,
  applied_at    DATETIME     NULL COMMENT '신청 일시 (현재는 즉시 등록)',
  applied_by    CHAR(36)     NULL COMMENT 'profiles.id',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cs_leave_worker_date (worker_id, start_date, end_date),
  KEY idx_cs_leave_range (start_date, end_date),
  CONSTRAINT fk_cs_leave_worker
    FOREIGN KEY (worker_id) REFERENCES cs_workers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS cs_leaves;
