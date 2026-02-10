-- =============================================
-- 001. RLS 무한재귀 근본 해결
-- =============================================
-- 문제: profiles 테이블 RLS 정책에서 profiles를 다시 조회 → 무한 재귀
-- 해결: SECURITY DEFINER 헬퍼 함수로 RLS를 우회하는 안전한 조회 제공
--
-- Supabase SQL Editor에서 실행하세요.
-- =============================================


-- =============================================
-- STEP 1: SECURITY DEFINER 헬퍼 함수 생성
-- (RLS 정책 내부에서 안전하게 사용자 정보 조회)
-- =============================================

-- 내 company_id 가져오기
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 내 role 가져오기
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 플랫폼 관리자 여부
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'god_admin' FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 활성 사용자 여부
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- =============================================
-- STEP 2: 기존 RLS 정책 전부 삭제
-- (무한재귀 원인 정책 포함)
-- =============================================

-- profiles
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

-- companies
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'companies' AND schemaname = 'public')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.companies', r.policyname);
  END LOOP;
END $$;

-- positions
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'positions' AND schemaname = 'public')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.positions', r.policyname);
  END LOOP;
END $$;

-- departments
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'departments' AND schemaname = 'public')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.departments', r.policyname);
  END LOOP;
END $$;

-- company_modules
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'company_modules' AND schemaname = 'public')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_modules', r.policyname);
  END LOOP;
END $$;

-- system_modules
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'system_modules' AND schemaname = 'public')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.system_modules', r.policyname);
  END LOOP;
END $$;

-- page_permissions
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'page_permissions' AND schemaname = 'public')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.page_permissions', r.policyname);
  END LOOP;
END $$;


-- =============================================
-- STEP 3: RLS 활성화 확인
-- =============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_permissions ENABLE ROW LEVEL SECURITY;


-- =============================================
-- STEP 4: 새 RLS 정책 (SECURITY DEFINER 함수 사용)
-- ★ profiles 조회 시 get_my_*() 사용 → 재귀 없음
-- =============================================

-- ─────────── profiles ───────────

-- 자기 프로필 읽기 (기본)
CREATE POLICY "profiles_read_own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- 같은 회사 프로필 읽기 (★ get_my_company_id() 사용 → 재귀 없음)
CREATE POLICY "profiles_read_same_company"
  ON public.profiles FOR SELECT
  USING (company_id = get_my_company_id());

-- 플랫폼 관리자 전체 읽기
CREATE POLICY "profiles_admin_read_all"
  ON public.profiles FOR SELECT
  USING (is_platform_admin());

-- 자기 프로필 수정
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- 플랫폼 관리자 전체 수정
CREATE POLICY "profiles_admin_update_all"
  ON public.profiles FOR UPDATE
  USING (is_platform_admin());

-- master: 같은 회사 직원 수정
CREATE POLICY "profiles_master_update_company"
  ON public.profiles FOR UPDATE
  USING (
    get_my_role() = 'master'
    AND company_id = get_my_company_id()
  );

-- 회원가입 시 프로필 생성 (트리거에서 처리하지만 안전장치)
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- 플랫폼 관리자 프로필 삽입
CREATE POLICY "profiles_admin_insert"
  ON public.profiles FOR INSERT
  WITH CHECK (is_platform_admin());


-- ─────────── companies ───────────

-- 자기 회사 읽기
CREATE POLICY "companies_read_own"
  ON public.companies FOR SELECT
  USING (id = get_my_company_id());

-- 플랫폼 관리자 전체 관리
CREATE POLICY "companies_admin_all"
  ON public.companies FOR ALL
  USING (is_platform_admin());

-- 회원가입 시 회사 생성 (인증된 사용자)
CREATE POLICY "companies_insert_authenticated"
  ON public.companies FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- master: 자기 회사 수정
CREATE POLICY "companies_master_update"
  ON public.companies FOR UPDATE
  USING (
    get_my_role() = 'master'
    AND id = get_my_company_id()
  );


-- ─────────── positions ───────────

-- 같은 회사 직급 읽기
CREATE POLICY "positions_read_company"
  ON public.positions FOR SELECT
  USING (company_id = get_my_company_id());

-- 플랫폼 관리자 전체 관리
CREATE POLICY "positions_admin_all"
  ON public.positions FOR ALL
  USING (is_platform_admin());

-- master: 자기 회사 직급 관리
CREATE POLICY "positions_master_manage"
  ON public.positions FOR ALL
  USING (
    get_my_role() = 'master'
    AND company_id = get_my_company_id()
  );


-- ─────────── departments ───────────

-- 같은 회사 부서 읽기
CREATE POLICY "departments_read_company"
  ON public.departments FOR SELECT
  USING (company_id = get_my_company_id());

-- 플랫폼 관리자 전체 관리
CREATE POLICY "departments_admin_all"
  ON public.departments FOR ALL
  USING (is_platform_admin());

-- master: 자기 회사 부서 관리
CREATE POLICY "departments_master_manage"
  ON public.departments FOR ALL
  USING (
    get_my_role() = 'master'
    AND company_id = get_my_company_id()
  );


-- ─────────── system_modules ───────────

-- 인증된 사용자 읽기 (메뉴 빌드에 필요)
CREATE POLICY "system_modules_read_authenticated"
  ON public.system_modules FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 플랫폼 관리자 전체 관리
CREATE POLICY "system_modules_admin_all"
  ON public.system_modules FOR ALL
  USING (is_platform_admin());


-- ─────────── company_modules ───────────

-- 자기 회사 모듈 읽기
CREATE POLICY "company_modules_read_company"
  ON public.company_modules FOR SELECT
  USING (company_id = get_my_company_id());

-- 플랫폼 관리자 전체 관리
CREATE POLICY "company_modules_admin_all"
  ON public.company_modules FOR ALL
  USING (is_platform_admin());


-- ─────────── page_permissions ───────────

-- 자기 회사 권한 읽기
CREATE POLICY "page_permissions_read_company"
  ON public.page_permissions FOR SELECT
  USING (company_id = get_my_company_id());

-- 플랫폼 관리자 전체 관리
CREATE POLICY "page_permissions_admin_all"
  ON public.page_permissions FOR ALL
  USING (is_platform_admin());

-- master: 자기 회사 권한 관리
CREATE POLICY "page_permissions_master_manage"
  ON public.page_permissions FOR ALL
  USING (
    get_my_role() = 'master'
    AND company_id = get_my_company_id()
  );


-- =============================================
-- STEP 5: god_admin 프로필 보장
-- =============================================

-- company_id NOT NULL 제약 해제 (플랫폼 관리자는 회사 없음)
ALTER TABLE public.profiles ALTER COLUMN company_id DROP NOT NULL;

-- god_admin 활성화 보장
UPDATE public.profiles SET is_active = true WHERE role = 'god_admin';


-- =============================================
-- 완료 확인
-- =============================================
SELECT '✅ 001_rls_fix.sql 완료 - RLS 무한재귀 해결됨' AS result;
SELECT policyname, tablename, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
