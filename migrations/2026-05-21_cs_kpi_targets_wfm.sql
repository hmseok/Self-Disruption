-- ═══════════════════════════════════════════════════════════════════
-- CX KPI — cs_kpi_targets (목표치) + cs_wfm_config (필요인원 산정 기준)
--   2026-05-21 sukhomin87@gmail.com
--
-- cs_kpi_targets — 상담원/팀 목표치 (KPI 대비 달성률 계산용)
-- cs_wfm_config  — Erlang C 필요인원 산정 기준 (목표 응대율/응대시간/부재율 등)
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- [STEP 1] cs_kpi_targets — 목표치 마스터
CREATE TABLE IF NOT EXISTS cs_kpi_targets (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  scope         VARCHAR(10)   NOT NULL DEFAULT 'team'    COMMENT 'team / agent',
  worker_id     CHAR(36)      DEFAULT NULL               COMMENT 'scope=agent 시 대상',
  metric        VARCHAR(30)   NOT NULL                   COMMENT 'call_count/aht/intake_count/work_hours 등',
  period_kind   VARCHAR(10)   NOT NULL DEFAULT 'monthly' COMMENT 'daily/weekly/monthly',
  target_value  DECIMAL(12,2) DEFAULT 0                  COMMENT '목표값',
  year          INT           DEFAULT NULL               COMMENT '적용 연도',
  month         INT           DEFAULT NULL               COMMENT '적용 월',
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cs_kpi_target (scope, metric, year, month)
) ENGINE=InnoDB COMMENT='CX KPI — 목표치 마스터';

-- [STEP 2] cs_wfm_config — 필요인원 산정 기준 (Erlang C)
CREATE TABLE IF NOT EXISTS cs_wfm_config (
  id                        CHAR(36) NOT NULL PRIMARY KEY,
  target_service_level_pct  INT      DEFAULT 80  COMMENT '목표 응대율 % (예: 80)',
  target_answer_sec         INT      DEFAULT 20  COMMENT '목표 응대 시간 초 (예: 20)',
  shrinkage_pct             INT      DEFAULT 30  COMMENT '부재율 % (휴식·후처리·교육 보정)',
  interval_minutes          INT      DEFAULT 60  COMMENT '산정 단위 (30/60분)',
  max_occupancy_pct         INT      DEFAULT 85  COMMENT '최대 점유율 상한 %',
  updated_at                DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='CX KPI — WFM 필요인원 산정 기준';

-- [STEP 3] cs_wfm_config 기본 1행 시드 (멱등 — 비어있을 때만)
INSERT INTO cs_wfm_config
  (id, target_service_level_pct, target_answer_sec, shrinkage_pct, interval_minutes, max_occupancy_pct)
SELECT UUID(), 80, 20, 30, 60, 85
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM cs_wfm_config);

-- 검증:
-- SELECT COUNT(*) FROM cs_kpi_targets;  -- 기대치 0
-- SELECT * FROM cs_wfm_config;          -- 기대치 1행 (기본값)
