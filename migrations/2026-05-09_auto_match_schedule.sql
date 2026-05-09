-- ════════════════════════════════════════════════════════════════
-- auto_match_schedule — 자동 매칭 스케줄 (PR-UX4, 2026-05-09)
-- ════════════════════════════════════════════════════════════════
--
-- 매칭 워크플로우 자동 실행 설정 + 마지막 실행 결과 기록.
-- single-row 테이블 (회사 1개 = 스케줄 1개).
--
-- 외부 트리거: GCP Cloud Scheduler / Vercel Cron 가
--   POST /api/finance/auto-match-schedule/run (X-Cron-Secret 헤더)
-- 매번 호출 → enabled=1 + 시간 일치 시 run-workflow 실행.

-- 테이블 생성 (멱등 — IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS auto_match_schedule (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  enabled         TINYINT(1)   NOT NULL DEFAULT 0,
  schedule_hour   TINYINT      NOT NULL DEFAULT 3,            -- 0~23 (KST)
  schedule_minute TINYINT      NOT NULL DEFAULT 0,            -- 0~59
  steps           JSON         NULL,                          -- ['classify-rule', 'classify-ai', 'match-fmi-rental', ...]
  auto_confirm    TINYINT(1)   NOT NULL DEFAULT 0,            -- true: 매칭 결과 자동 confirm (위험)
  last_run_at     DATETIME     NULL,
  last_run_status VARCHAR(16)  NULL,                          -- 'success' | 'partial' | 'failed' | 'running'
  last_run_result JSON         NULL,                          -- 실행 결과 요약
  next_run_at     DATETIME     NULL,                          -- 다음 실행 시각 (계산값)
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 기본 row INSERT (없으면 — 멱등)
INSERT IGNORE INTO auto_match_schedule (id, enabled, schedule_hour, schedule_minute, steps, auto_confirm)
VALUES (
  UUID(),
  0,        -- 기본 비활성
  3, 0,     -- 매일 03:00
  JSON_ARRAY('classify-rule', 'classify-ai',
             'match-fmi-rental', 'match-investor-jiip',
             'match-employee', 'match-freelancer'),
  0         -- 자동 confirm 기본 OFF (사용자 검수 필요)
);

-- 검증
-- SELECT * FROM auto_match_schedule;
