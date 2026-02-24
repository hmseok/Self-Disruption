-- ============================================
-- 043: 멤버 초대 테이블
-- 회사 관리자(master/god_admin)가 이메일로 직원 초대
-- 초대 링크 클릭 → 가입 양식 → 비밀번호 설정 → 자동 소속 연결
-- ============================================

CREATE TABLE IF NOT EXISTS member_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  invited_by UUID NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID,

  CONSTRAINT mi_valid_status CHECK (status IN ('pending', 'accepted', 'expired', 'canceled')),
  CONSTRAINT mi_valid_role CHECK (role IN ('user', 'master'))
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_mi_company ON member_invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_mi_token ON member_invitations(token);
CREATE INDEX IF NOT EXISTS idx_mi_email ON member_invitations(email);
CREATE INDEX IF NOT EXISTS idx_mi_status ON member_invitations(status);

-- RLS
ALTER TABLE member_invitations ENABLE ROW LEVEL SECURITY;

-- master/god_admin은 자기 회사 초대 조회
CREATE POLICY "mi_select_company" ON member_invitations
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR is_platform_admin()
  );

-- master/god_admin은 자기 회사 초대 생성
CREATE POLICY "mi_insert_company" ON member_invitations
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    OR is_platform_admin()
  );

-- master/god_admin은 자기 회사 초대 수정 (취소, 상태 변경)
CREATE POLICY "mi_update_company" ON member_invitations
  FOR UPDATE USING (
    company_id = get_my_company_id()
    OR is_platform_admin()
  );
