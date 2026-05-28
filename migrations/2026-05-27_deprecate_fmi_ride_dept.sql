-- ═══════════════════════════════════════════════════════════════
-- PR-MULTI-BRAND P3+d — FMI departments 「라이드주식회사」 row 폐기
-- 설계: _docs/HR-OPERATIONS.md § 9.5 (옵션 C — 회사 분리)
-- 의존: P1(profiles.company_id 백필) / P3+b(company_key 노출) / P3+c(invite RIDE 분리)
-- ───────────────────────────────────────────────────────────────
-- 멱등 (Rule 23/24). 적용:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-27_deprecate_fmi_ride_dept.sql
--
-- 동작:
--   1. profiles.department_id IN (선택된 FMI 「라이드주식회사」 row) → NULL
--   2. profiles.department (legacy 문자열) = '라이드주식회사' / 유사 → NULL
--   3. departments.「라이드주식회사」 row → soft-delete (is_active=0) 또는 명칭 변경
--   ※ RIDE 소속 식별은 이제 profiles.company_id (P1) + ride_employees (HR PR-HR-8) 기반.
-- ═══════════════════════════════════════════════════════════════

SET @db := DATABASE();

-- ── 0. 사전 확인 — 「라이드주식회사」 row 존재? + 영향 profile 수 ──
SELECT '═══ P3+d 적용 전 진단 ═══' AS info;
SELECT COUNT(*) AS '폐기 대상 departments row 수'
  FROM departments WHERE name = '라이드주식회사';
SELECT COUNT(*) AS 'department_id 참조 profiles 수'
  FROM profiles p
  WHERE p.department_id IN (SELECT id FROM departments WHERE name = '라이드주식회사');
SELECT COUNT(*) AS 'department 문자열 라이드주식회사 profiles 수'
  FROM profiles WHERE department = '라이드주식회사';

-- ── 1. profiles.department_id 정리 (FMI 「라이드주식회사」 row 참조 → NULL) ──
--    P1 backfill 결과 이 profiles 의 company_id 는 이미 RIDE UUID 임 (검증됨).
UPDATE profiles
SET department_id = NULL
WHERE department_id IN (
  SELECT id FROM (SELECT id FROM departments WHERE name = '라이드주식회사') t
);

-- ── 2. profiles.department (legacy 문자열) 정리 ──
--    P3+f 의 useMyCompanyKey 가 이미 회사 분기를 dept 문자열 무관하게 처리.
UPDATE profiles
SET department = NULL
WHERE department = '라이드주식회사';

-- ── 3. departments 「라이드주식회사」 row soft-delete ──
-- 3a. is_active 컬럼 있으면 0 으로 (가장 안전)
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='departments' AND column_name='is_active')>0,
  'UPDATE departments SET is_active = 0 WHERE name = ''라이드주식회사''',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3b. is_active 없으면 name 에 [DEPRECATED] prefix 로 식별 (idempotent)
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='departments' AND column_name='is_active')=0,
  'UPDATE departments SET name = CONCAT(''[DEPRECATED-2026-05-27] '', name)
   WHERE name = ''라이드주식회사''',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ═══════════════════════════════════════════════════════════════
-- 검증 (Rule 23):
--   -- 「라이드주식회사」 row 비활성/이름변경 확인:
--   SELECT id, name, is_active FROM departments WHERE name LIKE '%라이드주식회사%';
--   -- profiles 참조 0 확인:
--   SELECT COUNT(*) FROM profiles p
--     LEFT JOIN departments d ON d.id = p.department_id
--    WHERE d.name LIKE '%라이드주식회사%';
--   -- RIDE 소속 profiles 의 company_id 살아있는지:
--   SELECT COUNT(*) FROM profiles p JOIN companies c ON c.id=p.company_id
--    WHERE c.company_key='RIDE';
-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK 가이드 (필요 시):
--   UPDATE departments SET is_active = 1 WHERE name = '라이드주식회사';
--   -- 또는 [DEPRECATED-...] prefix 제거:
--   UPDATE departments SET name = '라이드주식회사' WHERE name LIKE '[DEPRECATED-2026-05-27] %';
-- ═══════════════════════════════════════════════════════════════
