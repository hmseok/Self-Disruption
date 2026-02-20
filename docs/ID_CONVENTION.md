# SelfDisruption DB ID 규정

## 1. ID 타입 표준

| 테이블 유형 | PK 타입 | 예시 |
|---|---|---|
| 핵심 엔티티 (회사, 사용자) | `UUID` (gen_random_uuid) | companies, profiles |
| 업무 엔티티 (견적, 계약) | `UUID` (gen_random_uuid) | quotes, contracts, loans |
| 운영 엔티티 (차량, 고객) | `BIGINT` (GENERATED ALWAYS) | cars, customers |
| 참조/기준 데이터 | `BIGSERIAL` | finance_rate_table, tax_rates |
| 감가/시세 데이터 | `BIGINT` | depreciation_db, market_price_db |

## 2. FK 규칙

**FK 컬럼의 타입은 반드시 참조 대상 PK 타입과 일치해야 함**

```
-- 올바른 예:
quotes.company_id  UUID    → companies.id  UUID     ✅
quotes.car_id      BIGINT  → cars.id       BIGINT   ✅

-- 잘못된 예:
quotes.car_id      UUID    → cars.id       BIGINT   ❌
```

## 3. 프론트엔드 ID 처리

```typescript
// 공통 유틸: 빈값만 null 처리, 타입은 DB가 결정
const cleanId = (val: any): any => {
  if (val === null || val === undefined || val === '' || val === 0) return null
  return val
}
```

- ID 값을 프론트에서 UUID/숫자 변환하지 않음
- DB 컬럼 타입에 맞게 Supabase가 자동 처리
- 빈값(null, undefined, '', 0)만 null로 정리

## 4. 새 테이블 생성 시

```sql
-- 핵심/업무 엔티티
CREATE TABLE new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- FK는 참조 테이블 PK 타입과 일치
  car_id BIGINT REFERENCES cars(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 참조 데이터
CREATE TABLE ref_table (
  id BIGSERIAL PRIMARY KEY,
  -- ...
);
```

## 5. 마이그레이션 이력

| 번호 | 내용 |
|---|---|
| 028 | quotes, contracts, pricing_worksheets의 car_id/customer_id를 BIGINT로 통일 |

## 6. quote_detail JSON 스키마

`quotes.quote_detail` 컬럼(JSONB)에 저장되는 견적 상세 데이터 규격:

```typescript
interface QuoteDetail {
  // === 차량 정보 (FK 없이도 조회 가능) ===
  car_info: {
    brand: string        // 브랜드 (현대, 기아 등)
    model: string        // 모델명
    trim: string         // 트림
    year: number         // 연식
    fuel: string         // 연료 (가솔린, 디젤, 전기 등)
    engine_cc: number    // 배기량
    mileage: number      // 주행거리 (km)
  }

  // === 가격 ===
  factory_price: number       // 출고가
  purchase_price: number      // 매입가
  total_acquisition_cost: number  // 총 취득원가

  // === 계약 조건 ===
  term_months: number         // 계약기간
  annualMileage: number       // 연간 약정주행 (만km)
  baselineKm: number          // 기준주행 (만km/년)
  deposit: number             // 보증금
  prepayment: number          // 선납금
  deductible: number          // 면책금
  margin: number              // 마진 (원/월)
  driver_age_group: string    // 운전자 연령 (26세이상 등)
  maint_package: string       // 정비 패키지 (self, oil_only, basic, full)

  // === 금융 ===
  loan_amount: number
  loan_rate: number           // %
  investment_rate: number     // %

  // === 감가 ===
  dep_curve_preset: string    // 감가 커브 프리셋
  current_market_value: number
  end_market_value: number
  year_dep: number            // 현재 연식감가율 %
  year_dep_end: number        // 종료시 연식감가율 %
  total_dep_rate: number      // 현재 총감가율 %
  total_dep_rate_end: number  // 종료시 총감가율 %

  // === 잔존가치 ===
  residual_rate: number       // 잔존가치 설정율 %
  residual_value: number      // 잔존가치 (원)
  buyout_price: number        // 인수가 (원)

  // === 원가 내역 ===
  cost_breakdown: {
    depreciation: number      // 월 감가
    finance: number           // 월 금융비용 합계
    loan_interest: number     // 월 대출이자
    opportunity_cost: number  // 월 기회비용
    insurance: number         // 월 보험료
    maintenance: number       // 월 정비비
    tax: number               // 월 자동차세
    risk: number              // 월 리스크 적립
    deposit_discount: number  // 보증금 할인
    prepayment_discount: number // 선납금 할인
    discount: number          // 총 할인
  }

  // === 산출 결과 ===
  suggested_rent: number      // 공급가 (원/월)
  cost_base: number           // 취득원가
  purchase_discount: number   // 매입할인율 %
  excess_mileage_rate: number // 초과주행 요금 (원/km)

  // === 메타 ===
  note: string | null         // 견적 메모
  worksheet_id: string | null // 연결된 워크시트 ID
}
```

### JSON 크기 관리

- 현재 구조: ~2~3KB (적정)
- 이미지/파일 데이터 절대 포함 금지
- 배열 데이터는 최소화 (시장비교 등은 별도 테이블)
- 중첩 3단계 이내 유지
