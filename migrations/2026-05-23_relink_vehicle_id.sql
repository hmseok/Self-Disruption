-- ════════════════════════════════════════════════════════════════════
-- 2026-05-23 — 빌려타 대차건 vehicle_id 재연결
-- 2026-05-23 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 명시 (2026-05-23): 「기존 데이터도 (차량) 매칭해야죠」
--
-- 배경: 옛 import(intake-bulk)가 fmi_rentals.vehicle_id 를 깨진 정수값
--   ('183' 등)으로 넣어 cars 테이블과 실제 연결이 끊김. N3c 의 재연결은
--   vehicle_id IS NULL 조건이라 정수 쓰레기값 행을 건너뜀.
--   → 차량번호(vehicle_car_number) ↔ cars.number 로 다시 연결.
--
-- ⚠ Rule 23/8 — STEP 0 미리보기 먼저, 확인 후 STEP 1.
-- ⚠ 멱등 (재실행 무해 — 같은 결과).
-- ════════════════════════════════════════════════════════════════════

-- ── STEP 0 — 미리보기 ──
-- (0-A) 재연결될 건수
SELECT COUNT(*) AS 재연결대상
  FROM fmi_rentals f
  JOIN cars c ON c.`number` = f.vehicle_car_number
 WHERE f.fleet_group = '빌려타';

-- (0-B) cars 에 매칭되는 차량번호가 없는 건 (재연결 불가 — 차량 미등록)
SELECT DISTINCT f.vehicle_car_number AS 매칭안되는_차량번호
  FROM fmi_rentals f
  LEFT JOIN cars c ON c.`number` = f.vehicle_car_number
 WHERE f.fleet_group = '빌려타'
   AND f.vehicle_car_number IS NOT NULL AND f.vehicle_car_number <> ''
   AND c.id IS NULL;


-- ═════ STEP 0 확인 후 아래 실행 ═════

-- ── STEP 1 — vehicle_id 재연결 ──
UPDATE fmi_rentals f
  JOIN cars c ON c.`number` = f.vehicle_car_number
   SET f.vehicle_id = c.id,
       f.updated_at = NOW()
 WHERE f.fleet_group = '빌려타';

-- ── 검증 ──
--   SELECT COUNT(*) AS 연결됨
--     FROM fmi_rentals r JOIN cars c ON c.id = r.vehicle_id
--    WHERE r.fleet_group = '빌려타';
--   -- 기대: (0-A) 재연결대상 건수와 일치
