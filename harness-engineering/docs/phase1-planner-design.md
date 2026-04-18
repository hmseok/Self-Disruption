# Phase 1 — 견적 기준표 재정립 + 엔진 확장 설계서

> **GATE 3 — Planner 설계서 (사용자 승인 대상)**
> 작성일: 2026-04-18
> 근거: `harness-engineering/reports/phase1-researcher-final.md`
> 사용자 지시: **"외부 실시간 조회 + 자체 운영데이터 = 기본 DB → 운영하면서 일부씩 조정 가능"**

---

## 0. 설계 원칙 (사용자 3원칙)

| # | 원칙 | 적용 |
|---|------|------|
| 1 | 외부 실시간 데이터는 **출처 기록** 필수 | vehicle_market_price 테이블에 `source_url`, `source_site`, `crawled_at` 필드 |
| 2 | 기존 DB값도 **그대로 신뢰 금지**, 재검증 필수 | business_rules 4건 수정, depreciation_rates 전체 재검증 |
| 3 | 자체 원가는 **검수 후 적용/조정 가능** | 3단 fallback 유지 (DB 값 → BusinessRules → hardcoded) + UI에서 수동 오버라이드 |

> **최종 구조**: 외부 시세 크롤러(월 1회) + 자체 운영데이터 → 통합 "기본 DB" → 운영 중 부분 조정

---

## 1. 현재 상태 요약 (Researcher 보고 기반)

### 1-1. 차량 18대 분류 (확정)

| 구분 | 대수 | 세부 |
|------|------|------|
| 자체 보유·장기 | 4 | BMW M2, 아이오닉5, 벤츠 A220, EV4 |
| 자체 보유·단기 | 4 | EQS450, M440i 그란쿠페, M4 쿠페, 911 4S |
| 자체 보유·구독(장기 준함) | 1 | EV6 |
| 외부렌탈(컨사인먼트) | 7 | 빌려타 5대 + BMW 520i (142호4413) + 공란 1대 |
| 반납 완료 | 2 | 투싼, 베뉴 |
| **합계** | **18** | |

자체 보유 **9대** (= 간접비 분모 = 월 1,000만원 / 9대 = **1,111,111원/대·월**)

### 1-2. 보험 등록 현황

| 상태 | 대수 | 비고 |
|------|------|------|
| 등록 완료 | 9/9 | 전수 완료 (A220 id=22, M2 id=23 방금 삽입) |
| 연 총액 | 18,754,440원 | KRMA 기준 납부액 |
| 평균 | 2,083,827원/대·년 | |

### 1-3. 보정 필요 항목 (총 4건)

| # | 항목 | 현재값 | 변경값 | 근거 |
|---|------|--------|--------|------|
| 1 | REG_ACQUISITION_TAX | 7.0% | **4.0%** | 영업용 차량 취득세 (지방세법 제124조) |
| 2 | REG_BOND_RATE_SEOUL | 12% | **8%** | 영업용 공채매입율 (서울시 조례) |
| 3 | LOAN_INTEREST_RATE | 4.8% | **5.3%** | 실 대출 평균 (통장 데이터 역추적, Phase2 재확정) |
| 4 | OVERHEAD (구조 변경) | 3%(비율) | **OVERHEAD_MONTHLY_PER_VEHICLE = 1,111,111원/대** (고정) | 월 고정비 1,000만원 ÷ 자체 9대 |

---

## 2. 이번 Phase 목표 (GATE 5 완료 기준)

1. **vehicle_market_price 테이블 생성** — 외부 시세 저장소 (Migrator)
2. **business_rules 4건 수정 + 신규 20키 추가** (Generator)
3. **rent-calc-engine v2.1 확장** — 3×2 매트릭스 분기 (contract_source × rental_term) (Generator)
4. **OVERHEAD 계산 로직 변경** — % → 고정액(원/대·월) (Generator)
5. **기준표 UI 3열 병행표시** — 현재값 / 외부추천값 / 운영실적 (Generator)
6. **자체 9대 차종별 시세 시드 입력** (Generator)
7. **DB 분류 오류 정정** — BMW 520i → consignment, 투싼·베뉴 → returned (Generator)
8. **evaluate.js ≥ 8.0** (Evaluator)
9. **Reviewer·Designer 통과** (GATE 6, 7)
10. **커밋·HARNESS.md 업데이트** (Deployer, Documenter)

