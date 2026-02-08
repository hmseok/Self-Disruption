-- =============================================
-- 기존 데이터 company_id NULL 복구 마이그레이션
-- 로그인 시스템 도입 전에 등록한 데이터는 company_id가 NULL이라
-- 회사 필터에 걸리지 않아 안 보이는 문제 수정
-- =============================================

-- 1단계: 먼저 어떤 회사가 있는지 확인
-- SELECT id, name FROM companies;
-- → 본인 회사의 id를 확인한 후 아래 'YOUR_COMPANY_ID' 부분을 교체하세요

-- =============================================
-- 2단계: 아래 'YOUR_COMPANY_ID' 를 본인 회사 id로 교체 후 실행
-- 예시: 만약 회사 id가 'abc-123-def' 이면
--   WHERE company_id IS NULL → UPDATE ... SET company_id = 'abc-123-def'
-- =============================================

-- 차량 데이터
UPDATE cars
SET company_id = 'YOUR_COMPANY_ID'
WHERE company_id IS NULL;

-- 지입 계약
UPDATE jiip_contracts
SET company_id = 'YOUR_COMPANY_ID'
WHERE company_id IS NULL;

-- 일반 투자
UPDATE general_investments
SET company_id = 'YOUR_COMPANY_ID'
WHERE company_id IS NULL;

-- 견적/계약
UPDATE quotes
SET company_id = 'YOUR_COMPANY_ID'
WHERE company_id IS NULL;

-- 고객
UPDATE customers
SET company_id = 'YOUR_COMPANY_ID'
WHERE company_id IS NULL;

-- 보험 계약
UPDATE insurance_contracts
SET company_id = 'YOUR_COMPANY_ID'
WHERE company_id IS NULL;

-- 대출/금융상품
UPDATE loans
SET company_id = 'YOUR_COMPANY_ID'
WHERE company_id IS NULL;

UPDATE financial_products
SET company_id = 'YOUR_COMPANY_ID'
WHERE company_id IS NULL;

-- 거래 내역 (입출금)
UPDATE transactions
SET company_id = 'YOUR_COMPANY_ID'
WHERE company_id IS NULL;

-- =============================================
-- 확인: NULL company_id가 남아있는지 체크
-- =============================================
-- SELECT 'cars' as tbl, count(*) FROM cars WHERE company_id IS NULL
-- UNION ALL
-- SELECT 'jiip_contracts', count(*) FROM jiip_contracts WHERE company_id IS NULL
-- UNION ALL
-- SELECT 'general_investments', count(*) FROM general_investments WHERE company_id IS NULL
-- UNION ALL
-- SELECT 'quotes', count(*) FROM quotes WHERE company_id IS NULL
-- UNION ALL
-- SELECT 'customers', count(*) FROM customers WHERE company_id IS NULL;
