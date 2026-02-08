-- =============================================
-- 자동 모듈 활성화 트리거
-- 새 회사가 생성되면 모든 system_modules를 자동으로 활성화
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 1. 트리거 함수 생성
CREATE OR REPLACE FUNCTION auto_activate_modules()
RETURNS TRIGGER AS $$
BEGIN
  -- 새 회사에 대해 모든 system_modules를 자동 활성화
  INSERT INTO company_modules (company_id, module_id, is_active)
  SELECT NEW.id, sm.id, true
  FROM system_modules sm
  WHERE NOT EXISTS (
    SELECT 1 FROM company_modules cm
    WHERE cm.company_id = NEW.id AND cm.module_id = sm.id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. 기존 트리거 삭제 (재실행 안전)
DROP TRIGGER IF EXISTS trigger_auto_activate_modules ON companies;

-- 3. 트리거 생성: companies INSERT 후 자동 실행
CREATE TRIGGER trigger_auto_activate_modules
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION auto_activate_modules();

-- =============================================
-- 테스트: 이후 새 회사가 INSERT되면
-- company_modules에 자동으로 모든 모듈이 활성화됩니다
-- =============================================
