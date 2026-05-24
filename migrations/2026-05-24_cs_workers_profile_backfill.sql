-- ═══════════════════════════════════════════════════════════════════
-- CallScheduler — cs_workers.profile_id 백필 (인사마스터 연동)
-- Phase WHR-A · 2026-05-24
--
-- 목적:
--   기존 16 워커의 profile_id (현재 전부 NULL) 를 profiles 의 직원과
--   이름 정확 일치로 연결한다.
--
-- 안전 규칙:
--   1) profile_id IS NULL 인 워커만 대상 → 멱등 (여러 번 실행 안전)
--   2) 이름이 profiles 에 정확히 1명일 때만 연결 (동명이인 skip)
--   3) 이미 다른 워커가 쓰는 profile_id 는 재사용 안 함 (1:1 보장)
--   4) is_active = 1 인 profiles · cs_workers 만 대상
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
  ) = 1
  -- 매칭될 profile 이 다른 워커에 이미 쓰이지 않을 때만 (1:1)
  AND NOT EXISTS (
    SELECT 1 FROM cs_workers w2
    WHERE w2.is_active = 1
      AND w2.profile_id IS NOT NULL
      AND w2.id <> w.id
      AND w2.profile_id = (
        SELECT p3.id FROM profiles p3
        WHERE p3.is_active = 1 AND p3.name = w.name
        LIMIT 1
      )
  );

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
