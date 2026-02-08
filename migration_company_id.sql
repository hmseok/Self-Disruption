-- ============================================
-- 회사별 데이터 분리를 위한 company_id 추가
-- Supabase SQL Editor에서 실행하세요
-- ============================================

-- 1. customers 테이블
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON customers(company_id);

-- 2. quotes 테이블
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_quotes_company_id ON quotes(company_id);

-- 3. loans 테이블
ALTER TABLE loans ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_loans_company_id ON loans(company_id);

-- 4. transactions 테이블
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_transactions_company_id ON transactions(company_id);

-- 5. general_investments 테이블
ALTER TABLE general_investments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_general_investments_company_id ON general_investments(company_id);

-- ============================================
-- 기존 데이터 마이그레이션 (선택사항)
-- 회사가 하나만 있는 경우, 모든 기존 데이터에 해당 회사 ID 부여
-- ============================================

-- 아래 SQL에서 'YOUR_COMPANY_ID'를 실제 회사 ID로 교체하세요
-- SELECT id, name FROM companies; 로 회사 ID를 먼저 확인하세요

-- UPDATE customers SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
-- UPDATE quotes SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
-- UPDATE loans SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
-- UPDATE transactions SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
-- UPDATE general_investments SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;

-- ============================================
-- (참고) cars 테이블은 이미 company_id가 있습니다
-- (참고) jiip_contracts 테이블도 이미 company_id가 있습니다
-- (참고) insurance_contracts는 car_id를 통해 cars.company_id로 필터링됩니다
-- ============================================
