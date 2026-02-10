-- =============================================
-- 003. 플랜 그룹 시스템 + 모듈/회사 관리 RPC
-- =============================================
-- 목적: 플랜별 모듈 그룹 관리 + 구독관리 페이지에서 사용하는 RPC 함수
--
-- 의존성: 001_rls_fix.sql (SECURITY DEFINER 헬퍼 함수)
--          002_platform_admin.sql (handle_new_user)
--
-- Supabase SQL Editor에서 실행하세요.
-- =============================================


-- =============================================
-- STEP 1: system_modules에 plan_group 컬럼 추가
-- =============================================

-- plan_group: 이 모듈이 최소 어떤 플랜부터 이용 가능한지
-- 'free' → 'basic' → 'pro' → 'max' 계층 구조
ALTER TABLE public.system_modules
  ADD COLUMN IF NOT EXISTS plan_group TEXT NOT NULL DEFAULT 'free';

COMMENT ON COLUMN public.system_modules.plan_group
  IS '모듈이 포함되는 최소 플랜 (free/basic/pro/max)';


-- =============================================
-- STEP 2: 기존 companies.plan 'master' → 'max' 마이그레이션
-- (이전에 'master' 플랜을 사용했다면 'max'로 변경)
-- =============================================

UPDATE public.companies
SET plan = 'max'
WHERE plan = 'master';

-- 유효하지 않은 plan 값 정리
UPDATE public.companies
SET plan = 'free'
WHERE plan NOT IN ('free', 'basic', 'pro', 'max');


-- =============================================
-- STEP 3: 기존 모듈 기본 plan_group 배정
-- (경로 기반으로 적절한 플랜에 배분)
-- =============================================

-- 기본 업무 모듈: free
UPDATE public.system_modules SET plan_group = 'free'
WHERE path IN ('/registration', '/customers', '/quotes');

-- 보험/재무 모듈: basic
UPDATE public.system_modules SET plan_group = 'basic'
WHERE path IN ('/insurance', '/finance');

-- 대출/투자 모듈: pro
UPDATE public.system_modules SET plan_group = 'pro'
WHERE path IN ('/loans', '/invest');

-- 고급 기능: max
UPDATE public.system_modules SET plan_group = 'max'
WHERE path IN ('/jiip');


-- =============================================
-- STEP 4: 플랜 계층 헬퍼 함수
-- =============================================

-- 플랜 이름 → 숫자 레벨 변환
CREATE OR REPLACE FUNCTION plan_to_level(plan_name TEXT)
RETURNS INT AS $$
BEGIN
  RETURN CASE plan_name
    WHEN 'free'  THEN 0
    WHEN 'basic' THEN 1
    WHEN 'pro'   THEN 2
    WHEN 'max'   THEN 3
    ELSE 0
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- =============================================
-- STEP 5: 모듈 플랜 그룹 변경 RPC
-- (구독관리 > 전체 모듈 카드에서 드롭다운 변경 시 호출)
-- =============================================

CREATE OR REPLACE FUNCTION update_module_plan_group(
  target_module_id UUID,
  new_plan_group TEXT
)
RETURNS JSON AS $$
BEGIN
  -- 권한 확인
  IF NOT is_platform_admin() THEN
    RETURN json_build_object('success', false, 'error', '플랫폼 관리자만 변경할 수 있습니다.');
  END IF;

  -- 유효한 플랜 확인
  IF new_plan_group NOT IN ('free', 'basic', 'pro', 'max') THEN
    RETURN json_build_object('success', false, 'error', '유효하지 않은 플랜입니다.');
  END IF;

  -- plan_group 업데이트
  UPDATE system_modules
  SET plan_group = new_plan_group
  WHERE id = target_module_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '모듈을 찾을 수 없습니다.');
  END IF;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- STEP 6: 회사 플랜 변경 RPC
-- (플랜 변경 → 해당 플랜 모듈 자동 ON/OFF)
-- =============================================

