-- ============================================
-- 013: 미실행 마이그레이션 통합 (한번에 실행)
-- Self-Disruption ERP
-- 실행: Supabase SQL Editor에서 전체 복사+붙여넣기 후 Run
-- ============================================

-- ============================================
-- A. 신차 가격 데이터 테이블 (new_car_prices)
-- ============================================
CREATE TABLE IF NOT EXISTS new_car_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT,
  source TEXT,
  price_data JSONB NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_new_car_prices_company_brand_model
  ON new_car_prices(company_id, brand, model);

ALTER TABLE new_car_prices ENABLE ROW LEVEL SECURITY;

-- RLS: new_car_prices (에러나면 이미 존재하는것 → 무시)
DO $$
BEGIN
  BEGIN
    CREATE POLICY "new_car_prices_select" ON new_car_prices
      FOR SELECT USING (company_id = get_my_company_id() OR is_platform_admin());
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    CREATE POLICY "new_car_prices_insert" ON new_car_prices
      FOR INSERT WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    CREATE POLICY "new_car_prices_update" ON new_car_prices
      FOR UPDATE USING (company_id = get_my_company_id() OR is_platform_admin());
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    CREATE POLICY "new_car_prices_delete" ON new_car_prices
      FOR DELETE USING (company_id = get_my_company_id() OR is_platform_admin());
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ============================================
-- B. pricing_worksheets 업데이트 (신차 지원 + 주행거리)
-- ============================================
ALTER TABLE pricing_worksheets ALTER COLUMN car_id DROP NOT NULL;
ALTER TABLE pricing_worksheets ADD COLUMN IF NOT EXISTS annual_mileage NUMERIC DEFAULT 1.5;
ALTER TABLE pricing_worksheets ADD COLUMN IF NOT EXISTS dep_mileage_rate NUMERIC DEFAULT 2;
ALTER TABLE pricing_worksheets ADD COLUMN IF NOT EXISTS newcar_info JSONB;

-- unique constraint → partial index로 변경
ALTER TABLE pricing_worksheets DROP CONSTRAINT IF EXISTS pricing_worksheets_company_id_car_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_worksheets_registered
  ON pricing_worksheets(company_id, car_id)
  WHERE car_id IS NOT NULL;


-- ============================================
-- C. 견적/계약 시스템 리뉴얼
-- ============================================
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS quote_id UUID;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS customer_id UUID;

ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS vat DECIMAL(15,0) DEFAULT 0;
ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS paid_date DATE;
ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS round_number INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_quotes_company_status ON quotes(company_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_quote_id ON contracts(quote_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_contract ON payment_schedules(contract_id, round_number);

UPDATE quotes SET expires_at = updated_at + INTERVAL '30 days' WHERE expires_at IS NULL;


-- ============================================
-- 완료 확인
-- ============================================
SELECT 'Migration 013 완료!' AS result,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'new_car_prices') AS new_car_prices_exists,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'pricing_worksheets' AND column_name = 'newcar_info') AS worksheets_updated,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'customer_id') AS quotes_updated;
