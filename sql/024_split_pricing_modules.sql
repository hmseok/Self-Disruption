-- 024: 렌트가 산출 → 장기렌터카 견적 이름 변경 + 단기대차 견적 모듈 분리
-- ====================================================================

-- 1. 기존 '렌트가 산출' 모듈명을 '장기렌터카 견적'으로 변경
UPDATE system_modules
SET name = '장기렌터카 견적',
    description = '장기렌터카 렌탈료 원가 산정: 감가상각, 금융, 보험, 세금, 정비 기반 전문 견적'
WHERE path = '/quotes/pricing';

-- 2. 단기대차 견적 모듈 추가
INSERT INTO system_modules (name, path, icon_key, description)
SELECT '단기대차 견적', '/quotes/short-term', 'Wrench', '단기대차 서비스 요금 조회, 견적 작성, 턴키 렌터 계약 관리'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/quotes/short-term');

-- 3. 기존 회사들에 새 모듈 자동 활성화 (장기렌터카 견적을 사용하는 회사들)
INSERT INTO company_modules (company_id, module_id, is_active)
SELECT cm.company_id, sm.id, true
FROM company_modules cm
JOIN system_modules sm_old ON cm.module_id = sm_old.id AND sm_old.path = '/quotes/pricing'
CROSS JOIN system_modules sm ON sm.path = '/quotes/short-term'
WHERE cm.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM company_modules cm2
    WHERE cm2.company_id = cm.company_id AND cm2.module_id = sm.id
  );
