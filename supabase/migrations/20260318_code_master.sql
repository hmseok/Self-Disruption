-- ═══════════════════════════════════════════════
-- 정제 데이터 시스템 (Cafe24 DB 보조 → 메인 전환 기반)
-- 2026-03-18
-- ═══════════════════════════════════════════════

-- 1. 코드 마스터 — 모든 코드-라벨 매핑을 한곳에서 관리
--    picbscdm을 대체하며, 관리자 UI에서 추가/수정 가능
CREATE TABLE IF NOT EXISTS code_master (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  group_code VARCHAR(20) NOT NULL,       -- 그룹코드 (OTPTSTAT, BHNAME, OTPTACBN 등)
  group_name VARCHAR(100),               -- 그룹명 (진행상태, 보험사명, 사고구분 등)
  code VARCHAR(20) NOT NULL,             -- 코드값 (1, N01, G 등)
  label VARCHAR(200) NOT NULL,           -- 표시 라벨 (접수, 렌터카공제조합, 가해 등)

  sort_order INT DEFAULT 0,              -- 정렬 순서
  is_active BOOLEAN DEFAULT true,        -- 사용 여부
  description TEXT,                      -- 설명/비고

  source VARCHAR(20) DEFAULT 'manual',   -- 출처: manual(수동), cafe24(카페24동기화), system(시스템)
  cafe24_group VARCHAR(20),              -- picbscdm 원본 그룹코드 (동기화용)

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),

  UNIQUE(company_id, group_code, code)
);

-- 2. 서비스 상품 — carscosv 코드를 실제 상품명으로 매핑
CREATE TABLE IF NOT EXISTS service_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  product_code VARCHAR(20) NOT NULL,     -- 서비스 코드 (MZ03, SA01 등)
  product_name VARCHAR(200) NOT NULL,    -- 상품명 (메리츠 Platinum, 스카이순회차량 등)
  product_type VARCHAR(10),              -- T=턴키, S=실비
  customer_code VARCHAR(10),             -- 거래처코드 (pmccustm FK)

  -- 포함 서비스 (계약사항 체크)
  has_inspection BOOLEAN DEFAULT false,   -- 정기점검
  has_accident BOOLEAN DEFAULT false,     -- 사고처리
  has_rental BOOLEAN DEFAULT false,       -- 대차가능
  has_legal_exam BOOLEAN DEFAULT false,   -- 법정검사
  has_emergency BOOLEAN DEFAULT false,    -- 긴급출동

  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(company_id, product_code)
);

-- 3. 차량 설정 (오버라이드) — Cafe24 데이터 위에 덮어쓰기/보충
CREATE TABLE IF NOT EXISTS vehicle_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  car_id VARCHAR(10) NOT NULL,           -- pmccarsm.carsidno (차량ID)

  -- 오버라이드 가능한 필드들 (NULL이면 Cafe24 원본 사용)
  plate_no VARCHAR(20),                  -- 차량번호 (수정된 경우)
  model_name VARCHAR(200),               -- 차량명 (수정된 경우)
  service_product_code VARCHAR(20),      -- 서비스상품 코드

  -- 추가 정보 (Cafe24에 없는 필드)
  memo TEXT,                             -- 관리자 메모
  tags TEXT[],                           -- 태그 (검색용)
  custom_fields JSONB DEFAULT '{}',      -- 확장 필드 (유연하게)

  -- 계약사항 (service_products에서 기본값, 차량별 오버라이드)
  has_inspection BOOLEAN,
  has_accident BOOLEAN,
  has_rental BOOLEAN,
  has_legal_exam BOOLEAN,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(company_id, car_id)
);

-- 4. 거래처 설정 — 거래처별 서비스 구성
CREATE TABLE IF NOT EXISTS customer_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  customer_code VARCHAR(10) NOT NULL,    -- pmccustm.custcode
  customer_name VARCHAR(100),            -- 표시명 (오버라이드)

  -- 기본 서비스 설정 (이 거래처의 차량들에 기본 적용)
  default_service_type VARCHAR(10),      -- T=턴키, S=실비
  default_has_inspection BOOLEAN DEFAULT false,
  default_has_accident BOOLEAN DEFAULT false,
  default_has_rental BOOLEAN DEFAULT false,
  default_has_legal_exam BOOLEAN DEFAULT false,

  -- 담당자 정보
  manager_name VARCHAR(100),
  manager_phone VARCHAR(20),
  manager_email VARCHAR(100),

  memo TEXT,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(company_id, customer_code)
);

