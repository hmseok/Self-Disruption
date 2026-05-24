-- ═══════════════════════════════════════════════════════════════════
-- ride_employees — 콜센터 직원 중복 정리 (WHR-A-fix · 2026-05-24)
--
-- 문제:
--   ride_employees 에 콜센터 16명이 각각 3행씩 = 48행
--   (활성 1 + 비활성 중복 2). 시드가 '활성 행 없음' 시점에 재실행되며
--   매번 새 UUID 행을 INSERT 한 흔적.
--
-- 확인된 사실 (2026-05-24 진단):
--   · cs_workers.employee_id 16명 전원 → 활성 정본 행을 정확히 가리킴 (linkage OK)
--   · 비활성 중복 32행은 어떤 cs_workers 도 가리키지 않음
--   · 32행 전부 department='콜센터', profile_id NULL, employment_type NULL
--
-- 동작:
--   비활성(is_active=0) 콜센터 행 중
--     · 같은 이름의 활성(is_active=1) 콜센터 행이 존재하고
--     · 어떤 cs_workers.employee_id 도 가리키지 않는 행
--   을 삭제. → 48행 → 16행.
--
-- 안전:
--   · 활성 정본 16행 · cs_workers 가 가리키는 행은 절대 삭제 안 함
--   · 멱등 — 재실행 안전 (중복이 다시 생기면 다시 실행해 청소 가능)
--   · MySQL 1093 회피 — 삭제 대상을 파생 테이블(derived)로 1차 materialize
--
-- ⚠ 적용 전 PRE-FLIGHT (아래 (0) 쿼리) 를 먼저 실행해
--   (0-a)=32 · (0-b)=0 인지 확인할 것.
--
-- 호환: MySQL 8.0 (Cloud SQL r-care-db)
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- (0) PRE-FLIGHT — 적용 전 직접 실행해 확인
-- ───────────────────────────────────────────────────────────────────
-- (0-a) 삭제 대상 수 — 기대치: 32
-- SELECT COUNT(*) AS doomed_count
-- FROM ride_employees e
-- WHERE e.is_active = 0 AND e.department = '콜센터'
--   AND EXISTS (SELECT 1 FROM ride_employees a
--               WHERE a.is_active=1 AND a.department='콜센터' AND a.name=e.name)
--   AND NOT EXISTS (SELECT 1 FROM cs_workers w WHERE w.employee_id = e.id);
--
-- (0-b) 삭제 대상이 ride_employee_assignments 에서 참조되는지 — 기대치: 0
--   (ride_employee_assignments 테이블이 아직 없으면 이 쿼리는 건너뛰어도 됨)
-- SELECT COUNT(*) AS ref_in_assignments
-- FROM ride_employee_assignments rea
-- WHERE rea.employee_id IN (
--   SELECT e.id FROM ride_employees e
--   WHERE e.is_active=0 AND e.department='콜센터'
--     AND EXISTS (SELECT 1 FROM ride_employees a
--                 WHERE a.is_active=1 AND a.department='콜센터' AND a.name=e.name)
--     AND NOT EXISTS (SELECT 1 FROM cs_workers w WHERE w.employee_id=e.id)
-- );
--
-- → (0-a)=32, (0-b)=0 이면 아래 (1) DELETE 안전.

-- ───────────────────────────────────────────────────────────────────
-- (1) 중복 삭제 — 1093 회피 위해 파생 테이블 래핑
-- ───────────────────────────────────────────────────────────────────
DELETE FROM ride_employees
WHERE id IN (
  SELECT id FROM (
    SELECT e.id
    FROM ride_employees e
    WHERE e.is_active = 0
      AND e.department = '콜센터'
      AND EXISTS (
        SELECT 1 FROM ride_employees a
        WHERE a.is_active = 1
          AND a.department = '콜센터'
          AND a.name = e.name
      )
      AND NOT EXISTS (
        SELECT 1 FROM cs_workers w WHERE w.employee_id = e.id
      )
  ) AS doomed
);

-- ───────────────────────────────────────────────────────────────────
-- (2) 검증 — 적용 후 직접 실행
-- ───────────────────────────────────────────────────────────────────
-- (2-a) 콜센터 직원 행 수 — 기대치: active 16 / inactive 0
-- SELECT is_active, COUNT(*) AS cnt
-- FROM ride_employees WHERE department='콜센터'
-- GROUP BY is_active;
--
-- (2-b) 이름당 활성 행 수 — 0행 이어야 (중복 없음)
-- SELECT name, COUNT(*) AS cnt
-- FROM ride_employees WHERE department='콜센터' AND is_active=1
-- GROUP BY name HAVING cnt > 1;
--
-- (2-c) cs_workers 연결 무결성 — 16행 전부 활성 정본 가리킴
-- SELECT COUNT(*) AS linked_ok
-- FROM cs_workers w JOIN ride_employees e ON e.id = w.employee_id
-- WHERE w.is_active=1 AND e.is_active=1;   -- 16 기대

-- ═══════════════════════════════════════════════════════════════════
-- 재발 방지 노트:
--   본 마이그레이션은 멱등 — 중복이 다시 생기면 재실행으로 청소 가능.
--   근본 원인은 ride_employees 시드(예: 2026-05-16_ride_employees_contact.sql)가
--   '활성 행 없음' 시점에 새 UUID 를 INSERT 하는 경로 — 활성 정본이 항상
--   1행 유지되면 (본 정리 후 상태) 해당 시드의 NOT EXISTS 가드가 작동해
--   추가 INSERT 를 막는다. hr/ride 세션에 시드 완전 멱등화 권고.
--
-- ROLLBACK: 삭제 행 복구 불가 — 적용 전 ride_employees 백업 권장.
-- ═══════════════════════════════════════════════════════════════════
