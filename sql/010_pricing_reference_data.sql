-- ================================================================
-- Self-Disruption ERP: 렌트가 산정 기준자료 종합 마이그레이션
-- 010_pricing_reference_data.sql
-- ================================================================
-- 전문 렌터카 견적 산출을 위한 7대 원가 기둥 데이터
--
-- [1] 잔존가치율표 (depreciation_db) — 가장 핵심, 15개 차종별
-- [2] 보험료 기준표 (insurance_rate_table) — 신규 테이블
-- [3] 정비비 기준표 (maintenance_cost_table) — 신규 테이블
-- [4] 자동차세 기준표 (vehicle_tax_table) — 신규 테이블
-- [5] 금리/금융비용 기준 (finance_rate_table) — 신규 테이블
-- [6] 등록비용 기준표 (registration_cost_table) — 신규 테이블
-- [7] business_rules 고도화
--
-- ※ 모든 INSERT는 중복 방지 처리 (DELETE + INSERT or WHERE NOT EXISTS)
-- ※ Supabase SQL Editor에서 한 번에 실행 가능
-- ================================================================


-- ================================================================
-- [1] 잔존가치율표 (depreciation_db)
-- ================================================================
-- 렌트가 산정의 가장 핵심 기준
-- 출고가(또는 취득원가) 대비 잔존가치 비율(%)
-- 한국 중고차 시장(Encar, KB차차차) 실거래가 기반

-- 기존 데이터 클리어 후 재입력 (최신 기준으로 갱신)
DELETE FROM depreciation_db WHERE category IN (
  '국산 경차', '국산 소형 세단', '국산 준중형 세단', '국산 중형 세단',
  '국산 대형 세단', '국산 소형 SUV', '국산 중형 SUV', '국산 대형 SUV',
  '국산 MPV/미니밴', '수입 중형 세단', '수입 대형 세단', '수입 중형 SUV',
  '수입 프리미엄', '전기차 국산', '전기차 수입', '하이브리드'
);

INSERT INTO depreciation_db (category, rate_1yr, rate_2yr, rate_3yr, rate_4yr, rate_5yr) VALUES
-- ── 국산차 ──────────────────────────────────────────
-- 경차: 모닝, 레이, 캐스퍼 등 — 감가 완만, 실수요 많음
('국산 경차',           82, 72, 62, 52, 42),
-- 소형 세단: 아반떼, K3 등
('국산 소형 세단',      80, 68, 58, 48, 38),
-- 준중형 세단: 쏘나타, K5 등
('국산 준중형 세단',    78, 66, 56, 46, 36),
-- 중형 세단: 그랜저(구형분류), K8 등
('국산 중형 세단',      76, 65, 55, 45, 36),
-- 대형 세단: 제네시스 G80, G90 등
('국산 대형 세단',      74, 62, 52, 42, 34),

-- ── 국산 SUV ────────────────────────────────────────
-- 소형 SUV: 셀토스, 코나, XM3 등 — 인기 높아 잔가 양호
('국산 소형 SUV',       82, 72, 62, 52, 43),
-- 중형 SUV: 투싼, 스포티지, 싼타페 등
('국산 중형 SUV',       80, 70, 60, 50, 41),
-- 대형 SUV: 팰리세이드, 쏘렌토, 모하비 등 — 대기수요로 잔가 높음
('국산 대형 SUV',       83, 73, 63, 53, 44),
-- MPV/미니밴: 카니발, 스타리아 등
('국산 MPV/미니밴',     80, 70, 60, 50, 40),

-- ── 수입차 ──────────────────────────────────────────
-- 수입 중형 세단: 벤츠 C, BMW 3, 아우디 A4 — 감가 빠름
('수입 중형 세단',      72, 58, 48, 40, 33),
-- 수입 대형 세단: 벤츠 E, BMW 5 — 모델체인지 영향 큼
('수입 대형 세단',      70, 56, 46, 38, 31),
-- 수입 SUV: GLC, X3, Q5 등 — SUV 특성상 세단보다 양호
('수입 중형 SUV',       74, 62, 52, 43, 36),
-- 수입 프리미엄: 벤츠 S, BMW 7, 포르쉐 — 급격 감가
('수입 프리미엄',       65, 50, 40, 33, 27),

