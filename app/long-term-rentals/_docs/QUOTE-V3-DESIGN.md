# QUOTE-V3 설계서 — 장기렌트 견적 전면 재설계

> **상태**: PR-Q2-1 (분석·설계) — 사용자 GO 대기  
> **작성**: 2026-05-26, trusting-relaxed-keller (operations 세션)  
> **선행**: PR-Q1 (long_term_quotes) — 폐기 예정. 기존 `quotes` / `RentPricingBuilder` / `operational-learning` 도 폐기.

## 0. 배경 / 의사결정

### 사용자 명시 (2026-05-26)
- 「렌트 견적자체도 여기서 진행하고 필요시 영업사원들에게 일부 계약페이지를 열어주는게 나을것같고 지금 장기 플로우에서 견적이 추가 되는 게 좋을것같아요」
- 「우리는 원가 분석이 들어가야합니다」
- 「설정 및 구성이 너무 복잡하여 리뉴얼은 필요했던 내용입니다. 분석후 재구성 또는 재적용이 필요합니다」

### 결정 사항 (Q&A 응답)
| 질문 | 결정 |
|------|------|
| a) 새 테이블명 | **`lt_quotes`** (장기 전용 새 테이블) — 기존 `quotes` 는 참고만 |
| b) 단기·사고대차 통합 여부 | **분리** — 단기 = 사고대차이므로 별개 (`fmi_rentals` / `claims` 유지) |
| c) operational-learning | **폐기** — 새 모듈에서 처음부터 안 가져감 |
| d) 기존 `quotes` 데이터 | **거의 없음 — 폐기 가능** (마이그레이션 불필요) |
| e) 신차 입력 방식 | **3가지 다** — 기존차량 / 신차 카탈로그 / 신차 AI 캡쳐 |
| f) AI 파싱 비용 | **첫 추출 후 자동 카탈로그 저장** → 같은 차종 재호출 시 카탈로그 fetch. Rule 1 안전망 (N=1 dry-run + 사용자 보고) 적용 |
| g) 시세 자동 조회 | **카탈로그 등록 시 1회만 호출 + 캐시** (market-sync) |
| 기타) 메뉴 위치 | `/long-term-rentals` 안의 견적 탭만 — 사이드바 `mod-quotes` 폐기 |

### 폐기 사유 정리
- 기존 `quotes` + `RentPricingBuilder` (4,135줄 wizard / 9탭 설정) — 영업이 견적 1건당 클릭 50+ 회
- 기존 `long_term_quotes` (PR-Q1) — 작업물이지만 단순화 부족 + 원가 통합 없음
- `operational-learning` (1,791+ 줄) — 실측 학습 모듈, 사용자 결정에 의해 폐기

## 1. 운영 사실 인지 (Rule 25)

### 장기렌트 영업 특성
- 영업 1인이 1건 견적을 카톡/이메일로 빠르게 발송하는 흐름
- 견적 대비 채택률이 중요 (rejected/expired 가 다수)
- 영업이 입력한 차량가/기간 → 회사 마진 즉시 확인 가능해야 (역설계 방지)
- 신차 vs 기존차량 흐름 다름:
  - **신차**: 견적 → 계약 → 출고 대기 → 운영중 → 종결
  - **기존차량**: 견적 → 계약 → 운영중 → 종결

### 단기·사고대차 분리 이유
- 단기렌트 = 사고대차 청구 (롯데/현대해상/삼성 등 보험사 청구)
- 일일 요금표 (롯데 단기 등) 별도 흐름 — 이미 `claims-tab` + `lib/lotte-short-term-rates.ts` 운영
- 견적 발급/공유 흐름 없음 (보험사 청구만)

## 2. 페르소나 + 시나리오 (Rule 26)

### 페르소나
| 페르소나 | 역할 | 진입점 |
|---------|------|--------|
| **영업사원** | 견적 작성 / 발송 / 채택 추적 | `/long-term-rentals` → 견적 탭 |
| **관리자** | 계약 전환 / 운영중 관리 / 만기 | `/long-term-rentals` → 계약·운영 탭 |
| **고객** | 공유 링크로 견적 조회 / PDF 다운로드 | `/public/lt-quote/[token]` (무인증) |

### 시나리오 — 신차 견적 (예시)

