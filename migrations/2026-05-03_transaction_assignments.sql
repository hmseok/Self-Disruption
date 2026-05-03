-- ═══════════════════════════════════════════════════════════════════
-- transaction_assignments — 거래 다중 매칭 (5차원 분리 원칙)
-- 2026-05-03
--
-- 배경: transactions.related_type / related_id 단일 슬롯 한계.
--   한 거래에 「KB-8819 카드 + 142호4406 차량 + 석호민 직원」 동시 매칭 불가.
--   사용자 명령: 카드 / 카테고리 / 직원 / 차량 / 투자지입 5차원 명확 분리.
--
-- 새 테이블: 한 거래 → N개 (assignment_type + assignment_id) 매칭.
--   카드 / 통장 모두 적용 (transactions.id 기반이라 source 무관).
--
-- assignment_type 값:
--   car / employee / salary / insurance / loan / jiip / invest /
--   fmi_rental / rental / contract / freelancer / card
--
-- 분배 비율 (ratio):
--   100.00 = 전체 (기본값)
--   50.00 = 차량 2대 분배 시 각각
--   사용처: transaction_vehicle_allocations 와 별도 — 이건 차원 매칭 (분배는 보조 테이블)
--
-- 기존 transactions.related_type / related_id 는 그대로 유지 (legacy 호환).
--   읽기 시 두 데이터 소스 합산:
--     1. transaction_assignments 의 모든 row (신규 매칭)
--     2. transactions.related_type / related_id (legacy, 1개)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS transaction_assignments (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  transaction_id  CHAR(36)     NOT NULL,
  assignment_type VARCHAR(32)  NOT NULL
    COMMENT 'car|employee|salary|insurance|loan|jiip|invest|fmi_rental|rental|contract|freelancer|card',
  assignment_id   CHAR(36)     NOT NULL,
  ratio           DECIMAL(5,2) NOT NULL DEFAULT 100.00
    COMMENT '분배 비율 (%) — 차량 분배 등',
  note            VARCHAR(255) NULL,
  created_by      CHAR(36)     NULL
    COMMENT '사용자 매칭 시 user_id (auto 매칭은 NULL)',
  source          VARCHAR(16)  NOT NULL DEFAULT 'manual'
    COMMENT 'manual|auto|migrated',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ta_tx (transaction_id),
  KEY idx_ta_type_id (assignment_type, assignment_id),
  UNIQUE KEY uniq_ta_tx_type_id (transaction_id, assignment_type, assignment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='거래 다중 매칭 — 5차원 분리 원칙 (카드 카테고리 직원 차량 투자지입)';

-- ROLLBACK:
-- DROP TABLE transaction_assignments;
