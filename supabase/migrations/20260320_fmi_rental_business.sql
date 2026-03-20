-- ============================================================
-- 주식회사 에프엠아이(FMI) 대차사업 전사 운영 시스템
-- 단일회사 구조 / 대차사업 중심
-- 2026-03-20
-- ============================================================

-- ============================================================
-- 1. 차량 관리 (자체보유 + 외부렌트)
-- ============================================================
CREATE TABLE IF NOT EXISTS fmi_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 차량 기본정보
  car_number TEXT NOT NULL UNIQUE,          -- 차량번호
  car_type TEXT,                             -- 차종 (ex: 쏘나타, K5)
  car_brand TEXT,                            -- 브랜드 (현대, 기아)
  car_model TEXT,                            -- 모델 상세
  car_year INT,                              -- 연식
  car_color TEXT,                            -- 색상
  vin TEXT,                                  -- 차대번호

  -- 소유/렌트 구분
  ownership_type TEXT NOT NULL DEFAULT 'owned'
    CHECK (ownership_type IN ('owned', 'external_rent', 'lease')),
  -- owned: 자체보유, external_rent: 외부렌트, lease: 리스

  -- 외부렌트 정보 (ownership_type = 'external_rent' 일 때)
  rental_company TEXT,                       -- 렌트 업체명
  rental_monthly_cost NUMERIC(12,0),         -- 월 렌트비
  rental_start_date DATE,                    -- 렌트 시작일
  rental_end_date DATE,                      -- 렌트 종료일
  rental_contract_no TEXT,                    -- 렌트 계약번호

  -- 자체보유 정보 (ownership_type = 'owned' 일 때)
  purchase_date DATE,                        -- 구매일
  purchase_price NUMERIC(12,0),              -- 구매가
  depreciation_rate NUMERIC(5,2),            -- 감가율(%)

  -- 투자 정보
  investor TEXT,                             -- 투자자 (지급의지급 구조)
  investment_amount NUMERIC(12,0),           -- 투자금액
  investment_return_rate NUMERIC(5,2),       -- 투자 수익률(%)
  investment_start_date DATE,
  investment_end_date DATE,

  -- 보험/관리
  insurance_company TEXT,                    -- 차량보험사
  insurance_policy_no TEXT,                  -- 보험증권번호
  insurance_expiry DATE,                     -- 보험만료일
  inspection_expiry DATE,                    -- 차량검사만료일

  -- 운행 상태
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN (
      'available',        -- 대기(배차가능)
      'dispatched',       -- 배차됨(대차운행중)
      'maintenance',      -- 정비중
      'accident',         -- 사고처리중
      'returned',         -- 반납완료(정비대기)
      'inactive'          -- 비활성(폐차/매각/계약종료)
    )),

  -- 위치/기타
  current_location TEXT,                     -- 현재 위치
  mileage INT DEFAULT 0,                     -- 현재 주행거리
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fmi_vehicles_status ON fmi_vehicles(status);
CREATE INDEX idx_fmi_vehicles_ownership ON fmi_vehicles(ownership_type);
CREATE INDEX idx_fmi_vehicles_car_number ON fmi_vehicles(car_number);

