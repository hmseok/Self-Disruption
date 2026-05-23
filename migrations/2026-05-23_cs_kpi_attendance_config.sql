-- ═══════════════════════════════════════════════════════════════════
-- CX KPI — cs_kpi_attendance_config (근태 지각·조퇴 판정 기준)
--   2026-05-23 sukhomin87@gmail.com
--
-- 「근태」 탭의 지각·조퇴 판정 유예시간(grace) 을 매니저가 「KPI 설정」
-- 탭에서 편집. attendance API 가 이 값을 읽어 정시 ±grace 분 이내는
-- 정상으로 처리. 기본 0분 (정시 엄격 기준 — 사용자 명시 2026-05-23).
-- 호환: MySQL 8.0 / 멱등
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cs_kpi_attendance_config (
  id             CHAR(36)  NOT NULL PRIMARY KEY,
  grace_minutes  INT       NOT NULL DEFAULT 0   COMMENT '지각·조퇴 유예 분 (정시 ±N분 이내 정상)',
  updated_at     DATETIME  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='CX KPI — 근태(지각·조퇴) 판정 기준';

-- 기본 1행 시드 (멱등 — 없을 때만, grace 0분)
INSERT INTO cs_kpi_attendance_config (id, grace_minutes)
SELECT UUID(), 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM cs_kpi_attendance_config);

-- 검증: SELECT grace_minutes FROM cs_kpi_attendance_config;  -- 기대치 1행
