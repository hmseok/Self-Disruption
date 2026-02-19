-- 024: 단기대차 시스템 확장 — 롯데렌터카 기준 요율 + 견적/계약 관리
-- Phase 1: lotte_reference_rates (롯데 공식 요금)
-- Phase 2: short_term_rates 확장 (할인율 기반 산출)
-- Phase 3: short_term_quotes (견적서 저장)
-- Phase 4: turnkey_contracts (턴키대차 계약)

------------------------------------------------------------
-- 1. 롯데렌터카 기준 요금 테이블
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lotte_reference_rates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  lotte_category text NOT NULL,          -- 경차, 소형, 중형, 준대형, 대형, 승합, SUV·RV, 수입차, 전기차
  vehicle_names text,                    -- 대표차종 (예: "스파크, 모닝")
  rate_1_3days numeric DEFAULT 0,        -- 1~3일 기준 1일 단가
  rate_4days numeric DEFAULT 0,          -- 4일 기준 1일 단가
  rate_5_6days numeric DEFAULT 0,        -- 5~6일 기준 1일 단가
  rate_7plus_days numeric DEFAULT 0,     -- 7일 이상 기준 1일 단가
  service_group text,                    -- 매핑 정비군 (1군, 2군 ...)
  effective_date date DEFAULT CURRENT_DATE,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE lotte_reference_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lotte_reference_rates_all" ON lotte_reference_rates FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_lotte_ref_company ON lotte_reference_rates(company_id);
CREATE INDEX IF NOT EXISTS idx_lotte_ref_category ON lotte_reference_rates(lotte_category);

------------------------------------------------------------
-- 2. short_term_rates 확장 컬럼
------------------------------------------------------------
ALTER TABLE short_term_rates ADD COLUMN IF NOT EXISTS lotte_ref_id uuid REFERENCES lotte_reference_rates(id);
ALTER TABLE short_term_rates ADD COLUMN IF NOT EXISTS lotte_base_rate numeric DEFAULT 0;
ALTER TABLE short_term_rates ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 40;
ALTER TABLE short_term_rates ADD COLUMN IF NOT EXISTS calc_method text DEFAULT 'auto';

------------------------------------------------------------
-- 3. 단기대차 견적서 테이블
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
  status text DEFAULT 'draft',           -- draft, sent, accepted, contracted, cancelled
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE short_term_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "short_term_quotes_all" ON short_term_quotes FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_stq_company ON short_term_quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_stq_status ON short_term_quotes(status);
CREATE INDEX IF NOT EXISTS idx_stq_number ON short_term_quotes(quote_number);

------------------------------------------------------------
-- 4. 턴키대차 계약 테이블
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
  status text DEFAULT 'active',          -- active, suspended, completed, cancelled
  renewal_status text DEFAULT 'active',  -- active, expiring, renewed, ended
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE turnkey_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "turnkey_contracts_all" ON turnkey_contracts FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_tc_company ON turnkey_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_tc_status ON turnkey_contracts(status);
CREATE INDEX IF NOT EXISTS idx_tc_quote ON turnkey_contracts(quote_id);
