-- ══════════════════════════════════════════════
-- 법인카드 사용내역 / 영수증 테이블
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS expense_receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT DEFAULT '',

  -- 지출 상세
  expense_date DATE NOT NULL,
  card_number TEXT DEFAULT '',              -- 카드번호 (예: 4140-0326-9330-7957)
  category TEXT NOT NULL DEFAULT '',        -- 구분 (주유비, 충전, 주차비, 접대, 식비 등)
  merchant TEXT NOT NULL DEFAULT '',        -- 사용처 (업체명)
  item_name TEXT DEFAULT '',                -- 품명 (휘발유, 전기, 식대 등)
  customer_team TEXT DEFAULT '',            -- 고객명/팀원
  amount INTEGER NOT NULL DEFAULT 0,        -- 금액

  -- 영수증 이미지
  receipt_url TEXT DEFAULT '',              -- 영수증 이미지 URL (Storage)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_expense_receipts_company ON expense_receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_user ON expense_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_date ON expense_receipts(expense_date);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_company_user_date ON expense_receipts(company_id, user_id, expense_date);

-- RLS
ALTER TABLE expense_receipts ENABLE ROW LEVEL SECURITY;

-- 본인 데이터만 조회/수정 가능
CREATE POLICY "Users can view own expense_receipts" ON expense_receipts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own expense_receipts" ON expense_receipts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expense_receipts" ON expense_receipts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own expense_receipts" ON expense_receipts
  FOR DELETE USING (auth.uid() = user_id);

-- service_role은 RLS 우회하므로 별도 정책 불필요