CREATE OR REPLACE FUNCTION update_company_plan(
  target_company_id UUID,
  new_plan TEXT
)
RETURNS JSON AS $$
DECLARE
  _new_level INT;
BEGIN
  -- 권한 확인
  IF NOT is_platform_admin() THEN
    RETURN json_build_object('success', false, 'error', '플랫폼 관리자만 변경할 수 있습니다.');
  END IF;

  -- 유효한 플랜 확인
  IF new_plan NOT IN ('free', 'basic', 'pro', 'max') THEN
    RETURN json_build_object('success', false, 'error', '유효하지 않은 플랜입니다.');
  END IF;

  _new_level := plan_to_level(new_plan);

  -- 회사 플랜 업데이트
  UPDATE companies SET plan = new_plan WHERE id = target_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '회사를 찾을 수 없습니다.');
  END IF;

  -- 모듈 자동 ON/OFF: 플랜 레벨 이하의 모듈만 활성화
  -- 1) 아직 company_modules에 없는 모듈 삽입
  INSERT INTO company_modules (company_id, module_id, is_active)
  SELECT target_company_id, sm.id, (plan_to_level(sm.plan_group) <= _new_level)
  FROM system_modules sm
  WHERE NOT EXISTS (
    SELECT 1 FROM company_modules cm
    WHERE cm.company_id = target_company_id AND cm.module_id = sm.id
  );

  -- 2) 기존 모듈 ON/OFF 조정
  UPDATE company_modules cm
  SET is_active = (plan_to_level(sm.plan_group) <= _new_level)
  FROM system_modules sm
  WHERE cm.module_id = sm.id
    AND cm.company_id = target_company_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- STEP 7: 단일 모듈 토글 RPC
-- (회사별 관리에서 개별 모듈 ON/OFF)
-- =============================================

CREATE OR REPLACE FUNCTION toggle_company_module(
  target_company_id UUID,
  target_module_id UUID,
  new_active BOOLEAN
)
RETURNS JSON AS $$
BEGIN
  -- 권한 확인
  IF NOT is_platform_admin() THEN
    RETURN json_build_object('success', false, 'error', '플랫폼 관리자만 변경할 수 있습니다.');
  END IF;

  -- UPSERT: 없으면 INSERT, 있으면 UPDATE
  INSERT INTO company_modules (company_id, module_id, is_active)
  VALUES (target_company_id, target_module_id, new_active)
  ON CONFLICT (company_id, module_id)
  DO UPDATE SET is_active = EXCLUDED.is_active;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- STEP 8: 전체 모듈 일괄 ON/OFF RPC
-- (회사별 관리에서 전체 ON / 전체 OFF 버튼)
-- =============================================

CREATE OR REPLACE FUNCTION toggle_all_company_modules(
  target_company_id UUID,
  new_active BOOLEAN
)
RETURNS JSON AS $$
BEGIN
  -- 권한 확인
  IF NOT is_platform_admin() THEN
    RETURN json_build_object('success', false, 'error', '플랫폼 관리자만 변경할 수 있습니다.');
  END IF;

  -- 아직 없는 모듈 먼저 삽입
  INSERT INTO company_modules (company_id, module_id, is_active)
  SELECT target_company_id, sm.id, new_active
  FROM system_modules sm
  WHERE NOT EXISTS (
    SELECT 1 FROM company_modules cm
    WHERE cm.company_id = target_company_id AND cm.module_id = sm.id
  );

  -- 기존 모듈 일괄 업데이트
  UPDATE company_modules
  SET is_active = new_active
  WHERE company_id = target_company_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- 완료 확인
-- =============================================
SELECT '✅ 003_plan_groups.sql 완료 - 플랜 그룹 + RPC 함수 생성됨' AS result;

-- 모듈별 plan_group 확인
SELECT name, path, plan_group FROM system_modules ORDER BY plan_to_level(plan_group), path;