-- ============================================================
-- 2. 사고접수 (카페24 동기화)
-- ============================================================
CREATE TABLE IF NOT EXISTS fmi_accidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe24_id TEXT UNIQUE,                     -- 카페24 원본 ID (중복방지)

  -- 접수 기본정보
  receipt_no TEXT,                            -- 접수번호
  receipt_date TIMESTAMPTZ,                  -- 접수일시
  accident_date TIMESTAMPTZ,                 -- 사고일시
  accident_location TEXT,                    -- 사고장소
  accident_description TEXT,                 -- 사고내용
  accident_region_sido TEXT,                 -- 시/도
  accident_region_sigungu TEXT,              -- 시/군/구

  -- 고객(피해자) 정보
  customer_name TEXT,                        -- 고객명
  customer_phone TEXT,                       -- 연락처
  customer_car_number TEXT,                  -- 피해차량번호
  customer_car_type TEXT,                    -- 피해차종

  -- 상대방 정보
  counterpart_name TEXT,                     -- 상대방명
  counterpart_phone TEXT,
  counterpart_car_number TEXT,
  counterpart_insurance TEXT,                -- 상대보험사
  counterpart_claim_no TEXT,                 -- 상대접수번호

  -- 보험 정보
  insurance_company TEXT,                    -- 담당 보험사
  insurance_claim_no TEXT,                   -- 보험접수번호
  adjuster_name TEXT,                        -- 손해사정사
  adjuster_phone TEXT,

  -- 과실/수리
  fault_type TEXT CHECK (fault_type IN ('own', 'counterpart', 'shared', 'unknown')),
  fault_rate INT,                            -- 과실비율 (0~100)
  repair_needed BOOLEAN DEFAULT false,
  repair_shop TEXT,                          -- 수리공장
  estimated_repair_days INT,                 -- 예상수리일수
  estimated_repair_cost NUMERIC(12,0),       -- 예상수리비

  -- 대차 필요 여부
  rental_needed BOOLEAN DEFAULT false,       -- 대차 필요
  rental_status TEXT DEFAULT 'none'
    CHECK (rental_status IN (
      'none',              -- 대차불필요
      'pending',           -- 대차대기(승인전)
      'approved',          -- 대차승인됨
      'dispatched',        -- 대차배차완료
      'in_use',            -- 대차운행중
      'returned',          -- 대차반납
      'completed'          -- 대차정산완료
    )),

  -- 상태
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN (
      'received',          -- 접수
      'reviewing',         -- 검토중
      'rental_approved',   -- 대차승인
      'in_progress',       -- 진행중
      'claiming',          -- 청구중
      'settled',           -- 정산완료
      'closed',            -- 종결
      'cancelled'          -- 취소
    )),

  -- 담당자
  handler_id UUID,                           -- 담당자 ID
  handler_name TEXT,                         -- 담당자명

  -- 메타
  source TEXT DEFAULT 'cafe24'               -- 데이터 소스
    CHECK (source IN ('cafe24', 'jandi', 'manual', 'api')),
  raw_data JSONB,                            -- 원본 데이터 보관
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fmi_accidents_status ON fmi_accidents(status);
CREATE INDEX idx_fmi_accidents_rental_status ON fmi_accidents(rental_status);
CREATE INDEX idx_fmi_accidents_receipt_date ON fmi_accidents(receipt_date);
CREATE INDEX idx_fmi_accidents_cafe24_id ON fmi_accidents(cafe24_id);
CREATE INDEX idx_fmi_accidents_handler ON fmi_accidents(handler_id);
CREATE INDEX idx_fmi_accidents_insurance ON fmi_accidents(insurance_company);

-- ============================================================
-- 3. 대차건 관리 (핵심 테이블)
-- ============================================================
CREATE TABLE IF NOT EXISTS fmi_rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id UUID REFERENCES fmi_accidents(id),

  -- 대차 기본정보
  rental_no TEXT UNIQUE,                     -- 대차관리번호 (자동생성: FMI-2026-0001)

  -- 고객 정보 (사고에서 가져옴)
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_car_number TEXT,                  -- 피해차량
  customer_car_type TEXT,

  -- 배차 차량 정보
  vehicle_id UUID REFERENCES fmi_vehicles(id),
  vehicle_car_number TEXT,                   -- 배차 차량번호
  vehicle_car_type TEXT,                     -- 배차 차종

  -- 보험사 정보
  insurance_company TEXT,                    -- 청구 대상 보험사
  insurance_claim_no TEXT,                   -- 보험접수번호
  adjuster_name TEXT,
  adjuster_phone TEXT,

  -- 대차 기간
  dispatch_date TIMESTAMPTZ,                 -- 배차일시
  dispatch_location TEXT,                    -- 배차장소
  expected_return_date TIMESTAMPTZ,          -- 예상반납일
  actual_return_date TIMESTAMPTZ,            -- 실제반납일
  rental_days INT,                           -- 대차일수 (자동계산)

  -- 주행거리
  dispatch_mileage INT,                      -- 배차시 주행거리
  return_mileage INT,                        -- 반납시 주행거리
  driven_km INT,                             -- 운행거리 (자동계산)

  -- 요금
  daily_rate NUMERIC(10,0),                  -- 일일 대차료
  total_rental_fee NUMERIC(12,0),            -- 총 대차료 (일수 × 일일요금)
  additional_charges NUMERIC(12,0) DEFAULT 0, -- 추가요금 (유류, 하이패스 등)
  deduction_amount NUMERIC(12,0) DEFAULT 0,  -- 공제액
  final_claim_amount NUMERIC(12,0),          -- 최종 청구금액

  -- 반납 상태
  return_condition TEXT,                     -- 반납시 차량상태
  return_fuel_level TEXT,                    -- 연료량
  return_damage_yn BOOLEAN DEFAULT false,    -- 추가 손상 여부
  return_damage_memo TEXT,                   -- 손상 내용
  return_photos TEXT[],                      -- 반납 사진

  -- 워크플로우 상태
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',           -- 대차대기
      'approved',          -- 승인(배차전)
      'dispatched',        -- 배차완료(운행중)
      'returning',         -- 반납진행중
      'returned',          -- 반납완료
      'claiming',          -- 보험청구중
      'claimed',           -- 청구완료(입금대기)
      'partial_paid',      -- 부분입금
      'settled',           -- 정산완료
      'cancelled'          -- 취소
    )),

  -- 담당자
  handler_id UUID,
  handler_name TEXT,
  dispatcher_name TEXT,                      -- 배차 담당자

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fmi_rentals_status ON fmi_rentals(status);
CREATE INDEX idx_fmi_rentals_accident ON fmi_rentals(accident_id);
CREATE INDEX idx_fmi_rentals_vehicle ON fmi_rentals(vehicle_id);
CREATE INDEX idx_fmi_rentals_insurance ON fmi_rentals(insurance_company);
CREATE INDEX idx_fmi_rentals_dispatch_date ON fmi_rentals(dispatch_date);
CREATE INDEX idx_fmi_rentals_handler ON fmi_rentals(handler_id);

