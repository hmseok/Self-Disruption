-- =============================================
-- DB 관리 페이지 모듈 추가 마이그레이션
-- 기존에 있던 데이터 관리 페이지들이 system_modules에 없어서
-- 사이드바에 안 보이던 문제 수정
-- =============================================

-- 1. 차량 시세 DB (/db/models)
INSERT INTO system_modules (name, path, icon_key, description)
SELECT '차량 시세 DB', '/db/models', 'Chart', '차종별 시세/감가 데이터베이스'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/models');

-- 2. 정비/부품 DB (/db/maintenance)
INSERT INTO system_modules (name, path, icon_key, description)
SELECT '정비/부품 DB', '/db/maintenance', 'Wrench', '정비 항목 및 부품 비용 데이터'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/maintenance');

-- 3. 차량 코드 DB (/db/codes)
INSERT INTO system_modules (name, path, icon_key, description)
SELECT '차량 코드 DB', '/db/codes', 'Database', 'AI 견적 및 차량 코드 관리'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/codes');

-- 4. 잔가율 DB (/db/depreciation)
INSERT INTO system_modules (name, path, icon_key, description)
SELECT '잔가율 DB', '/db/depreciation', 'Chart', '연차별 잔가율 테이블'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/depreciation');

-- 5. 롯데렌터카 DB (/db/lotte)
INSERT INTO system_modules (name, path, icon_key, description)
SELECT '롯데렌터카 DB', '/db/lotte', 'Car', '롯데렌터카 견적 아카이브'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE path = '/db/lotte');

-- 기존 회사들에 자동 활성화
INSERT INTO company_modules (company_id, module_id, is_active)
SELECT c.id, sm.id, true
FROM companies c
CROSS JOIN system_modules sm
WHERE sm.path IN ('/db/models', '/db/maintenance', '/db/codes', '/db/depreciation', '/db/lotte')
AND NOT EXISTS (
  SELECT 1 FROM company_modules cm
  WHERE cm.company_id = c.id AND cm.module_id = sm.id
);