```
[S1] 영업 김OO 이 새 견적 작성
  → 견적 탭 「+ 신규 견적」 클릭
  → 모달 진입:
    좌측 입력:
      · 고객: 박OO / 010-1234-5678 / 회사명
      · 계약유형: 신차구입
      · 예정 차종: 현대 그랜저 (브랜드/모델/연료/CC 선택)
      · 매입가: 45,000,000 (또는 시세 자동 조회)
      · 기간: 36개월 / 주행거리: 20,000km/년
      · 계약형식: 반납형 (또는 인수형)
    우측 자동 산출 (실시간):
      · 7대 원가 (감가/금융/보험/정비/세금/리스크/간접)
      · 적정 월 렌트료: 1,180,000원 (VAT 포함)
      · 마진율: 12% / IRR: 8.5% / 손익분기: 28개월
      · "이 가격으로 적용" 버튼 → 좌측 월렌트료 필드 자동 채움
  → 영업이 협상가 1,200,000원 으로 수정 (좌측 직접 입력)
  → 우측 마진 자동 갱신 (13.7%)
  → 「저장」 → status='draft'

[S2] 영업이 「📤 발송」 클릭
  → status='sent' + share_token 발급
  → 공유 링크 카톡으로 박OO에게 전달

[S3] 박OO 가 링크 클릭 → /public/lt-quote/[token]
  → A4 견적서 (회사명/차량/기간/금액)
  → views++ + last_viewed_at=NOW
  → 박OO 가 「PDF 저장」 → window.print()

[S4] 박OO 가 OK → 영업이 「✅ 수락」 → status='accepted'

[S5] 관리자가 「🔗 계약 전환」 클릭
  → long_term_rentals 생성 (신차 → status='pending_delivery')
  → quote.status='converted' + converted_to_rental_id 세팅

[S6] 차량 출고 → 「계약·운영」 탭에서 차량번호 등록 → status='active'
```

## 3. 데이터 모델 — `lt_quotes`

```sql
CREATE TABLE IF NOT EXISTS lt_quotes (
  id                       VARCHAR(36) PRIMARY KEY,

  -- 식별
  quote_no                 VARCHAR(40) NULL,
  status                   VARCHAR(20) NOT NULL DEFAULT 'draft',
       -- draft|sent|accepted|rejected|expired|converted
  contract_type            VARCHAR(20) NOT NULL DEFAULT '기존차량',
       -- 신차구입|기존차량
  rent_type                VARCHAR(20) NOT NULL DEFAULT 'return',
       -- return (반납형) | buyout (인수형)

  -- 고객
  customer_name            VARCHAR(100) NOT NULL,
  customer_phone           VARCHAR(30)  NULL,
  customer_email           VARCHAR(100) NULL,
  customer_company         VARCHAR(100) NULL,

  -- 차량 (기존: vehicle_id, 신차: vehicle_spec_*)
  vehicle_id               VARCHAR(36)  NULL,             -- cars.id (기존차량)
  vehicle_car_number       VARCHAR(30)  NULL,
  vehicle_brand            VARCHAR(50)  NULL,             -- 신차/기존 공통
  vehicle_model            VARCHAR(100) NULL,
  vehicle_trim             VARCHAR(100) NULL,
  vehicle_year             INT          NULL,
  vehicle_fuel             VARCHAR(20)  NULL,             -- 가솔린|디젤|하이브리드|전기
  vehicle_engine_cc        INT          NULL,
  vehicle_color            VARCHAR(50)  NULL,
  vehicle_options_text     VARCHAR(255) NULL,             -- 옵션 패키지 메모

  -- 매입가 / 시장가 (원가 산출 입력)
  purchase_price           DECIMAL(12,0) NULL,            -- 매입가 (회사)
  market_price             DECIMAL(12,0) NULL,            -- 시장가 (참조)

  -- 계약 조건
  start_date               DATE         NULL,
  months                   INT          NULL,             -- 36/48/60
  end_date                 DATE         NULL,             -- 계산값
  annual_km                INT          NULL,             -- 15000/20000/30000
  residual_rate            DECIMAL(5,2) NULL,             -- 인수형 잔존가율 %

  -- 영업 입력 (협상가 / 보증금 / 선납)
  monthly_fee              DECIMAL(12,0) NULL,            -- 최종 월 렌트료 (VAT 포함)
  deposit                  DECIMAL(12,0) NULL,
  upfront_months           INT           NULL,            -- 선납월수
  delivery_fee             DECIMAL(12,0) NULL,
  insurance_option         VARCHAR(100)  NULL,

  -- 자동 산출 결과 (rent-calc-engine — JSON 보관)
  cost_breakdown_json      JSON          NULL,
       -- { depreciation, finance, insurance, maintenance, tax_inspection, risk, overhead, discount }
  suggested_rent           DECIMAL(12,0) NULL,            -- 엔진 산출 적정가 (VAT 별도)
  suggested_rent_with_vat  DECIMAL(12,0) NULL,            -- 엔진 산출 적정가 (VAT 포함)
  margin_rate              DECIMAL(5,2)  NULL,            -- 마진율 %
  irr_annual               DECIMAL(5,2)  NULL,            -- 연 IRR %
  breakeven_months         INT           NULL,
  competitive_index        DECIMAL(5,2)  NULL,            -- 시장 경쟁력 (1.0=평균)

  -- 발송 / 유효 / 공유
  sent_at                  DATETIME     NULL,
  valid_until              DATE         NULL,
  owner_id                 VARCHAR(36)  NULL,             -- 영업 담당
  owner_name               VARCHAR(50)  NULL,
  share_token              VARCHAR(64)  NULL,
  share_views              INT          NOT NULL DEFAULT 0,
  share_last_viewed_at     DATETIME     NULL,

  -- 전환
  converted_to_rental_id   VARCHAR(36)  NULL,             -- long_term_rentals.id
  converted_at             DATETIME     NULL,

  -- 메타
  memo                     TEXT         NULL,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_ltq2_share_token (share_token),
  KEY idx_ltq2_status (status),
  KEY idx_ltq2_customer (customer_name),
  KEY idx_ltq2_owner (owner_id),
  KEY idx_ltq2_converted (converted_to_rental_id)
);
```

