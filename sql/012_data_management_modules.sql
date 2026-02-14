-- ============================================
-- 012: 데이터 관리 모듈 등록
-- 차량 대장, 산출 기준, 시세 DB, 정비 DB, 환경설정 등
-- ============================================

-- 1. system_modules에 데이터 관리 페이지들 추가
INSERT INTO system_modules (name, path, icon_key, description)
SELECT '전체 차량 대장', '/cars', 'Car', '등록 차량 목록 및 상태 관리'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/cars');

INSERT INTO system_modules (name, path, icon_key, description)
SELECT '산출 기준 관리', '/db/pricing-standards', 'Database', '렌트가 산출에 사용되는 감가/보험/세금/금융/등록비 기준 데이터'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/pricing-standards');

INSERT INTO system_modules (name, path, icon_key, description)
SELECT '차량 시세 DB', '/db/models', 'Chart', '차종별 시세 및 감가상각 데이터베이스'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/models');

INSERT INTO system_modules (name, path, icon_key, description)
SELECT '정비/부품 DB', '/db/maintenance', 'Wrench', '차종별 정비 항목 및 부품 비용 데이터'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/maintenance');

INSERT INTO system_modules (name, path, icon_key, description)
SELECT '환경설정/코드', '/db/codes', 'Setting', '시스템 코드 및 환경 설정'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/codes');

INSERT INTO system_modules (name, path, icon_key, description)
SELECT '감가 DB', '/db/depreciation', 'Chart', '감가상각 기준 데이터'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/depreciation');

INSERT INTO system_modules (name, path, icon_key, description)
SELECT '시세 참조', '/db/lotte', 'Chart', '외부 시세 참조 데이터'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/lotte');

-- 2. 기존 활성 회사들에 자동 활성화 (모든 활성 회사에 데이터 관리 모듈 활성화)
INSERT INTO company_modules (company_id, module_id, is_active)
SELECT DISTINCT c.id, sm.id, true
FROM companies c
CROSS JOIN system_modules sm
WHERE sm.path IN ('/cars', '/db/pricing-standards', '/db/models', '/db/maintenance', '/db/codes', '/db/depreciation', '/db/lotte')
  AND c.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM company_modules ex
    WHERE ex.company_id = c.id AND ex.module_id = sm.id
  );