-- ============================================================
-- 4. 보험 청구 관리
-- ============================================================
CREATE TABLE IF NOT EXISTS fmi_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id UUID NOT NULL REFERENCES fmi_rentals(id),
  accident_id UUID REFERENCES fmi_accidents(id),

  -- 청구 기본
  claim_no TEXT UNIQUE,                      -- 청구번호
  insurance_company TEXT NOT NULL,            -- 청구 보험사
  insurance_claim_no TEXT,                   -- 보험접수번호

  -- 청구 금액
  rental_fee NUMERIC(12,0),                  -- 대차료
  additional_charges NUMERIC(12,0) DEFAULT 0, -- 추가비용
  total_claim_amount NUMERIC(12,0),          -- 총 청구금액

  -- 청구 방법
  claim_method TEXT CHECK (claim_method IN ('fax', 'ims', 'aos', 'email', 'visit')),
  claim_date TIMESTAMPTZ,                    -- 청구일
  claim_documents JSONB,                     -- 첨부서류 목록

  -- 청구서 정보
  claim_pdf_url TEXT,                        -- 청구서 PDF URL
  fax_number TEXT,                           -- 팩스번호
  fax_sent_at TIMESTAMPTZ,                   -- 팩스발송일시

  -- 보험사 응답
  response_date TIMESTAMPTZ,                 -- 보험사 회신일
  approved_amount NUMERIC(12,0),             -- 승인금액
  rejected_amount NUMERIC(12,0),             -- 거절금액
  rejection_reason TEXT,                     -- 거절사유
  negotiation_memo TEXT,                     -- 협상내용

  -- 상태
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',             -- 작성중
      'ready',             -- 발송준비
      'sent',              -- 발송완료
      'received',          -- 보험사접수확인
      'under_review',      -- 심사중
      'approved',          -- 승인
      'partial_approved',  -- 부분승인
      'rejected',          -- 거절
      'resubmitted',       -- 재청구
      'paid',              -- 입금완료
      'cancelled'          -- 취소
    )),

  handler_id UUID,
  handler_name TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fmi_claims_status ON fmi_claims(status);
CREATE INDEX idx_fmi_claims_rental ON fmi_claims(rental_id);
CREATE INDEX idx_fmi_claims_insurance ON fmi_claims(insurance_company);
CREATE INDEX idx_fmi_claims_date ON fmi_claims(claim_date);

