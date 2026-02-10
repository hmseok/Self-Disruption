-- =============================================
-- 002. Platform Admin 초대 코드 시스템
-- =============================================
-- 목적: god_admin 하드코딩 제거 → 정식 초대 기반 관리자 시스템
--
-- 운영 가이드:
--   1) 최초 1명은 DB에서 직접 생성 (부트스트랩)
--   2) 이후 관리자는 기존 관리자가 초대 코드 발급
--   3) 초대 코드로 회원가입 → 자동으로 god_admin 역할
--   4) 초대 코드는 1회용, 만료 시간 있음
--
-- Supabase SQL Editor에서 실행하세요.
-- =============================================


-- =============================================
-- STEP 1: 초대 코드 테이블
-- =============================================

CREATE TABLE IF NOT EXISTS public.admin_invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,                                     -- "김철수님 초대" 등 메모
  created_by UUID REFERENCES public.profiles(id),       -- 발급한 관리자
  used_by UUID REFERENCES public.profiles(id),          -- 사용한 사용자 (NULL = 미사용)
  used_at TIMESTAMPTZ,                                  -- 사용 시점
  expires_at TIMESTAMPTZ NOT NULL,                      -- 만료 시점
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 코드 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_admin_invite_code ON admin_invite_codes(code);


-- =============================================
-- STEP 2: RLS 정책 (플랫폼 관리자만 관리 가능)
-- =============================================

ALTER TABLE public.admin_invite_codes ENABLE ROW LEVEL SECURITY;

-- 플랫폼 관리자만 읽기
CREATE POLICY "admin_invites_admin_read"
  ON public.admin_invite_codes FOR SELECT
  USING (is_platform_admin());

-- 플랫폼 관리자만 생성
CREATE POLICY "admin_invites_admin_insert"
  ON public.admin_invite_codes FOR INSERT
  WITH CHECK (is_platform_admin());

-- 플랫폼 관리자만 수정/삭제
CREATE POLICY "admin_invites_admin_manage"
  ON public.admin_invite_codes FOR ALL
  USING (is_platform_admin());


-- =============================================
-- STEP 3: 초대 코드 검증 RPC (회원가입 시 호출)
-- =============================================

-- 초대 코드 유효성 확인 (공개 — 회원가입 전 확인용)
CREATE OR REPLACE FUNCTION validate_admin_invite(invite_code TEXT)
RETURNS JSON AS $$
DECLARE
  _invite RECORD;
BEGIN
  SELECT * INTO _invite
  FROM admin_invite_codes
  WHERE code = invite_code
    AND used_by IS NULL
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', '유효하지 않거나 만료된 초대 코드입니다.');
  END IF;

  RETURN json_build_object('valid', true, 'description', _invite.description);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- STEP 4: 초대 코드 소비 RPC (가입 완료 후 호출)
-- =============================================

CREATE OR REPLACE FUNCTION consume_admin_invite(invite_code TEXT, user_id UUID)
RETURNS JSON AS $$
DECLARE
  _invite RECORD;
BEGIN
  -- 코드 찾기
  SELECT * INTO _invite
  FROM admin_invite_codes
  WHERE code = invite_code
    AND used_by IS NULL
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '유효하지 않은 초대 코드');
  END IF;

  -- 코드 소비 처리
  UPDATE admin_invite_codes
  SET used_by = user_id, used_at = NOW()
  WHERE id = _invite.id;

  -- 프로필을 god_admin으로 업데이트
  UPDATE profiles
  SET role = 'god_admin',
      company_id = NULL,
      is_active = true
  WHERE id = user_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- STEP 5: 초대 코드 발급 RPC (기존 관리자가 호출)
-- =============================================

CREATE OR REPLACE FUNCTION generate_admin_invite(
  invite_description TEXT DEFAULT NULL,
  valid_hours INT DEFAULT 72    -- 기본 72시간
)
RETURNS JSON AS $$
DECLARE
  _code TEXT;
  _invite_id UUID;
