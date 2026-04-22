-- ============================================================
-- 2026-04-22 : /db/pricing-standards 구조 간소화
-- 계산엔진·UI에서 완전히 미사용인 5개 테이블만 제거
-- ============================================================
-- 원칙:
--   - "계산엔진이 input.reference.* 필드로 읽지 않고,
--      /quotes/simple 페이지가 Promise.all 로 fetch 하지도 않고,
--      UI 편집 탭이 존재하지도 않는" 테이블만 DROP 대상.
--
-- 검증 절차 (2026-04-22 수행):
--   ✅ grep "<table_name>" 결과 → 활성 코드 참조 0건
--   ✅ rent-calc-engine.ts 내 reference.* 필드에 없음
--   ✅ /quotes/simple/page.tsx Promise.all 리스트에 없음
--
-- DROP 대상 5개:
--   1) depreciation_history         — 레거시 감가 이력.
--                                     2026-04-22 pricing_standard_changes 로 전면 대체됨.
--   2) emission_standard_table      — 친환경 배출 기준 참조용.
--                                     계산 로직에서 한 번도 호출되지 않음.
--   3) inspection_penalty_table     — 검사 지연 과태료 참조용.
--                                     엔진에서 쓰지 않음. 참고자료.
--   4) insurance_policy_record      — 보험 가입 이력(운영 기록).
--                                     참조 테이블 아님. fmi_rentals/operational 에서 따로 관리.
--   5) insurance_vehicle_group      — 보험사 차량 그룹.
--                                     계산 엔진에서 사용하지 않음 (insurance_rate_table 로 충분).
-- ============================================================

-- 1) 실행 전 데이터 개수 확인 — 디버깅 참고용
SELECT 'depreciation_history'      AS tbl, COUNT(*) AS n FROM depreciation_history      UNION ALL
SELECT 'emission_standard_table',         COUNT(*) FROM emission_standard_table         UNION ALL
SELECT 'inspection_penalty_table',        COUNT(*) FROM inspection_penalty_table        UNION ALL
SELECT 'insurance_policy_record',         COUNT(*) FROM insurance_policy_record         UNION ALL
SELECT 'insurance_vehicle_group',         COUNT(*) FROM insurance_vehicle_group;

-- 2) 실제 DROP
DROP TABLE IF EXISTS depreciation_history;
DROP TABLE IF EXISTS emission_standard_table;
DROP TABLE IF EXISTS inspection_penalty_table;
DROP TABLE IF EXISTS insurance_policy_record;
DROP TABLE IF EXISTS insurance_vehicle_group;

-- 3) 변경이력 테이블에 남아있는 과거 로그 정리 (선택)
DELETE FROM pricing_standard_changes
 WHERE table_name IN (
   'depreciation_history',
   'emission_standard_table',
   'inspection_penalty_table',
   'insurance_policy_record',
   'insurance_vehicle_group'
 );