### PR-Q1 폐기 SQL (별도 마이그레이션)
```sql
DROP TABLE IF EXISTS long_term_quotes;
-- (사용자 결정: PR-Q1 데이터 거의 없음 — 안전)
```

## 4. 원가 산출 엔진 — `lib/quote-cost.ts` (정제 추출)

### 추출 원칙
- 기존 `lib/rent-calc-engine.ts` (1,593줄) 의 **필요 함수만** 발췌:
  - `calculateRentCost` (메인) → 단순 입력 인터페이스로 wrap
  - `calculateAcquisitionCost` (취득원가)
  - `lookupCostStandard` (기준표 조회)
- 14개 DB 기준표 fetch 는 `lib/quote-cost-data.ts` 로 분리 (캐시 가능)
- 단위테스트 (`__tests__/quote-cost.test.ts`) 로 회귀 방지

### 새 입력 인터페이스 (단순화)
```ts
export interface QuoteCostInput {
  // 영업이 입력하는 최소 6개
  purchase_price: number       // 매입가
  brand: string                // 현대 / 기아 / BMW ...
  model: string
  fuel: 'gasoline' | 'diesel' | 'hybrid' | 'ev'
  engine_cc: number
  term_months: 24 | 36 | 48 | 60
  annual_km: number            // 15000 / 20000 / 30000
  rent_type: 'return' | 'buyout'
  // 선택 입력
  deposit?: number
  upfront_months?: number
}

export interface QuoteCostResult {
  cost_breakdown: {
    depreciation: number    // 월
    finance: number
    insurance: number
    maintenance: number
    tax_inspection: number
    risk: number
    overhead: number
    discount: number        // 선납/보증금 할인 (음수)
  }
  suggested_rent: number          // VAT 별도
  suggested_rent_with_vat: number // VAT 포함
  margin_rate: number             // %
  irr_annual: number              // %
  breakeven_months: number
  competitive_index: number
}
```

## 4-b. 신차 차량 정보 입력 흐름 (3가지 진입)

> **재사용 자산**: `new_car_prices` 테이블, `/api/parse-quote` (Gemini Vision), `/api/new-car-prices/*`, `/api/cost-standards/market-sync`, `NewCarResult` 타입 — 모두 폐기 X, 그대로 사용.

### 진입 1: 「기존 차량」 (cars 테이블 검색)
```
차량번호 입력 → cars.id/brand/model/year/fuel/cc 자동 채움
→ purchase_price 는 cars.purchase_price (있으면) 또는 영업 입력
```

