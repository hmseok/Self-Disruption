-- ════════════════════════════════════════════════════════════════════
-- 2026-05-23 — 대차리스트 데이터 정리
-- 2026-05-23 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 명시 (2026-05-23):
--   1) 따봉 등 이상 데이터 삭제
--   2) 같은 차량이 추가 출고된 건 = 이전 건은 이미 반납된 것 →
--      회차완료 처리. actual_return_date = 「다음 출고일 전날」.
--
-- 배경: 옛 import 데이터가 status='pending' 으로 들어와 대차리스트에
--   배차예정 146건으로 쌓임. 차량별 최신 배차만 남기고 나머진 회차완료
--   (→ 청구관리 탭으로 인계).
--
-- ⚠ Rule 23/8/10 — 반드시 STEP 0 미리보기 먼저 실행해 확인 후 STEP 1·2.
-- ⚠ STEP 1 은 DELETE — 미리보기로 대상 확인 필수.
-- ════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- STEP 0 — 미리보기 (먼저 이 2개만 실행해서 대상 확인)
-- ─────────────────────────────────────────────────────────────────

-- (0-A) 삭제될 따봉 이상 데이터
SELECT id, vehicle_car_number, customer_name, customer_car_number,
       DATE(dispatch_date) AS 출고일, status, fleet_group
  FROM fmi_rentals
 WHERE customer_name LIKE '따봉%';

-- (0-B) 회차완료 처리될 superseded 배차 (다음 출고가 있는 건)
SELECT f.vehicle_car_number, DATE(f.dispatch_date) AS 출고일,
       f.status AS 현재상태,
       DATE(DATE_SUB(seq.next_dispatch, INTERVAL 1 DAY)) AS 입력될_반납일
  FROM fmi_rentals f
  JOIN (
    SELECT id,
           LEAD(dispatch_date) OVER (
             PARTITION BY vehicle_car_number ORDER BY dispatch_date
           ) AS next_dispatch
      FROM fmi_rentals
     WHERE fleet_group = '빌려타'
  ) seq ON seq.id = f.id
 WHERE seq.next_dispatch IS NOT NULL
   AND f.status IN ('pending', 'dispatched')
   AND f.actual_return_date IS NULL
 ORDER BY f.vehicle_car_number, f.dispatch_date;


-- ═════ 위 미리보기가 맞으면 아래 STEP 1·2 실행 ═════

-- ─────────────────────────────────────────────────────────────────
-- STEP 1 — 따봉 이상 데이터 삭제
-- ─────────────────────────────────────────────────────────────────
DELETE FROM fmi_rentals WHERE customer_name LIKE '따봉%';

-- ─────────────────────────────────────────────────────────────────
-- STEP 2 — superseded 배차 회차완료 처리
--   다음 출고가 있는 배차 → status='returned',
--   actual_return_date = 다음 출고일 - 1일
--   (window 함수로 derived table materialize → self-update 안전)
-- ─────────────────────────────────────────────────────────────────
UPDATE fmi_rentals f
  JOIN (
    SELECT id,
           LEAD(dispatch_date) OVER (
             PARTITION BY vehicle_car_number ORDER BY dispatch_date
           ) AS next_dispatch
      FROM fmi_rentals
     WHERE fleet_group = '빌려타'
  ) seq ON seq.id = f.id
   SET f.status = 'returned',
       f.actual_return_date = DATE_SUB(seq.next_dispatch, INTERVAL 1 DAY),
       f.updated_at = NOW()
 WHERE seq.next_dispatch IS NOT NULL
   AND f.status IN ('pending', 'dispatched')
   AND f.actual_return_date IS NULL;

-- ── 검증 ──
--   SELECT status, COUNT(*) FROM fmi_rentals WHERE fleet_group='빌려타' GROUP BY status;
--   -- pending/dispatched 는 차량별 최신 배차만 남아야 함 (대폭 감소)
