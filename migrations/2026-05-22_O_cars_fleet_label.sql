-- ════════════════════════════════════════════════════════════════════
-- PR-O — 빌려타 전용 차량 fleet(ownership_type) 라벨
-- 2026-05-22 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 명시 (2026-05-22):
--   「대차리스트의 플릿을 cars 정보에서 가져오게 — 차량 한 곳에서 관리」
--
-- 배경: 대차리스트 플릿 = COALESCE(fmi_rentals.fleet_group, cars.ownership_type).
--   빌려타 535건은 fmi_rentals.fleet_group 라벨됨(N3d). 그러나 신규 배차는
--   fleet_group 미설정 → cars.ownership_type 폴백. 빌려타 전용 15대의
--   ownership_type 을 '빌려타' 로 박아두면, 그 차로 배차되는 모든 신규 건이
--   자동으로 빌려타 플릿으로 잡힘.
--   (cars.ownership_type = rental_company 의미 — PR-E 차량 통합 시 확정)
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행. 멱등 (재실행 무해).
--
-- 실행:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-22_O_cars_fleet_label.sql
-- ════════════════════════════════════════════════════════════════════

UPDATE cars
SET ownership_type = '빌려타', updated_at = NOW()
WHERE `number` IN (
  '125하4239','142호4413','125하4228','142호4406','125하4207',
  '17허9866','125하2050','175허1237','101허4216','101허4230',
  '47하9602','47하9603','47하9604','47하9606','161하9826'
);

-- ── 검증 (단독 실행) ──
--   SELECT `number`, ownership_type FROM cars
--    WHERE `number` IN ('125하4239','142호4413','125하4228','142호4406','125하4207',
--      '17허9866','125하2050','175허1237','101허4216','101허4230',
--      '47하9602','47하9603','47하9604','47하9606','161하9826');
--   -- 기대: 매칭된 차량 모두 ownership_type='빌려타'
--   SELECT ownership_type, COUNT(*) FROM cars GROUP BY ownership_type;