-- ── 전기차/하이브리드 ───────────────────────────────
-- 전기차 국산: 아이오닉5, EV6, EV9 — 배터리 감가 반영
('전기차 국산',         75, 62, 50, 40, 32),
-- 전기차 수입: 테슬라, 벤츠 EQE 등 — 모델 주기 빠름
('전기차 수입',         70, 55, 43, 34, 27),
-- 하이브리드: HEV/PHEV — 연비 강점으로 잔가 양호
('하이브리드',          80, 70, 60, 50, 42);


-- ================================================================
-- [2] 보험료 기준표 (insurance_rate_table) — 신규
-- ================================================================
-- 렌터카 영업용 보험 기준 (대인II 무한, 대물 2억, 자손 1억, 자차 포함)
-- 차량 가액 구간별 + 차종별 연간 보험료 추정

CREATE TABLE IF NOT EXISTS insurance_rate_table (
  id BIGSERIAL PRIMARY KEY,
  vehicle_type TEXT NOT NULL,              -- 차종 구분
  value_min BIGINT NOT NULL DEFAULT 0,     -- 차량가 하한 (원)
  value_max BIGINT NOT NULL DEFAULT 0,     -- 차량가 상한 (원)
  annual_premium BIGINT NOT NULL,          -- 연간 보험료 (원)
  coverage_desc TEXT,                      -- 담보 설명
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 기존 데이터 클리어
DELETE FROM insurance_rate_table;

INSERT INTO insurance_rate_table (vehicle_type, value_min, value_max, annual_premium, coverage_desc, notes) VALUES
-- ================================================================
-- ★ 렌터카 영업용 플릿보험 기준 (중소 플릿 50~200대 기준)
-- ================================================================
-- 개인보험 대비 약 30~40% 저렴한 플릿 요율 적용
-- 대형사(1000대+)는 추가 15~20% 할인 가능
--
-- ── 국산 승용 (플릿) ────────────────────────────────
('국산 승용',      0,       20000000,  1050000, '대인II무한/대물2억/자손1억/자차', '경차~소형, 플릿 30% 할인 반영'),
('국산 승용',      20000001, 30000000, 1330000, '대인II무한/대물2억/자손1억/자차', '준중형~중형, 플릿 30% 할인'),
('국산 승용',      30000001, 50000000, 1750000, '대인II무한/대물2억/자손1억/자차', '중형~대형, 플릿 30% 할인'),
('국산 승용',      50000001, 70000000, 2240000, '대인II무한/대물3억/자손1억/자차', '대형/프리미엄, 플릿 30% 할인'),
('국산 승용',      70000001, 999999999, 2800000, '대인II무한/대물3억/자손1억/자차', '고가, 플릿 30% 할인'),

-- ── 수입 승용 (플릿, 국산 대비 약 40% 할증) ─────────
('수입 승용',      0,       40000000,  1960000, '대인II무한/대물3억/자손1억/자차', '수입 소~중형, 부품비 높아 할증'),
('수입 승용',      40000001, 60000000, 2450000, '대인II무한/대물3억/자손1억/자차', '수입 중형'),
('수입 승용',      60000001, 80000000, 2940000, '대인II무한/대물5억/자손1억/자차', '수입 대형'),
('수입 승용',      80000001, 120000000, 3850000, '대인II무한/대물5억/자손1억/자차', '수입 프리미엄'),
('수입 승용',      120000001, 999999999, 4900000, '대인II무한/대물5억/자손1억/자차', '초고가, 면책금 상향 검토'),

-- ── 전기차 (플릿, 배터리 수리비로 자차 높음) ────────
('전기차',         0,       40000000,  1540000, '대인II무한/대물2억/자손1억/자차', '소형 전기차, 배터리 수리비 반영'),
('전기차',         40000001, 60000000, 2100000, '대인II무한/대물3억/자손1억/자차', '중형 전기차'),
('전기차',         60000001, 999999999, 2800000, '대인II무한/대물3억/자손1억/자차', '대형/수입 전기차');


-- ================================================================
-- [3] 정비비 기준표 (maintenance_cost_table) — 신규
-- ================================================================
-- 차종별/연식별 월간 정비충당금
-- 소모품 교체주기, 정기점검, 타이어 감가 포함

CREATE TABLE IF NOT EXISTS maintenance_cost_table (
  id BIGSERIAL PRIMARY KEY,
  vehicle_type TEXT NOT NULL,              -- 차종 구분
  fuel_type TEXT NOT NULL DEFAULT '내연기관',  -- 내연기관/전기/하이브리드
  age_min INT NOT NULL DEFAULT 0,          -- 차령 하한 (년)
  age_max INT NOT NULL DEFAULT 99,         -- 차령 상한 (년)
  monthly_cost BIGINT NOT NULL,            -- 월 정비충당금 (원)
  includes TEXT,                           -- 포함 항목
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

DELETE FROM maintenance_cost_table;

INSERT INTO maintenance_cost_table (vehicle_type, fuel_type, age_min, age_max, monthly_cost, includes, notes) VALUES
-- ── 국산 경차/소형 ──────────────────────────────────
('국산 경차/소형',   '내연기관', 0, 2,  30000,  '오일/필터/워셔액',          '신차~2년: 기본 소모품만'),
('국산 경차/소형',   '내연기관', 3, 4,  50000,  '오일/필터/브레이크패드/타이어적립', '3~4년: 교체 주기 도래'),
('국산 경차/소형',   '내연기관', 5, 99, 80000,  '오일/필터/브레이크/타이어/벨트',   '5년+: 주요 부품 교체'),

-- ── 국산 중형 ───────────────────────────────────────
('국산 중형',        '내연기관', 0, 2,  40000,  '오일/필터/워셔액',          ''),
('국산 중형',        '내연기관', 3, 4,  65000,  '오일/필터/브레이크/타이어적립',   ''),
('국산 중형',        '내연기관', 5, 99, 100000, '오일/필터/브레이크/타이어/서스펜션', ''),

-- ── 국산 대형/SUV ───────────────────────────────────
('국산 대형/SUV',    '내연기관', 0, 2,  50000,  '오일/필터/워셔액',          ''),
('국산 대형/SUV',    '내연기관', 3, 4,  80000,  '오일/필터/브레이크/타이어적립',   'SUV 타이어 비용 높음'),
('국산 대형/SUV',    '내연기관', 5, 99, 120000, '오일/필터/브레이크/타이어/미션오일', ''),

-- ── 수입차 (국산 대비 약 80~100% 추가) ─────────────
('수입차',           '내연기관', 0, 2,  70000,  '오일/필터/워셔액',          '수입차 부품 단가 높음'),
('수입차',           '내연기관', 3, 4,  120000, '오일/필터/브레이크/타이어적립',   '수입 정비 인건비 포함'),
('수입차',           '내연기관', 5, 99, 180000, '오일/필터/브레이크/타이어/냉각수/미션', '고연식 수입차 리스크'),

-- ── 전기차 (정비비 대폭 절감) ────────────────────────
('전기차',           '전기',    0, 2,  20000,  '워셔액/에어컨필터/와이퍼',   '오일교환 불필요'),
('전기차',           '전기',    3, 4,  35000,  '에어컨필터/와이퍼/브레이크/냉각수', '회생제동으로 브레이크 마모 적음'),
('전기차',           '전기',    5, 99, 55000,  '브레이크/타이어/냉각수/배터리점검', '배터리 점검비용 포함'),

-- ── 하이브리드 ──────────────────────────────────────
('하이브리드',       '하이브리드', 0, 2,  35000,  '오일/필터/워셔액',         '오일교환 주기 길어짐'),
('하이브리드',       '하이브리드', 3, 4,  55000,  '오일/필터/브레이크/타이어적립', ''),
('하이브리드',       '하이브리드', 5, 99, 90000,  '오일/필터/브레이크/타이어/배터리', 'HEV 배터리 점검 포함');


-- ================================================================
-- [4] 자동차세 기준표 (vehicle_tax_table) — 신규
-- ================================================================
-- 영업용(렌터카) 자동차세 기준
-- 렌터카는 영업용이므로 비영업용 대비 대폭 할인

CREATE TABLE IF NOT EXISTS vehicle_tax_table (
  id BIGSERIAL PRIMARY KEY,
  tax_type TEXT NOT NULL,                  -- 영업용/비영업용
  fuel_category TEXT NOT NULL,             -- 내연기관/전기
  cc_min INT NOT NULL DEFAULT 0,           -- 배기량 하한
  cc_max INT NOT NULL DEFAULT 999999,      -- 배기량 상한
  rate_per_cc NUMERIC(10,2) NOT NULL DEFAULT 0,  -- cc당 세액 (원)
  fixed_annual BIGINT NOT NULL DEFAULT 0,  -- 고정 연세액 (전기차용)
  education_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 30, -- 지방교육세율 (%)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

DELETE FROM vehicle_tax_table;

INSERT INTO vehicle_tax_table (tax_type, fuel_category, cc_min, cc_max, rate_per_cc, fixed_annual, education_tax_rate, notes) VALUES
-- ================================================================
-- ★ 영업용(렌터카) 전용 — 비영업용 데이터 불필요
-- ================================================================
-- 영업용은 교육세 비과세 (education_tax_rate 컬럼은 0으로 설정)
-- 비영업용 참고: 80~200원/cc + 교육세 30% (영업용의 약 10배)
('영업용', '내연기관', 0,    1600,   18,  0,     0, '영업용 1600cc 이하 (교육세 비과세)'),
('영업용', '내연기관', 1601, 2500,   19,  0,     0, '영업용 1601~2500cc (교육세 비과세)'),
('영업용', '내연기관', 2501, 999999, 24,  0,     0, '영업용 2501cc 초과 (교육세 비과세)'),
('영업용', '전기',     0,    0,      0,   20000, 0, '영업용 전기차 고정 2만원 (비영업 13만원)');


-- ================================================================
-- [5] 금리/금융비용 기준표 (finance_rate_table) — 신규
-- ================================================================
-- 캐피탈/리스사 조달금리 + 자체 자금 기회비용
-- 계약기간별 차등 적용

CREATE TABLE IF NOT EXISTS finance_rate_table (
  id BIGSERIAL PRIMARY KEY,
  finance_type TEXT NOT NULL,              -- 캐피탈대출/리스/자체자금
  term_months_min INT NOT NULL DEFAULT 0,  -- 계약기간 하한 (월)
  term_months_max INT NOT NULL DEFAULT 999,-- 계약기간 상한 (월)
  annual_rate NUMERIC(5,2) NOT NULL,       -- 연이율 (%)
  description TEXT,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

DELETE FROM finance_rate_table;

INSERT INTO finance_rate_table (finance_type, term_months_min, term_months_max, annual_rate, description, notes) VALUES
-- ── 캐피탈 대출 (차량 담보) ─────────────────────────
('캐피탈대출', 1,  12, 4.0, '단기 캐피탈 조달금리', '2025년 기준 시중 캐피탈'),
('캐피탈대출', 13, 24, 4.5, '2년 캐피탈 조달금리',   ''),
('캐피탈대출', 25, 36, 4.8, '3년 캐피탈 조달금리',   '가장 일반적 기간'),
('캐피탈대출', 37, 48, 5.2, '4년 캐피탈 조달금리',   ''),
('캐피탈대출', 49, 60, 5.5, '5년 캐피탈 조달금리',   '장기 조달 할증'),

-- ── 리스 (렌터카 리스백 등) ─────────────────────────
('리스',       1,  12, 5.5, '단기 리스 금리',       ''),
('리스',       13, 24, 6.0, '2년 리스 금리',        ''),
('리스',       25, 36, 6.5, '3년 리스 금리',        ''),
('리스',       37, 48, 7.0, '4년 리스 금리',        ''),
('리스',       49, 60, 7.5, '5년 리스 금리',        ''),

-- ── 자체자금 기회비용 ───────────────────────────────
('자체자금',   1,  60, 5.0, '자기자본 기회비용',     '예금/투자 대안수익률 기준');


-- ================================================================
-- [6] 등록비용 기준표 (registration_cost_table) — 신규
-- ================================================================
-- 차량 취득 시 부대비용 (취득원가에 포함해야 정확한 렌트가 산출)
-- 취득세 + 공채 + 탁송 + 번호판 등

CREATE TABLE IF NOT EXISTS registration_cost_table (
  id BIGSERIAL PRIMARY KEY,
  cost_type TEXT NOT NULL,                 -- 취득세/공채매입/탁송/번호판/기타
  vehicle_category TEXT NOT NULL DEFAULT '승용', -- 승용/화물/특수
  region TEXT DEFAULT '전국',               -- 서울/경기/기타/전국
  rate NUMERIC(6,3) DEFAULT 0,             -- 차량가 대비 비율 (%)
  fixed_amount BIGINT DEFAULT 0,           -- 고정 금액 (원)
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

DELETE FROM registration_cost_table;

INSERT INTO registration_cost_table (cost_type, vehicle_category, region, rate, fixed_amount, description, notes) VALUES
-- ================================================================
-- ★ 렌터카(자동차대여업) = 영업용 전용 데이터
-- ================================================================
--
-- ── 취득세 (영업용 기준) ──────────────────────────────
-- 영업용 승용: 4% (지방세법 제12조제1항제2호 '비영업용 승용 7%' 와 다름!)
-- 경차: 취득세 75만원까지 면제 (지방세특례제한법 제75조)
('취득세', '영업용',       '전국', 4.0,   0,      '영업용 승용 취득세 4%',     '비영업용 7%와 다름! 렌터카=영업용'),
('취득세', '영업용 승합',  '전국', 5.0,   0,      '영업용 승합 취득세 5%',     '15인승 이상 등'),
('취득세', '영업용 화물',  '전국', 5.0,   0,      '영업용 화물 취득세 5%',     ''),
('취득세', '영업용 전기',  '전국', 4.0,   0,      '영업용 전기차 취득세 4%',   '보조금 차감 후 과세, 경차 감면 별도'),

-- ── 공채매입비 (영업용 기준 · 지역별 · 배기량별) ──────
-- ★ 핵심: 도시철도채권 지역(서울/부산/대구)만 영업용에도 매입 의무
--         그 외 지역(지역개발채권) → 영업용 전차종 면제!
--
-- [서울 도시철도채권 - 영업용 승용차]
('공채매입', '영업용',     '서울',  8.0,   0,      '서울 영업용 2000cc↑ 8%',      '도시철도채권 7년만기, 비영업 20%'),
('공채매입', '영업용 중형','서울',  5.0,   0,      '서울 영업용 1600~2000cc 5%',  '비영업 12%, 2025.12.31까지'),
('공채매입', '영업용 소형','서울',  0,     0,      '서울 영업용 1600cc미만 면제',  '소형·경차 공채 면제'),
-- [부산 도시철도채권 - 영업용 승용차]
('공채매입', '영업용',     '부산',  4.0,   0,      '부산 영업용 2000cc↑ 4%',      '도시철도채권 5년만기'),
('공채매입', '영업용 중형','부산',  2.0,   0,      '부산 영업용 1600~2000cc 2%',  ''),
('공채매입', '영업용 소형','부산',  0,     0,      '부산 영업용 1600cc미만 면제',  ''),
-- [대구 도시철도채권 - 영업용 승용차]
('공채매입', '영업용',     '대구',  4.0,   0,      '대구 영업용 2000cc↑ 4%',      '도시철도채권 5년만기'),
('공채매입', '영업용 중형','대구',  2.0,   0,      '대구 영업용 1600~2000cc 2%',  ''),
('공채매입', '영업용 소형','대구',  0,     0,      '대구 영업용 1600cc미만 면제',  ''),
-- [그 외 지역 - 지역개발채권 → 영업용 면제]
('공채매입', '영업용',     '경기',  0,     0,      '경기 영업용 공채 면제',       '지역개발채권 → 영업용 전차종 면제'),
('공채매입', '영업용',     '인천',  0,     0,      '인천 영업용 공채 면제',       '지역개발채권 → 영업용 전차종 면제'),
('공채매입', '영업용',     '기타',  0,     0,      '기타지역 영업용 공채 면제',   '광역시 외 지역개발채권 → 영업용 면제'),

-- ── 공채할인율 (도시철도채권 매입 후 즉시매도) ────────
('공채할인', '영업용', '전국',  6.0,   0,      '공채 즉시매도 할인율 약6%',  '시장 금리에 따라 4~8% 변동'),

-- ── 고정 부대비용 (영업용 공통) ──────────────────────
('탁송료',   '영업용', '전국',  0,     350000, '출고지→사업장 탁송비',      '거리/지역별 변동, 인근 출고시 0원'),
('번호판',   '영업용', '전국',  0,     12000,  '영업용 번호판 교부비',      '허 번호판'),
('인지세',   '영업용', '전국',  0,     15000,  '등록 인지세',              ''),
('대행료',   '영업용', '전국',  0,     100000, '등록 대행수수료',           '직접 등록 시 불필요, 대량 등록 시 할인'),
('검사비',   '영업용', '전국',  0,     40000,  '신규검사 비용',            '');


-- ================================================================
-- [7] business_rules 고도화
-- ================================================================
-- 기존 단순 규칙을 전문가급으로 확장
-- ※ UPSERT 패턴 (key가 UNIQUE)

-- 기존 값 갱신 + 신규 추가
INSERT INTO business_rules (key, value, description) VALUES
  -- 감가 기본율 (depreciation_db 없을 때 폴백)
  ('DEP_YEAR_1',              to_jsonb(15::numeric),   '1년차 감가율 기본값 (%)'),
  ('DEP_YEAR_2PLUS',          to_jsonb(8::numeric),    '2년차 이후 연간 감가율 (%)'),
  ('DEP_MILEAGE_10K',         to_jsonb(2::numeric),    '만km당 추가 감가율 (%)'),
  ('DEP_MAX_RATE',            to_jsonb(85::numeric),   '최대 감가율 상한 (%)'),

  -- 금융비용
  ('LOAN_INTEREST_RATE',      to_jsonb(4.8::numeric),  '기본 대출금리 (%, 36개월 기준)'),
  ('LOAN_LTV_DEFAULT',        to_jsonb(70::numeric),   '기본 LTV 비율 (%, 매입가 대비 대출)'),
  ('INVESTMENT_RETURN_RATE',  to_jsonb(5.0::numeric),  '자기자본 기회비용 (%)'),

  -- 보험
  ('INSURANCE_LOADING',       to_jsonb(10::numeric),   '보험 로딩율 (%, 기본 보험료 위 추가)'),

  -- 정비
  ('MONTHLY_MAINTENANCE_BASE', to_jsonb(50000::numeric), '월 정비충당금 기본값 (원)'),

  -- 자동차세
  ('CAR_TAX_RATE',            to_jsonb(2.0::numeric),  '자동차세 폴백용 비율 (%)'),
  ('CAR_TAX_TYPE',            to_jsonb('영업용'::text), '렌터카 세금 유형'),

  -- 리스크 관리
  ('DEDUCTIBLE_AMOUNT',       to_jsonb(500000::numeric), '보험 면책금 (원)'),
  ('RISK_RESERVE_RATE',       to_jsonb(0.5::numeric),    '리스크 적립률 (%, 차량가 대비 연간)'),

  -- 보증금/선납금 효과
  ('DEPOSIT_DISCOUNT_RATE',   to_jsonb(0.4::numeric),  '보증금 할인율 (%)'),
  ('PREPAYMENT_DISCOUNT_RATE', to_jsonb(0.5::numeric), '선납금 할인율 (%)'),
  ('DEFAULT_DEPOSIT',         to_jsonb(3000000::numeric), '기본 보증금 (원)'),

  -- 등록비용 (★ 폴백용 — 실제 데이터는 registration_cost_table에서 직접 관리)
  ('REG_ACQUISITION_TAX',     to_jsonb(4.0::numeric),  '(폴백용) 영업용 취득세율 4%'),
  ('REG_BOND_RATE_SEOUL',     to_jsonb(8.0::numeric),  '(폴백용) 서울 영업용 공채 2000cc↑ 8%'),
  ('REG_BOND_RATE_GYEONGGI',  to_jsonb(0::numeric),    '(폴백용) 경기 영업용 공채 면제'),
  ('REG_BOND_RATE_OTHER',     to_jsonb(0::numeric),    '(폴백용) 기타 영업용 공채 면제'),
  ('REG_BOND_DISCOUNT',       to_jsonb(6.0::numeric),  '공채할인율 (%)'),
  ('REG_DELIVERY_FEE',        to_jsonb(350000::numeric), '탁송료 기본값 (원)'),
  ('REG_MISC_FEE',            to_jsonb(167000::numeric), '기타 등록비용 합계 (원)'),

  -- 마진/관리비
  ('DEFAULT_MARGIN_RATE',     to_jsonb(8::numeric),    '기본 이익률 (%)'),
  ('OVERHEAD_RATE',           to_jsonb(3::numeric),    '관리비율 (%, 취득원가 대비 연간)'),

  -- VAT
  ('VAT_RATE',                to_jsonb(10::numeric),   '부가가치세율 (%)'),

  -- 계약기간
  ('DEFAULT_TERM_MONTHS',     to_jsonb(36::numeric),   '기본 계약기간 (개월)')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = now();


-- ================================================================
-- [8] RLS 정책 (신규 테이블)
-- ================================================================

-- insurance_rate_table: 참조 테이블 (전체 조회 가능, 관리자만 수정)
ALTER TABLE insurance_rate_table ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'insurance_rate_table' AND policyname = 'insurance_rate_select') THEN
    CREATE POLICY insurance_rate_select ON insurance_rate_table FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'insurance_rate_table' AND policyname = 'insurance_rate_admin') THEN
    CREATE POLICY insurance_rate_admin ON insurance_rate_table FOR ALL USING (is_platform_admin());
  END IF;
END $$;

-- maintenance_cost_table
ALTER TABLE maintenance_cost_table ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'maintenance_cost_table' AND policyname = 'maintenance_cost_select') THEN
    CREATE POLICY maintenance_cost_select ON maintenance_cost_table FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'maintenance_cost_table' AND policyname = 'maintenance_cost_admin') THEN
    CREATE POLICY maintenance_cost_admin ON maintenance_cost_table FOR ALL USING (is_platform_admin());
  END IF;
END $$;

-- vehicle_tax_table
ALTER TABLE vehicle_tax_table ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vehicle_tax_table' AND policyname = 'vehicle_tax_select') THEN
    CREATE POLICY vehicle_tax_select ON vehicle_tax_table FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vehicle_tax_table' AND policyname = 'vehicle_tax_admin') THEN
    CREATE POLICY vehicle_tax_admin ON vehicle_tax_table FOR ALL USING (is_platform_admin());
  END IF;
END $$;

-- finance_rate_table
ALTER TABLE finance_rate_table ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_rate_table' AND policyname = 'finance_rate_select') THEN
    CREATE POLICY finance_rate_select ON finance_rate_table FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_rate_table' AND policyname = 'finance_rate_admin') THEN
    CREATE POLICY finance_rate_admin ON finance_rate_table FOR ALL USING (is_platform_admin());
  END IF;
END $$;

-- registration_cost_table
ALTER TABLE registration_cost_table ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'registration_cost_table' AND policyname = 'registration_cost_select') THEN
    CREATE POLICY registration_cost_select ON registration_cost_table FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'registration_cost_table' AND policyname = 'registration_cost_admin') THEN
    CREATE POLICY registration_cost_admin ON registration_cost_table FOR ALL USING (is_platform_admin());
  END IF;
END $$;


-- ================================================================
-- 완료 알림
-- ================================================================
-- 실행 후 확인 쿼리:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
--   'insurance_rate_table', 'maintenance_cost_table', 'vehicle_tax_table',
--   'finance_rate_table', 'registration_cost_table'
-- );
-- SELECT * FROM depreciation_db ORDER BY category;
-- SELECT * FROM insurance_rate_table ORDER BY vehicle_type, value_min;
-- SELECT * FROM business_rules ORDER BY key;
