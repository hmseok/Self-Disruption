-- ════════════════════════════════════════════════════════════════════
-- PR-E4 — fmi_vehicles 폐기 (테이블 archive rename)
-- 2026-05-16 (trusting-relaxed-keller / operations 세션)
--
-- 차량 테이블 통합 (PR-E) 4단계 (마지막). cars 정본 전환 완료.
--   PR-E1: cars schema 52컬럼 동기화
--   PR-E2: fmi_rentals.vehicle_id 466건 → cars.id 리포인트
--   PR-E3: fmi_vehicles 참조 코드 11파일 → cars 전환
--   PR-E4: fmi_vehicles 테이블 폐기 (본 파일)
--
-- 사용자 명시 (2026-05-16):
--   「다 추출해서 제대로 하나 놓고 불필요한 데이터 정리」
--
-- ⚠ 즉시 DROP 아님 — fmi_vehicles_archive 로 rename (롤백 여지 보존).
--   안정 확인 후 (수개월) 최종 DROP 은 별도 진행.
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행.
-- ⚠ Rule 24 — 멱등 가드 (여러 번 실행 안전).
-- ════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- STEP 0 — 사전 확인 (단독 실행 — 안전 점검)
-- ───────────────────────────────────────────────────────────────────
-- fmi_vehicles 가 빈 껍데기인지 + 참조 잔재 없는지 확인:
--
--   SELECT COUNT(*) AS fmi_vehicles_rows FROM fmi_vehicles;
--   -- 기대: 18 (빈 껍데기 — sync 복제본)
--
--   SELECT COUNT(*) AS rentals_pointing_fmi
--     FROM fmi_rentals r
--    WHERE r.vehicle_id IS NOT NULL
--      AND r.vehicle_id IN (SELECT id FROM fmi_vehicles)
--      AND r.vehicle_id NOT IN (SELECT id FROM cars);
--   -- 기대: 0 (PR-E2 리포인트 후 fmi_vehicles 만 가리키는 row 없어야 함)
--
-- rentals_pointing_fmi 가 0 이 아니면 → 중단, PR-E2 재확인.


-- ───────────────────────────────────────────────────────────────────
-- STEP 1 — fmi_vehicles → fmi_vehicles_archive rename (멱등 가드)
-- ───────────────────────────────────────────────────────────────────
SET @tbl_exists := (
  SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = 'fmi_vehicles'
);
SET @archive_exists := (
  SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = 'fmi_vehicles_archive'
);
SET @sql := IF(@tbl_exists > 0 AND @archive_exists = 0,
  'RENAME TABLE fmi_vehicles TO fmi_vehicles_archive',
  'SELECT "fmi_vehicles already archived or absent" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ───────────────────────────────────────────────────────────────────
-- STEP 2 — 검증 (단독 실행)
-- ───────────────────────────────────────────────────────────────────
--   SELECT
--     (SELECT COUNT(*) FROM information_schema.tables
--       WHERE table_schema=DATABASE() AND table_name='fmi_vehicles')         AS fmi_vehicles_gone,
--     (SELECT COUNT(*) FROM information_schema.tables
--       WHERE table_schema=DATABASE() AND table_name='fmi_vehicles_archive') AS archive_exists;
--   -- 기대: fmi_vehicles_gone=0 / archive_exists=1


-- ════════════════════════════════════════════════════════════════════
-- 최종 DROP (수개월 안정 확인 후 — 지금 실행 금지):
--   DROP TABLE fmi_vehicles_archive;
--   DROP TABLE fmi_rentals_bak_pre_e2;   -- PR-E2 백업본
-- ════════════════════════════════════════════════════════════════════
