-- ════════════════════════════════════════════════════════════════════
-- 2026-05-23 — 161하9826 오분류 배차 복구 (회차완료 → 배차완료)
-- 2026-05-23 (trusting-relaxed-keller / operations 세션 / PR-X)
--
-- 사용자 보고 (엑셀 496행): 161하9826 유한희 건 — 반납일에 '05/23 18:00'
--   이 적혀 있으나 비고 "5월24일 오전까지 사용" — 실제로는 아직 배차중.
--   import 가 엑셀 반납일을 actual_return_date 로 일괄 넣어 회차완료(returned)
--   처리됨 → 실제 운영(배차중)과 불일치 (엑셀 9 vs DB 8 차이의 원인).
--
-- STEP 0 미리보기로 확인된 대상 행 (최신 161하9826 = 유한희):
--   id     = c5383685-55ca-11f1-a4e0-42010a400006
--   status = returned   (settled 아님 — 그래서 id 직접 지정)
--   dispatch_date        = 2026-05-08 12:30
--   actual_return_date   = 2026-05-23 18:00  ← 잘못 들어간 값
--
-- 처리: 이 한 행만 dispatched 로 되돌리고 actual_return_date 를 비움.
--   (예정 반납일 expected_return_date 는 그대로 유지)
--
-- ⚠ Rule 23/8 — STEP 0 미리보기로 이미 대상 확인 완료.
-- ⚠ 멱등 — id + status='returned' + actual_return_date='2026-05-23 18:00:00'
--   3중 가드. 실행 후 actual_return_date=NULL 이 되어 재실행 시 무반응.
--   (나중에 실제 반납 처리해도 반납시각이 달라 재트리거 안 됨)
-- ════════════════════════════════════════════════════════════════════

-- ── STEP 0 — 미리보기 (161하9826 의 모든 배차건) ──
SELECT id, vehicle_car_number, customer_name, status,
       dispatch_date, expected_return_date, actual_return_date
  FROM fmi_rentals
 WHERE vehicle_car_number = '161하9826'
 ORDER BY dispatch_date DESC;
--  최신 건(유한희 / id c5383685…)이 status='returned' 면 STEP 1 진행


-- ═════ 위 확인 후 STEP 1 실행 ═════

-- ── STEP 1 — 유한희 161하9826 건 → 배차완료 복구 ──
UPDATE fmi_rentals
   SET status = 'dispatched',
       expected_return_date = COALESCE(expected_return_date, actual_return_date),
       actual_return_date = NULL,
       updated_at = NOW()
 WHERE id = 'c5383685-55ca-11f1-a4e0-42010a400006'
   AND status = 'returned'
   AND actual_return_date = '2026-05-23 18:00:00';

-- ── 검증 ──
--   SELECT status, expected_return_date, actual_return_date
--     FROM fmi_rentals
--    WHERE id = 'c5383685-55ca-11f1-a4e0-42010a400006';
--   -- 기대: status='dispatched', actual_return_date=NULL
--
--   SELECT COUNT(DISTINCT vehicle_id) AS 배차중_차량수
--     FROM fmi_rentals WHERE status='dispatched' AND vehicle_id IS NOT NULL;
--   -- 기대: 9 (기존 8 + 161하9826)
