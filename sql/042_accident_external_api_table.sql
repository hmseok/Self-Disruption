-- ============================================
-- 042: 사고접수 외부 API 연동용 더미 테이블
-- 스카이오토 → Self-Disruption API 수신 데이터 저장
-- 중첩 JSON 구조를 JSONB + 개별 컬럼 혼합 저장
-- ============================================

-- 1. 외부 API 수신 원본 저장 테이블
CREATE TABLE IF NOT EXISTS accident_reports_external (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 접수 기본
  receipt_no TEXT NOT NULL UNIQUE,
  handler_name TEXT,

  -- 차량 정보 (car.*)
  car_number TEXT NOT NULL,
  car_model_detail TEXT,
  car_class_code TEXT,        -- 코드표 H
  car_fuel_type_code TEXT,    -- 코드표 I
  car_brand_code TEXT,        -- 코드표 J

  -- 고객 정보 (customer.*)
  customer_name TEXT NOT NULL,
  customer_finance_company TEXT,

  -- 서비스 구분 (service.*)
  service_type_code TEXT,          -- 코드표 A
  settlement_type_code TEXT,       -- 코드표 B
  fault_type_code TEXT NOT NULL,   -- 코드표 C
  insurance_type_code TEXT,        -- 코드표 D

  -- 사고 상세 (accident.*)
  accident_date TIMESTAMPTZ NOT NULL,
  accident_receipt_date TIMESTAMPTZ NOT NULL,
  accident_execution_date DATE,
  accident_location TEXT NOT NULL,
  accident_description TEXT NOT NULL,
  accident_damage_part_code TEXT,   -- 코드표 L (NEW)
  accident_damage_part_detail TEXT, -- 자유입력 보충
  accident_drivable BOOLEAN NOT NULL DEFAULT true,

  -- 통보자 (reporter.*)
  reporter_name TEXT NOT NULL,
  reporter_phone TEXT NOT NULL,
  reporter_relation_code TEXT,     -- 코드표 E

  -- 운전자 (driver.*)
  driver_name TEXT NOT NULL,
  driver_phone TEXT NOT NULL,
  driver_birth TEXT,
  driver_license_code TEXT,        -- 코드표 F
  driver_relation_code TEXT,       -- 코드표 E

  -- 면책금 (deductible.*)
  deductible_type_code TEXT NOT NULL,  -- 코드표 K (FIXED/RATE)
  deductible_amount NUMERIC,
  deductible_rate NUMERIC,
  deductible_min_amount NUMERIC,
  deductible_max_amount NUMERIC,

  -- 수리 (repair.*)
  repair_needs_repair BOOLEAN NOT NULL DEFAULT true,
  repair_location TEXT,

  -- 보험 (insurance_policy.own.* / insurance_policy.counter.*)
  ins_own_company_code TEXT,       -- 코드표 G
  ins_own_policy_no TEXT,
  ins_counter_company_code TEXT,   -- 코드표 G
  ins_counter_policy_no TEXT,

  -- 원본 JSON 보관
  raw_json JSONB,

  -- 메타
  api_key_used TEXT,              -- 어떤 API Key로 수신했는지
  source TEXT DEFAULT 'skyauto_api',
  processing_status TEXT DEFAULT 'received',  -- received, synced, error
  synced_accident_id UUID,        -- accident_records.id로 동기화 후 매핑
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- CHECK 제약
  CONSTRAINT valid_deductible_type CHECK (deductible_type_code IN ('FIXED', 'RATE')),
  CONSTRAINT valid_processing_status CHECK (processing_status IN ('received', 'synced', 'error'))
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_are_receipt_no ON accident_reports_external(receipt_no);
CREATE INDEX IF NOT EXISTS idx_are_car_number ON accident_reports_external(car_number);
CREATE INDEX IF NOT EXISTS idx_are_created_at ON accident_reports_external(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_are_status ON accident_reports_external(processing_status);
CREATE INDEX IF NOT EXISTS idx_are_synced ON accident_reports_external(synced_accident_id);

-- 3. RLS 활성화
ALTER TABLE accident_reports_external ENABLE ROW LEVEL SECURITY;

-- 플랫폼 관리자만 조회 가능
CREATE POLICY "are_admin_read" ON accident_reports_external
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('god_admin', 'master'))
  );

-- API 서비스 계정(service_role)으로만 INSERT 가능 (anon에서는 불가)
-- INSERT는 API route에서 service_role key로 수행