### 진입 2: 「신차 — 카탈로그」 (new_car_prices 에서 선택)
```
브랜드 → 모델 → 연식 → 트림 → 변형(variant: 가솔린/디젤/하이브리드/전기, 개별소비세 5%/3.5%)
→ 외장 색상 / 내장 색상 / 옵션 패키지 (다중 선택)
→ base_price (VAT 포함 출고가) 표시
→ 매입가 입력 필드 (영업이 할인된 실제 가격 — 원가 산출의 핵심 입력)
```

### 진입 3: 「신차 — AI 캡쳐」 (PDF/이미지 업로드 → Gemini 파싱)
```
1. 영업이 차량 견적서 PDF 또는 카탈로그 사진 업로드 (≤ 10MB)
2. POST /api/parse-quote (Gemini 2.0 Flash)
   - 응답: NewCarResult (brand, model, year, variants, trims, options, colors)
3. 모달에 추출 결과 미리보기 (트림 목록 / 색상 / 옵션)
4. 영업이 트림 + 변형 + 색상 + 옵션 선택
5. ☑ "카탈로그에 저장" (기본 ON) 체크 시:
   - POST /api/new-car-prices 자동 호출 → new_car_prices 등록
   - 첫 등록 시 동시에 /api/cost-standards/market-sync (1회) → 시세 캐시
6. 매입가 입력 (base_price 와 별도, 영업이 실제 매입가)
```

### Rule 1 안전망 (외부 LLM 호출)
- **N=1 dry-run**: 첫 PR-Q2-4 통합 시 실제 PDF 1건으로 추출 결과 raw 샘플 사용자 보고
- **break 조건**: 추출 실패 (variants[] 비어있음) 시 즉시 중단 + 사용자 보고
- **비용 노출**: 모달 헤더에 "AI 파싱: Gemini Flash · ~₩1~3 / 호출" 표시
- **캐시 우선**: 같은 brand+model+year 가 카탈로그에 있으면 AI 호출 X (카탈로그 fetch)

### 시세 자동 조회 (g 결정)
- AI 파싱으로 신차 등록 시 동시에 1회 `/api/cost-standards/market-sync` 호출
- 결과는 `cost_standards` 테이블 캐시 (이미 운영 중)
- 새 견적 시 별도 조회 X — 카탈로그 fetch 시 자연스럽게 캐시된 시세 활용
- 사용자가 「시세 새로고침」 버튼 (선택) → 강제 재호출

## 5. UI 구조 — 모달 (좌:입력 / 우:실시간 원가)

```
┌─────────────────────────────────────────────────────────────┐
│ 📝 장기렌트 견적 작성                              [✕]      │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────┐  ┌────────────────────────┐   │
│ │ 좌측 입력                  │  │ 우측 자동 원가 산출      │   │
│ │                          │  │                        │   │
│ │ [고객 정보]                │  │ 💰 월 렌트료 (VAT 포함) │   │
│ │  - 이름 * / 연락처 / 회사  │  │   1,180,000원          │   │
│ │                          │  │   (협상 시: 좌측 직접 입력) │   │
│ │ [차량 정보]                │  │                        │   │
│ │  - 계약유형 (신차/기존)     │  │ 📊 원가 구성 (월)        │   │
│ │  - 브랜드 / 모델 / 연료    │  │  • 감가상각  524,000    │   │
│ │  - CC / 연식              │  │  • 금융비용  168,000    │   │
│ │  - 색상 / 옵션 텍스트       │  │  • 보험료    142,000    │   │
│ │  - 매입가 (원가 산출 핵심)   │  │  • 정비비     74,000    │   │
│ │                          │  │  • 세금·검사   31,000    │   │
│ │ [계약 조건]                │  │  • 리스크적립  21,000    │   │
│ │  - 시작일 / 기간 / 만기일   │  │  • 간접비     53,000    │   │
│ │  - 주행거리 / 잔존가율       │  │                        │   │
│ │                          │  │ 📈 분석                  │   │
│ │ [영업 입력 (협상가)]        │  │  마진율: 12%            │   │
│ │  - 월 렌트료 (직접 가능)     │  │  IRR: 8.5%             │   │
│ │  - 보증금 / 선납 / 인도비   │  │  손익분기: 28개월        │   │
│ │  - 보험 옵션 텍스트         │  │  경쟁력: 0.95 (시장 우위) │   │
│ │                          │  │                        │   │
│ │ [발송]                    │  │ [이 가격으로 적용 ↓]    │   │
│ │  - 유효기간 / 메모          │  │                        │   │
│ └──────────────────────────┘  └────────────────────────┘   │
│ [닫기]    [거부] [수락] [발송] [계약 전환]   [저장]          │
└─────────────────────────────────────────────────────────────┘
폭: 1100~1200px (현재 720 → 확장)
```