BEGIN
  -- 권한 확인
  IF NOT is_platform_admin() THEN
    RETURN json_build_object('success', false, 'error', '플랫폼 관리자만 초대 코드를 발급할 수 있습니다.');
  END IF;

  -- 8자리 랜덤 코드 생성 (영문 대문자 + 숫자)
  _code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4))
         || '-'
         || upper(substr(md5(random()::text || clock_timestamp()::text), 5, 4));

  -- 삽입
  INSERT INTO admin_invite_codes (code, description, created_by, expires_at)
  VALUES (_code, invite_description, auth.uid(), NOW() + (valid_hours || ' hours')::INTERVAL)
  RETURNING id INTO _invite_id;

  RETURN json_build_object(
    'success', true,
    'code', _code,
    'expires_at', (NOW() + (valid_hours || ' hours')::INTERVAL)::TEXT,
    'invite_id', _invite_id::TEXT
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- STEP 6: 회원가입 트리거 수정
-- (기존 handle_new_user 트리거에 관리자 초대 코드 처리 추가)
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _role TEXT;
  _company_id UUID;
  _company_name TEXT;
  _business_number TEXT;
  _invite_code TEXT;
  _invite_valid JSON;
BEGIN
  -- 메타데이터에서 역할/회사 정보 추출
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  _company_name := NEW.raw_user_meta_data->>'company_name';
  _business_number := NEW.raw_user_meta_data->>'business_number';
  _invite_code := NEW.raw_user_meta_data->>'admin_invite_code';

  -- ★ 관리자 초대 코드가 있는 경우 → 플랫폼 관리자로 가입
  IF _invite_code IS NOT NULL AND _invite_code != '' THEN
    -- 프로필 생성 (회사 없음)
    INSERT INTO public.profiles (id, role, company_id, employee_name, phone, is_active)
    VALUES (
      NEW.id,
      'god_admin',
      NULL,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'phone', ''),
      true  -- 관리자는 즉시 활성
    );

    -- 초대 코드 소비
    UPDATE admin_invite_codes
    SET used_by = NEW.id, used_at = NOW()
    WHERE code = _invite_code
      AND used_by IS NULL
      AND expires_at > NOW();

    RETURN NEW;
  END IF;

  -- ★ founder(master) 가입 → 회사 생성 + 프로필
  IF _role = 'master' AND _company_name IS NOT NULL THEN
    INSERT INTO public.companies (name, business_number, plan, is_active)
    VALUES (_company_name, _business_number, 'free', false)
    RETURNING id INTO _company_id;

    INSERT INTO public.profiles (id, role, company_id, employee_name, phone, is_active)
    VALUES (
      NEW.id,
      'master',
      _company_id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'phone', ''),
      false  -- 승인 대기
    );

    -- 기본 모듈 배정
    INSERT INTO company_modules (company_id, module_id, is_active)
    SELECT _company_id, sm.id, (COALESCE(sm.plan_group, 'free') = 'free')
    FROM system_modules sm
    ON CONFLICT (company_id, module_id) DO NOTHING;

    -- 기본 직급/부서 생성
    INSERT INTO positions (company_id, name, level, description) VALUES
      (_company_id, '대표', 1, '회사 대표 / 최고 권한'),
      (_company_id, '이사', 2, '임원 / 고급 관리자'),
      (_company_id, '팀장', 3, '중간 관리자'),
      (_company_id, '사원', 4, '일반 직원');

    INSERT INTO departments (company_id, name, description) VALUES
      (_company_id, '경영지원', '경영 및 관리 업무'),
      (_company_id, '영업', '고객 영업 및 계약'),
      (_company_id, '차량관리', '차량 정비 및 자산 관리');

    RETURN NEW;
  END IF;

  -- ★ employee(user) 가입 → 프로필만 (회사는 나중에 배정)
  INSERT INTO public.profiles (id, role, company_id, employee_name, phone, is_active)
  VALUES (
    NEW.id,
    'user',
    NULL,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    false
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 재생성 (이미 있으면 교체)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================
-- STEP 7: 기존 RPC 함수 업데이트 (is_platform_admin() 사용)
-- =============================================

-- get_all_company_modules: 전체 회사 모듈 현황 (플랫폼 관리자용)
DROP FUNCTION IF EXISTS get_all_company_modules();
CREATE OR REPLACE FUNCTION get_all_company_modules()
RETURNS TABLE(company_id UUID, module_id UUID, is_active BOOLEAN) AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION '권한이 없습니다';
  END IF;
  RETURN QUERY SELECT cm.company_id, cm.module_id, cm.is_active FROM company_modules cm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- 완료 확인
-- =============================================
SELECT '✅ 002_platform_admin.sql 완료 - 초대 코드 시스템 구축됨' AS result;