-- ============================================================
-- 5. 정산/입금 관리
-- ============================================================
CREATE TABLE IF NOT EXISTS fmi_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES fmi_claims(id),
  rental_id UUID REFERENCES fmi_rentals(id),

  -- 입금 정보
  settlement_type TEXT CHECK (settlement_type IN (
    'insurance_payment',   -- 보험사 입금
    'customer_payment',    -- 고객 직접입금
    'deduction',           -- 공제처리
    'write_off',           -- 대손처리
    'refund'               -- 환불
  )),

  amount NUMERIC(12,0) NOT NULL,             -- 입금/처리 금액
  payment_date DATE,                         -- 입금일
  payment_method TEXT,                       -- 입금방법 (계좌이체, 수표 등)
  bank_name TEXT,                            -- 입금은행
  account_no TEXT,                           -- 계좌번호
  depositor TEXT,                            -- 입금자명
  transaction_no TEXT,                       -- 거래번호

  -- 매칭
  matched BOOLEAN DEFAULT false,             -- 청구-입금 매칭여부
  match_difference NUMERIC(12,0),            -- 차액

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fmi_settlements_claim ON fmi_settlements(claim_id);
CREATE INDEX idx_fmi_settlements_rental ON fmi_settlements(rental_id);
CREATE INDEX idx_fmi_settlements_date ON fmi_settlements(payment_date);

-- ============================================================
-- 6. 지급 관리 (지급의지급, 투자수익, 외부렌트비 등)
-- ============================================================
CREATE TABLE IF NOT EXISTS fmi_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 지급 구분
  payment_category TEXT NOT NULL CHECK (payment_category IN (
    'external_rent',       -- 외부 렌트비 지급
    'investor_return',     -- 투자자 수익배분
    'repair_cost',         -- 수리비 지급
    'insurance_premium',   -- 보험료
    'maintenance',         -- 정비비
    'fuel',                -- 유류비
    'toll',                -- 통행료/하이패스
    'salary',              -- 급여
    'operating_expense',   -- 운영비
    'other'                -- 기타
  )),

  -- 지급 대상
  payee_name TEXT NOT NULL,                  -- 수취인
  payee_bank TEXT,                           -- 은행
  payee_account TEXT,                        -- 계좌
  payee_business_no TEXT,                    -- 사업자번호

  -- 관련 정보
  vehicle_id UUID REFERENCES fmi_vehicles(id),  -- 관련 차량
  rental_id UUID REFERENCES fmi_rentals(id),    -- 관련 대차건

  -- 금액
  amount NUMERIC(12,0) NOT NULL,
  tax_amount NUMERIC(12,0) DEFAULT 0,        -- 세금
  total_amount NUMERIC(12,0),                -- 합계

  -- 지급 정보
  payment_date DATE,                         -- 지급일
  due_date DATE,                             -- 지급예정일
  payment_method TEXT,                       -- 지급방법
  payment_status TEXT DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'approved', 'paid', 'cancelled')),

  -- 정기지급 (월 렌트비 등)
  is_recurring BOOLEAN DEFAULT false,
  recurring_period TEXT,                     -- monthly, quarterly
  recurring_start DATE,
  recurring_end DATE,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fmi_payments_category ON fmi_payments(payment_category);
CREATE INDEX idx_fmi_payments_status ON fmi_payments(payment_status);
CREATE INDEX idx_fmi_payments_vehicle ON fmi_payments(vehicle_id);
CREATE INDEX idx_fmi_payments_date ON fmi_payments(payment_date);
CREATE INDEX idx_fmi_payments_due ON fmi_payments(due_date);

-- ============================================================
-- 7. 대차 타임라인/이력 (모든 상태변경 추적)
-- ============================================================
CREATE TABLE IF NOT EXISTS fmi_rental_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id UUID NOT NULL REFERENCES fmi_rentals(id),
  accident_id UUID REFERENCES fmi_accidents(id),

  event_type TEXT NOT NULL,                  -- status_change, note, call, document, photo
  event_title TEXT NOT NULL,                 -- 이벤트 제목
  event_detail TEXT,                         -- 상세 내용

  old_status TEXT,
  new_status TEXT,

  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fmi_timeline_rental ON fmi_rental_timeline(rental_id);
CREATE INDEX idx_fmi_timeline_date ON fmi_rental_timeline(created_at);

