-- ════════════════════════════════════════════════════════════════════
-- 2026-05-23 — 161하9826 복구 (구버전 마이그레이션 오작동 정정)
-- 2026-05-23 (trusting-relaxed-keller / operations 세션 / PR-X.2)
--
-- ⚠ 사고: 구버전 fix_161_dispatch.sql 의 STEP 1 이
--   "AND status='settled' ORDER BY dispatch_date DESC LIMIT 1" 조건이라
--   유한희(고쳐야 할 행)가 아닌 문태원(완료건)을 잡아 잘못 변경함.
--
-- 현재 잘못된 상태 (STEP 0 로 확인됨):
--   ① 문태원  c532405b… — settled → dispatched 로 바뀌고 반납일 지워짐  ❌
--      원복: status='settled', actual_return_date='2026-05-06 18:00:00'
--   ② 유한희  c5383685… — 아직 returned (실제는 배차중)              ❌
--      수정: status='dispatched', actual_return_date=NULL
--
-- 두 행 모두 id 직접 지정 + status 가드 → 정확히 그 행만, 멱등.
--
-- ⚠ Rule 23/8 — STEP 0 미리보기 먼저, 확인 후 STEP 1·2.
-- ════════════════════════════════════════════════════════════════════

-- ── STEP 0 — 미리보기 (대상 2건 현재 상태) ──
SELECT id, customer_name, status,
       dispatch_date, expected_return_date, actual_return_date
  FROM fmi_rentals
 WHERE id IN ('c532405b-55ca-11f1-a4e0-42010a400006',   -- 문태원
              'c5383685-55ca-11f1-a4e0-42010a400006')   -- 유한희
 ORDER BY dispatch_date;
--  문태원=dispatched / 유한희=returned 이면 아래 STEP 1·2 진행


-- ═════ 위 확인 후 STEP 1·2 실행 ═════

-- ── STEP 1 — 문태원 건 원상복구 (dispatched → settled, 반납일 복원) ──
UPDATE fmi_rentals
   SET status = 'settled',
       actual_return_date = '2026-05-06 18:00:00',
       updated_at = NOW()
 WHERE id = 'c532405b-55ca-11f1-a4e0-42010a400006'
   AND status = 'dispatched';

-- ── STEP 2 — 유한희 건 정상 수정 (returned → dispatched, 반납일 해제) ──
UPDATE fmi_rentals
   SET status = 'dispatched',
       expected_return_date = COALESCE(expected_return_date, actual_return_date),
       actual_return_date = NULL,
       updated_at = NOW()
 WHERE id = 'c5383685-55ca-11f1-a4e0-42010a400006'
   AND status = 'returned';

-- ── 검증 ──
--   SELECT id, customer_name, status, expected_return_date, actual_return_date
--     FROM fmi_rentals
--    WHERE id IN ('c532405b-55ca-11f1-a4e0-42010a400006',
--                 'c5383685-55ca-11f1-a4e0-42010a400006');
--   -- 기대: 문태원 status='settled' actual_return_date='2026-05-06 18:00:00'
--   --       유한희 status='dispatched' actual_return_date=NULL
--
--   SELECT COUNT(DISTINCT vehicle_id) AS 배차중_차량수
--     FROM fmi_rentals WHERE status='dispatched' AND vehicle_id IS NOT NULL;
--   -- 기대: 9
