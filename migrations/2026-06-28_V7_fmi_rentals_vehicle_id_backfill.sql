-- V7 (2026-06-28) — 빌려타 대차의 vehicle_id 백필 (차량번호 → cars.id 링크)
-- 배경: import는 fmi_rentals.vehicle_car_number(번호)만 채우고 vehicle_id(cars.id)는 NULL.
--   waiting-vehicles API 는 status='dispatched' AND vehicle_id IS NOT NULL 로 「배차중」을 도출 →
--   링크 없는 대차는 누락 → 미반납 차량이 「사용가능」으로 잘못 표시됨.
-- 해결: 차량번호로 cars 매칭해 vehicle_id 채움 → 배차중 도출 정상화 + 반납/정산/투자자정산도 정상 링크.
-- 멱등(이미 채워진 건 건너뜀). CONVERT 로 collation 안전.

UPDATE fmi_rentals f
  JOIN cars c
    ON CONVERT(c.number USING utf8mb4) = CONVERT(f.vehicle_car_number USING utf8mb4)
SET f.vehicle_id = c.id,
    f.updated_at = NOW()
WHERE (f.vehicle_id IS NULL OR f.vehicle_id = '')
  AND f.fleet_group = '빌려타'
  AND f.vehicle_car_number IS NOT NULL
  AND f.vehicle_car_number <> '';

-- 검증 1: 백필 후 남은 NULL 링크 (번호가 cars 에 없는 대차 — 보유차량 아님일 수 있음)
-- SELECT vehicle_car_number, COUNT(*) FROM fmi_rentals
--   WHERE fleet_group='빌려타' AND vehicle_id IS NULL GROUP BY vehicle_car_number;

-- 검증 2: 현재 배차중(미반납) 차량 수 — waiting-vehicles 가 이 값을 「배차중」으로 표시
-- SELECT COUNT(DISTINCT vehicle_id) FROM fmi_rentals WHERE status='dispatched' AND vehicle_id IS NOT NULL;
