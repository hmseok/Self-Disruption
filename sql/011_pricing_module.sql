-- ============================================
-- 011: 렌트가 산출 모듈 등록
-- ============================================

-- 1. system_modules에 렌트가 산출 페이지 추가 (중복 방지)
INSERT INTO system_modules (name, path, icon_key, description)
SELECT '렌트가 산출', '/quotes/pricing', 'Money', '렌터카 렌탈료 원가 산정: 감가상각, 금융, 보험, 세금, 정비 기반 전문 견적'
WHERE NOT EXISTS (
  SELECT 1 FROM system_modules WHERE path = '/quotes/pricing'
);

-- 2. 기존 활성 회사들에 자동 활성화
-- (이미 /quotes 모듈을 사용 중인 회사는 /quotes/pricing도 활성화)
INSERT INTO company_modules (company_id, module_id, is_active)
SELECT cm.company_id, sm.id, true
FROM company_modules cm
JOIN system_modules sm_quotes ON cm.module_id = sm_quotes.id AND sm_quotes.path = '/quotes'
CROSS JOIN system_modules sm
WHERE sm.path = '/quotes/pricing'
  AND cm.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM company_modules ex
    WHERE ex.company_id = cm.company_id AND ex.module_id = sm.id
  );

