-- ═══════════════════════════════════════════════════════════════════
-- CX KPI — 커스텀 평가 항목 (cs_kpi_eval_items / cs_kpi_eval_scores)
--   2026-05-23 sukhomin87@gmail.com
--
-- 매니저가 평가 항목을 직접 만들고(친절도·모니터링 점수·교육 이수 등)
-- 상담원별 점수를 입력 → 평가 종합점수에 가중 반영.
--   · cs_kpi_eval_items  — 커스텀 항목 정의 (이름·만점·가중치)
--   · cs_kpi_eval_scores — 상담원 × 기간 × 항목 점수
-- 계산지표(cs_kpi_eval_weights)와 별개 테이블 — 평가 route 에서 함께 합산.
-- 호환: MySQL 8.0 / 멱등 (CREATE IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

-- (1) 커스텀 평가 항목 정의
CREATE TABLE IF NOT EXISTS cs_kpi_eval_items (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  name        VARCHAR(40)  NOT NULL              COMMENT '항목명 (예: 친절도)',
  description VARCHAR(200) DEFAULT NULL           COMMENT '설명',
  max_score   INT          NOT NULL DEFAULT 100  COMMENT '만점 — 정규화 기준 (점수/만점×100)',
  weight      INT          NOT NULL DEFAULT 10   COMMENT '가중치 %',
  sort_order  INT          NOT NULL DEFAULT 0    COMMENT '표시 순서',
  is_active   TINYINT      NOT NULL DEFAULT 1    COMMENT '평가 사용 여부',
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_eval_item_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='CX KPI — 커스텀 평가 항목 정의';

-- (2) 상담원 × 기간 × 항목 점수
CREATE TABLE IF NOT EXISTS cs_kpi_eval_scores (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  item_id      CHAR(36)     NOT NULL              COMMENT 'cs_kpi_eval_items.id',
  worker_id    CHAR(36)     NOT NULL              COMMENT 'cs_workers.id',
  period_kind  VARCHAR(10)  NOT NULL              COMMENT 'daily / weekly / monthly',
  period_label VARCHAR(10)  NOT NULL              COMMENT '2026-05 / 2026-05-19(주시작) / 2026-05-23',
  score        DECIMAL(7,2) NOT NULL DEFAULT 0    COMMENT '입력 점수 (0~max_score)',
  note         VARCHAR(200) DEFAULT NULL          COMMENT '메모',
  updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_eval_score (item_id, worker_id, period_kind, period_label),
  KEY idx_cs_eval_score_period (period_kind, period_label),
  KEY idx_cs_eval_score_item   (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='CX KPI — 커스텀 평가 점수 (상담원×기간×항목)';

-- 시드 없음 — 매니저가 「KPI 설정」 탭에서 항목 직접 생성.

-- 검증:
--   SELECT COUNT(*) FROM cs_kpi_eval_items;   -- 기대 0 (신규)
--   SELECT COUNT(*) FROM cs_kpi_eval_scores;  -- 기대 0 (신규)
