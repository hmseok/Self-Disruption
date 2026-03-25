-- ============================================
-- Codef 연동 테이블
-- ============================================

-- Codef 연동 계정 저장
CREATE TABLE IF NOT EXISTS codef_connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  connected_id text NOT NULL,
  org_type text NOT NULL, -- 'bank' | 'card'
  org_code text NOT NULL, -- 기관코드 (0020=우리은행 등)
  org_name text NOT NULL,
  account_number text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_codef_connections_connected_id ON codef_connections(connected_id);
CREATE INDEX IF NOT EXISTS idx_codef_connections_org_code ON codef_connections(org_code);
CREATE INDEX IF NOT EXISTS idx_codef_connections_is_active ON codef_connections(is_active);

-- RLS
ALTER TABLE codef_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_access" ON codef_connections FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Codef 동기화 로그
CREATE TABLE IF NOT EXISTS codef_sync_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type text NOT NULL, -- 'bank' | 'card' | 'all'
  org_name text,
  fetched integer DEFAULT 0,
  inserted integer DEFAULT 0,
  status text DEFAULT 'success',
  error_message text,
  synced_at timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_codef_sync_logs_sync_type ON codef_sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_codef_sync_logs_synced_at ON codef_sync_logs(synced_at);
CREATE INDEX IF NOT EXISTS idx_codef_sync_logs_status ON codef_sync_logs(status);

-- RLS
ALTER TABLE codef_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_access" ON codef_sync_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
