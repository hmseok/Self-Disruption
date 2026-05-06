-- ============================================================
-- employee_salaries — 중복 / 의미없는 row 정리 (2026-05-06 PR-B9)
--
-- 문제 진단 (사용자 SQL 결과):
--  · 김준수 row 2개 (5b787545) — base_salary="" + base_salary=4000000
--  · hoyoun2104 row (퇴사) 잔존 — base_salary="" / 의미 없음
--  · 원인: (company_id, employee_id) UNIQUE 인데 company_id NULL → NULL ≠ NULL
--          → POST UPSERT 시 ON DUPLICATE KEY 미적용
--
-- 정리 전략:
--  1) base_salary IS NULL OR = 0 OR = '' 인 row 삭제 (의미 없는 row)
--  2) 같은 employee_id 의 중복 row 중 base_salary 큰 것만 유지
--  3) 향후 POST UPSERT 보강 — company_id 기본값 채우거나 별도 UNIQUE 인덱스 (employee_id only)
--
-- 멱등 — 여러 번 실행 안전
-- 검증: 하단 SELECT 주석으로 결과 확인
-- ============================================================

-- 1) 의미 없는 row 삭제 (base_salary 없음 또는 0)
DELETE FROM employee_salaries
 WHERE (base_salary IS NULL OR CAST(base_salary AS DECIMAL) = 0);

-- 2) 같은 employee_id 의 중복 row 중 base_salary 작은 것 삭제 (큰 것만 유지)
-- MySQL DELETE with self-join
DELETE es1
  FROM employee_salaries es1
  INNER JOIN employee_salaries es2
    ON es1.employee_id = es2.employee_id
   AND es1.id <> es2.id
   AND (
     CAST(IFNULL(es1.base_salary, 0) AS DECIMAL) < CAST(IFNULL(es2.base_salary, 0) AS DECIMAL)
     OR (CAST(IFNULL(es1.base_salary, 0) AS DECIMAL) = CAST(IFNULL(es2.base_salary, 0) AS DECIMAL)
         AND es1.created_at < es2.created_at)
   );

-- 3) (옵션) employee_id only UNIQUE 인덱스 추가 — 향후 중복 발생 차단
-- 현재 (company_id, employee_id) UNIQUE 가 있는데 company_id NULL 이라 무력화됨
-- employee_id 단독 UNIQUE 추가 (한 직원당 1 row 만)
SET @idx_exists := 0;
SELECT COUNT(*) INTO @idx_exists
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_salaries' AND INDEX_NAME = 'uq_es_employee_id';
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE employee_salaries ADD UNIQUE KEY uq_es_employee_id (employee_id)',
  'SELECT "uq_es_employee_id already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 검증
-- ============================================================
-- SELECT employee_id, COUNT(*) FROM employee_salaries
--   GROUP BY employee_id HAVING COUNT(*) > 1;
-- 기대치: 0건 (중복 없음)
--
-- SELECT es.id, es.employee_id, es.base_salary, es.employment_type,
--        p.name, p.is_active, p.emp_status
--   FROM employee_salaries es
--   LEFT JOIN profiles p ON p.id = es.employee_id;
-- 기대치: 활성 직원의 1 row 만 (4,000,000 김준수만 남음)
