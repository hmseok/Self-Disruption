-- 입금자 별칭 매핑 테이블 + 거래 분리 지원
-- 실행: Cloud SQL Console 또는 mysql -h 34.47.105.219 -u admin -p fmi_op < this_file.sql

-- 1. 입금자 별칭 매핑 테이블
-- 통장에 "박진숙"으로 입금되지만 실제 투자자는 "임성민"인 경우 등
CREATE TABLE IF NOT EXISTS client_name_aliases (
  id CHAR(36) NOT NULL PRIMARY KEY,
  bank_name VARCHAR(128) NOT NULL COMMENT '통장에 표시되는 입금자명',
  actual_name VARCHAR(128) NOT NULL COMMENT '실제 투자자/고객명',
  memo VARCHAR(255) COMMENT '비고 (관계 등)',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bank_name (bank_name),
  KEY idx_actual_name (actual_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. transactions에 split 관련 컬럼 추가
-- 합산 입금을 분리할 때: 원본에 split_into, 분리건에 split_from 기록
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_from CHAR(36) COMMENT '분리 원본 거래 ID' AFTER deleted_at;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_into JSON COMMENT '분리된 거래 ID 배열' AFTER split_from;