-- ============================================================
-- 8. 보험사 마스터
-- ============================================================
CREATE TABLE IF NOT EXISTS fmi_insurance_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,                 -- 보험사명
  short_name TEXT,                           -- 약칭
  fax_number TEXT,                           -- 팩스번호
  ims_code TEXT,                             -- IMS 코드
  aos_code TEXT,                             -- AOS 코드
  claim_email TEXT,                          -- 청구 이메일
  contact_phone TEXT,
  address TEXT,
  -- 청구 양식 설정
  claim_form_type TEXT DEFAULT 'standard',   -- 청구서 양식 타입
  daily_rate_standard JSONB,                 -- 보험사별 일일 대차료 기준
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 주요 보험사 기본 데이터
INSERT INTO fmi_insurance_companies (name, short_name) VALUES
  ('삼성화재', '삼성'),
  ('현대해상', '현대'),
  ('DB손해보험', 'DB'),
  ('KB손해보험', 'KB'),
  ('메리츠화재', '메리츠'),
  ('한화손해보험', '한화'),
  ('롯데손해보험', '롯데'),
  ('흥국화재', '흥국'),
  ('MG손해보험', 'MG'),
  ('우리금융캐피탈', '우리'),
  ('AXA손해보험', 'AXA'),
  ('하나손해보험', '하나'),
  ('NH농협손해보험', 'NH'),
  ('교보생명', '교보')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 9. 일일 대차료 기준표
-- ============================================================
CREATE TABLE IF NOT EXISTS fmi_daily_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_class TEXT NOT NULL,                   -- 차급 (경형, 소형, 중형, 대형, SUV 등)
  car_type_example TEXT,                     -- 예시차종
  daily_rate NUMERIC(10,0) NOT NULL,         -- 일일 대차료
  insurance_standard_rate NUMERIC(10,0),     -- 보험사 인정 기준단가
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 기본 대차료 데이터
INSERT INTO fmi_daily_rates (car_class, car_type_example, daily_rate, insurance_standard_rate) VALUES
  ('경형', '모닝, 스파크', 40000, 35000),
  ('소형', '아반떼, K3', 55000, 48000),
  ('준중형', '쏘나타, K5', 65000, 58000),
  ('중형', '그랜저, K8', 80000, 72000),
  ('대형', 'G80, K9', 120000, 100000),
  ('SUV소형', '코나, 셀토스', 60000, 52000),
  ('SUV중형', '투싼, 스포티지', 75000, 65000),
  ('SUV대형', '팰리세이드, 모하비', 100000, 88000),
  ('승합', '스타리아, 카니발', 90000, 80000),
  ('화물', '포터, 봉고', 70000, 60000)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 10. 대차관리번호 자동생성 함수
-- ============================================================
CREATE OR REPLACE FUNCTION generate_rental_no()
RETURNS TRIGGER AS $$
DECLARE
  year_str TEXT;
  seq_no INT;