-- RLS 정책
ALTER TABLE code_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company codes" ON code_master
  FOR SELECT USING (company_id IN (
    SELECT company_id FROM user_profiles WHERE user_id = auth.uid()
  ) OR company_id IS NULL);

CREATE POLICY "Users can view their company products" ON service_products
  FOR SELECT USING (company_id IN (
    SELECT company_id FROM user_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view their company vehicle overrides" ON vehicle_overrides
  FOR SELECT USING (company_id IN (
    SELECT company_id FROM user_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view their company customer settings" ON customer_settings
  FOR SELECT USING (company_id IN (
    SELECT company_id FROM user_profiles WHERE user_id = auth.uid()
  ));

-- 인덱스
CREATE INDEX idx_code_master_group ON code_master(company_id, group_code);
CREATE INDEX idx_service_products_code ON service_products(company_id, product_code);
CREATE INDEX idx_vehicle_overrides_car ON vehicle_overrides(company_id, car_id);
CREATE INDEX idx_customer_settings_cust ON customer_settings(company_id, customer_code);

-- 초기 데이터: 핵심 코드 마스터 (company_id = NULL → 전체 공통)
INSERT INTO code_master (company_id, group_code, group_name, code, label, sort_order, source, cafe24_group) VALUES
  -- OTPTSTAT 진행상태
  (NULL, 'OTPTSTAT', '진행상태', '1', '접수', 1, 'cafe24', 'OTPTSTAT'),
  (NULL, 'OTPTSTAT', '진행상태', '2', '입고', 2, 'cafe24', 'OTPTSTAT'),
  (NULL, 'OTPTSTAT', '진행상태', '3', '수리중', 3, 'cafe24', 'OTPTSTAT'),
  (NULL, 'OTPTSTAT', '진행상태', '4', '출고', 4, 'cafe24', 'OTPTSTAT'),
  -- OTPTACBN 사고구분
  (NULL, 'OTPTACBN', '사고구분', 'B', '보물', 1, 'cafe24', 'OTPTACBN'),
  (NULL, 'OTPTACBN', '사고구분', 'D', '단독', 2, 'cafe24', 'OTPTACBN'),
  (NULL, 'OTPTACBN', '사고구분', 'E', '기타', 3, 'cafe24', 'OTPTACBN'),
  (NULL, 'OTPTACBN', '사고구분', 'G', '가해', 4, 'cafe24', 'OTPTACBN'),
  (NULL, 'OTPTACBN', '사고구분', 'H', '긴출', 5, 'cafe24', 'OTPTACBN'),
  (NULL, 'OTPTACBN', '사고구분', 'J', '자차', 6, 'cafe24', 'OTPTACBN'),
  (NULL, 'OTPTACBN', '사고구분', 'K', '과실', 7, 'cafe24', 'OTPTACBN'),
  (NULL, 'OTPTACBN', '사고구분', 'M', '면책', 8, 'cafe24', 'OTPTACBN'),
  (NULL, 'OTPTACBN', '사고구분', 'O', '정비', 9, 'cafe24', 'OTPTACBN'),
  (NULL, 'OTPTACBN', '사고구분', 'P', '피해', 10, 'cafe24', 'OTPTACBN'),
  (NULL, 'OTPTACBN', '사고구분', 'Q', '검사', 11, 'cafe24', 'OTPTACBN'),
  (NULL, 'OTPTACBN', '사고구분', 'S', '긴출', 12, 'cafe24', 'OTPTACBN'),
  -- BHNAME 보험사
  (NULL, 'BHNAME', '보험사명', 'N01', '렌터카공제조합', 1, 'cafe24', 'BHNAME'),
  (NULL, 'BHNAME', '보험사명', 'N02', '메리츠화재', 2, 'cafe24', 'BHNAME'),
  (NULL, 'BHNAME', '보험사명', 'N03', '삼성화재', 3, 'cafe24', 'BHNAME'),
  (NULL, 'BHNAME', '보험사명', 'N04', '흥국화재', 4, 'cafe24', 'BHNAME'),
  (NULL, 'BHNAME', '보험사명', 'N05', '악사다이렉트', 5, 'cafe24', 'BHNAME'),
  (NULL, 'BHNAME', '보험사명', 'N06', '현대해상', 6, 'cafe24', 'BHNAME'),
  (NULL, 'BHNAME', '보험사명', 'N07', 'DB', 7, 'cafe24', 'BHNAME'),
  (NULL, 'BHNAME', '보험사명', 'N99', '보험사없음', 99, 'cafe24', 'BHNAME'),
  -- OTPTDSLI 운전자면허종류
  (NULL, 'OTPTDSLI', '운전자면허종류', '1B', '1종보통', 1, 'cafe24', 'OTPTDSLI'),
  (NULL, 'OTPTDSLI', '운전자면허종류', '1D', '1종대형', 2, 'cafe24', 'OTPTDSLI'),
  (NULL, 'OTPTDSLI', '운전자면허종류', '2A', '2종오토', 3, 'cafe24', 'OTPTDSLI'),
  (NULL, 'OTPTDSLI', '운전자면허종류', '2B', '2종보통', 4, 'cafe24', 'OTPTDSLI'),
  -- CARSSTAT 차량상태
  (NULL, 'CARSSTAT', '차량이용상태', 'R', '이용중', 1, 'cafe24', 'CARSSTAT'),
  (NULL, 'CARSSTAT', '차량이용상태', 'H', '해지', 2, 'cafe24', 'CARSSTAT'),
  (NULL, 'CARSSTAT', '차량이용상태', 'L', '반납', 3, 'cafe24', 'CARSSTAT'),
  -- CARSTYPE 서비스유형
  (NULL, 'CARSTYPE', '서비스유형', 'S', '실비', 1, 'cafe24', 'CARSTYPE'),
  (NULL, 'CARSTYPE', '서비스유형', 'T', '턴키', 2, 'cafe24', 'CARSTYPE'),
  -- BHJAGB 자부담구분
  (NULL, 'BHJAGB', '자부담구분', '-', '모름', 1, 'cafe24', 'BHJAGB'),
  (NULL, 'BHJAGB', '자부담구분', 'A', '정액', 2, 'cafe24', 'BHJAGB'),
  (NULL, 'BHJAGB', '자부담구분', 'B', '정율', 3, 'cafe24', 'BHJAGB'),
  (NULL, 'BHJAGB', '자부담구분', 'C', '모름', 4, 'cafe24', 'BHJAGB'),
  -- BHJACHA 자차수리부담
  (NULL, 'BHJACHA', '자차수리부담', 'A01', '메리츠캐피탈', 1, 'cafe24', 'BHJACHA'),
  (NULL, 'BHJACHA', '자차수리부담', 'A02', '스카이오토서비스', 2, 'cafe24', 'BHJACHA'),
  (NULL, 'BHJACHA', '자차수리부담', 'A03', 'GS엠비즈', 3, 'cafe24', 'BHJACHA'),
  (NULL, 'BHJACHA', '자차수리부담', 'A04', '효성캐피탈', 4, 'cafe24', 'BHJACHA'),
  (NULL, 'BHJACHA', '자차수리부담', 'A05', '렌터카공제조합(자차)', 5, 'cafe24', 'BHJACHA'),
  (NULL, 'BHJACHA', '자차수리부담', 'a06', '삼성화재', 6, 'cafe24', 'BHJACHA'),
  (NULL, 'BHJACHA', '자차수리부담', 'A07', '라이드(주)', 7, 'cafe24', 'BHJACHA'),
  (NULL, 'BHJACHA', '자차수리부담', 'A99', '없음', 99, 'cafe24', 'BHJACHA'),
  -- OTPTACRN 차량운행상태
  (NULL, 'OTPTACRN', '차량운행상태', 'Y', '운행가능', 1, 'cafe24', 'OTPTACRN'),
  (NULL, 'OTPTACRN', '차량운행상태', 'N', '운행불가능', 2, 'cafe24', 'OTPTACRN'),
  -- FACTTYPE 공장유형
  (NULL, 'FACTTYPE', '공장/업체유형', 'A', '공장(일반)', 1, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'B', '공장(P)', 2, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'C', '정비업체(일반)', 3, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'D', '정비업체(정기점검)', 4, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'E', '자동차부품', 5, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'F', '타이어', 6, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'G', '기타(임시)', 7, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'H', '법정검사', 8, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'I', '렌터카(대차)', 9, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'J', '정비업체(미션)', 10, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'K', '자동차유리', 11, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'L', '정비업체(순회)', 12, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'M', '탁송', 13, 'cafe24', 'FACTTYPE'),
  (NULL, 'FACTTYPE', '공장/업체유형', 'N', '자동차유리', 14, 'cafe24', 'FACTTYPE'),
  -- CAMOLEVL 고객성향
  (NULL, 'CAMOLEVL', '고객성향', '1', '좋음', 1, 'cafe24', 'CAMOLEVL'),
  (NULL, 'CAMOLEVL', '고객성향', '2', '보통', 2, 'cafe24', 'CAMOLEVL'),
  (NULL, 'CAMOLEVL', '고객성향', '3', '나쁨', 3, 'cafe24', 'CAMOLEVL')
ON CONFLICT DO NOTHING;
