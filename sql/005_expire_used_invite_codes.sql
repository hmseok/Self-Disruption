-- =============================================
-- 005. 사용된 초대코드 즉시 만료 처리
-- =============================================
-- 문제: 초대코드 사용 시 used_by/used_at만 설정되고 expires_at은 그대로 유지됨
-- 수정: 사용 시 expires_at = NOW()로 즉시 만료 + 기존 사용된 코드도 일괄 만료
--
-- Supabase SQL Editor에서 실행하세요.
-- =============================================


-- =============================================
-- STEP 1: 이미 사용된 코드들 일괄 만료 처리
-- =============================================

UPDATE admin_invite_codes
SET expires_at = used_at
WHERE used_by IS NOT NULL
  AND expires_at > NOW();


-- =============================================
-- STEP 2: handle_new_user() 트리거 함수 재생성
--   (초대코드 사용 시 expires_at = NOW() 추가)
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _role TEXT;
  _company_id UUID;
  _company_name TEXT;
  _business_number TEXT;
  _invite_code TEXT;
BEGIN
  -- 메타데이터에서 역할/회사 정보 추출
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  _company_name := NEW.raw_user_meta_data->>'company_name';
  _business_number := NEW.raw_user_meta_data->>'business_number';
  _invite_code := NEW.raw_user_meta_data->>'admin_invite_code';

  -- ★ 관리자 초대 코드가 있는 경우 → 플랫폼 관리자로 가입
  IF _invite_code IS NOT NULL AND _invite_code != '' THEN
    -- 프로필 생성 (회사 없음, email 포함)
    INSERT INTO public.profiles (id, email, role, company_id, employee_name, phone, is_active)
    VALUES (
      NEW.id,
      NEW.email,
      'god_admin',
      NULL,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'phone', ''),
      true  -- 관리자는 즉시 활성
    );

    -- 초대 코드 소비 + 즉시 만료
    BEGIN
      UPDATE admin_invite_codes
      SET used_by = NEW.id, used_at = NOW(), expires_at = NOW()
      WHERE code = _invite_code
        AND used_by IS NULL
        AND expires_at > NOW();
    EXCEPTION WHEN OTHERS THEN
      -- 초대 코드 소비 실패해도 가입은 진행
      RAISE WARNING 'admin_invite_codes 업데이트 실패: %', SQLERRM;
    END;

    RETURN NEW;
  END IF;

  -- ★ founder(master) 가입 → 회사 생성 + 프로필
  IF _role = 'master' AND _company_name IS NOT NULL THEN
    INSERT INTO public.companies (name, business_number, plan, is_active)
    VALUES (_company_name, _business_number, 'free', false)
    RETURNING id INTO _company_id;

    INSERT INTO public.profiles (id, email, role, company_id, employee_name, phone, is_active)
    VALUES (
      NEW.id,
      NEW.email,
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
  INSERT INTO public.profiles (id, email, role, company_id, employee_name, phone, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    'user',
    NULL,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    false
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 재생성
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================
-- STEP 3: 확인
-- =============================================
SELECT '✅ 005_expire_used_invite_codes.sql 완료' AS result;
SELECT '  - 기존 사용된 코드 일괄 만료 처리' AS detail
UNION ALL SELECT '  - handle_new_user() 초대코드 사용 시 expires_at=NOW() 추가'
UNION ALL SELECT '  - 트리거 재생성 완료';


