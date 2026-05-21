-- ════════════════════════════════════════════════════════════════════
-- PR-E2 — fmi_rentals.vehicle_id 리포인트 (fmi_vehicles.id → cars.id)
-- 2026-05-16 (trusting-relaxed-keller / operations 세션)
--
-- 차량 테이블 통합 (PR-E) 2단계. cars 정본 전환.
--   fmi_rentals 546건 중 vehicle_id 있는 466건을 cars.id 로 변환.
--   매칭 키: fmi_vehicles.car_number = cars.number (공백 무시)
--
-- 사용자 명시 (2026-05-16):
--   「다 추출해서 제대로 하나 놓고 불필요한 데이터 정리」
--   「재무나 정산에서 연결하겠지만 거기도 수정해야되는 부분이니 할건 해야죠」
--
-- ⚠ 실행 순서 — 반드시 위에서 아래로. STEP 0 먼저 확인 후 진행.
-- ⚠ Rule 23 — 본 마이그레이션은 검토 후 사용자가 직접 실행.
-- ⚠ Rule 24 — 멱등 가드 적용 (여러 번 실행 안전).
-- ════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- STEP 0 — dry-run 검증 (먼저 단독 실행 — 결과 0건 확인 후 STEP 1~4 진행)
-- ───────────────────────────────────────────────────────────────────
-- 아래 SELECT 를 먼저 실행: cars 에 매칭 안 되는 fmi_rentals row 확인.
-- 0 rows 여야 안전. 1건이라도 나오면 중단하고 보고할 것.
--
--   SELECT r.id, r.vehicle_id, fv.car_number
--     FROM fmi_rentals r
--     JOIN fmi_vehicles fv ON r.vehicle_id = fv.id
--     LEFT JOIN cars c
--       ON REPLACE(c.number, ' ', '') = REPLACE(fv.car_number, ' ', '')
--    WHERE r.vehicle_id IS NOT NULL
--      AND c.id IS NULL;
--
-- 기대: 0 rows (18=18 동기화 + car_number 매칭 → 전건 매칭)


-- ───────────────────────────────────────────────────────────────────
-- STEP 1 — 백업 (멱등: 재실행 시 기존 백업 덮어씀)
-- ───────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS fmi_rentals_bak_pre_e2;
CREATE TABLE fmi_rentals_bak_pre_e2 AS SELECT * FROM fmi_rentals;


-- ───────────────────────────────────────────────────────────────────
-- STEP 2 — FK 제약 DROP (멱등 가드 — 이미 없으면 skip)
-- ───────────────────────────────────────────────────────────────────
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE table_schema = DATABASE()
     AND table_name = 'fmi_rentals'
     AND constraint_name = 'fmi_rentals_vehicle_id_fkey'
);
SET @sql := IF(@fk_exists > 0,
  'ALTER TABLE fmi_rentals DROP FOREIGN KEY fmi_rentals_vehicle_id_fkey',
  'SELECT "fmi_rentals_vehicle_id_fkey already dropped" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ───────────────────────────────────────────────────────────────────
-- STEP 3 — vehicle_id 리포인트 (fmi_vehicles.id → cars.id)
-- ───────────────────────────────────────────────────────────────────
-- 멱등성: 재실행 시 vehicle_id 가 이미 cars.id 이므로
--         JOIN fmi_vehicles fv ON r.vehicle_id = fv.id 매칭 실패 → 0건 UPDATE.
UPDATE fmi_rentals r
  JOIN fmi_vehicles fv ON r.vehicle_id = fv.id
  JOIN cars c
    ON REPLACE(c.number, ' ', '') = REPLACE(fv.car_number, ' ', '')
   SET r.vehicle_id = c.id;


-- ───────────────────────────────────────────────────────────────────
-- STEP 4 — 결과 검증 (실행 후 단독 SELECT — orphan 0건 확인)
-- ───────────────────────────────────────────────────────────────────
--   SELECT
--     COUNT(*)                                                          AS total,
--     SUM(vehicle_id IS NULL)                                           AS null_vehicle,
--     SUM(vehicle_id IN (SELECT id FROM cars))                          AS matched_cars,
--     SUM(vehicle_id IS NOT NULL
--         AND vehicle_id NOT IN (SELECT id FROM cars))                  AS orphan
--   FROM fmi_rentals;
--
-- 기대:  total=546 / null_vehicle≈80 / matched_cars≈466 / orphan=0
-- orphan 이 0 이 아니면 → STEP 1 백업본 (fmi_rentals_bak_pre_e2) 으로 복구.
--
-- 복구 SQL (필요 시):
--   UPDATE fmi_rentals r
--     JOIN fmi_rentals_bak_pre_e2 b ON b.id = r.id
--      SET r.vehicle_id = b.vehicle_id;


-- ════════════════════════════════════════════════════════════════════
-- 후속 (별도 PR):
--   PR-E3 — fmi_vehicles 참조 코드 13개 파일 → cars 기준 전환
--           (schema.prisma FmiRental.vehicle relation: FmiVehicle → Car)
--   PR-E4 — fmi_vehicles → fmi_vehicles_archive rename
--   백업 테이블 fmi_rentals_bak_pre_e2 는 PR-E4 완료 + 안정 확인 후 DROP
-- ════════════════════════════════════════════════════════════════════
