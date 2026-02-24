-- ============================================
-- 046: 직원 급여 관리 모듈
-- employee_salaries: 직원별 급여 설정
-- payslips: 월별 급여명세서
-- ============================================

-- ── 1. 직원별 급여 설정 ──
CREATE TABLE IF NOT EXISTS employee_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  base_salary NUMERIC(15,0) NOT NULL DEFAULT 0,        -- 기본급
  allowances JSONB DEFAULT '{}',                        -- 수당 { "식대": 200000, "교통비": 100000, "직책수당": 0 }
  deduction_overrides JSONB DEFAULT '{}',               -- 공제 오버라이드 (특정 항목 직접 지정)

  payment_day INT DEFAULT 25,                           -- 급여일
  tax_type VARCHAR(30) DEFAULT '근로소득',               -- '근로소득' | '사업소득3.3%'
  bank_name VARCHAR(50),                                -- 은행명
  account_number VARCHAR(50),                           -- 계좌번호
  account_holder VARCHAR(50),                           -- 예금주

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT es_unique_employee UNIQUE(company_id, employee_id),
  CONSTRAINT es_valid_tax_type CHECK (tax_type IN ('근로소득', '사업소득3.3%'))
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_es_company ON employee_salaries(company_id);
CREATE INDEX IF NOT EXISTS idx_es_employee ON employee_salaries(employee_id);

-- ── 2. 월별 급여명세서 ──
CREATE TABLE IF NOT EXISTS payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pay_period VARCHAR(7) NOT NULL,                        -- 'YYYY-MM'

  -- 지급 내역
  base_salary NUMERIC(15,0) DEFAULT 0,                   -- 기본급
  total_allowances NUMERIC(15,0) DEFAULT 0,              -- 총 수당
  allowance_details JSONB DEFAULT '{}',                  -- 수당 상세
  gross_salary NUMERIC(15,0) DEFAULT 0,                  -- 총 지급액

  -- 4대보험
  national_pension NUMERIC(15,0) DEFAULT 0,              -- 국민연금
  health_insurance NUMERIC(15,0) DEFAULT 0,              -- 건강보험
  long_care_insurance NUMERIC(15,0) DEFAULT 0,           -- 장기요양보험
  employment_insurance NUMERIC(15,0) DEFAULT 0,          -- 고용보험

  -- 세금
  income_tax NUMERIC(15,0) DEFAULT 0,                    -- 근로소득세 / 사업소득세
  local_income_tax NUMERIC(15,0) DEFAULT 0,              -- 지방소득세
  tax_type VARCHAR(30) DEFAULT '근로소득',

  -- 공제/정산
  total_deductions NUMERIC(15,0) DEFAULT 0,              -- 총 공제액
  expense_claims JSONB DEFAULT '[]',                     -- 실비정산 (지급) [{memo, amount}]
  expense_deductions JSONB DEFAULT '[]',                 -- 개인경비 공제 [{memo, amount}]

  -- 최종
  net_salary NUMERIC(15,0) DEFAULT 0,                    -- 실수령액

  -- 상태
  status VARCHAR(20) DEFAULT 'draft',                    -- draft → confirmed → paid
  paid_date DATE,
  pdf_url TEXT,
  memo TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT ps_unique_period UNIQUE(company_id, employee_id, pay_period),
  CONSTRAINT ps_valid_status CHECK (status IN ('draft', 'confirmed', 'paid')),
  CONSTRAINT ps_valid_tax_type CHECK (tax_type IN ('근로소득', '사업소득3.3%'))
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ps_company ON payslips(company_id);
CREATE INDEX IF NOT EXISTS idx_ps_employee ON payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_ps_period ON payslips(pay_period);
CREATE INDEX IF NOT EXISTS idx_ps_status ON payslips(status);

-- ── 3. RLS (Row Level Security) ──
ALTER TABLE employee_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

-- employee_salaries: 자기 회사 데이터만 접근
CREATE POLICY "es_select" ON employee_salaries
  FOR SELECT USING (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "es_insert" ON employee_salaries
  FOR INSERT WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "es_update" ON employee_salaries
  FOR UPDATE USING (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "es_delete" ON employee_salaries
  FOR DELETE USING (company_id = get_my_company_id() OR is_platform_admin());

-- payslips: 자기 회사 데이터만 접근
CREATE POLICY "ps_select" ON payslips
  FOR SELECT USING (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "ps_insert" ON payslips
  FOR INSERT WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "ps_update" ON payslips
  FOR UPDATE USING (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "ps_delete" ON payslips
  FOR DELETE USING (company_id = get_my_company_id() OR is_platform_admin());

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