-- 4. 테스트 데이터 삽입 (5건)
INSERT INTO accident_reports_external (
  receipt_no, handler_name,
  car_number, car_model_detail, car_class_code, car_fuel_type_code, car_brand_code,
  customer_name, customer_finance_company,
  service_type_code, settlement_type_code, fault_type_code, insurance_type_code,
  accident_date, accident_receipt_date, accident_execution_date,
  accident_location, accident_description,
  accident_damage_part_code, accident_damage_part_detail, accident_drivable,
  reporter_name, reporter_phone, reporter_relation_code,
  driver_name, driver_phone, driver_birth, driver_license_code, driver_relation_code,
  deductible_type_code, deductible_amount, deductible_rate, deductible_min_amount, deductible_max_amount,
  repair_needs_repair, repair_location,
  ins_own_company_code, ins_own_policy_no, ins_counter_company_code, ins_counter_policy_no,
  raw_json
) VALUES
-- 1. 정액 면책금, 자차, 가해 사고
(
  '260224-001-0001', '정지은',
  '171호6793', '신형 K9 가솔린 3.8', 'LARGE', 'GAS', 'KIA',
  '[법인]주식회사공화정공', '우리금융캐피탈',
  'SELF', 'TURNKEY', 'AT_FAULT', 'OWN_DAMAGE',
  '2026-02-20T14:35:00+09:00', '2026-02-20T14:45:00+09:00', '2025-10-29',
  '서울특별시 강남구 테헤란로 102길', '교차로에서 신호위반 차량과 측면 충돌',
  'FR_DOOR', '우측 앞문 및 사이드패널 긁힘', true,
  '박준영', '010-5520-5719', 'CEO',
  '박준영', '010-5520-5719', '680115', '1종보통', 'CEO',
  'FIXED', 300000, NULL, NULL, NULL,
  true, '서울 강남구 신월정비소',
  'MERITZ', '20261840470', 'HYUNDAI', '',
  '{"receipt_no":"260224-001-0001","car":{"number":"171호6793"}}'::jsonb
),
-- 2. 정률 면책금, 대물, 피해 사고
(
  '260224-002-0015', '김수연',
  '23가1234', '아반떼 CN7 가솔린 1.6', 'SMALL', 'GAS', 'HYUNDAI',
  '홍길동', NULL,
  'CUSTOMER', 'ACTUAL', 'VICTIM', 'PROPERTY',
  '2026-02-22T09:10:00+09:00', '2026-02-22T09:30:00+09:00', '2026-01-15',
  '경기도 성남시 분당구 판교역로 235', '후방 추돌 (상대방 전적 과실)',
  'REAR_BUMPER', '후면 범퍼 찌그러짐, 트렁크 약간 변형', true,
  '홍길동', '010-1111-2222', 'SELF',
  '홍길동', '010-1111-2222', '900315', '2종보통', 'SELF',
  'RATE', 240000, 20, 200000, 500000,
  true, '성남 판교 현대서비스센터',
  'SAMSUNG', '20261230567', 'DB', '20269991234',
  '{"receipt_no":"260224-002-0015"}'::jsonb
),
-- 3. 전손 사고, 쌍방
(
  '260224-003-0042', '이민수',
  '서울12가5678', '팰리세이드 디젤 2.2', 'SUV_LARGE', 'DIESEL', 'HYUNDAI',
  '[법인]대한물류', '하나캐피탈',
  'SELF', 'TURNKEY', 'MUTUAL', 'OWN_DAMAGE',
  '2026-02-23T22:05:00+09:00', '2026-02-23T22:30:00+09:00', '2025-06-01',
  '서울특별시 서초구 강남대로 300', '빗길 미끄러짐으로 중앙분리대 충돌 후 반대차선 차량과 정면충돌',
  'TOTAL_LOSS', '차량 전면부 대파, 프레임 변형, 전손 예상', false,
  '김대리', '010-3333-4444', 'EMPLOYEE',
  '이기사', '010-5555-6666', '851220', '1종보통', 'EMPLOYEE',
  'FIXED', 500000, NULL, NULL, NULL,
  false, NULL,
  'CARCO', '20260001234', 'KB', '20267770001',
  '{"receipt_no":"260224-003-0042"}'::jsonb
),
-- 4. 수입차 사고, 면책
(
  '260224-004-0078', '정지은',
  '12너3456', 'BMW 520d xDrive', 'IMPORT', 'DIESEL', 'BMW',
  '김영수', 'KB캐피탈',
  'CUSTOMER', 'ACTUAL', 'EXEMPT', 'NONE',
  '2026-02-24T06:30:00+09:00', '2026-02-24T07:00:00+09:00', '2025-12-01',
  '서울특별시 마포구 월드컵북로 396', '폭설로 인한 주차장 내 슬립 사고 (자연재해)',
  'FL_FENDER', '좌측 앞 펜더 + 좌측 사이드미러 파손', true,
  '김영수', '010-7777-8888', 'SELF',
  '김영수', '010-7777-8888', '780520', '1종보통', 'SELF',
  'RATE', 400000, 15, 300000, 1000000,
  true, '마포 공식 BMW 서비스센터',
  'HYUNDAI', '20260550123', NULL, NULL,
  '{"receipt_no":"260224-004-0078"}'::jsonb
),
-- 5. 경차 사고, 운행 불가
(
  '260224-005-0103', '박지현',
  '56모7890', '레이 가솔린 1.0', 'LIGHT', 'GAS', 'KIA',
  '최민지', NULL,
  'SELF', 'TURNKEY', 'AT_FAULT', 'PROPERTY',
  '2026-02-24T11:20:00+09:00', '2026-02-24T11:40:00+09:00', '2026-02-01',
  '인천광역시 연수구 송도대로 123', '좁은 골목 진입 중 전신주 충돌',
  'FRONT_BUMPER', '전면 범퍼 탈락, 라디에이터 손상', false,
  '최민지', '010-9999-0000', 'SELF',
  '최민지', '010-9999-0000', '950803', '2종보통', 'SELF',
  'FIXED', 200000, NULL, NULL, NULL,
  true, '인천 송도 기아오토큐',
  'LOTTE', '20260880456', NULL, NULL,
  '{"receipt_no":"260224-005-0103"}'::jsonb
);

-- 5. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_are_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_are_updated_at
  BEFORE UPDATE ON accident_reports_external
  FOR EACH ROW
  EXECUTE FUNCTION update_are_updated_at();
