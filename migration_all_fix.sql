-- =============================================
-- 통합 마이그레이션: 전체 복구 SQL
-- Supabase SQL Editor에서 한번에 실행하세요
-- =============================================

-- =============================================
-- PART 1: company_id 컬럼 추가 (없는 테이블에만)
-- =============================================

-- customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON customers(company_id);

-- quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_quotes_company_id ON quotes(company_id);

-- loans
ALTER TABLE loans ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_loans_company_id ON loans(company_id);

-- transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_transactions_company_id ON transactions(company_id);

-- general_investments
ALTER TABLE general_investments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_general_investments_company_id ON general_investments(company_id);

-- insurance_contracts (이전에 빠져있었음!)
ALTER TABLE insurance_contracts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_insurance_company_id ON insurance_contracts(company_id);

-- financial_products (이전에 빠져있었음!)
ALTER TABLE financial_products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_financial_products_company_id ON financial_products(company_id);

-- =============================================
-- PART 2: 기존 NULL 데이터에 회사 ID 할당
-- =============================================

UPDATE cars SET company_id = '9f8a4fee-88b8-46ba-8db5-50fa643f3920' WHERE company_id IS NULL;
UPDATE jiip_contracts SET company_id = '9f8a4fee-88b8-46ba-8db5-50fa643f3920' WHERE company_id IS NULL;
UPDATE general_investments SET company_id = '9f8a4fee-88b8-46ba-8db5-50fa643f3920' WHERE company_id IS NULL;
UPDATE quotes SET company_id = '9f8a4fee-88b8-46ba-8db5-50fa643f3920' WHERE company_id IS NULL;
UPDATE customers SET company_id = '9f8a4fee-88b8-46ba-8db5-50fa643f3920' WHERE company_id IS NULL;
UPDATE insurance_contracts SET company_id = '9f8a4fee-88b8-46ba-8db5-50fa643f3920' WHERE company_id IS NULL;
UPDATE loans SET company_id = '9f8a4fee-88b8-46ba-8db5-50fa643f3920' WHERE company_id IS NULL;
UPDATE financial_products SET company_id = '9f8a4fee-88b8-46ba-8db5-50fa643f3920' WHERE company_id IS NULL;
UPDATE transactions SET company_id = '9f8a4fee-88b8-46ba-8db5-50fa643f3920' WHERE company_id IS NULL;

-- =============================================
-- PART 3: 사이드바 DB 관리 페이지 모듈 추가
-- =============================================

INSERT INTO system_modules (name, path, icon_key, description)
SELECT '차량 시세 DB', '/db/models', 'Chart', '차종별 시세/감가 데이터베이스'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/models');

INSERT INTO system_modules (name, path, icon_key, description)
SELECT '정비/부품 DB', '/db/maintenance', 'Wrench', '정비 항목 및 부품 비용 데이터'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/maintenance');

INSERT INTO system_modules (name, path, icon_key, description)
SELECT '차량 코드 DB', '/db/codes', 'Database', 'AI 견적 및 차량 코드 관리'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/codes');

INSERT INTO system_modules (name, path, icon_key, description)
SELECT '잔가율 DB', '/db/depreciation', 'Chart', '연차별 잔가율 테이블'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/depreciation');

INSERT INTO system_modules (name, path, icon_key, description)
SELECT '롯데렌터카 DB', '/db/lotte', 'Car', '롯데렌터카 견적 아카이브'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/lotte');

-- 기존 회사들에 자동 활성화
INSERT INTO company_modules (company_id, module_id, is_active)
SELECT c.id, sm.id, true
FROM companies c
CROSS JOIN system_modules sm
WHERE sm.path IN ('/db/models', '/db/maintenance', '/db/codes', '/db/depreciation', '/db/lotte')
AND NOT EXISTS (
  SELECT 1 FROM company_modules cm
  WHERE cm.company_id = c.id AND cm.module_id = sm.id
);
