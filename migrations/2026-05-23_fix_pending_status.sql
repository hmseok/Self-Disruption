-- ════════════════════════════════════════════════════════════════════
-- 2026-05-23 — 잔여 pending 배차 상태 정리
-- 2026-05-23 (trusting-relaxed-keller / operations 세션)
--
-- 발견: status_normalize 후에도 pending 99건이 남음.
--   원인 — 이 99건은 actual_return_date(반납일)는 이미 있는데 status 만
--   'pending' 으로 남은 옛 import 잔여. (반납 완료인데 상태 미반영)
--   STEP 2(반납일 없는 것 대상)에 안 걸려서 그대로 남음.
--
-- 처리:
--   STEP 1 — 반납일 없는데 다음 출고 있는 pending/dispatched → 반납일 채움
--            (actual_return_date = 다음 출고 - 1일)
--   STEP 2 — 반납일 있는 pending/dispatched → settled (정산완료)
--            = 이미 반납·종료된 2025 옛 배차. 청구관리에서도 정리됨.
--   → 차량별 최신 + 반납일 없는 건만 pending/dispatched 유지 (진짜 진행 중)
--
-- ⚠ Rule 23/8 — STEP 0 미리보기 먼저, 멱등(재실행 무해).
-- ⚠ 옛 99건을 「회차완료(returned)」가 아닌 「정산완료(settled)」로 처리:
--    2025년 옛 데이터라 종료 처리. 청구 대기로 두고 싶으면 STEP 2 의
--    'settled' → 'returned' 로 바꿔 실행.
-- ════════════════════════════════════════════════════════════════════

-- ── STEP 0 — 미리보기 (pending/dispatched 의 반납일 유무) ──
SELECT
  SUM(actual_return_date IS NOT NULL) AS 반납일있음,
  SUM(actual_return_date IS NULL)     AS 반납일없음
  FROM fmi_rentals
 WHERE fleet_group = '빌려타' AND status IN ('pending', 'dispatched');


-- ═════ 위 확인 후 STEP 1·2 실행 ═════

-- ── STEP 1 — 반납일 없는 superseded 건 → 반납일 채움 (다음 출고 - 1일) ──
UPDATE fmi_rentals f
  JOIN (
    SELECT id,
           LEAD(dispatch_date) OVER (
             PARTITION BY vehicle_car_number ORDER BY dispatch_date
           ) AS next_dispatch
      FROM fmi_rentals
     WHERE fleet_group = '빌려타' AND status <> 'cancelled'
  ) seq ON seq.id = f.id
   SET f.actual_return_date = DATE_SUB(seq.next_dispatch, INTERVAL 1 DAY),
       f.updated_at = NOW()
 WHERE seq.next_dispatch IS NOT NULL
   AND f.status IN ('pending', 'dispatched')
   AND f.actual_return_date IS NULL;

-- ── STEP 2 — 반납일 있는 pending/dispatched → 정산완료 ──
UPDATE fmi_rentals
   SET status = 'settled', updated_at = NOW()
 WHERE fleet_group = '빌려타'
   AND status IN ('pending', 'dispatched')
   AND actual_return_date IS NOT NULL;

-- ── 검증 ──
--   SELECT status, COUNT(*) FROM fmi_rentals WHERE fleet_group='빌려타' GROUP BY status;
--   -- 기대: pending/dispatched 는 차량별 최신·반납일없음 만 (~15 이하)
