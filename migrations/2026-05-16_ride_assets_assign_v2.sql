-- PR-ASSETS-2.0 — ride_assets 매칭 대상 확장
-- 2026-05-16 (assets 세션)
--
-- 배경: 기존 assigned_user_id 는 profiles.id 참조였으나, 사용자 요청으로
--       매칭 대상을 ride_employees(라이드 직원) + freelancers(외부인력) 로 확장.
--       ride_employees.profile_id 가 전부 NULL → profiles 경유 불가 → 직접 참조 모델로 전환.
--
-- 신규 컬럼:
--   assigned_to_kind  'employee'(ride_employees) | 'freelancer'(freelancers) | NULL(공통자산)
--   assigned_to_id    ride_employees.id 또는 freelancers.id (둘 다 CHAR(36) utf8mb4_unicode_ci)
--
-- 기존 assigned_user_id 는 데이터 0건 → 유지(하위호환)하되 신규 코드는 미사용.
--
-- Rule 23 멱등성: information_schema 체크 후 조건부 ALTER. 여러 번 실행 안전.
-- 상위 설계: _docs/ASSETS-DATA-MODEL.md (PR-ASSETS-2.0 갱신)

-- ─────────────────────────────────────────────────────────────────
-- 1. assigned_to_kind 컬럼 추가 (멱등)
-- ─────────────────────────────────────────────────────────────────
SET @c1 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'ride_assets' AND column_name = 'assigned_to_kind');
SET @s1 := IF(@c1 = 0,
  'ALTER TABLE ride_assets ADD COLUMN assigned_to_kind VARCHAR(20) DEFAULT NULL AFTER assigned_user_id',
  'SELECT 1');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- ─────────────────────────────────────────────────────────────────
-- 2. assigned_to_id 컬럼 추가 (멱등)
-- ─────────────────────────────────────────────────────────────────
SET @c2 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'ride_assets' AND column_name = 'assigned_to_id');
SET @s2 := IF(@c2 = 0,
  'ALTER TABLE ride_assets ADD COLUMN assigned_to_id CHAR(36) DEFAULT NULL AFTER assigned_to_kind',
  'SELECT 1');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- ─────────────────────────────────────────────────────────────────
-- 3. 인덱스 추가 (멱등)
-- ─────────────────────────────────────────────────────────────────
SET @c3 := (SELECT COUNT(*) FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = 'ride_assets' AND index_name = 'idx_ride_assets_assigned_to');
SET @s3 := IF(@c3 = 0,
  'ALTER TABLE ride_assets ADD INDEX idx_ride_assets_assigned_to (assigned_to_kind, assigned_to_id)',
  'SELECT 1');
PREPARE st3 FROM @s3; EXECUTE st3; DEALLOCATE PREPARE st3;

-- ─────────────────────────────────────────────────────────────────
-- 4. 검증 SELECT (Rule 23 — DBeaver/CLI 에서 실행)
-- ─────────────────────────────────────────────────────────────────
-- 검증 1: 신규 컬럼 2개 확인 (기대치 2)
-- SELECT COUNT(*) AS new_cols FROM information_schema.columns
--   WHERE table_schema = DATABASE() AND table_name = 'ride_assets'
--     AND column_name IN ('assigned_to_kind','assigned_to_id');

-- 검증 2: 인덱스 확인 (기대치 1)
-- SELECT COUNT(*) AS idx FROM information_schema.statistics
--   WHERE table_schema = DATABASE() AND table_name = 'ride_assets'
--     AND index_name = 'idx_ride_assets_assigned_to';

-- 검증 3: 컬럼 collation (ride_employees.id / freelancers.id 와 일치 확인 — utf8mb4_unicode_ci)
-- SELECT column_name, collation_name FROM information_schema.columns
--   WHERE table_schema = DATABASE() AND table_name = 'ride_assets'
--     AND column_name = 'assigned_to_id';
