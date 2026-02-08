-- =============================================
-- 회원가입 트리거 재생성
-- auth.users INSERT 시 자동으로 profile + company 생성
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 기존 트리거/함수 삭제 (안전)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 트리거 함수 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _company_id UUID;
  _role TEXT;
  _company_name TEXT;
  _business_number TEXT;
  _full_name TEXT;
  _phone TEXT;
BEGIN
  -- 메타데이터 추출
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  _company_name := NEW.raw_user_meta_data->>'company_name';
  _business_number := NEW.raw_user_meta_data->>'business_number';
  _full_name := NEW.raw_user_meta_data->>'full_name';
  _phone := NEW.raw_user_meta_data->>'phone';

  -- 1. 기업 대표(master)로 가입: 회사 생성
  IF _role = 'master' AND _company_name IS NOT NULL AND trim(_company_name) != '' THEN
    INSERT INTO public.companies (name, business_number, plan, is_active)
    VALUES (trim(_company_name), _business_number, 'free', true)
    RETURNING id INTO _company_id;
  END IF;

  -- 2. 직원(user)으로 가입: 회사명으로 기존 회사 찾기
  IF _role = 'user' AND _company_name IS NOT NULL AND trim(_company_name) != '' THEN
    SELECT id INTO _company_id
    FROM public.companies
    WHERE lower(trim(name)) = lower(trim(_company_name))
    LIMIT 1;
  END IF;

  -- 3. 프로필 생성
  INSERT INTO public.profiles (id, email, role, company_id, employee_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    _role,
    _company_id,
    _full_name,
    _phone
  );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- 에러 발생 시에도 유저 생성은 허용 (프로필은 나중에 수동 생성 가능)
  RAISE LOG 'handle_new_user error: % %', SQLERRM, SQLSTATE;
  -- 최소한 프로필만이라도 생성 시도
  BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES (NEW.id, NEW.email, COALESCE(_role, 'user'))
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'fallback profile insert also failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 생성
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =============================================
-- 완료! 이제 회원가입 시:
-- 1. 기업 대표: companies 자동 생성 → profiles 생성 (company_id 연결)
-- 2. 직원: 기존 회사 검색 → profiles 생성 (company_id 연결)
-- 3. companies INSERT → auto_activate_modules 트리거 → 모듈 자동 활성화
-- =============================================
