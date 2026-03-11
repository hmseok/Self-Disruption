-- ============================================
-- 074: 정산 계좌 정보 + 이력 조회 지원
-- ============================================

-- 1. jiip_contracts에 계좌 정보 컬럼 추가
ALTER TABLE jiip_contracts ADD COLUMN IF NOT EXISTS bank_name TEXT;          -- 은행명
ALTER TABLE jiip_contracts ADD COLUMN IF NOT EXISTS account_number TEXT;     -- 계좌번호
ALTER TABLE jiip_contracts ADD COLUMN IF NOT EXISTS account_holder TEXT;     -- 예금주

-- 2. general_investments에 계좌 정보 컬럼 추가
ALTER TABLE general_investments ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE general_investments ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE general_investments ADD COLUMN IF NOT EXISTS account_holder TEXT;

-- 3. settlement_shares에 계좌 정보 JSONB 컬럼 추가
ALTER TABLE settlement_shares ADD COLUMN IF NOT EXISTS bank_info JSONB;
-- bank_info 예시: {"bank_name": "신한은행", "account_holder": "홍길동", "account_number": "110-123-456789"}

-- 4. settlement_shares에 실제 지급완료일 컬럼 추가
ALTER TABLE settlement_shares ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 5. 과거 이력 조회를 위한 인덱스 (recipient_phone + company_id)
CREATE INDEX IF NOT EXISTS idx_settlement_shares_recipient_phone
  ON settlement_shares(recipient_phone, company_id)
  WHERE recipient_phone IS NOT NULL;
