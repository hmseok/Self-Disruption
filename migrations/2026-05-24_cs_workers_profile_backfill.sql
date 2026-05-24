-- ═══════════════════════════════════════════════════════════════════
-- CallScheduler — cs_workers.profile_id 백필 (인사마스터 연동)
-- Phase WHR-A · 2026-05-24  (rev2 — Error 1093 수정)
--
-- 목적:
--   기존 16 워커의 profile_id (현재 전부 NULL) 를 profiles 의 직원과
--   이름 정확 일치로 연결한다.
--
-- 안전 규칙:
--   1) profile_id IS NULL 인 워커만 대상 → 멱등 (여러 번 실행 안전)
--   2) 이름이 활성 profiles 에 정확히 1명일 때만 연결 (동명이인 skip)
--   3) is_active = 1 인 profiles · cs_workers 만 대상
--   4) cs_workers.name 은 UNIQUE (uq_cs_worker_name) → 서로 다른 워커가
--      같은 profile 에 연결될 수 없음. 즉 1:1 은 UNIQUE 제약으로 자연 보장.
--
-- ⚠ rev1 의 1093 에러 수정:
--   rev1 은 「이미 다른 워커가 쓰는 profile_id 재사용 금지」 가드를
--   NOT EXISTS (SELECT ... FROM cs_workers w2 ...) 로 넣었으나,
--   MySQL 은 UPDATE 대상 테이블(cs_workers)을 같은 문의 서브쿼리에서
--   참조할 수 없음 → Error 1093.
--   해당 가드는 cs_workers.name UNIQUE 제약상 애초에 불필요(중복 불가)
--   하므로 제거. 서브쿼리는 이제 profiles 만 참조한다.
--
-- 동명이인 / 매칭 실패 행은 NULL 유지 → UI(WorkersTab)에서 수동 연결.
--
-- 호환: MySQL 8.0 (Cloud SQL r-care-db)
-- ═══════════════════════════════════════════════════════════════════

UPDATE cs_workers w
SET w.profile_id = (
  SELECT p.id
  FROM profiles p
  WHERE p.is_active = 1
    AND p.name = w.name
  LIMIT 1
)
WHERE w.is_active = 1
  AND w.profile_id IS NULL
  -- 그 이름의 활성 profile 이 정확히 1명일 때만 (동명이인 skip)
  AND (
    SELECT COUNT(*) FROM profiles p2
    WHERE p2.is_active = 1 AND p2.name = w.name
  ) = 1;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT
-- ═══════════════════════════════════════════════════════════════════
-- (1) 연결 결과 요약 — 기대치: linked + unlinked = 활성 워커 수(16)
-- SELECT
--   SUM(profile_id IS NOT NULL) AS linked,
--   SUM(profile_id IS NULL)     AS unlinked,
--   COUNT(*)                    AS total
-- FROM cs_workers WHERE is_active = 1;
--
-- (2) 미연결 워커 목록 — 동명이인이거나 profiles 미등록 (UI 수동 연결 대상)
-- SELECT w.id, w.name,
--   (SELECT COUNT(*) FROM profiles p WHERE p.is_active=1 AND p.name=w.name) AS name_match_count
-- FROM cs_workers w
-- WHERE w.is_active = 1 AND w.profile_id IS NULL;
--
-- (3) 1:1 무결성 — 한 profile_id 가 2개 워커에 연결되면 행 반환 (기대치: 0행)
-- SELECT profile_id, COUNT(*) c FROM cs_workers
-- WHERE is_active = 1 AND profile_id IS NOT NULL
-- GROUP BY profile_id HAVING c > 1;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK (백필 취소 — 모든 연결 해제)
-- ═══════════════════════════════════════════════════════════════════
-- UPDATE cs_workers SET profile_id = NULL WHERE is_active = 1;
