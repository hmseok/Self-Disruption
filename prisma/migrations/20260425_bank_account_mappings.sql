-- PHASE 2: 은행 계좌 매핑 테이블 + corporate_cards 보강
-- 실행: Cloud SQL Console 또는 mysql -h 34.47.105.219 -u admin -p fmi_op < this_file.sql

-- 1. 은행 계좌 매핑 테이블
CREATE TABLE IF NOT EXISTS bank_account_mappings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  account_alias VARCHAR(64) NOT NULL COMMENT '우리은행****8777',
  bank_issuer VARCHAR(16) NOT NULL COMMENT 'WOORI_BANK, KB_BANK',
  bank_name VARCHAR(32) COMMENT '우리은행, 국민은행',
  account_holder VARCHAR(64) COMMENT '예금주',
  assigned_car_id CHAR(36) COMMENT '전용 차량 (NULL=공용)',
  purpose VARCHAR(32) COMMENT 'rent_income, operating, etc.',
  memo VARCHAR(255),
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_account_alias (account_alias),
  KEY idx_bank_mappings_car (assigned_car_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. corporate_cards에 card_issuer 컬럼 추가
ALTER TABLE corporate_cards ADD COLUMN IF NOT EXISTS card_issuer VARCHAR(16) AFTER card_alias;
