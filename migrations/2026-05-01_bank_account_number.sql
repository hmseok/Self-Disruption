-- ═══════════════════════════════════════════════════════════════════
-- bank_account_mappings 에 계좌번호 + 지점 컬럼 추가
-- 2026-05-01
--
-- 배경: 통장 매핑이 별칭 정확 일치만 가능 → 매칭 정확도 낮음.
--   카드는 card_number (16자리) → last4 추출하여 정확 매칭.
--   통장도 같은 수준의 정확도 필요.
--
-- 신규 컬럼:
--   account_number       VARCHAR(64)  -- 실제 계좌번호 (예: 1002-928-828777)
--   branch               VARCHAR(64)  -- 지점 (선택)
--   account_holder_phone VARCHAR(32)  -- 예금주 연락처 (선택)
-- ═══════════════════════════════════════════════════════════════════

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'bank_account_mappings'
     AND column_name = 'account_number'
);
SET @sql := IF(@col_exists = 0,
  "ALTER TABLE bank_account_mappings
     ADD COLUMN account_number VARCHAR(64) NULL AFTER account_alias,
     ADD COLUMN branch VARCHAR(64) NULL AFTER account_number,
     ADD COLUMN account_holder_phone VARCHAR(32) NULL AFTER account_holder,
     ADD KEY idx_bam_account_number (account_number)",
  "SELECT 'bank_account_mappings.account_number 이미 존재 — skip' AS msg"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ROLLBACK:
-- ALTER TABLE bank_account_mappings
--   DROP KEY idx_bam_account_number,
--   DROP COLUMN account_number,
--   DROP COLUMN branch,
--   DROP COLUMN account_holder_phone;
