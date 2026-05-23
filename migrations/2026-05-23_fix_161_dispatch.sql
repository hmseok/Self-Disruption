-- ════════════════════════════════════════════════════════════════════
-- 2026-05-23 — 161하9826 오분류 배차 복구 (정산완료 → 배차완료)
-- 2026-05-23 (trusting-relaxed-keller / operations 세션 / PR-X)
--
-- 사용자 보고 (엑셀 496행): 161하9826 — 반납일에 '05/23 18:00' 이 적혀
--   있으나 비고에 "5월24일 오전까지 사용" — 실제로는 아직 배차중.
--   앞서 돌린 fix_pending_status STEP 2 가 actual_return_date 가 있다는
--   이유로 settled 처리 → 실제 운영 상태와 불일치 (엑셀 9 vs DB 8 차이).
--
-- 처리: 최신 161하9826 건의 status 를 dispatched 로 되돌리고
--   actual_return_date 를 비움 (예정 반납일은 expected_return_date 로 보존).
--
-- ⚠ Rule 23/8 — STEP 0 미리보기 먼저, 확인 후 STEP 1.
-- ⚠ 멱등 — status='settled' 인 건만 대상이라 재실행 무해.
-- ════════════════════════════════════════════════════════════════════

-- ── STEP 0 — 미리보기 (161하9826 의 모든 배차건) ──
SELECT id, vehicle_car_number, customer_name, status,
       dispatch_date, expected_return_date, actual_return_date
  FROM fmi_rentals
 WHERE vehicle_car_number = '161하9826'
 ORDER BY dispatch_date DESC;
--  최신 건 status 가 'settled' 이고 actual_return_date 가 채워져 있으면 STEP 1 진행


-- ═════ 위 확인 후 STEP 1 실행 ═════

-- ── STEP 1 — 최신 161하9826 정산완료 건 → 배차완료 복구 ──
UPDATE fmi_rentals
   SET status = 'dispatched',
       expected_return_date = COALESCE(expected_return_date, actual_return_date),
       actual_return_date = NULL,
       updated_at = NOW()
 WHERE id = (
   SELECT id FROM (
     SELECT id
       FROM fmi_rentals
      WHERE vehicle_car_number = '161하9826'
        AND status = 'settled'
      ORDER BY dispatch_date DESC
      LIMIT 1
   ) t
 );

-- ── 검증 ──
--   SELECT status, expected_return_date, actual_return_date
--     FROM fmi_rentals
--    WHERE vehicle_car_number = '161하9826'
--    ORDER BY dispatch_date DESC LIMIT 1;
--   -- 기대: status='dispatched', actual_return_date=NULL
