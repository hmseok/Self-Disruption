-- ════════════════════════════════════════════════════════════════════
-- PR-N3d — 기존 빌려타 historical 행 fleet_group 라벨 + 부가세 재적용
-- 2026-05-22 (trusting-relaxed-keller / operations 세션)
--
-- 배경: 빌려타 데이터가 예전 import(intake-bulk 추정)로 fmi_rentals 에
--   이미 약 470건 존재. 그 행들은 fleet_group 이 비어 있어 대차리스트
--   「빌려타」 필터/라벨에 안 잡힘. N3c 는 누락분 63건만 신규 추가.
--   N3c 의 부가세 UPDATE 는 당시 fleet_group 미라벨이라 4건만 적용됨.
--
-- 처리:
--   1) 빌려타 전용 차량 15대로 배차된 NULL-fleet 행 → fleet_group='빌려타'
--   2) 부가세 추가청구 32건 재적용 (fleet_group 조건 제거 — 키로만 매칭)
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행. 멱등 (재실행 무해).
--
-- 실행:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-22_N3d_fmi_rentals_fleet_label.sql
-- ════════════════════════════════════════════════════════════════════

-- ── 1) 기존 빌려타 행 fleet_group 라벨 ──
UPDATE fmi_rentals
SET fleet_group = '빌려타', updated_at = NOW()
WHERE (fleet_group IS NULL OR fleet_group = '')
  AND vehicle_car_number IN (
    '125하4239','142호4413','125하4228','142호4406','125하4207',
    '17허9866','125하2050','175허1237','101허4216','101허4230',
    '47하9602','47하9603','47하9604','47하9606','161하9826'
  );

-- ── 2) 부가세 추가청구 플래그 재적용 (32건, 키 매칭) ──
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company='iM' WHERE vehicle_car_number='175허1237' AND dispatch_date='2025-10-31 09:00:00' AND customer_car_number='103하2988';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company='마음카' WHERE vehicle_car_number='142호4413' AND dispatch_date='2025-10-16 12:00:00' AND customer_car_number='125호8687';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company='iM' WHERE vehicle_car_number='142호4413' AND dispatch_date='2025-10-30 15:00:00' AND customer_car_number='232호5173';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company='iM' WHERE vehicle_car_number='175허1237' AND dispatch_date='2025-11-09 10:00:00' AND customer_car_number='54허3667';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company='iM' WHERE vehicle_car_number='125하2050' AND dispatch_date='2025-11-06 09:30:00' AND customer_car_number='232호1060';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company='우리' WHERE vehicle_car_number='142호4406' AND dispatch_date='2025-11-11 17:00:00' AND customer_car_number='199호7301';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company='우리' WHERE vehicle_car_number='125하4239' AND dispatch_date='2025-11-18 11:00:00' AND customer_car_number='205하4500';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company='iM' WHERE vehicle_car_number='125하2050' AND dispatch_date='2025-11-19 15:00:00' AND customer_car_number='103호6577';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company='우리' WHERE vehicle_car_number='175허1237' AND dispatch_date='2025-12-03 08:00:00' AND customer_car_number='199호8698';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='142호4406' AND dispatch_date='2025-12-05 17:00:00' AND customer_car_number='103하2052';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='125하4239' AND dispatch_date='2025-12-17 13:00:00' AND customer_car_number='103하8456';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='175허1237' AND dispatch_date='2025-12-31 18:00:00' AND customer_car_number='103호6401';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='125하2050' AND dispatch_date='2025-12-29 09:30:00' AND customer_car_number='17하6346';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='101허4216' AND dispatch_date='2026-01-09 10:00:00' AND customer_car_number='103하2735';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='125하4239' AND dispatch_date='2026-01-20 11:00:00' AND customer_car_number='224하3063';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='47하9604' AND dispatch_date='2026-02-11 10:30:00' AND customer_car_number='54허5064';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='101허4216' AND dispatch_date='2026-02-13 10:00:00' AND customer_car_number='103호8817';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='125하4239' AND dispatch_date='2026-02-19 08:00:00' AND customer_car_number='103호5536';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='125하2050' AND dispatch_date='2026-02-14 09:00:00' AND customer_car_number='226하2620';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='142호4406' AND dispatch_date='2026-03-06 10:30:00' AND customer_car_number='103호9708';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='101허4230' AND dispatch_date='2026-03-10 14:00:00' AND customer_car_number='103호5024';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='161하9826' AND dispatch_date='2026-03-09 14:00:00' AND customer_car_number='195하3990';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='125하2050' AND dispatch_date='2026-03-13 14:00:00' AND customer_car_number='126하5338';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='142호4406' AND dispatch_date='2026-03-17 17:00:00' AND customer_car_number='232호1630';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='175허1237' AND dispatch_date='2026-02-05 14:00:00' AND customer_car_number='232호3059';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='125하2050' AND dispatch_date='2026-03-23 20:30:00' AND customer_car_number='205하4380';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='47하9604' AND dispatch_date='2026-04-02 17:00:00' AND customer_car_number='54허3916';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='125하4239' AND dispatch_date='2026-04-06 15:00:00' AND customer_car_number='233하6369';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='175허1237' AND dispatch_date='2026-04-20 12:00:00' AND customer_car_number='232호2637';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='101허4216' AND dispatch_date='2026-04-23 17:00:00' AND customer_car_number='103호6820';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='175허1237' AND dispatch_date='2026-04-24 14:00:00' AND customer_car_number='232호7662';
UPDATE fmi_rentals SET vat_extra_billing='Y', capital_company=NULL WHERE vehicle_car_number='125하2050' AND dispatch_date='2026-04-20 16:00:00' AND customer_car_number='205하7065';

-- ── 검증 (단독 실행) ──
--   SELECT COALESCE(fleet_group,'(NULL)') AS 그룹, COUNT(*) AS 건수
--     FROM fmi_rentals GROUP BY fleet_group ORDER BY 건수 DESC;
--   -- 빌려타 ≈ 533+ 기대
--   SELECT COUNT(*) FROM fmi_rentals WHERE vat_extra_billing='Y';   -- 기대 ~32