### 자동 산출 트리거
- 매입가/브랜드/모델/연료/CC/기간/주행거리 중 하나 변경 시 디바운스 300ms → 우측 자동 갱신
- `lib/quote-cost.ts` 의 `calculateQuoteCost` 호출

### 「이 가격으로 적용」 동작
- 좌측 `monthly_fee` 필드에 `suggested_rent_with_vat` 자동 입력
- 영업이 그 위에서 추가 협상 (값 직접 수정)
- 수정하면 우측 마진율 자동 재계산

## 6. API 인벤토리

### 신규 (PR-Q2-4)
```
GET    /api/lt-quotes              ?status=&q=  (목록)
POST   /api/lt-quotes              (신규 — customer_name 필수)
GET    /api/lt-quotes/[id]         (상세)
PATCH  /api/lt-quotes/[id]         (수정 — ALLOWED_FIELDS)
DELETE /api/lt-quotes/[id]         (삭제)
POST   /api/lt-quotes/[id]/send    (status='sent' + share_token)
POST   /api/lt-quotes/[id]/convert (long_term_rentals 생성)
POST   /api/lt-quotes/calculate    (원가 자동 산출 — input → result, save X)
GET    /api/public/lt-quote/[token] (공개 조회, 무인증)
```

### 재사용 (그대로, 폐기 X)
```
GET/POST /api/new-car-prices         신차 카탈로그 CRUD (캐시)
GET/PATCH/DELETE /api/new-car-prices/[id]
POST     /api/parse-quote            AI 파싱 (Gemini Vision)
POST     /api/cost-standards/market-sync   시세 자동 조회 (카탈로그 등록 시 1회)
```

### 폐기 (PR-Q2-5)
```
- /api/quotes/* (route, [id], send, share, timeline, generate-pdf)
- /api/long-term-quotes/* (PR-Q1 4개)
- /api/public/quote/[token] / sign
- /api/public/contract/[token]/pdf — 기존 quote 의존
- /api/public/long-term-quote/[token] (PR-Q1)
```

### 의존 갱신 (PR-Q2-5)
```
- /api/dashboard         — quotes.rent_fee → lt_quotes.monthly_fee 로 갱신
- prisma/schema.prisma   — Quote / QuoteShareToken / QuoteLifecycleEvent 모델 제거
```

## 7. 폐기 대상 목록 (Q2-5)

| 영역 | 대상 | 처리 |
|------|------|------|
| 페이지 | `/quotes` (QuoteListMain 1,525줄) | 폐기 |
| 페이지 | `/quotes/create`, `/new`, `/[id]`, `/invoice`, `/short-term`, `/simple` | 폐기 |
| 페이지 | `/quotes/pricing` (RentPricingBuilder 4,135줄) | 폐기 |
| 페이지 | `/quotes/operational-learning` (전체) | 폐기 |
| 페이지 | `/public/quote/[token]` | 폐기 |
| 페이지 | `/public/long-term-quote/[token]` (PR-Q1) | 폐기 |
| 페이지 | `/long-term-rentals/_components/QuotesTab.tsx` (PR-Q1) | 재작성 |
| API | 위 인벤토리 폐기 라우트 | 폐기 |
| 테이블 | `quotes`, `quote_share_tokens`, `quote_lifecycle_events` | DROP (사용자 GO) |
| 테이블 | `long_term_quotes` (PR-Q1) | DROP |
| 메뉴 | `mod-quotes`, `mod-operational-learning`, `/quotes/pricing` | 제거 |
| PageTitle | `/quotes/*` 경로 | 제거 |
| 라이브러리 | `lib/quote-utils.ts`, `lib/contract-terms.ts` | 정제 (필요 함수만) |

## 8. 페이즈 분할 (5 PR)

| PR | 작업 | 산출물 | GO 지점 |
|----|------|--------|--------|
| **Q2-1** (지금) | 본 설계서 | `_docs/QUOTE-V3-DESIGN.md` | **사용자 GO** |
| **Q2-2** | `lib/quote-cost.ts` + `lib/quote-cost-data.ts` 추출 + 단위테스트 | 정제된 엔진 모듈 | tsc + 테스트 PASS |
| **Q2-3** | `lt_quotes` 마이그레이션 + PR-Q1 DROP SQL | 2개 .sql | DBeaver 실행 |
| **Q2-4** | 새 API 9개 + 모달 UI (좌/우) + 공개 페이지 | 모듈 코드 | 시각 검수 |
| **Q2-5** | 폐기 (quotes/operational-learning/long_term_quotes/공유라우트) + 대시보드/PageTitle/menu 갱신 | 정리 commit | 배포 검수 |

