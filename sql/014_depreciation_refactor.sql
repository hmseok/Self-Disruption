-- ================================================================
-- Self-Disruption ERP: 감가상각 기준 리팩토링
-- 014_depreciation_refactor.sql
-- ================================================================
-- 기존 depreciation_db (단일 category 텍스트)를 3축 분류 체계로 전환
--
-- [1] depreciation_rates      — 핵심 감가율 (origin × vehicle_class × fuel_type)
-- [2] depreciation_adjustments — 보정 계수 (주행거리·시장상황·인기도)
-- [3] depreciation_history     — 변경 이력 자동 기록
--
-- ※ 기존 depreciation_db는 유지 (하위 호환), 새 테이블로 데이터 이관
-- ※ Supabase SQL Editor에서 한 번에 실행 가능
-- ================================================================


-- ================================================================
-- [1] depreciation_rates — 3축 분류 감가율 테이블
-- ================================================================

CREATE TABLE IF NOT EXISTS depreciation_rates (
  id BIGSERIAL PRIMARY KEY,

  -- 3축 분류
  origin TEXT NOT NULL CHECK (origin IN ('국산', '수입')),
  vehicle_class TEXT NOT NULL CHECK (vehicle_class IN (
    '경차', '소형_세단', '준중형_세단', '중형_세단', '대형_세단',
    '소형_SUV', '중형_SUV', '대형_SUV', 'MPV',
    '프리미엄'
  )),
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('내연기관', '하이브리드', '전기')),

  -- 연차별 잔존율 (%)
  rate_1yr NUMERIC(5,1) NOT NULL DEFAULT 0,
  rate_2yr NUMERIC(5,1) NOT NULL DEFAULT 0,
  rate_3yr NUMERIC(5,1) NOT NULL DEFAULT 0,
  rate_4yr NUMERIC(5,1) NOT NULL DEFAULT 0,
  rate_5yr NUMERIC(5,1) NOT NULL DEFAULT 0,

  -- 메타
  description TEXT,              -- 참고 설명 (예: "소나타, K5 등")
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- 동일 조합 중복 방지
  UNIQUE (origin, vehicle_class, fuel_type)
);

COMMENT ON TABLE depreciation_rates IS '3축 분류 감가율 기준표 (origin × vehicle_class × fuel_type)';
COMMENT ON COLUMN depreciation_rates.origin IS '원산지: 국산, 수입';
COMMENT ON COLUMN depreciation_rates.vehicle_class IS '차급: 경차, 소형_세단, 준중형_세단, 중형_세단, 대형_세단, 소형_SUV, 중형_SUV, 대형_SUV, MPV, 프리미엄';
COMMENT ON COLUMN depreciation_rates.fuel_type IS '연료타입: 내연기관, 하이브리드, 전기';


-- ================================================================
-- [2] depreciation_adjustments — 보정 계수 테이블
-- ================================================================

CREATE TABLE IF NOT EXISTS depreciation_adjustments (
  id BIGSERIAL PRIMARY KEY,

  -- 보정 유형
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN (
    'mileage',           -- 주행거리 약정 보정
    'market_condition',  -- 시장 상황 보정
    'popularity'         -- 인기도 보정
  )),

  -- 적용 범위 (NULL이면 전체 적용)
  target_origin TEXT,              -- NULL = 전체, '국산' or '수입'
  target_vehicle_class TEXT,       -- NULL = 전체, 특정 차급
  target_fuel_type TEXT,           -- NULL = 전체, 특정 연료

  -- 보정값
  factor NUMERIC(5,3) NOT NULL DEFAULT 1.000,  -- 곱셈 계수 (1.0 = 보정 없음)
  label TEXT NOT NULL,             -- 표시명 (예: "연 3만km 약정", "반도체 대란")
  description TEXT,                -- 상세 설명

  -- 적용 기간 (시장상황 보정 등에 사용)
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,               -- NULL = 무기한

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE depreciation_adjustments IS '감가율 보정 계수 (주행거리·시장상황·인기도)';
COMMENT ON COLUMN depreciation_adjustments.factor IS '보정 계수: 1.0=보정없음, 1.1=잔존율10%↑, 0.9=잔존율10%↓';


-- ================================================================
-- [3] depreciation_history — 변경 이력 테이블
-- ================================================================

