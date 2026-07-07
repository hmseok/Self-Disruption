-- V10 (2026-07-08) — transactions.account_last4 추가 (계좌별 관리)
-- PR-ACCOUNT (사용자 명시): 「내역들도 계좌별로 관리할 수 있게」
--   통장 거래에 계좌 끝 4자리를 저장 → 계좌별 필터·계좌 단위 잔액 사슬 검증.
-- 멱등: @col_exists + PREPARE 패턴.

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'account_last4');
SET @sql = IF(@c = 0, 'ALTER TABLE transactions ADD COLUMN account_last4 VARCHAR(8) NULL COMMENT ''계좌 끝4자리 — 계좌별 관리'', ADD INDEX idx_tx_account_last4 (account_last4)', 'SELECT ''account_last4 exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- (선택) 기존 오픈뱅킹 거래 계좌 채우기 — codef_connections 가 1계좌/은행이면 정확
-- UPDATE transactions t JOIN codef_connections c ON c.org_code = t.codef_org_code AND c.org_type='bank'
--    SET t.account_last4 = RIGHT(REPLACE(c.account_number, '-', ''), 4)
--  WHERE t.imported_from = 'codef_bank' AND t.account_last4 IS NULL;

-- 검증: 아래가 1 이면 적용 완료
SELECT COUNT(*) AS v10_applied FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'account_last4';
