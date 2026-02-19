-- 023+024 통합 (안전 실행 — 이미 존재하는 객체 대응)
-- 단기대차 시스템: short_term_rates + lotte_reference_rates + short_term_quotes + turnkey_contracts

------------------------------------------------------------
-- 1. short_term_rates (기본 테이블)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS short_term_rates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  service_group text NOT NULL,
  vehicle_class text NOT NULL,
  displacement_range text NOT NULL,
  daily_rate numeric DEFAULT 0,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE short_term_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "short_term_rates_all" ON short_term_rates;
CREATE POLICY "short_term_rates_all" ON short_term_rates FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_short_term_rates_company ON short_term_rates(company_id);
CREATE INDEX IF NOT EXISTS idx_short_term_rates_active ON short_term_rates(is_active);

-- 확장 컬럼
ALTER TABLE short_term_rates ADD COLUMN IF NOT EXISTS lotte_base_rate numeric DEFAULT 0;
ALTER TABLE short_term_rates ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 40;
ALTER TABLE short_term_rates ADD COLUMN IF NOT EXISTS calc_method text DEFAULT 'auto';

------------------------------------------------------------
-- 2. lotte_reference_rates (롯데 공식 요금)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lotte_reference_rates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  lotte_category text NOT NULL,
  vehicle_names text,
  rate_1_3days numeric DEFAULT 0,
  rate_4days numeric DEFAULT 0,
  rate_5_6days numeric DEFAULT 0,
  rate_7plus_days numeric DEFAULT 0,
  service_group text,
  effective_date date DEFAULT CURRENT_DATE,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE lotte_reference_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lotte_reference_rates_all" ON lotte_reference_rates;
CREATE POLICY "lotte_reference_rates_all" ON lotte_reference_rates FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_lotte_ref_company ON lotte_reference_rates(company_id);
CREATE INDEX IF NOT EXISTS idx_lotte_ref_category ON lotte_reference_rates(lotte_category);

-- lotte_ref_id는 lotte_reference_rates 생성 후 추가
ALTER TABLE short_term_rates ADD COLUMN IF NOT EXISTS lotte_ref_id uuid REFERENCES lotte_reference_rates(id);

------------------------------------------------------------
-- 3. short_term_quotes (견적서)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS short_term_quotes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid,
  quote_number text,
  customer_name text NOT NULL,
  customer_phone text,
  customer_email text,
  quote_detail jsonb NOT NULL DEFAULT '{}',
  contract_period text DEFAULT '1년',
  discount_percent numeric DEFAULT 40,
  status text DEFAULT 'draft',
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE short_term_quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "short_term_quotes_all" ON short_term_quotes;
CREATE POLICY "short_term_quotes_all" ON short_term_quotes FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_stq_company ON short_term_quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_stq_status ON short_term_quotes(status);
CREATE INDEX IF NOT EXISTS idx_stq_number ON short_term_quotes(quote_number);

------------------------------------------------------------
-- 4. turnkey_contracts (턴키대차 계약)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS turnkey_contracts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES short_term_quotes(id) ON DELETE SET NULL,
  customer_id uuid,
  contract_number text,
  customer_name text,
  start_date date,
  end_date date,
  contract_period_months int,
  annual_amount numeric DEFAULT 0,
  monthly_amount numeric DEFAULT 0,
  monthly_amount_vat numeric DEFAULT 0,
  total_days int DEFAULT 0,
  days_used int DEFAULT 0,
  billing_cycle text DEFAULT 'monthly',
  status text DEFAULT 'active',
  renewal_status text DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE turnkey_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "turnkey_contracts_all" ON turnkey_contracts;
CREATE POLICY "turnkey_contracts_all" ON turnkey_contracts FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_tc_company ON turnkey_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_tc_status ON turnkey_contracts(status);
CREATE INDEX IF NOT EXISTS idx_tc_quote ON turnkey_contracts(quote_id);