BEGIN
  year_str := TO_CHAR(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(rental_no FROM 'FMI-' || year_str || '-(\d+)') AS INT)
  ), 0) + 1
  INTO seq_no
  FROM fmi_rentals
  WHERE rental_no LIKE 'FMI-' || year_str || '-%';

  NEW.rental_no := 'FMI-' || year_str || '-' || LPAD(seq_no::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rental_no
  BEFORE INSERT ON fmi_rentals
  FOR EACH ROW
  WHEN (NEW.rental_no IS NULL)
  EXECUTE FUNCTION generate_rental_no();

-- ============================================================
-- 11. 대차일수 자동계산 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION calc_rental_days()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.actual_return_date IS NOT NULL AND NEW.dispatch_date IS NOT NULL THEN
    NEW.rental_days := GREATEST(1, EXTRACT(DAY FROM (NEW.actual_return_date - NEW.dispatch_date))::INT + 1);
    NEW.total_rental_fee := NEW.rental_days * COALESCE(NEW.daily_rate, 0);
    NEW.final_claim_amount := NEW.total_rental_fee + COALESCE(NEW.additional_charges, 0) - COALESCE(NEW.deduction_amount, 0);
  END IF;

  IF NEW.return_mileage IS NOT NULL AND NEW.dispatch_mileage IS NOT NULL THEN
    NEW.driven_km := NEW.return_mileage - NEW.dispatch_mileage;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_rental
  BEFORE INSERT OR UPDATE ON fmi_rentals
  FOR EACH ROW
  EXECUTE FUNCTION calc_rental_days();

-- ============================================================
-- 12. 청구번호 자동생성
-- ============================================================
CREATE OR REPLACE FUNCTION generate_claim_no()
RETURNS TRIGGER AS $$
DECLARE
  year_month TEXT;
  seq_no INT;
BEGIN
  year_month := TO_CHAR(now(), 'YYYYMM');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(claim_no FROM 'CLM-' || year_month || '-(\d+)') AS INT)
  ), 0) + 1
  INTO seq_no
  FROM fmi_claims
  WHERE claim_no LIKE 'CLM-' || year_month || '-%';

  NEW.claim_no := 'CLM-' || year_month || '-' || LPAD(seq_no::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_claim_no
  BEFORE INSERT ON fmi_claims
  FOR EACH ROW
  WHEN (NEW.claim_no IS NULL)
  EXECUTE FUNCTION generate_claim_no();

-- ============================================================
-- 13. updated_at 자동갱신 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fmi_vehicles_updated AT BEFORE UPDATE ON fmi_vehicles FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_fmi_accidents_updated_at BEFORE UPDATE ON fmi_accidents FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_fmi_rentals_updated_at BEFORE UPDATE ON fmi_rentals FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_fmi_claims_updated_at BEFORE UPDATE ON fmi_claims FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_fmi_payments_updated_at BEFORE UPDATE ON fmi_payments FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================
-- 14. 대시보드용 뷰 (실시간 현황)
-- ============================================================
CREATE OR REPLACE VIEW fmi_dashboard_summary AS
SELECT
  -- 차량 현황
  (SELECT COUNT(*) FROM fmi_vehicles WHERE status = 'available') AS vehicles_available,
  (SELECT COUNT(*) FROM fmi_vehicles WHERE status = 'dispatched') AS vehicles_dispatched,
  (SELECT COUNT(*) FROM fmi_vehicles WHERE status = 'maintenance') AS vehicles_maintenance,
  (SELECT COUNT(*) FROM fmi_vehicles) AS vehicles_total,

  -- 대차건 현황
  (SELECT COUNT(*) FROM fmi_rentals WHERE status = 'pending') AS rentals_pending,
  (SELECT COUNT(*) FROM fmi_rentals WHERE status = 'dispatched') AS rentals_active,
  (SELECT COUNT(*) FROM fmi_rentals WHERE status = 'returned') AS rentals_returned,
  (SELECT COUNT(*) FROM fmi_rentals WHERE status IN ('claiming', 'claimed')) AS rentals_claiming,

  -- 청구 현황
  (SELECT COUNT(*) FROM fmi_claims WHERE status = 'draft') AS claims_draft,
  (SELECT COUNT(*) FROM fmi_claims WHERE status = 'sent') AS claims_sent,
  (SELECT COUNT(*) FROM fmi_claims WHERE status IN ('approved', 'partial_approved')) AS claims_approved,
  (SELECT COALESCE(SUM(total_claim_amount), 0) FROM fmi_claims WHERE status = 'sent') AS claims_pending_amount,
  (SELECT COALESCE(SUM(approved_amount), 0) FROM fmi_claims WHERE status = 'paid'
    AND claim_date >= DATE_TRUNC('month', CURRENT_DATE)) AS claims_paid_this_month,

  -- 이번달 매출
  (SELECT COALESCE(SUM(amount), 0) FROM fmi_settlements
    WHERE payment_date >= DATE_TRUNC('month', CURRENT_DATE)) AS revenue_this_month,

  -- 이번달 지출
  (SELECT COALESCE(SUM(total_amount), 0) FROM fmi_payments
    WHERE payment_date >= DATE_TRUNC('month', CURRENT_DATE)
    AND payment_status = 'paid') AS expense_this_month;

-- ============================================================
-- 15. RLS 정책 (기본)
-- ============================================================
ALTER TABLE fmi_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmi_accidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmi_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmi_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmi_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmi_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmi_rental_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmi_insurance_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmi_daily_rates ENABLE ROW LEVEL SECURITY;

-- 서비스 역할은 모든 접근 허용
CREATE POLICY "service_role_all" ON fmi_vehicles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON fmi_accidents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON fmi_rentals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON fmi_claims FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON fmi_settlements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON fmi_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON fmi_rental_timeline FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON fmi_insurance_companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON fmi_daily_rates FOR ALL USING (true) WITH CHECK (true);

-- 인증된 사용자 읽기 허용
CREATE POLICY "authenticated_read" ON fmi_vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON fmi_accidents FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON fmi_rentals FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON fmi_claims FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON fmi_settlements FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON fmi_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON fmi_rental_timeline FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON fmi_insurance_companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON fmi_daily_rates FOR SELECT TO authenticated USING (true);