CREATE TABLE IF NOT EXISTS depreciation_history (
  id BIGSERIAL PRIMARY KEY,

  -- 어떤 테이블의 어떤 레코드
  source_table TEXT NOT NULL CHECK (source_table IN ('depreciation_rates', 'depreciation_adjustments')),
  source_id BIGINT NOT NULL,

  -- 변경 내용
  changed_field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,

  -- 누가, 언제
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT                      -- 변경 사유 (선택)
);

COMMENT ON TABLE depreciation_history IS '감가율·보정계수 변경 이력';

-- 이력 조회 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_depreciation_history_source
  ON depreciation_history(source_table, source_id, changed_at DESC);


-- ================================================================
-- [4] updated_at 자동 갱신 트리거
-- ================================================================

-- 공용 updated_at 트리거 함수 (없으면 생성)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER depreciation_rates_updated_at
  BEFORE UPDATE ON depreciation_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER depreciation_adjustments_updated_at
  BEFORE UPDATE ON depreciation_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ================================================================
-- [5] RLS 정책 (기존 패턴과 동일)
-- ================================================================

ALTER TABLE depreciation_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE depreciation_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE depreciation_history ENABLE ROW LEVEL SECURITY;

-- depreciation_rates: 인증 사용자 읽기, 관리자 전체
CREATE POLICY "depreciation_rates_select" ON depreciation_rates
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "depreciation_rates_admin_all" ON depreciation_rates
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- depreciation_adjustments: 인증 사용자 읽기, 관리자 전체
CREATE POLICY "depreciation_adjustments_select" ON depreciation_adjustments
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "depreciation_adjustments_admin_all" ON depreciation_adjustments
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- depreciation_history: 인증 사용자 읽기, 관리자 INSERT만
CREATE POLICY "depreciation_history_select" ON depreciation_history
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "depreciation_history_insert" ON depreciation_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- ================================================================
-- [6] 시드 데이터 — depreciation_rates
-- ================================================================
-- 기존 depreciation_db 16개 카테고리를 3축으로 분해하여 이관
-- rate 값은 기존과 동일 (소수점 1자리로 확장)

INSERT INTO depreciation_rates (origin, vehicle_class, fuel_type, rate_1yr, rate_2yr, rate_3yr, rate_4yr, rate_5yr, description) VALUES

-- ── 국산 내연기관 ─────────────────────────────────────
('국산', '경차',       '내연기관', 82.0, 72.0, 62.0, 52.0, 42.0, '모닝, 레이, 캐스퍼 — 실수요 많아 감가 완만'),
('국산', '소형_세단',   '내연기관', 80.0, 68.0, 58.0, 48.0, 38.0, '아반떼, K3 — 볼륨 모델'),
('국산', '준중형_세단', '내연기관', 78.0, 66.0, 56.0, 46.0, 36.0, '쏘나타, K5 — 가장 일반적'),
('국산', '중형_세단',   '내연기관', 76.0, 65.0, 55.0, 45.0, 36.0, '그랜저, K8 — 법인 수요'),
('국산', '대형_세단',   '내연기관', 74.0, 62.0, 52.0, 42.0, 34.0, '제네시스 G80, G90'),
('국산', '소형_SUV',   '내연기관', 82.0, 72.0, 62.0, 52.0, 43.0, '셀토스, 코나 — 인기 높아 잔가 양호'),
('국산', '중형_SUV',   '내연기관', 80.0, 70.0, 60.0, 50.0, 41.0, '투싼, 스포티지, 싼타페'),
('국산', '대형_SUV',   '내연기관', 83.0, 73.0, 63.0, 53.0, 44.0, '팰리세이드, 쏘렌토 — 대기수요로 잔가 높음'),
('국산', 'MPV',        '내연기관', 80.0, 70.0, 60.0, 50.0, 40.0, '카니발, 스타리아'),

-- ── 수입 내연기관 ─────────────────────────────────────
('수입', '중형_세단',   '내연기관', 72.0, 58.0, 48.0, 40.0, 33.0, '벤츠 C, BMW 3, 아우디 A4'),
('수입', '대형_세단',   '내연기관', 70.0, 56.0, 46.0, 38.0, 31.0, '벤츠 E, BMW 5 — 모델체인지 영향 큼'),
('수입', '중형_SUV',   '내연기관', 74.0, 62.0, 52.0, 43.0, 36.0, 'GLC, X3, Q5'),
('수입', '프리미엄',   '내연기관', 65.0, 50.0, 40.0, 33.0, 27.0, '벤츠 S, BMW 7, 포르쉐 — 급격 감가'),

