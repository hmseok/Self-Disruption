-- ─────────────────────────────────────────────────────────────
-- #39 Phase 1a: sales_presets 테이블 신설 + business_rules 3키 추가
-- 작성일: 2026-04-22
-- 작성자: Harness Migrator
-- 대상 DB: MySQL 8.x (GCP Cloud SQL, fmi_op)
-- 리스크: 🟢 Green (순수 추가 — 기존 데이터/스키마 영향 없음)
-- ─────────────────────────────────────────────────────────────

-- 1) business_rules 신규 3키 (INSERT IGNORE — 이미 있으면 skip)
--    value 컬럼은 JSON 타입 → CAST(... AS JSON) 필수
INSERT IGNORE INTO business_rules (id, `key`, `value`, description, updated_at)
VALUES
  (UUID(), 'OWN_DAMAGE_RATIO',
   CAST('60' AS JSON),
   '자차 면책 비율 (%) — 보험료 산출 시 자차 사고 부담 비율 (기본 60%)',
   NOW()),
  (UUID(), 'DEFAULT_RESIDUAL_RATE_RETURN',
   CAST('0' AS JSON),
   '반납형 계약 기본 잔존가치율 (%) — 계약 만료 시 차량 회수 (기본 0%)',
   NOW()),
  (UUID(), 'DEFAULT_RESIDUAL_RATE_BUYOUT',
   CAST('30' AS JSON),
   '인수형 계약 기본 잔존가치율 (%) — 계약 만료 시 고객 인수 옵션 가격 (기본 30%)',
   NOW());

-- 2) sales_presets 테이블 신설
--    심플 견적 작성 시 영업 정책별(표준/할인/프리미엄) 기준값 프리셋 관리
CREATE TABLE IF NOT EXISTS sales_presets (
  id                        VARCHAR(36)  NOT NULL PRIMARY KEY,
  name                      VARCHAR(50)  NOT NULL UNIQUE  COMMENT '내부식별자 (표준/할인/프리미엄)',
  label                     VARCHAR(100) NOT NULL         COMMENT 'UI 표시용 라벨',
  description               TEXT                          COMMENT '프리셋 설명 (견적 작성자 가이드)',
  is_default                TINYINT(1)   DEFAULT 0        COMMENT '기본 프리셋 (하나만 TRUE 권장)',

  -- 프리셋별 오버라이드 (NULL이면 business_rules 기본값 적용)
  loan_interest_rate        DECIMAL(5,2)                  COMMENT '대출금리 (%) — NULL이면 business_rules.LOAN_INTEREST_RATE',
  margin_rate               DECIMAL(5,2)                  COMMENT '마진율 (%) — NULL이면 business_rules.DEFAULT_MARGIN_RATE',
  overhead_rate             DECIMAL(5,2)                  COMMENT '관리비율 (%) — NULL이면 business_rules.OVERHEAD_RATE',
  risk_reserve_rate         DECIMAL(5,2)                  COMMENT '리스크 적립율 (%) — NULL이면 business_rules.RISK_RESERVE_RATE',
  deposit_discount_rate     DECIMAL(5,2)                  COMMENT '보증금 할인율 (%)',
  prepayment_discount_rate  DECIMAL(5,2)                  COMMENT '선납 할인율 (%)',
  default_deposit           INT                           COMMENT '기본 보증금 (원)',

  sort_order                INT          DEFAULT 0        COMMENT '정렬 순서 (작은 값 우선)',
  is_active                 TINYINT(1)   DEFAULT 1        COMMENT '활성 여부 (비활성은 견적 선택 목록에서 제외)',
  created_at                TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_active_sort (is_active, sort_order)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='영업 가격 프리셋 — 심플 견적 작성 시 선택';

-- 3) 시드 데이터 — 표준/할인/프리미엄 3종
INSERT IGNORE INTO sales_presets
  (id, name, label, description, is_default,
   loan_interest_rate, margin_rate, overhead_rate, risk_reserve_rate,
   deposit_discount_rate, prepayment_discount_rate, default_deposit,
   sort_order, is_active)
VALUES
  (UUID(), '표준', '표준 (Standard)',
   '업계 평균 기준 — 대부분의 견적에 사용하는 기본 프리셋. 마진 10%, 관리비 5%, 리스크 2%.',
   1,
   NULL, 10.00, 5.00, 2.00,
   1.50, 3.00, 500000,
   1, 1),
  (UUID(), '할인', '할인 (Discount)',
   '공격적 가격 정책 — 물량 확보 또는 경쟁 입찰 시 사용. 마진 6%, 보증금 면제.',
   0,
   NULL, 6.00, 4.00, 1.50,
   2.00, 4.00, 0,
   2, 1),
  (UUID(), '프리미엄', '프리미엄 (Premium)',
   '고가치 차량 · VIP 고객 — 마진 15%, 리스크 여유 확보, 보증금 강화.',
   0,
   NULL, 15.00, 7.00, 3.00,
   1.00, 2.00, 1000000,
   3, 1);

-- 4) 적용 확인 쿼리 (실행 후 수동 확인)
--    SELECT `key`, `value`, description FROM business_rules
--     WHERE `key` IN ('OWN_DAMAGE_RATIO','DEFAULT_RESIDUAL_RATE_RETURN','DEFAULT_RESIDUAL_RATE_BUYOUT');
--    SELECT name, label, margin_rate, overhead_rate, sort_order FROM sales_presets ORDER BY sort_order;