---

## 3. 신규 테이블 — vehicle_market_price (Migrator 작업)

### 3-1. 목적

외부 시세 사이트(엔카, KB차차차 등) 월 1회 크롤링 결과를 저장하여 **depreciation_rates 테이블의 상수(고정감가율)을 실시간 시세로 보완**. 감가 계산에서 우선순위는 `vehicle_market_price (실시간) > depreciation_rates (고정) > DEP_CURVE_PRESETS (하드코딩)`.

### 3-2. 스키마

```sql
CREATE TABLE vehicle_market_price (
  id              INT PRIMARY KEY AUTO_INCREMENT,

  -- 차량 식별
  brand           VARCHAR(50)  NOT NULL COMMENT '브랜드 (예: BMW, Hyundai, 벤츠)',
  model           VARCHAR(100) NOT NULL COMMENT '모델명 (예: M2, 아이오닉5)',
  trim_name       VARCHAR(100) NULL     COMMENT '트림명',
  year            SMALLINT     NOT NULL COMMENT '연식 (예: 2024)',
  fuel_type       VARCHAR(30)  NOT NULL COMMENT '연료 (가솔린/디젤/전기/하이브리드)',
  origin          VARCHAR(20)  NOT NULL COMMENT 'domestic/imported',
  vehicle_class   VARCHAR(30)  NULL     COMMENT '경형/소형/중형/대형',

  -- 시세 정보
  mileage_km      INT          NULL     COMMENT '대표 주행거리 (km)',
  market_price    BIGINT       NOT NULL COMMENT '평균 시세 (원)',
  min_price       BIGINT       NULL     COMMENT '최저가 (원)',
  max_price       BIGINT       NULL     COMMENT '최고가 (원)',
  sample_count    INT          NOT NULL DEFAULT 0 COMMENT '표본 매물 수',

  -- 출처 (사용자 원칙 1: 출처 기록 필수)
  source_site     VARCHAR(30)  NOT NULL COMMENT 'encar/kb-chachacha/heydealer/manual',
  source_url      VARCHAR(500) NULL     COMMENT '원 URL',
  crawled_at      DATETIME     NOT NULL COMMENT '크롤링 시각',

  -- 운영
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  note            TEXT         NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_vmp_brand_model (brand, model, year),
  INDEX idx_vmp_crawled (crawled_at DESC),
  INDEX idx_vmp_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='차량 시세 기록 (외부 크롤링 + 수동 입력)';
```

### 3-3. 마이그레이션 안전도

| 색깔 | 판정 | 근거 |
|------|------|------|
| 🟢 Green | 자동 실행 | 신규 테이블 생성 (기존 데이터 무영향) |

### 3-4. 시드 데이터 — 자체 9대 초기 시세 (수동 입력 + 크롤러 확장)

Phase 1에서는 **크롤러 구현 대신 수동 입력**으로 시작. Phase 2에서 엔카 크롤러(월 1회 스케줄러) 연결.

| 차량 | 시세(예상, 크롤러 연결 전 수동) | 출처 |
|------|---------------------------|------|
| BMW M2 (2024) | 79,000,000 | 엔카 검색 결과 수동 입력 |
| 아이오닉5 (2024) | 38,000,000 | KB차차차 수동 |
| 벤츠 A220 (2024) | 42,000,000 | 엔카 수동 |
| EV4 (2025) | 32,000,000 | KB차차차 수동 |
| EQS450 (2024) | 165,000,000 | 엔카 수동 |
| M440i 그란쿠페 (2024) | 75,000,000 | 엔카 수동 |
| M4 쿠페 (2024) | 115,000,000 | 엔카 수동 |
| 911 4S (2024) | 240,000,000 | 엔카 수동 |
| EV6 (2024) | 45,000,000 | KB차차차 수동 |

> 실제 입력값은 Generator 단계에서 엔카 검색 수행 후 확정. 이 표는 **규모 참고용**.

---

