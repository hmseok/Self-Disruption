-- ════════════════════════════════════════════════════════════════════
-- 2026-05-23 — 빌려타 status 용어 통일 + superseded 배차 정리
-- 2026-05-23 (trusting-relaxed-keller / operations 세션)
--
-- 발견: fmi_rentals.status 에 예전 import 용어가 섞여 있음
--   paid(360) / billed(3)  — 앱이 모르는 값 → 대차리스트·청구관리 양쪽 다 안 보임
--   앱 표준: pending / dispatched / returned / claiming / settled / cancelled
--
-- 처리:
--   STEP 1 — 용어 통일:  paid → settled(정산완료),  billed → claiming(청구중)
--   STEP 2 — 같은 차량 다음 출고가 있는 pending/dispatched → 회차완료
--            (actual_return_date = 다음 출고일 전날)
--
-- ⚠ Rule 23/8/10 — STEP 0 미리보기 먼저 확인 후 STEP 1·2.
-- ⚠ 멱등 (재실행 무해).
-- ════════════════════════════════════════════════════════════════════

-- ── STEP 0 — 미리보기 (현재 status 분포) ──
SELECT status, COUNT(*) AS 건수
  FROM fmi_rentals WHERE fleet_group = '빌려타'
 GROUP BY status ORDER BY 건수 DESC;
--  paid / billed 가 보이면 STEP 1·2 진행


-- ═════ 위 확인 후 아래 실행 ═════

-- ── STEP 1 — status 용어 통일 ──
UPDATE fmi_rentals SET status = 'settled', updated_at = NOW()
 WHERE fleet_group = '빌려타' AND status = 'paid';

UPDATE fmi_rentals SET status = 'claiming', updated_at = NOW()
 WHERE fleet_group = '빌려타' AND status = 'billed';

-- ── STEP 2 — superseded 배차 회차완료 처리 ──
--   (다음 출고가 있는 pending/dispatched → returned, 반납일 = 다음 출고 - 1일)
UPDATE fmi_rentals f
  JOIN (
    SELECT id,
           LEAD(dispatch_date) OVER (
             PARTITION BY vehicle_car_number ORDER BY dispatch_date
           ) AS next_dispatch
      FROM fmi_rentals
     WHERE fleet_group = '빌려타' AND status <> 'cancelled'
  ) seq ON seq.id = f.id
   SET f.status = 'returned',
       f.actual_return_date = DATE_SUB(seq.next_dispatch, INTERVAL 1 DAY),
       f.updated_at = NOW()
 WHERE seq.next_dispatch IS NOT NULL
   AND f.status IN ('pending', 'dispatched')
   AND f.actual_return_date IS NULL;

-- ── 검증 ──
--   SELECT status, COUNT(*) FROM fmi_rentals WHERE fleet_group='빌려타' GROUP BY status;
--   -- 기대: paid/billed 사라짐, pending/dispatched 는 차량별 최신만 (~15),
--   --       settled 대폭 증가, returned 증가
