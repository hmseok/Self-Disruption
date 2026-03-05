-- ═══════════════════════════════════════════════════
-- user_corporate_cards: 사용자별 법인카드 등록 테이블
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_corporate_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID,
  card_name TEXT NOT NULL DEFAULT '',
  card_number TEXT NOT NULL,
  card_last4 TEXT NOT NULL DEFAULT '',
  card_company TEXT DEFAULT '',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_corporate_cards_user ON user_corporate_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_corporate_cards_company ON user_corporate_cards(company_id);
CREATE INDEX IF NOT EXISTS idx_user_corporate_cards_last4 ON user_corporate_cards(card_last4);

-- RLS 정책
ALTER TABLE user_corporate_cards ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 카드만 CRUD 가능
CREATE POLICY "users_own_cards_select" ON user_corporate_cards
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_cards_insert" ON user_corporate_cards
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_cards_update" ON user_corporate_cards
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_own_cards_delete" ON user_corporate_cards
  FOR DELETE USING (auth.uid() = user_id);

-- service_role은 모든 접근 가능 (API 서버용)
CREATE POLICY "service_role_all" ON user_corporate_cards
  FOR ALL USING (auth.role() = 'service_role');
