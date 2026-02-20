-- ============================================================
-- 고객관리 테이블 확장 마이그레이션
-- 렌터카 운영에 필요한 고객 정보 컬럼 추가
-- ============================================================

-- 1. customers 테이블 확장
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_date TEXT;           -- 생년월일 (YYYYMMDD)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS license_number TEXT;      -- 운전면허번호
ALTER TABLE customers ADD COLUMN IF NOT EXISTS license_type TEXT;        -- 면허종류 (1종보통, 2종보통 등)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS license_expiry TEXT;      -- 면허만료일
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;             -- 주소
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_detail TEXT;      -- 상세주소

-- 법인 고객 전용
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_number TEXT;     -- 사업자등록번호
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ceo_name TEXT;            -- 대표자명
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_type TEXT;       -- 업태
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_category TEXT;   -- 종목
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_address TEXT;    -- 사업장주소
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_address_detail TEXT; -- 사업장 상세주소

-- 법인 담당자 정보
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person TEXT;      -- 담당자명
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_phone TEXT;       -- 담당자 연락처
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_email TEXT;       -- 담당자 이메일

-- 세금계산서 정보
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_email TEXT;           -- 세금계산서 수신 이메일
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_type TEXT DEFAULT '미발행'; -- 세금계산서유형: 전자세금계산서, 수기세금계산서, 미발행

-- 외국인 전용
ALTER TABLE customers ADD COLUMN IF NOT EXISTS passport_number TEXT;     -- 여권번호
ALTER TABLE customers ADD COLUMN IF NOT EXISTS nationality TEXT;         -- 국적
ALTER TABLE customers ADD COLUMN IF NOT EXISTS intl_license TEXT;        -- 국제면허번호

-- 고객 등급 및 관리
ALTER TABLE customers ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT '일반'; -- VIP, 우수, 일반, 주의
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT[];              -- 태그 배열 (예: ['장기', '사고이력', '법인카드'])
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. 고객 결제 이력 테이블
CREATE TABLE IF NOT EXISTS customer_payments (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  contract_id BIGINT,                    -- 관련 계약 ID (nullable)
  amount NUMERIC NOT NULL DEFAULT 0,     -- 결제/청구 금액
  payment_type TEXT NOT NULL,            -- 'charge'(청구), 'payment'(결제), 'refund'(환불)
  payment_method TEXT,                   -- '카드', '계좌이체', '현금', '자동이체'
  status TEXT DEFAULT '미결제',           -- '결제완료', '미결제', '부분결제', '환불'
  description TEXT,                      -- 설명 (예: "2024년 3월 렌탈료", "보증금")
  due_date DATE,                         -- 결제기한
  paid_date DATE,                        -- 실제 결제일
  receipt_number TEXT,                   -- 영수증/승인번호
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 고객 메모/상담 이력 테이블
CREATE TABLE IF NOT EXISTS customer_notes (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  author_name TEXT,                      -- 작성자 이름
  note_type TEXT DEFAULT '일반',          -- '일반', '상담', '클레임', '정비요청', '사고접수'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 세금계산서 발행 이력 테이블
CREATE TABLE IF NOT EXISTS customer_tax_invoices (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  contract_id BIGINT,
  invoice_number TEXT,                   -- 계산서 번호
  issue_date DATE NOT NULL,              -- 발행일
  supply_amount NUMERIC NOT NULL,        -- 공급가액
  tax_amount NUMERIC NOT NULL,           -- 세액
  total_amount NUMERIC NOT NULL,         -- 합계
  description TEXT,                      -- 품목/적요
  status TEXT DEFAULT '발행',             -- '발행', '수정발행', '취소'
  sent_to_email TEXT,                    -- 발송 이메일
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 정책
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tax_invoices ENABLE ROW LEVEL SECURITY;

-- customer_payments RLS
CREATE POLICY "customer_payments_select" ON customer_payments FOR SELECT
  USING (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "customer_payments_insert" ON customer_payments FOR INSERT
  WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "customer_payments_update" ON customer_payments FOR UPDATE
  USING (company_id = get_my_company_id() OR is_platform_admin())
  WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "customer_payments_delete" ON customer_payments FOR DELETE
  USING (company_id = get_my_company_id() OR is_platform_admin());

-- customer_notes RLS
CREATE POLICY "customer_notes_select" ON customer_notes FOR SELECT
  USING (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "customer_notes_insert" ON customer_notes FOR INSERT
  WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "customer_notes_update" ON customer_notes FOR UPDATE
  USING (company_id = get_my_company_id() OR is_platform_admin())
  WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "customer_notes_delete" ON customer_notes FOR DELETE
  USING (company_id = get_my_company_id() OR is_platform_admin());

-- customer_tax_invoices RLS
CREATE POLICY "customer_tax_invoices_select" ON customer_tax_invoices FOR SELECT
  USING (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "customer_tax_invoices_insert" ON customer_tax_invoices FOR INSERT
  WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "customer_tax_invoices_update" ON customer_tax_invoices FOR UPDATE
  USING (company_id = get_my_company_id() OR is_platform_admin())
  WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "customer_tax_invoices_delete" ON customer_tax_invoices FOR DELETE
  USING (company_id = get_my_company_id() OR is_platform_admin());

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(type);
CREATE INDEX IF NOT EXISTS idx_customers_grade ON customers(grade);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_company ON customer_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tax_invoices_customer ON customer_tax_invoices(customer_id);