## 4. business_rules 변경 내역 (Generator 작업)

### 4-1. 기존 4건 수정

```sql
-- 1. 취득세율 (영업용)
UPDATE business_rules SET value = '4.0', description = '영업용 차량 취득세율 (%) — 지방세법 제124조'
WHERE `key` = 'REG_ACQUISITION_TAX';

-- 2. 공채매입율 (서울, 영업용)
UPDATE business_rules SET value = '8.0', description = '서울시 영업용 공채매입율 (%)'
WHERE `key` = 'REG_BOND_RATE_SEOUL';

-- 3. 대출금리 (실 평균)
UPDATE business_rules SET value = '5.3', description = '실 대출 평균 금리 (%, 통장 데이터 역추적 기반)'
WHERE `key` = 'LOAN_INTEREST_RATE';

-- 4. OVERHEAD_RATE 비활성화 (% 기반 → 고정액 기반으로 전환)
UPDATE business_rules SET value = '0', description = '[DEPRECATED] % 방식 간접비 (OVERHEAD_MONTHLY_PER_VEHICLE로 대체)'
WHERE `key` = 'OVERHEAD_RATE';
```

### 4-2. 신규 추가 (총 16건)

```sql
INSERT INTO business_rules (`key`, value, description, category) VALUES
  -- 간접비 (고정액 기반)
  ('OVERHEAD_MONTHLY_PER_VEHICLE',   '1111111',  '월 간접비 원/대 (10,000,000 ÷ 자체 9대)',                 'overhead'),
  ('OVERHEAD_FLEET_SIZE',            '9',        '자체 보유 대수 (간접비 분모)',                            'overhead'),
  ('OVERHEAD_MONTHLY_TOTAL',         '10000000', '월 고정비 총액 (인건비+사무실+시스템)',                   'overhead'),

  -- 계약 구분 (신규)
  ('SHORT_TERM_UTILIZATION_RATE',    '60',       '단기 렌터카 가동률 (%, 빈 기간도 원가 발생)',             'contract'),
  ('EXTERNAL_RENT_MARGIN_RATE',      '15',       '외부렌탈 차량 마진율 (%, 월렌탈료 대비)',                 'contract'),
  ('LEASE_BUYOUT_RESIDUAL_RATE',     '30',       '인수형 리스 표준 잔존가율 (%)',                           'contract'),
  ('LONGTERM_ANNUAL_MILEAGE_DEFAULT','20000',    '장기렌트 기본 연주행거리 (km/년)',
    'contract'),
  ('SHORTTERM_DAILY_MILEAGE_DEFAULT','100',      '단기렌트 기본 일주행거리 (km/일)',                        'contract'),

  -- 자차율 (자체 9대 평균 기반)
  ('INSURANCE_OWN_DAMAGE_RATIO_AVG', '3.8',      '자차율 평균 (%, 자체 9대 KRMA 기준)',                     'insurance'),

  -- 감가 (외부 시세 가중)
  ('DEP_MARKET_PRICE_WEIGHT',        '0.7',      '감가 계산 시 외부시세 가중치 (0~1)',                      'depreciation'),
  ('DEP_CURVE_WEIGHT',               '0.3',      '감가 계산 시 고정커브 가중치 (0~1)',                      'depreciation'),

  -- 크롤러 스케줄
  ('CRAWLER_MARKET_PRICE_CRON',      '0 3 1 * *','매월 1일 03:00 엔카 크롤링 (cron)',                       'crawler'),
  ('CRAWLER_PRIMARY_SOURCE',         'encar',    '1순위 크롤링 사이트',                                     'crawler'),
  ('CRAWLER_SECONDARY_SOURCE',       'kb-chachacha', '2순위 크롤링 사이트',                                 'crawler'),

  -- 업계 평균 (업데이트)
  ('INDUSTRY_AVG_RENT_RATIO',        '2.2',      '업계 평균 월렌탈료/차량가 비율 (%)',                      'industry'),
  ('INDUSTRY_AVG_MARGIN_RATE',       '12',       '업계 평균 마진율 (%)',                                    'industry');
```

