-- V11 — 관리 구분 (2026-07-10 사용자 명시)
-- 「모든 출금 관련 매핑은 투자면 투자, 지입은 지입, 대차면 대차 페이지에.
--   통장 관리에서는 어느 페이지 관리로 할지만 결정」
-- 「셋팅을 할 수 있는 페이지가 있어야 — 사용자가 셋팅하여 구현」 → 구분 목록은 테이블로 (하드코딩 X)
-- Cloud SQL Studio 호환 (DELIMITER 미사용, 멱등 — 여러 번 실행 안전)

-- 1) 구분 목록 테이블 (사용자가 설정 페이지에서 관리)
CREATE TABLE IF NOT EXISTS finance_manage_domains (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  code        VARCHAR(32)  NOT NULL,              -- 내부 코드 (rental/jiip/invest/...)
  label       VARCHAR(32)  NOT NULL,              -- 화면 이름 (대차/지입/투자/...)
  target_page VARCHAR(64)  NULL,                  -- 상세 매핑을 담당하는 페이지 경로
  color       VARCHAR(16)  NULL,                  -- 배지 색 (hex)
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fmd_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) 기본 구분 시드 (INSERT IGNORE — 멱등, 규칙 24. 설정 페이지에서 자유 수정)
INSERT IGNORE INTO finance_manage_domains (id, code, label, target_page, color, sort_order) VALUES
  (UUID(), 'rental',  '대차',    '/operations?tab=deposits', '#1e40af', 1),
  (UUID(), 'jiip',    '지입',    '/jiip',                    '#0f766e', 2),
  (UUID(), 'invest',  '투자',    '/invest/general',          '#7c3aed', 3),
  (UUID(), 'insure',  '보험',    '/insurance',               '#b45309', 4),
  (UUID(), 'repair',  '정비',    '/db/maintenance',          '#dc2626', 5),
  (UUID(), 'general', '일반운영', NULL,                       '#64748b', 9);

-- 3) transactions.manage_domain 컬럼 (있으면 skip)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'transactions'
     AND column_name = 'manage_domain'
);
SET @ddl = IF(@col_exists = 0,
  'ALTER TABLE transactions ADD COLUMN manage_domain VARCHAR(32) NULL, ADD INDEX idx_tx_manage_domain (manage_domain)',
  'SELECT ''transactions.manage_domain 이미 존재 — skip'' AS msg');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) 기존 자료 승격 (멱등 — 이미 지정된 행은 건드리지 않음)
--    4-1) 입금 탭 「대차 입금 아님」 사유 → 구분
UPDATE transactions
   SET manage_domain = CASE JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$._not_rental'))
                         WHEN '지입 정산' THEN 'jiip'
                         WHEN '투자'      THEN 'invest'
                         WHEN '보험'      THEN 'insure'
                         WHEN '일반 매출' THEN 'general'
                         ELSE 'general' END
 WHERE manage_domain IS NULL
   AND raw_data IS NOT NULL
   AND JSON_EXTRACT(raw_data, '$._not_rental') IS NOT NULL;

--    4-2) 이미 상세 연결된 거래 → 구분 자동 승격
UPDATE transactions SET manage_domain = 'rental' WHERE manage_domain IS NULL AND related_type = 'fmi_rental';
UPDATE transactions SET manage_domain = 'jiip'   WHERE manage_domain IS NULL AND related_type IN ('jiip', 'jiip_share');
UPDATE transactions SET manage_domain = 'invest' WHERE manage_domain IS NULL AND related_type = 'invest';

-- 검증: SELECT code, label FROM finance_manage_domains ORDER BY sort_order;  -- 기대 6행
-- 검증: SELECT manage_domain, COUNT(*) FROM transactions WHERE manage_domain IS NOT NULL GROUP BY manage_domain;
