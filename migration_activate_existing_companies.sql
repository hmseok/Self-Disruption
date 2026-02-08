-- =============================================
-- 기존 회사에 대해 누락된 모듈 자동 활성화
-- 이미 활성화된 모듈은 건드리지 않고, 빠진 것만 추가
-- Supabase SQL Editor에서 실행하세요
-- =============================================

INSERT INTO company_modules (company_id, module_id, is_active)
SELECT c.id, sm.id, true
FROM companies c
CROSS JOIN system_modules sm
WHERE NOT EXISTS (
  SELECT 1 FROM company_modules cm
  WHERE cm.company_id = c.id AND cm.module_id = sm.id
);