> 총 20키 변경 (4 수정 + 16 신규). `category` 컬럼이 없다면 생성 SQL은 skipping — 실제 columns는 Researcher 덤프 기준으로 추출.

---

## 5. rent-calc-engine v2.1 확장 (Generator 작업)

### 5-1. CalcInput.contract 확장

```ts
contract: {
  // ── 기존 필드 (유지) ──
  term_months: number
  car_age_mode: 'new' | 'used'
  custom_car_age: number
  contract_type: 'return' | 'buyout'
  residual_rate: number
  buyout_premium: number
  annual_mileage: number
  baseline_km: number

  // ── 신규 (v2.1) ──
  contract_source: 'owned' | 'external_rent' | 'lease'
    // owned         = 자체 보유 (취득원가 + 감가 + 금융 7대원가 전체)
    // external_rent = 외부렌탈 (월렌탈료 pass-through + 마진만)
    // lease         = 리스 (리스료 pass-through + 인수형 잔존가 처리)

  rental_term: 'longterm' | 'shortterm' | 'subscription'
    // longterm     = 장기 (12개월 이상, 가동률 100% 가정)
    // shortterm    = 단기 (1~30일, 가동률 60% 반영)
    // subscription = 구독 (장기 준함, 해약조항 다름)

  utilization_rate: number
    // 가동률 % (단기일 때 60, 장기/구독일 때 100)

  external_rent_monthly?: number
    // external_rent일 때 월 렌탈료 (파스-스루 원가)
}
```

### 5-2. calculateRentCost 분기 로직 (3×3 = 9 조합, 의미 있는 6조합)

| contract_source | rental_term | 엔진 동작 |
|----------------|-------------|----------|
| owned          | longterm    | **기존 7대원가 풀 계산** (현재 동작) |
| owned          | shortterm   | 기존 7대원가 × (1 / utilization_rate × 100) — 가동률 60% 반영 |
| owned          | subscription | longterm과 동일 처리 |
| external_rent  | longterm    | `external_rent_monthly × (1 + EXTERNAL_RENT_MARGIN_RATE/100)` + 보험·정비만 자체 |
| external_rent  | shortterm   | external_rent longterm × (1 / utilization_rate × 100) |
| lease          | longterm    | 취득원가=리스실행가 + contract_type='buyout'일 때 LEASE_BUYOUT_RESIDUAL_RATE 기본 적용 |

**의사코드:**

```ts
export function calculateRentCost(input: CalcInput): CalcResult {
  const { contract: c } = input

  // 분기 1: 외부렌탈은 원가 대부분을 pass-through
  if (c.contract_source === 'external_rent') {
    return calculateExternalRent(input)
  }

  // 분기 2: owned / lease = 기존 7대원가 로직
  const base = calculateOwnedCost(input)  // 기존 코드를 함수로 추출

  // 분기 3: 단기는 가동률 보정 (단, 감가·세금·검사는 시간비례라 비대상)
  if (c.rental_term === 'shortterm') {
    const utilAdjust = 100 / (c.utilization_rate || 60)
    base.breakdown.finance.monthly      = Math.round(base.breakdown.finance.monthly * utilAdjust)
    base.breakdown.insurance.monthly    = Math.round(base.breakdown.insurance.monthly * utilAdjust)
    base.breakdown.maintenance.monthly  = Math.round(base.breakdown.maintenance.monthly * utilAdjust)
    base.breakdown.risk.monthly         = Math.round(base.breakdown.risk.monthly * utilAdjust)
    base.breakdown.overhead.monthly     = Math.round(base.breakdown.overhead.monthly * utilAdjust)
    // 감가·세금은 시간비례로 그대로
    // → total_monthly_cost 재계산 필요
  }

  return base
}

function calculateExternalRent(input: CalcInput): CalcResult {
  const monthlyRent = n(input.contract.external_rent_monthly)
  const marginRate = n(input.rules.EXTERNAL_RENT_MARGIN_RATE, 15)
  const margin = Math.round(monthlyRent * marginRate / 100)

  // 외부렌탈은 보험·정비는 자체가 부담 안함 (렌탈사가 포함)
  // 오직 pass-through + 마진
  const total = monthlyRent + margin
  // ...breakdown 구성 (depreciation·finance·tax 전부 0, overhead만 PER_VEHICLE 반영)
}
```

