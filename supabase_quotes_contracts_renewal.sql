-- ============================================
-- 견적/계약 시스템 리뉴얼 스키마 마이그레이션
-- Supabase SQL Editor에서 실행
-- ============================================

-- 1. quotes 테이블: 고객 연결 + 상태관리
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();

-- 2. contracts 테이블: quote 역링크 + 고객 연결
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS quote_id UUID;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS customer_id UUID;

-- 3. payment_schedules 테이블: 누락 필드 추가
ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS vat DECIMAL(15,0) DEFAULT 0;
ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS paid_date DATE;
ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS round_number INT DEFAULT 0;

-- 4. 인덱스 (성능)
CREATE INDEX IF NOT EXISTS idx_quotes_company_status ON quotes(company_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_quote_id ON contracts(quote_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_contract ON payment_schedules(contract_id, round_number);

-- 5. 기존 quotes에 만료일 설정 (30일)
UPDATE quotes SET expires_at = created_at + INTERVAL '30 days' WHERE expires_at IS NULL;
