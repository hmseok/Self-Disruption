-- ============================================
-- 044: 계약 관리 강화
-- 1) 이메일 발송 로그
-- 2) 상태 변경 이력
-- 3) 예상 결제 스케줄
-- 4) 기존 테이블 상태 CHECK 제약
-- ============================================

-- ─────────────────────────────────────────────
-- 1. 계약 이메일 발송 로그
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_sending_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_type VARCHAR(20) NOT NULL,
  contract_id UUID NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'sent',
  send_token UUID UNIQUE DEFAULT gen_random_uuid(),
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  created_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT csl_valid_type CHECK (contract_type IN ('jiip', 'invest')),
  CONSTRAINT csl_valid_status CHECK (status IN ('sent', 'failed', 'viewed', 'signed'))
);

CREATE INDEX IF NOT EXISTS idx_csl_contract ON contract_sending_logs(contract_type, contract_id);
CREATE INDEX IF NOT EXISTS idx_csl_token ON contract_sending_logs(send_token);

ALTER TABLE contract_sending_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csl_select" ON contract_sending_logs
  FOR SELECT USING (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "csl_insert" ON contract_sending_logs
  FOR INSERT WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "csl_update" ON contract_sending_logs
  FOR UPDATE USING (company_id = get_my_company_id() OR is_platform_admin());

-- ─────────────────────────────────────────────
-- 2. 계약 상태 변경 이력
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_type VARCHAR(20) NOT NULL,
  contract_id UUID NOT NULL,
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  change_reason VARCHAR(255),
  changed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT csh_valid_type CHECK (contract_type IN ('jiip', 'invest'))
);

CREATE INDEX IF NOT EXISTS idx_csh_contract ON contract_status_history(contract_type, contract_id);

ALTER TABLE contract_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csh_select" ON contract_status_history
  FOR SELECT USING (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "csh_insert" ON contract_status_history
  FOR INSERT WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());

-- ─────────────────────────────────────────────
-- 3. 예상 결제 스케줄
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expected_payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_type VARCHAR(20) NOT NULL,
  contract_id UUID NOT NULL,
  payment_date DATE NOT NULL,
  payment_number INT NOT NULL,
  expected_amount BIGINT NOT NULL,
  actual_amount BIGINT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  matched_transaction_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT eps_valid_type CHECK (contract_type IN ('jiip', 'invest')),
  CONSTRAINT eps_valid_status CHECK (status IN ('pending', 'partial', 'completed', 'overdue')),
  UNIQUE(contract_type, contract_id, payment_number)
);

CREATE INDEX IF NOT EXISTS idx_eps_contract ON expected_payment_schedules(contract_type, contract_id);
CREATE INDEX IF NOT EXISTS idx_eps_date ON expected_payment_schedules(payment_date);
CREATE INDEX IF NOT EXISTS idx_eps_status ON expected_payment_schedules(status);

ALTER TABLE expected_payment_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eps_select" ON expected_payment_schedules
  FOR SELECT USING (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "eps_insert" ON expected_payment_schedules
  FOR INSERT WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "eps_update" ON expected_payment_schedules
  FOR UPDATE USING (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY "eps_delete" ON expected_payment_schedules
  FOR DELETE USING (company_id = get_my_company_id() OR is_platform_admin());

-- ─────────────────────────────────────────────
-- 4. 기존 테이블 상태 CHECK 제약 추가
-- (이미 status 컬럼이 존재하므로 제약만 추가)
-- ─────────────────────────────────────────────

-- jiip_contracts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jiip_valid_status'
  ) THEN
    ALTER TABLE jiip_contracts ADD CONSTRAINT jiip_valid_status
      CHECK (status IN ('active', 'expired', 'terminated', 'renewed'));
  END IF;
END $$;

-- general_investments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gi_valid_status'
  ) THEN
    ALTER TABLE general_investments ADD CONSTRAINT gi_valid_status
      CHECK (status IN ('active', 'expired', 'terminated', 'renewed'));
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 5. updated_at 자동 갱신 트리거
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_eps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eps_updated_at ON expected_payment_schedules;
CREATE TRIGGER trg_eps_updated_at
  BEFORE UPDATE ON expected_payment_schedules
  FOR EACH ROW EXECUTE FUNCTION update_eps_updated_at();
