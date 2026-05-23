-- ═══════════════════════════════════════════════════════════════════
-- CX KPI — cs_kpi_eval_weights (직원 종합 평가 항목·가중치 설정)
--   2026-05-22 sukhomin87@gmail.com
--
-- 평가 탭 종합점수의 항목별 사용여부·가중치를 코드 상수에서 DB 로 이관.
-- 매니저가 「KPI 설정」 탭에서 편집 → evaluation API 가 이 값을 읽음.
-- 호환: MySQL 8.0 / 멱등
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cs_kpi_eval_weights (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  metric      VARCHAR(30)  NOT NULL              COMMENT '평가 지표 키 (call_count/aht/acw_away_ratio/work_hours)',
  label       VARCHAR(40)  DEFAULT NULL          COMMENT '표시 라벨',
  enabled     TINYINT      DEFAULT 1             COMMENT '평가 사용 여부 (0=제외)',
  weight      INT          DEFAULT 0             COMMENT '가중치 % (enabled 항목 합 100 권장)',
  sort_order  INT          DEFAULT 0             COMMENT '표시 순서',
  updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_eval_metric (metric)
) ENGINE=InnoDB COMMENT='CX KPI — 직원 평가 항목·가중치';

-- 기본 4개 지표 시드 (멱등 — 없을 때만)
INSERT INTO cs_kpi_eval_weights (id, metric, label, enabled, weight, sort_order)
SELECT * FROM (
  SELECT UUID() AS id, 'call_count'      AS metric, '통화량'          AS label, 1 AS enabled, 35 AS weight, 1 AS sort_order UNION ALL
  SELECT UUID(),       'aht',                       '평균처리시간',                1,           30,           2 UNION ALL
  SELECT UUID(),       'acw_away_ratio',            '후처리·이석 관리',            1,           15,           3 UNION ALL
  SELECT UUID(),       'work_hours',                '근무시간',                    1,           20,           4
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM cs_kpi_eval_weights);

-- 검증: SELECT metric, enabled, weight FROM cs_kpi_eval_weights ORDER BY sort_order;
--        기대치 4행, weight 합 100
