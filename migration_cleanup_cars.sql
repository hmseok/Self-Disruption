-- ============================================
-- /cars 모듈 DB 정리 + 보험 이름 변경
-- Supabase SQL Editor에서 실행
-- ============================================

-- 1. /cars 관련 page_permissions 삭제
DELETE FROM page_permissions WHERE page_path = '/cars';

-- 2. /cars 관련 company_modules 삭제
DELETE FROM company_modules
WHERE module_id IN (SELECT id FROM system_modules WHERE path = '/cars');

-- 3. system_modules에서 /cars 삭제
DELETE FROM system_modules WHERE path = '/cars';

-- 4. 보험/정비 → 보험/가입 이름 변경
UPDATE system_modules SET name = '보험/가입' WHERE path = '/insurance';

-- 확인
SELECT * FROM system_modules ORDER BY path;
