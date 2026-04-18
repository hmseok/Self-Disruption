-- ============================================================================
-- 운영학습 (Operational Learning) 테이블
-- 목적: v2.0 렌트 원가 엔진의 예측값 vs 실제값 비교·학습 기능용 저장소
-- 엔진 함수: analyzeActualVsPredicted, suggestBusinessRules (lib/rent-calc-engine.ts)
-- 사용처: app/quotes/operational-learning/* (운영학습 대시보드)
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. 견적 스냅샷 — 견적 저장 시점의 예측 원가 보관
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calc_snapshots (
  id                     CHAR(36)      NOT NULL PRIMARY KEY,
  quote_id               CHAR(36)      NOT NULL,
  vehicle_id             CHAR(36)              COMMENT 'quotes.vehicle_id',
  contract_id            CHAR(36)              COMMENT '계약으로 전환된 경우',

  -- 입력 요약
  purchase_price         BIGINT        NOT NULL DEFAULT 0,
  term_months            INT           NOT NULL DEFAULT 36,
  contract_type          VARCHAR(20)            COMMENT 'return | buyout',
  annual_mileage         INT                    COMMENT '연 주행거리',
  loan_rate              DECIMAL(5,2)           COMMENT '대출 금리 %',
  vehicle_class          VARCHAR(50)            COMMENT '경형/준중형/중형/대형 등',

  -- 예측 원가 breakdown (월 기준, 원화)
  predicted_depreciation BIGINT                 COMMENT '월 감가',
  predicted_insurance    BIGINT                 COMMENT '월 보험료',
  predicted_maintenance  BIGINT                 COMMENT '월 정비비',
  predicted_tax          BIGINT                 COMMENT '월할 세금/검사',
  predicted_accident_cost BIGINT                COMMENT '월 리스크 적립',
  predicted_overhead     BIGINT                 COMMENT '월 간접비',
  predicted_margin       BIGINT                 COMMENT '월 마진',
  predicted_rent         BIGINT                 COMMENT '월 렌트료(VAT 포함)',

  -- CalcResult 원본 JSON (재분석/감사추적)
  result_json            LONGTEXT,

  snapshot_date          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_cs_quote (quote_id),
  INDEX idx_cs_vehicle (vehicle_id),
  INDEX idx_cs_contract (contract_id),
  INDEX idx_cs_date (snapshot_date),
  INDEX idx_cs_class (vehicle_class, contract_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='견적 시점의 예측 원가 스냅샷 — 운영학습 기반 데이터';


-- ──────────────────────────────────────────────────────────────────────────
-- 2. 실적 기록 — 월 단위로 실제 발생한 원가 저장
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operational_actuals (
  id                     CHAR(36)      NOT NULL PRIMARY KEY,
  snapshot_id            CHAR(36)              COMMENT 'calc_snapshots.id',
  contract_id            CHAR(36)              COMMENT 'contracts.id (스냅샷 없어도 추적 가능)',
  recorded_month         VARCHAR(7)    NOT NULL COMMENT 'YYYY-MM',

  actual_depreciation    BIGINT                 COMMENT '월 실감가 (매각시 역산)',
  actual_insurance       BIGINT                 COMMENT '월 실보험료',
  actual_maintenance     BIGINT                 COMMENT '월 실정비비',
  actual_tax             BIGINT                 COMMENT '월할 실세금',
  actual_accident_cost   BIGINT                 COMMENT '월 실사고비용',

  source                 VARCHAR(20)   NOT NULL DEFAULT 'manual'
                         COMMENT 'manual | auto_payment | auto_accident | mixed',
  notes                  TEXT                   COMMENT '자동집계 결과/메모',

  created_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_oa_snapshot_month (snapshot_id, recorded_month),
  INDEX idx_oa_contract (contract_id),
  INDEX idx_oa_month (recorded_month),
  INDEX idx_oa_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='월 단위 실제 원가 — 운영학습 분석 대상';


-- ──────────────────────────────────────────────────────────────────────────
-- 3. BusinessRules 추천 적용 이력 (선택적 — 감사 추적용)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rule_suggestion_logs (
  id                     CHAR(36)      NOT NULL PRIMARY KEY,
  rule_key               VARCHAR(64)   NOT NULL COMMENT 'business_rules.rule_name',
  old_value              DECIMAL(15,4),
  new_value              DECIMAL(15,4),
  reason                 TEXT                   COMMENT 'suggestBusinessRules 추천 사유',
  confidence             VARCHAR(10)            COMMENT 'high | medium | low',
  sample_size            INT                    COMMENT '분석에 사용된 스냅샷 수',
  applied_by             CHAR(36)               COMMENT 'users.id',
  applied_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_rsl_key (rule_key),
  INDEX idx_rsl_applied (applied_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BusinessRules 자동추천 적용 이력 (감사용)';
