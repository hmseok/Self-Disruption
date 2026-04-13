-- ============================================
-- 신차 가격 데이터 테이블 (AI 조회 / 견적서 업로드 결과 저장)
-- ============================================

CREATE TABLE IF NOT EXISTS new_car_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT,
  source TEXT,                          -- '공식사이트 AI조회' / '견적서 업로드 (파일명.pdf)' 등
  price_data JSONB NOT NULL,            -- variants[], trims[], options[] 전체 JSON
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스: 회사별 브랜드+모델 조회 빠르게
CREATE INDEX IF NOT EXISTS idx_new_car_prices_company_brand_model
  ON new_car_prices(company_id, brand, model);

-- RLS 활성화
ALTER TABLE new_car_prices ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 같은 회사 또는 플랫폼 관리자만 접근
CREATE POLICY "new_car_prices_select" ON new_car_prices
  FOR SELECT USING (company_id = get_my_company_id() OR is_platform_admin());

CREATE POLICY "new_car_prices_insert" ON new_car_prices
  FOR INSERT WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());

CREATE POLICY "new_car_prices_update" ON new_car_prices
  FOR UPDATE USING (company_id = get_my_company_id() OR is_platform_admin());

CREATE POLICY "new_car_prices_delete" ON new_car_prices
  FOR DELETE USING (company_id = get_my_company_id() OR is_platform_admin());