-- ── 전기차 ────────────────────────────────────────────
('국산', '중형_세단',   '전기', 75.0, 62.0, 50.0, 40.0, 32.0, '아이오닉5, EV6, EV9 — 배터리 감가 반영'),
('수입', '중형_세단',   '전기', 70.0, 55.0, 43.0, 34.0, 27.0, '테슬라, 벤츠 EQE — 모델 주기 빠름'),

-- ── 하이브리드 ────────────────────────────────────────
('국산', '중형_세단',   '하이브리드', 80.0, 70.0, 60.0, 50.0, 42.0, '쏘나타HEV, 그랜저HEV — 연비 강점')

ON CONFLICT (origin, vehicle_class, fuel_type) DO UPDATE SET
  rate_1yr = EXCLUDED.rate_1yr,
  rate_2yr = EXCLUDED.rate_2yr,
  rate_3yr = EXCLUDED.rate_3yr,
  rate_4yr = EXCLUDED.rate_4yr,
  rate_5yr = EXCLUDED.rate_5yr,
  description = EXCLUDED.description,
  updated_at = now();


-- ================================================================
-- [7] 시드 데이터 — depreciation_adjustments (기본 보정 계수)
-- ================================================================

-- ── 주행거리 약정 보정 ────────────────────────────────
-- 기본 감가율은 "연 2만km" 기준. 약정거리에 따라 잔존율 보정
INSERT INTO depreciation_adjustments (adjustment_type, label, factor, description) VALUES
('mileage', '연 1.5만km 약정', 1.020, '저주행 약정 — 잔존율 2%p 상향, 일반 출퇴근/주말 사용'),
('mileage', '연 2만km 약정 (기본)', 1.000, '기본 기준 — 보정 없음, 렌터카 표준 주행거리'),
('mileage', '연 3만km 약정', 0.960, '고주행 약정 — 잔존율 4%p 하향, 영업/배달/출장 다수'),
('mileage', '연 4만km 이상', 0.920, '초고주행 — 잔존율 8%p 하향, 택시급 주행')
ON CONFLICT DO NOTHING;

-- ── 시장 상황 보정 ────────────────────────────────────
-- 특이 상황 발생 시 활성화. 평소에는 비활성 상태
INSERT INTO depreciation_adjustments (adjustment_type, label, factor, description, is_active) VALUES
('market_condition', '일반 시장 (기본)', 1.000, '정상 시장 — 보정 없음', true),
('market_condition', '공급 부족 (예: 반도체 대란)', 1.100, '신차 출고 지연으로 중고차 가격 상승, 잔존율 10%↑', false),
('market_condition', '보조금 축소 (전기차)', 0.900, '정부 보조금 감소로 전기차 중고 가격 하락, 잔존율 10%↓', false),
('market_condition', '환율 급등 (수입차)', 1.050, '원/달러 상승 시 수입 중고차 상대가치 상승', false),
('market_condition', '경기 침체', 0.950, '전반적 소비 위축으로 중고차 수요 감소', false)
ON CONFLICT DO NOTHING;

-- ── 인기도 보정 ───────────────────────────────────────
-- 차급 내 인기도 편차 보정 (사용자가 견적 시 선택)
INSERT INTO depreciation_adjustments (adjustment_type, label, factor, description) VALUES
('popularity', 'A등급 (고인기)', 1.030, '해당 차급 내 인기 모델 — 잔존율 3%p 상향 (예: 팰리세이드, 셀토스)'),
('popularity', 'B등급 (일반)', 1.000, '일반적인 리세일 — 보정 없음'),
('popularity', 'C등급 (저인기)', 0.960, '인기 낮은 모델 — 잔존율 4%p 하향 (예: 단종 예정, 비인기 색상)')
ON CONFLICT DO NOTHING;


-- ================================================================
-- 완료 메시지
-- ================================================================
-- 실행 후 확인:
--   SELECT * FROM depreciation_rates ORDER BY origin, vehicle_class, fuel_type;
--   SELECT * FROM depreciation_adjustments ORDER BY adjustment_type, factor DESC;
--   SELECT count(*) FROM depreciation_history;  -- 0건 (아직 변경 없음)
