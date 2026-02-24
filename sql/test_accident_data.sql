-- ============================================
-- Test Data: accident_records (5건)
-- 실행 전: 040_accident_jandi_columns.sql 먼저 실행
-- ============================================
-- CHECK 제약조건:
--   accident_type: collision, self_damage, hit_and_run, theft, natural_disaster, vandalism, fire, other
--   insurance_status: none, filed, processing, approved, denied, partial
--   status: reported, insurance_filed, repairing, settled, closed, cancelled
--   vehicle_condition: repairable, total_loss, minor

-- 이전 테스트 데이터 정리 (source가 있는 것만)
DELETE FROM accident_records WHERE source IN ('jandi_accident', 'manual') AND driver_name IN ('김철수','이영희','박민준','최정희','정수민');

DO $$
DECLARE
  v_cid UUID;
  v_car1 BIGINT;
  v_car2 BIGINT;
  v_car3 BIGINT;
  v_car4 BIGINT;
  v_car5 BIGINT;
BEGIN
  SELECT id INTO v_cid FROM companies LIMIT 1;
  IF v_cid IS NULL THEN
    RAISE EXCEPTION '회사 데이터가 없습니다.';
  END IF;

  SELECT id INTO v_car1 FROM cars WHERE company_id = v_cid ORDER BY id OFFSET 0 LIMIT 1;
  SELECT id INTO v_car2 FROM cars WHERE company_id = v_cid ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO v_car3 FROM cars WHERE company_id = v_cid ORDER BY id OFFSET 2 LIMIT 1;
  SELECT id INTO v_car4 FROM cars WHERE company_id = v_cid ORDER BY id OFFSET 3 LIMIT 1;
  SELECT id INTO v_car5 FROM cars WHERE company_id = v_cid ORDER BY id OFFSET 4 LIMIT 1;

  IF v_car1 IS NULL THEN
    RAISE EXCEPTION '등록된 차량이 없습니다.';
  END IF;
  v_car2 := COALESCE(v_car2, v_car1);
  v_car3 := COALESCE(v_car3, v_car1);
  v_car4 := COALESCE(v_car4, v_car1);
  v_car5 := COALESCE(v_car5, v_car1);

  -- 1) 충돌사고 · 수리중 · 잔디접수
  INSERT INTO accident_records (
    company_id, car_id, accident_date, accident_time, accident_location,
    accident_type, fault_ratio, description, status,
    driver_name, driver_phone, driver_relation,
    counterpart_name, counterpart_phone, counterpart_vehicle, counterpart_insurance,
    insurance_company, insurance_claim_no, insurance_status,
    police_reported, police_report_no,
    repair_shop_name, repair_start_date,
    estimated_repair_cost, customer_deductible, company_cost,
    vehicle_condition, notes,
    source, jandi_raw, jandi_topic
  ) VALUES (
    v_cid, v_car1, '2026-02-20', '14:35', '서울 강남구 테헤란로 102길',
    'collision', 100, '교차로에서 신호위반 차량과 측면 충돌', 'repairing',
    '김철수', '010-5520-5719', '본인',
    '이영희', '010-8765-4321', '99나7890', '현대손해보험',
    '삼성화재', '260220-001-0891', 'processing',
    true, '2026-0021-001',
    '강남 신월정비소', '2026-02-20',
    3500000, 300000, 150000,
    'repairable', '[잔디자동접수] 턴키정산 / 가해 / 자차',
    'jandi_accident',
    '12가3456 / 우리금융캐피탈 / self / 턴키 / 가해 / 자차' || E'\n' ||
    '*접수번호: 260220-001-0891' || E'\n' ||
    '*사고일시: 2026년 02월 20일 14시35분' || E'\n' ||
    '*운전자: 김철수 / 010-5520-5719',
    '사고접수'
  );

  -- 2) 자손사고 · 정산완료 · 수동등록
  INSERT INTO accident_records (
    company_id, car_id, accident_date, accident_time, accident_location,
    accident_type, fault_ratio, description, status,
    driver_name, driver_phone, driver_relation,
    insurance_company, insurance_claim_no, insurance_status,
    police_reported,
    repair_shop_name, repair_start_date, repair_end_date,
    estimated_repair_cost, actual_repair_cost, insurance_payout, customer_deductible,
    vehicle_condition, notes, source
  ) VALUES (
    v_cid, v_car2, '2026-02-15', '09:20', '인천 남동구 지하주차장 B2',
    'self_damage', 0, '주차장 기둥 접촉으로 좌측 펜더 찍힘', 'settled',
    '이영희', '010-3344-5566', '임직원',
    '메리츠화재', '260215-002-1234', 'approved',
    false,
    '인천 카닥 정비센터', '2026-02-16', '2026-02-19',
    850000, 780000, 480000, 300000,
    'minor', '주차 중 기둥 접촉 · 자차처리 완료',
    'manual'
  );

  -- 3) 뺑소니 · 신규접수 · 잔디접수
  INSERT INTO accident_records (
    company_id, car_id, accident_date, accident_time, accident_location,
    accident_type, fault_ratio, description, status,
    driver_name, driver_phone, driver_relation,
    counterpart_name, counterpart_vehicle,
    insurance_company, insurance_claim_no, insurance_status,
    police_reported, police_report_no,
    estimated_repair_cost, customer_deductible,
    vehicle_condition, notes,
    source, jandi_raw, jandi_topic
  ) VALUES (
    v_cid, v_car3, '2026-02-22', '22:10', '서울 송파구 올림픽대로 잠실IC 부근',
    'hit_and_run', 0, '주행 중 뒤에서 추돌 후 상대차량 도주', 'reported',
    '박민준', '010-7788-9900', '고객',
    '미상', '흰색 SUV(번호 미확인)',
    'KB손해보험', '260222-003-5678', 'filed',
    true, '2026-0045-003',
    2200000, 0,
    'repairable', '[잔디자동접수] 뺑소니 피해 / 경찰신고 완료',
    'jandi_accident',
    '34나5678 / KB캐피탈 / customer / 일반 / 피해 / 대물' || E'\n' ||
    '*사고일시: 2026년 02월 22일 22시10분' || E'\n' ||
    '*사고내용: 주행 중 뒤에서 추돌 후 상대차량 도주',
    '사고접수'
  );

  -- 4) 도난 · 종결 · 수동등록
  INSERT INTO accident_records (
    company_id, car_id, accident_date, accident_time, accident_location,
    accident_type, fault_ratio, description, status,
    driver_name, driver_phone, driver_relation,
    insurance_company, insurance_claim_no, insurance_status, insurance_filed_at,
    police_reported, police_report_no,
    estimated_repair_cost, actual_repair_cost, insurance_payout, customer_deductible,
    vehicle_condition, notes, source
  ) VALUES (
    v_cid, v_car4, '2026-01-28', '06:00', '경기 부천시 상동 아파트 주차장',
    'theft', 0, '야간 주차 중 차량 도난 · 3일 후 파손 상태로 발견', 'closed',
    '최정희', '010-1122-3344', '고객',
    'DB손해보험', '260128-004-9012', 'approved', '2026-01-29 10:30:00+09',
    true, '2026-0012-007',
    15000000, 14200000, 13000000, 1200000,
    'total_loss', '도난 후 발견 · 전손처리 · 보험금 수령 완료',
    'manual'
  );

  -- 5) 침수(자연재해) · 보험접수 · 잔디접수 · 대차포함
  INSERT INTO accident_records (
    company_id, car_id, accident_date, accident_time, accident_location,
    accident_type, fault_ratio, description, status,
    driver_name, driver_phone, driver_relation,
    insurance_company, insurance_claim_no, insurance_status, insurance_filed_at,
    police_reported,
    repair_shop_name, repair_start_date,
    estimated_repair_cost, customer_deductible,
    replacement_start, replacement_end, replacement_cost,
    vehicle_condition, notes,
    source, jandi_raw, jandi_topic
  ) VALUES (
    v_cid, v_car5, '2026-02-18', '16:45', '서울 강북구 도봉로 침수지역',
    'natural_disaster', 0, '집중호우로 도로 침수 · 엔진룸까지 침수', 'insurance_filed',
    '정수민', '010-4455-6677', '본인',
    '현대해상', '260218-005-3456', 'processing', '2026-02-19 09:00:00+09',
    false,
    '강북 현대오토서비스', '2026-02-19',
    8500000, 500000,
    '2026-02-19', '2026-03-05', 1200000,
    'repairable', '[잔디자동접수] 침수사고 / 대차 배정 완료',
    'jandi_accident',
    '56다7890 / 현대캐피탈 / self / 일반 / 자연재해' || E'\n' ||
    '*사고일시: 2026년 02월 18일 16시45분' || E'\n' ||
    '*사고내용: 집중호우로 도로 침수',
    '사고접수'
  );

  RAISE NOTICE '✅ 테스트 사고 데이터 5건 삽입 완료 (company_id: %)', v_cid;
END $$;
