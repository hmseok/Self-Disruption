-- ============================================
-- Sideline ERP - invest/jiip 모듈 추가
-- Supabase SQL Editor에서 실행하세요
-- ============================================

-- 1단계: 일반투자 모듈 추가 (이미 있으면 무시)
INSERT INTO system_modules (name, path, icon_key, description)
SELECT '일반투자', '/invest', 'Truck', '일반 투자 관리 - 법인 운영 자금 및 투자 계약'
WHERE NOT EXISTS (
  SELECT 1 FROM system_modules WHERE path = '/invest'
);

-- 2단계: 지입투자 모듈 추가 (이미 있으면 무시)
INSERT INTO system_modules (name, path, icon_key, description)
SELECT '지입투자', '/jiip', 'Truck', '지입/위수탁 관리 - 차주 및 투자자 계약'
WHERE NOT EXISTS (
  SELECT 1 FROM system_modules WHERE path = '/jiip'
);

-- 3단계: 확인
SELECT id, name, path, icon_key FROM system_modules ORDER BY path;

-- 4단계: 기존 회사들에 자동 활성화
INSERT INTO company_modules (company_id, module_id, is_active)
SELECT c.id, sm.id, true
FROM companies c
CROSS JOIN system_modules sm
WHERE sm.path IN ('/invest', '/jiip')
  AND NOT EXISTS (
    SELECT 1 FROM company_modules cm
    WHERE cm.company_id = c.id AND cm.module_id = sm.id
  );