### 5-3. OVERHEAD 계산 변경

**기존 (% 방식 — 폐기):**
```ts
const monthlyOverhead = Math.round(subtotalBeforeOverhead * (n(overhead.overhead_rate) / 100))
```

**신규 (고정액 방식):**
```ts
// BusinessRules OVERHEAD_MONTHLY_PER_VEHICLE 우선, 폴백으로 OVERHEAD_RATE
const overheadPerVehicle = n(input.rules.OVERHEAD_MONTHLY_PER_VEHICLE, 0)
const monthlyOverhead = overheadPerVehicle > 0
  ? overheadPerVehicle
  : Math.round(subtotalBeforeOverhead * (n(input.overhead.overhead_rate) / 100))
// formula 필드도 분기 표시
```

### 5-4. 감가 계산 — vehicle_market_price 가중치 반영

```ts
// reference에 vehicle_market_prices 추가 (route.ts 로더에서 조회)
reference: {
  ...기존 필드,
  vehicle_market_prices: any[]
}

// 현재 시장가 계산 수정:
const matchedMarketPrice = input.reference.vehicle_market_prices?.find(p =>
  p.brand === v.brand && p.model === v.model && p.year === v.year && p.is_active
)
const marketWeight = n(rules.DEP_MARKET_PRICE_WEIGHT, 0.7)
const curveWeight  = n(rules.DEP_CURVE_WEIGHT, 0.3)

const priceFromCurve  = Math.round(factoryPrice * adjustedNowResidualPct)
const priceFromMarket = matchedMarketPrice ? n(matchedMarketPrice.market_price) : 0

const currentMarketValue = priceFromMarket > 0
  ? Math.round(priceFromMarket * marketWeight + priceFromCurve * curveWeight)
  : priceFromCurve  // 외부 시세 없으면 커브만 사용
```

---

## 6. 기준표 UI 3열 병행표시 (Generator 작업)

### 6-1. 대상 페이지

`app/admin/standards/*` 하위 모든 관리 UI (BusinessRulesManager, DepreciationRatesManager 등). 현재는 1열(현재값)만 표시.

### 6-2. 3열 구조

| 컬럼 1 (현재값) | 컬럼 2 (외부추천값) | 컬럼 3 (운영실적) |
|---------------|-------------------|-----------------|
| DB에 저장된 확정 값 | 크롤러/법정 기준 | calc_snapshots + operational_actuals 집계 |
| 편집 가능 (관리자) | 읽기 전용 | 읽기 전용, 자동 집계 |
| "사용 중" 배지 | "외부 최신" 배지 + 출처 링크 | "실 운영" 배지 + 샘플 수 |

### 6-3. 3열 해석 규칙 (BusinessRule별)

| 키 | 컬럼 1 (현재) | 컬럼 2 (외부) | 컬럼 3 (실적) |
|---|-------------|-------------|-------------|
| REG_ACQUISITION_TAX | DB 값 | 4.0 (영업용 법정) | — |
| LOAN_INTEREST_RATE | DB 값 | 한은 기업대출 공시금리 | transactions 역산 |
| OVERHEAD_MONTHLY_PER_VEHICLE | DB 값 | — | 실 월 고정비 / 자체 대수 |
| INSURANCE_OWN_DAMAGE_RATIO_AVG | DB 값 | KRMA 공시율 | insurance_policy_record 평균 |
| DEP_YEAR_1 | DB 값 | vehicle_market_price 역산 | — |

### 6-4. UI 반영 패턴

```tsx
// 예시: BusinessRuleRow 컴포넌트
<tr>
  <td>{rule.key}</td>
  <td className="bg-blue-50/40 border-blue-100/80">
    <input value={rule.value} onChange={...} />  {/* 컬럼 1: 편집 */}
    <Badge>사용 중</Badge>
  </td>
  <td className="bg-green-50/40 border-green-100/80">
    {suggestion?.value ?? '—'}
    {suggestion?.source_url && <a href={suggestion.source_url}>출처</a>}
    <Badge>외부 최신</Badge>
  </td>
  <td className="bg-amber-50/40 border-amber-100/80">
    {actual?.avg ?? '—'} (n={actual?.count ?? 0})
    <Badge>실 운영</Badge>
  </td>
  <td><button onClick={()=>applySuggestion()}>외부값 적용</button></td>
</tr>
```

