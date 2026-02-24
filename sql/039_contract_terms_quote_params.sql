-- ============================================
-- 039: contract_terms에 견적서 표시 & 계산 파라미터 JSONB 컬럼 추가
-- ============================================

-- ── 1) JSONB 컬럼 추가
ALTER TABLE contract_terms
  ADD COLUMN IF NOT EXISTS insurance_coverage JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS quote_notices      JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS calc_params        JSONB DEFAULT '{}';

COMMENT ON COLUMN contract_terms.insurance_coverage IS '견적서 보험 보장내역 [{label, description}]';
COMMENT ON COLUMN contract_terms.quote_notices      IS '견적서 유의사항 목록';
COMMENT ON COLUMN contract_terms.calc_params        IS '보험료 계산/견적 파라미터 JSON';

-- ── 2) 기존 active 약관에 기본값 시드
UPDATE contract_terms
SET
  insurance_coverage = '[
    {"label": "대인배상 I (책임)", "description": "자배법 의무보험 · 사망/부상 한도 무제한"},
    {"label": "대인배상 II (종합)", "description": "대인 I 초과분 무한 보장"},
    {"label": "대물배상", "description": "1억원 한도 (상대방 차량·재물 손해)"},
    {"label": "자기신체사고", "description": "사망 1.5억 / 부상·후유장해 3천만원 한도"},
    {"label": "무보험차상해", "description": "2억원 한도"},
    {"label": "자기차량손해 (자차)", "description": "차량가액 기준 전손/분손 보장 · 면책금 {deductible}원"}
  ]'::jsonb,

  quote_notices = '[
    "본 견적서는 발행일로부터 30일간 유효하며, 차량 재고 및 시장 상황에 따라 변동될 수 있습니다.",
    "보증금은 계약 종료 시 차량 상태 확인 후 손해액을 공제한 잔액을 환불합니다.",
    "약정주행거리 초과 시 계약 종료 시점에 km당 {excessRate}원의 추가 요금이 정산됩니다.",
    "사고 발생 시 자차 면책금 {deductible}원은 임차인 부담이며, 면책금 초과 수리비는 보험 처리됩니다.",
    "중도해지 시 잔여 렌탈료의 {earlyTerminationRate}%에 해당하는 위약금이 발생합니다.",
    "자동차보험(렌터카 공제조합)은 렌탈료에 포함되며, 대인II/대물1억/자손/무보험차상해/자차 종합 보장됩니다.",
    "자동차 정기검사(종합검사)는 임대인이 일정에 맞추어 실시하며, 검사비용은 렌탈료에 포함됩니다.",
    "렌탈 차량은 타인에게 전대·양도할 수 없으며 임대인의 사전 동의 없이 차량 개조 불가합니다.",
    {"text": "인수 시 소유권 이전에 필요한 취득세 및 수수료는 임차인 부담입니다.", "condition": "buyout"}
  ]'::jsonb,

  calc_params = '{
    "early_termination_rate": 35,
    "insurance_note": "렌터카 공제조합 가입 · 보험기간: 계약기간 동안 연단위 자동갱신 · 보험료 렌탈료 포함",
    "ins_base_annual": {
      "경형": 705000, "소형": 923830, "중형": 923830, "대형": 923830, "수입": 923830
    },
    "ins_own_damage_rate": {
      "경형": 1.90, "소형": 1.96, "중형": 2.00, "대형": 2.10, "수입": 2.18
    },
    "deductible_discount": {
      "0": 1.0, "200000": 0.92, "300000": 0.88, "500000": 0.82,
      "1000000": 0.72, "1500000": 0.65, "2000000": 0.60
    },
    "driver_age_factors": {
      "26세이상": {"factor": 1.00, "label": "만 26세 이상", "desc": "표준 요율"},
      "21세이상": {"factor": 1.40, "label": "만 21세 이상", "desc": "젊은층 할증 +40%"},
      "전연령":   {"factor": 1.65, "label": "전 연령",      "desc": "최대 할증 +65%"}
    },
    "car_age_factors": [
      {"max_age": 1, "factor": 1.0},
      {"max_age": 3, "factor": 0.95},
      {"max_age": 5, "factor": 0.90},
      {"max_age": 7, "factor": 0.85},
      {"max_age": 99, "factor": 0.80}
    ],
    "ins_breakdown_ratios": {
      "대인I": 0.308, "대인II": 0.205, "대물": 0.379,
      "자기신체": 0.032, "무보험차": 0.036, "긴급출동": 0.041
    },
    "non_commercial_base_factor": 1.30,
    "non_commercial_own_factor": 1.15,
    "excess_mileage_rates": {
      "국산_경소형": 110, "국산_중형": 150, "국산_대형": 200,
      "수입_소중형": 250, "수입_대형": 350
    },
    "early_termination_rates_by_period": [
      {"months_from": 1,  "months_to": 12,  "rate": 80},
      {"months_from": 13, "months_to": 24,  "rate": 70},
      {"months_from": 25, "months_to": 36,  "rate": 50},
      {"months_from": 37, "months_to": 48,  "rate": 40},
      {"months_from": 49, "months_to": 999, "rate": 30}
    ]
  }'::jsonb
WHERE insurance_coverage = '[]'::jsonb OR insurance_coverage IS NULL;