## 9. 회귀 케이스 / 시뮬레이션 (Rule 8/9)

### 시뮬레이션
- **STEP 0**: 영업 김OO 신차 견적 (그랜저 가솔린 2500CC, 36개월, 20000km)
- **STEP 1**: 모달 입력 → 우측 자동 산출 (가정: 1,180,000원 VAT 포함)
- **STEP 2**: 「이 가격으로 적용」 → 좌측 monthly_fee 채움
- **STEP 3**: 영업이 1,200,000원 으로 수정 → 우측 마진율 13.7% 로 자동 갱신
- **STEP 4**: 저장 → status='draft' (cost_breakdown_json + suggested_rent 저장)
- **STEP 5**: 발송 → share_token 발급 → 카톡 전달
- **STEP 6**: 고객 링크 클릭 → /public/lt-quote/[token] → views++
- **STEP 7**: 수락 → 계약 전환 → long_term_rentals#pending_delivery 생성

### 회귀 케이스 (`regression-cases/`)
- `2026-05-26-quote-v3-cost-engine-fidelity.md` — Q2-2 엔진 추출 시 산출값이 기존 엔진과 동일해야 (단위테스트)
- `2026-05-26-quote-v3-share-token-collision.md` — Q2-4 새 share_token 과 기존 token 형식 충돌 없어야

## 10. 영향 모듈 / 다른 세션 협업 (Rule 21)

### 본 세션 작업 영역 (자율 commit)
- `app/long-term-rentals/`
- `app/api/lt-quotes/`
- `app/api/public/lt-quote/`
- `app/public/lt-quote/`
- `lib/quote-cost.ts`, `lib/quote-cost-data.ts`
- `lib/__tests__/quote-cost.test.ts`
- `migrations/2026-05-26_Q2_*.sql`

### 공통 파일 (사용자 사전 보고 의무)
- `lib/menu-registry.ts` (mod-quotes 제거)
- `app/components/PageTitle.tsx` (/quotes/* 경로 제거)
- `app/components/auth/ConditionalLayout.tsx` (/public/long-term-quote 제거, /public/lt-quote 추가)
- `app/api/dashboard/route.ts` (quotes → lt_quotes 의존 갱신)
- `prisma/schema.prisma` (Quote / QuoteShareToken / QuoteLifecycleEvent 제거)

### 다른 세션 영향 가능성
- `quotes` 테이블 의존 코드가 다른 세션에 있을 수 있음 → grep 으로 확인 후 보고
- 폐기 전 사용자 최종 확인 필수

## 11. 검증 절차

### Q2-2 (엔진)
- `npm run lint:harness` 통과
- 단위테스트 5+ 케이스 (모닝/아반떼/쏘나타/그랜저/BMW 5시리즈)
- 기존 SimulationPanel 결과와 ±1% 오차 이내

### Q2-3 (마이그)
- DBeaver 실행 후:
  - `SELECT COUNT(*) FROM information_schema.tables WHERE table_name='lt_quotes';` → 1
  - `SHOW INDEX FROM lt_quotes;` → PK + UNIQUE + 4 idx
  - `SELECT COUNT(*) FROM information_schema.tables WHERE table_name='long_term_quotes';` → 0

### Q2-4 (UI)
- 시각 검수 (Rule 6) — 사용자 스크린샷 또는 Chrome MCP
  - 모달 좌·우 레이아웃 1100px 이상에서 깨지지 않음
  - 실시간 산출 디바운스 300ms
  - 「이 가격으로 적용」 동작
  - 공개 견적서 A4 인쇄 미리보기

### Q2-5 (폐기)
- `/quotes` → 404 또는 redirect 동작
- 대시보드 통계 lt_quotes 기반으로 정상 표시
- `npm run lint:harness` 통과 (broken-call 0)

## 12. 변경 이력

| 날짜 | 작성자 | 내용 |
|------|--------|------|
| 2026-05-26 | trusting-relaxed-keller | 초안 작성 (PR-Q2-1) |