Soft Ice Glass Level 3 (색상 틴트 보더) 준수.

### 6-5. 외부추천값 API

신규 엔드포인트: `GET /api/pricing-standards/suggestions?key={ruleKey}`
- 법정/공시 기준표에서 조회 (하드코딩된 매핑 + vehicle_market_price 집계)
- 반환: `{ value, source_site, source_url, updated_at }`

### 6-6. 운영실적 API

신규 엔드포인트: `GET /api/pricing-standards/actuals?key={ruleKey}`
- calc_snapshots + operational_actuals 집계 (이미 Phase 0에 테이블 있음)
- 반환: `{ avg, median, count, period }`

---

## 7. DB 분류 오류 정정 (Generator 작업)

### 7-1. BMW 520i (142호4413) → consignment로 정정

```sql
-- 현재: vehicles.ownership_type = 'company'
-- 문제: xlsx 원본에 "빌려타렌트카"로 분류되어 있고 월 렌탈료 1,448,700원 지급 중
UPDATE vehicles
SET ownership_type = 'consignment',
    note = CONCAT(IFNULL(note, ''), '\n[분류정정 2026-04-18] 외부렌탈(빌려타) 차량으로 재분류')
WHERE plate_no = '142호4413';

-- consignment_contracts 레코드 추가 필요 시:
INSERT INTO consignment_contracts (vehicle_id, external_company, monthly_rent, start_date, ...)
VALUES (@vid, '빌려타렌트카', 1448700, '2025-xx-xx', ...);
```

### 7-2. 반납 차량 처리

```sql
-- 투싼
UPDATE vehicles
SET status = 'returned',
    returned_at = NOW(),
    note = CONCAT(IFNULL(note, ''), '\n[반납 2026-04-18] 외부렌탈 종료')
WHERE model = '투싼' AND ownership_type IN ('consignment', 'external_rent');

-- 베뉴
UPDATE vehicles
SET status = 'returned',
    returned_at = NOW(),
    note = CONCAT(IFNULL(note, ''), '\n[반납 2026-04-18] 외부렌탈 종료')
WHERE model = '베뉴' AND ownership_type IN ('consignment', 'external_rent');
```

### 7-3. 마이그레이션 안전도

| 변경 | 색깔 | 판정 |
|------|------|------|
| BMW 520i 재분류 | 🟡 Yellow | 로그 남기고 실행, consignment_contracts 신규 레코드는 사용자에게 렌탈료 계약 시작일 확인 |
| 반납 처리 | 🟢 Green | status 필드만 수정 |

---

## 8. GATE 흐름 매핑 (이번 Phase의 진행 경로)

```
GATE 2 완료 (Researcher 보고 확정)
    ↓
★ 지금 여기 — GATE 3: Planner 설계서 승인 대기 ★
    ↓ [사용자 승인]
GATE 4: Migrator
    - vehicle_market_price 테이블 생성 (🟢 Green)
    - 검증: SHOW CREATE TABLE, 인덱스 확인
    ↓
GATE 5: Generator (4 작업 병렬)
    ① business_rules 4건 수정 + 16건 신규
    ② rent-calc-engine v2.1 (CalcInput 확장 + 3모드 분기)
    ③ 기준표 UI 3열 병행표시 (BusinessRulesManager 우선)
    ④ 자체 9대 시세 시드 입력 + DB 분류 정정
    ↓
GATE 6: Reviewer
    - MySQL-only 규칙 / Raw SQL 파라미터 바인딩 / 최소 권한
    - 신규 외부 API 호출 없음 확인 (크롤러는 Phase 2)
    ↓
GATE 7: Designer
    - Soft Ice Level 3 (색상 틴트 보더) 3열 준수
    - 시인성 (배경 30% 블루/그린/앰버 틴트)
    ↓
GATE 8: Evaluator (evaluate.js)
    - 시나리오 6개: owned-longterm, owned-shortterm, external-longterm,
                    external-shortterm, lease-longterm, 기존 회귀
    - 합격: 8.0/10 이상
    ↓
GATE 9: Deployer (커밋 1회, push 안내)
    ↓
Documenter: HARNESS.md + knowledge/decisions.md 업데이트
    ↓
완료 ✅
```

---

## 9. 위험 요소 & 대응

| # | 위험 | 대응 |
|---|------|------|
| 1 | OVERHEAD % → 고정액 전환 시 기존 견적 재계산 결과 차이 발생 | calculation_version = '2.1.0'으로 버저닝, 기존 견적은 v2.0 유지 |
| 2 | vehicle_market_price에 시세 미입력 차량 → null 폴백 필요 | 코드 방어: 없으면 기존 커브만 사용 (가중치 0) |
| 3 | BMW 520i 재분류 시 기존 견적/계약 영향 | 견적 재계산 선택적, 계약은 유지 |
| 4 | external_rent 모드에서 월렌탈료가 없으면 계산 실패 | input.contract.external_rent_monthly 필수값 검증 + 에러 메시지 |
| 5 | 단기 가동률 60% 반영 시 장기 대비 50% 이상 비싸짐 | INDUSTRY_AVG 대비 검증, 사용자 재확인 |
| 6 | 크롤러 미구현 → vehicle_market_price 비어있음 | Phase 1은 수동 입력(9건), Phase 2에서 크롤러 연결 |

---

## 10. 범위 밖 (Phase 2 이후)

- ❌ 엔카/KB차차차 크롤러 구현 (스케줄러 + 파서) → Phase 2
- ❌ loans 테이블 시드 (transactions 역추적) → Phase 2
- ❌ 운영실적 자동 집계 로직 정교화 → Phase 2 (Phase 1은 이미 있는 calc_snapshots만 사용)
- ❌ vehicle_market_price 외 신규 테이블 추가 → 없음

---

## 11. Must-have 구현 체크리스트 (GATE 5 검증용)

- [ ] M1. vehicle_market_price 테이블 생성 완료 (인덱스 포함)
- [ ] M2. business_rules 4건 수정 SQL 실행 완료
- [ ] M3. business_rules 16건 신규 INSERT 완료
- [ ] M4. rent-calc-engine v2.1: CalcInput.contract에 contract_source/rental_term/utilization_rate 추가
- [ ] M5. calculateExternalRent 함수 신규 구현
- [ ] M6. shortterm 가동률 보정 분기 구현
- [ ] M7. OVERHEAD 계산: 고정액 우선, % 폴백
- [ ] M8. 감가 계산: vehicle_market_price 가중치 반영
- [ ] M9. BusinessRulesManager UI: 3열 구조
- [ ] M10. /api/pricing-standards/suggestions 신규 엔드포인트
- [ ] M11. /api/pricing-standards/actuals 신규 엔드포인트
- [ ] M12. 자체 9대 vehicle_market_price 시드 입력
- [ ] M13. BMW 520i consignment 재분류
- [ ] M14. 투싼·베뉴 returned 처리
- [ ] M15. calculation_version = '2.1.0' 업데이트
- [ ] M16. evaluate.js 시나리오 6개 모두 PASS

---

## 12. 사용자 확인 요청 (GATE 3 승인 포인트)

**결정 필요 사항:**

1. **단기 가동률 반영 방식** — 원가를 `÷ 가동률`로 상승시키는 방식 OK? (60%면 1.67배 상승)
2. **OVERHEAD 완전 전환** — 기존 견적의 OVERHEAD_RATE 3%를 모두 폐기하고 고정액(1,111,111원/대)만 사용? 아니면 병행(프론트에서 선택)?
3. **Phase 1 시세 시드** — 크롤러 없이 관리자가 엔카 수동 검색 후 9건만 입력하는 방식 OK? (Phase 2에서 자동화)
4. **BMW 520i consignment_contracts 시작일** — 빌려타렌트카 계약 시작일 알려주실 수 있나요? (확인 가능한 범위에서)

승인 시 **"넵 가시죠"** 또는 변경 사항 지시 → Migrator 단계 진입.
