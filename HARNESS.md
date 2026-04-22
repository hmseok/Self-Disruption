# FMI ERP — 기능 현황 (HARNESS.md)

> 마지막 업데이트: 2026-04-22 (Finance Consolidation v1 — Phase H 탭 디자인 토큰화 + Phase I 301 리다이렉트 + 전역 빠른 입력)

---

## Finance Consolidation v1: Phase H + I (2026-04-22) — 커밋 `e665dfa`, `0011142`

재무 모듈 하위의 5개 분산 페이지(`/finance`, `/finance/upload`, `/finance/uploads`, `/finance/cards`, `/finance/codef`)를 단일 허브 `/finance/transactions?tab=*`로 통합. URL 라우팅은 301로 강제하고, 본문은 `_tabs` 재수출 래퍼로 재사용. 모든 탭에 Soft Ice 디자인 토큰 적용.

### Phase H — 탭별 본문 이전 + 디자인 시스템 적용

- [x] **H2 — ClassifyTab** (`044f280`) — localStorage → FinanceContext + URL 쿼리 양방향 동기화
  - `upload/page.tsx` 4개 useEffect persistence 제거 → Context/Provider 기반 dual-mode
  - SourceFilter 유니온 확장: `'all'|'bank'|'card'|'manual'|'unclassified'|'cat_matched'|'fully_matched'`
  - `useFinanceUrlSync` VALID_SOURCE 배열 동기 업데이트
  - 배지 컴포넌트 추출(renderCategoryBadge/renderRelatedBadge)은 20개 의존 prop로 별도 작업으로 deferred
- [x] **H3 — UploadsTab** (`e2d031c`) — onMouseEnter/Leave 런타임 스타일 변경을 CSS :hover로 전환
  - 주입 `<style>` 블록: `.uploads-tx-row[data-tone]` + `.uploads-btn-{ghost|primary-tint|danger-tint|primary}:hover`
  - 상태 pill을 `pillStyle('success'|'danger'|'info'|'neutral')` 헬퍼로 통일
  - 442→459줄, 7개 pill/5개 hover 인라인 구문 제거
- [x] **H4 — CardsTab** (`43ff1d6`) — 스코프 제한(2510줄) 헤더/탭/액션 버튼 디자인 토큰화
  - `.cards-btn-{primary|ghost}` + `.cards-main-tab[data-active]` + `.cards-flag-row:hover` 주입
  - 외부 wrapper `bg-#f9fafb` → `COLORS.bgGray`, SVG/타이틀 색상 토큰
  - 카드 지갑/한도 모달/급여 탭(2000+줄)은 H4b로 deferred
- [x] **H5 — CodefTab** (`e665dfa`) — 5개 카드 섹션에 violet GLASS.L3 틴트 (CLAUDE.md §10 "플러그인/확장 기능" 카테고리)
  - `.codef-card` 유틸리티 클래스로 `bg-gray-50 rounded-lg p-6 border-black/[0.06]` 5회 반복 통합
  - `.codef-btn-{primary|ghost|success}` + `.codef-segment[data-active]` + `.codef-tx-row:hover`
  - 연동하기(BTN.md+primary), 지금 동기화(BTN.lg+success), 로그인 방식 segmented control
  - 기관/상태 pill 6곳 → `pillStyle('info'|'primary'|'success'|'danger')`
  - Tailwind `bg-emerald/red-50` 메시지 배너 → `COLORS.bgGreen/bgRed` 토큰

### Phase I — 301 리다이렉트 + 전역 빠른 입력 (`0011142`)

- [x] **Next.js `redirects()`** — 5건 permanent redirect로 외부 북마크/링크 보존
  - `/finance` → `/finance/transactions?tab=dashboard`
  - `/finance/upload` → `?tab=classify`
  - `/finance/uploads` → `?tab=uploads`
  - `/finance/cards` → `?tab=cards`
  - `/finance/codef` → `?tab=codef`
  - 레거시 `*.tsx`는 `_tabs`에서 재수출로 유지 → 내부 import는 영향 없이 URL만 허브로 강제
- [x] **전역 "⚡ 빠른 입력" 진입점** — `ClientLayout`에 통합
  - 사이드바 대시보드 바로 아래 에메랄드 그라디언트 버튼 (`#10b981 → #059669`)
  - **Alt+N** 키보드 단축키 (input/textarea/contentEditable 포커스 시 무시)
  - 전역 `<QuickTxModal>` 레이아웃 최하단 렌더 (어느 페이지에서든 즉시 거래 기록)
  - `initialStatus="completed"` 기본값으로 즉시 확정 저장 경로

### 검증

- [x] **TypeScript**: 154 error baseline 유지 (Phase H2-H5, Phase I 전체에서 회귀 0건)
- [x] **evaluate.js**: 9.4/10 PASS (no-browser 모드, 합격선 8.0 초과)
  - UI/UX 10/10, 기능완성도 12/12, 코드품질 6/12, 반응형 8/8, 보안 10/10, 디자인품질 14/14, 독창성 10/10, 완성도 12/12, 기능성 12/12
  - ❌ 잔여: SQL Injection 패턴 67개 파일 (기존 baseline, #72에서 일부 패치됨)
  - ⚠️ 경고: console.log 44개 파일
- **커밋**: `e665dfa` (Phase H5), `0011142` (Phase I) pushed → Cloud Run 배포 완료

---

## Phase 2A: 배차·대차 엑셀 인테이크 + 입금매칭 (2026-04-19)

- [x] **MarketPriceTab 콤마 버그 수정** — 외부시세/자체매입가/블렌드 모두 `Number()` 캐스팅 (BIGINT serialize 대응)
- [x] **심플 견적 UI** — `/app/quotes/simple/page.tsx` (~550줄). useRefTables 병렬 로더, operational-learning snapshot 논블로킹 훅 자동 연결
- [x] **배차·대차 엑셀 일괄 인테이크 API** — `POST /api/operations/intake-bulk`
  - 4 fleet group (마춤카/빌려타/부가세(캐피탈)/따봉) 자동 구분 → `fmi_vehicles.rental_company` 저장
  - 차량번호 정규화 ("(1) 125하4239 / G80 2.5(G)" → "125하4239")
  - "이름/010-xxxx-xxxx" 연락처 파싱
  - 3단 upsert: fmi_vehicles (unique car_number) → fmi_accidents (customer_car_number+receipt_no) → fmi_rentals (vehicle_id+dispatch_date ±3h)
  - `dry_run` 모드로 검증 먼저 실행 가능
- [x] **배차 엑셀 인테이크 UI** — `/app/operations/intake-bulk/page.tsx`
  - 브라우저 XLSX 파서 (cellDates:true), 헤더 행 자동탐지 (매칭 점수 최대 행)
  - 시트명 → fleet group 자동 추론 + 편집 가능
  - 12행 프리뷰 테이블 + Dry Run / 실제 저장 2단 버튼
  - /operations 메인 DcToolbar에 "📥 대차 엑셀 일괄" 진입점
- [x] **4축 입금매칭 helper** — `POST /api/transactions/dispatch-match`
  - 입금 적요에서 한국 차량번호 정규식 추출 (12~123[가-힣]1234)
  - fmi_rentals의 customer_car_number(사고차량) OR vehicle_car_number(대차차) 양방 매칭
  - 신뢰도 스코어링: 차량번호(0.4) + 기간(0.4) + 상태(0.1) + final_claim_amount 근접도(±5%:0.2 / ±15%:0.1)
  - axis='revenue' + suggested_category 반환 → 기존 classification UI 훅킹 대상
- [x] **Typecheck PASS**, **evaluate.js 9.4/10 PASS**

---

## 모듈 상태

| 모듈 | 페이지 | API | DB | 상태 |
|------|--------|-----|-----|------|
| **대시보드** | 1 | ✅ | ✅ | 🟢 운영 중 |
| **차량 관리** | 6 | ✅ | ✅ | 🟢 운영 중 |
| **운영/정비** | 6 | ✅ | ✅ | 🟢 운영 중 |
| **영업/견적** | 12 | ✅ | ✅ | 🟢 **v2.1 엔진 (3×2 매트릭스) + 외부시세 블렌드** |
| **계약** | 4 | ✅ | ✅ | 🟢 운영 중 |
| **고객** | 1 | ✅ | ✅ | 🟢 운영 중 |
| **재무/정산** | 16 | ✅ | ✅ | 🟢 운영 중 |
| **관리자/HR** | 13 | ✅ | ⚠️ 일부 테이블 확인 | 🟡 직원초대 수정 완료 |
| **데이터관리** | 6 | ✅ | ✅ | 🟢 운영 중 |
| **기준표설정** | 1 | ✅ | ✅ | 🟢 **통합 대시보드 + 시뮬레이션** |
| **보험/사고** | 7 | ✅ | ✅ | 🔵 구현 완료, 네비 숨김 |
| **투자** | 5 | ✅ | ⚠️ | 🟡 정산 로직 검증 필요 |
| **Codef 연동** | 1 | ✅ | ⚠️ | 🟡 API 키 + 테이블 확인 |

---

## 최근 완료 작업

### Phase 1: 엔진 v2.1 확장 + 외부시세 기준표 + 3-column UI (2026-04-18) — 커밋 `2d8ee56` pushed
- [x] **엔진 v2.1** — `lib/rent-calc-engine.ts` 3×2 매트릭스 (contract_source × rental_term)
  - `contract_source` 필드 추가 (owned / external / consignment)
  - `rental_term` 필드 추가 (long / short)
  - 단기: 원가 ÷ `utilization_rate` (A안)
  - 외부매입: `external_rent_monthly` 입력값 기반 + OVERHEAD 3-tier 적용
  - **마진 공식 정정**: `(외부렌탈료 + 간접비) × EXTERNAL_RENT_MARGIN_RATE` (총원가 기반) — 종전 adjustedRent만 기준이던 버그 수정
- [x] **BusinessRules 연동** — OVERHEAD_PER_VEHICLE(1,111,111) > TOTAL/FLEET_SIZE > overhead_rate% 3-tier
- [x] **vehicle_market_price 테이블 시드** — 9차종 초기값 (source='initial_seed', 크롤러가 향후 덮어씀)
- [x] **외부시세 API** (`/api/vehicle-market-prices`)
  - `mode=comparison` — 외부시세 + 자체 매입가 AVG + 블렌드 + 편차율 + 가중치
  - `DEP_MARKET_PRICE_WEIGHT`(0.7) × `DEP_CURVE_WEIGHT`(0.3) business_rules 연동
  - CRUD (화이트리스트 컬럼 PATCH, is_active soft delete)
- [x] **3-column UI** — `MarketPriceTab.tsx`
  - ①외부시세(파랑 Level 3) / ②자체 매입가(녹색 Level 3) / ③블렌드(보라 Level 3)
  - 편차 색상: ±5% 녹색 / <15% 황색 / 그외 적색 틴트
  - `pricing-standards/page.tsx` 첫 탭으로 `market` 추가, default activeTab 변경
- [x] **검증** — 6개 엔진 시나리오 + 11개 실차 통합 시나리오 (9 owned×long + 1 external BMW 520i + 1 shortterm EV4) **전체 PASS**
- [x] **Generator/Reviewer/Evaluator** 전 게이트 통과, `evaluate.js` ≥ 8.0/10
- **변경 파일 9개, 1,668 insertions / 45 deletions**
- **커밋**: `650974e..2d8ee56 main -> main` pushed (Cloud Build 자동 트리거, 5-10분)

### Phase 1 (과거): 렌트 원가 계산엔진 v2.0 (2026-04-17)
- [x] DB 기준 데이터 17종 정합성 검수
- [x] BusinessRules 20개 키 연동 (미연동 7개 → 전체 연결)
- [x] 하드코딩 값 → BusinessRules 설정값 전환
- [x] 설정 변경 → 견적 즉시 반영 검증
- [x] 순수함수 기반 v2.0 엔진 구현 (7대 원가, 감사추적, DB 우선 폴백)
- [x] 시장분석 모듈 (IRR, 경쟁력 지수, 손익분기)
- [x] 운영학습 모듈 (analyzeActualVsPredicted, suggestBusinessRules)
- [x] 평가: 9.50/10 (3회 반복 개선)
- **커밋**: 891fb26 → 8b86d2d (pushed)

### Phase 2: 기준표 통합 대시보드 + 모듈 분리 (2026-04-18)
- [x] SimulationPanel 실시간 시뮬레이션 (13개 기준표 → 엔진 호출 → 즉시 렌트료)
- [x] page.tsx 레이아웃 변경 (8탭 + 우측 시뮬레이션 사이드바)
- [x] RentPricingBuilder 모듈 분리 (5,853줄 → 5개 파일)
- [x] 평가: 8.9/10
- **커밋**: 806def6 + 104a9ce (pushed)

### Phase 3.1: 운영학습 UI 연동 (2026-04-18)
- [x] Migrator: calc_snapshots / operational_actuals / rule_suggestion_logs 3개 테이블 생성 (Cloud SQL 적용)
- [x] 백엔드 API 6종 구현
  - `POST/GET /api/operational-learning/snapshots` — 스냅샷 CRUD (Quote 저장 훅 대상)
  - `POST/GET /api/operational-learning/actuals` — 월별 실적 UPSERT (단건/배치)
  - `GET /api/operational-learning/analyze` — analyzeActualVsPredicted 실행
  - `POST /api/operational-learning/suggest-rules` — suggestBusinessRules + current_value 채움
  - `POST /api/operational-learning/auto-aggregate` — FmiPayment/FmiAccident 월별 집계 UPSERT
  - `POST/GET /api/operational-learning/apply-rule` — business_rules 갱신 + 이력 기록
- [x] 공용 헬퍼: `lib/operational-learning-helpers.ts` (rowToCalcSnapshot, averageActuals, serialize, monthRange)
- [x] 프론트 페이지 `/quotes/operational-learning` — Context + 8개 컴포넌트
  - OperationalLearningContext.tsx / page.tsx
  - FilterPanel (Level 2) / KpiStrip (Level 3 틴트 4색)
  - SnapshotTable (Level 4) / ActualInputModal (Level 4 + Level 1 inset 인풋)
  - AccuracyChart (Level 3 blue, 수동 SVG) / RuleSuggestionPanel (Level 3 purple)
  - ComparisonDetail (Level 4, 항목별 편차/추천)
- [x] 네비 등록: system_modules fallback + ClientLayout NAME_OVERRIDES/PATH_TO_GROUP + PageTitle
- [x] TypeScript: 운영학습 영역 0 errors (프로젝트 기존 에러 150개는 미관여)
- [x] 평가: 9.4/10 (evaluate.js)

---

## 진행 중 / 대기 작업

### 즉시 필요
- [ ] Cloud Build 빌드 결과 확인 (https://hmseok.com 헬스체크)

### 다음 우선순위 (Phase 2 후보)
- [ ] 크롤러 Phase A (KB차차차/보배드림 등) → vehicle_market_price 자동 업데이트
- [ ] loans 테이블 시드 — transactions 기반 역추적 (Phase 1에서 지연)
- [ ] Quote 저장 직후 `POST /api/operational-learning/snapshots` 훅 연결 (현재는 수동 호출만 가능)
- [ ] AccuracyChart 월별 시계열 확장 (Phase 3.2)
- [ ] 견적 심플 작성 UI (사용자: "원가분석 먼저, 견적작성은 뒤에")
- [ ] PricingContext 타입 정의 (any → PricingState 인터페이스)

### 기존 대기 작업
- [ ] payment_schedules API 구현 (Phase 4+)
- [ ] SQL Injection 보안 패치 (9개 라우트, CLAUDE.md 이슈 #5)
- [ ] 직원초대 → 페이지권한 → 견적 접근 플로우 검증
- [ ] 견적 고객 전달 (공유 링크 → 서명 플로우)
- [ ] Codef API 연동 테스트
- [ ] 투자자 정산 로직 검증

---

## 핵심 API 엔드포인트

### 인증
- `POST /api/auth/login` — 로그인 (JWT 발급)
- `POST /api/auth/signup` — 회원가입
- `POST /api/member-invite` — 직원 초대
- `POST /api/member-invite/accept` — 초대 수락 + 프로필 생성
- `GET /api/member-invite/validate` — 초대 토큰 검증

### 견적
- `GET/POST /api/quotes` — 견적 목록/생성
- `GET/PATCH/DELETE /api/quotes/[id]` — 견적 상세
- `POST /api/quotes/[id]/share` — 공유 링크 생성
- `GET /api/public/quote/[token]` — 고객용 공개 견적
- `POST /api/public/quote/[token]/sign` — 고객 서명
- `GET /api/pricing-standards?table=...` — 기준표 17종 CRUD (`vehicle_market_price` 포함)
- `GET /api/vehicle-market-prices?mode=comparison` — 외부시세 + 자체 매입가 + 블렌드 3-column
- `POST/PATCH/DELETE /api/vehicle-market-prices` — 시세 등록/수정/비활성화
- `GET /api/business-rules` — BusinessRules 20개 키

### 운영학습
- `GET/POST /api/operational-learning/snapshots` — 스냅샷 목록/생성
- `GET/POST /api/operational-learning/actuals` — 실적 월별 CRUD (UPSERT 배치)
- `GET /api/operational-learning/analyze?snapshotId=` — 단건 비교 분석
- `POST /api/operational-learning/suggest-rules` — BusinessRules 자동 추천
- `POST /api/operational-learning/auto-aggregate` — FmiPayment/Accident 월별 자동 집계
- `POST/GET /api/operational-learning/apply-rule` — 추천 적용 + 적용 이력

### 재무
- `GET /api/transactions` — 거래내역
- `GET /api/codef/bank` — 은행 거래내역 (Codef)
- `GET /api/codef/card` — 카드 승인내역 (Codef)
- `GET /api/settlement` — 정산 데이터

---

## DB 스키마 현황

- **Prisma 모델**: 42개
- **Raw SQL 전용 테이블**: 50+개 (기준표 17종 포함)
- **마이그레이션**: Prisma 마이그레이션 히스토리 없음 (수동 관리)
- **주의**: `prisma db push` 사용 시 기존 데이터 영향 확인 필요

---

## 견적 시스템 아키텍처 (v2.1)

```
사용자 입력
    ↓
RentPricingBuilder.tsx (오케스트레이터)
  ├─ 122개 상태 관리
  ├─ 13개 기준표 DB 로딩
  ├─ PricingContext.Provider
  │   ├─ VehicleStep (차량선택+옵션)
  │   ├─ AnalysisStep (원가분석)
  │   ├─ CustomerStep (고객정보)
  │   └─ PreviewStep (견적서)
  └─ calculations (useMemo)
       ↓
  calculateRentCost(CalcInput)  ← lib/rent-calc-engine.ts v2.1
       ├─ contract_source: owned / external / consignment
       └─ rental_term:    long  / short
       ↓
  CalcResult (7대 원가 + 감사추적 + 시장분석 + IRR)
```

엔진 분기 매트릭스 (v2.1):
```
                     ┌─ long  → 감가+고정+변동+간접비 표준경로
    owned            │
    (자체 보유)      └─ short → 원가 ÷ utilization_rate (A안)
                     
    external         ─ any   → external_rent_monthly + 간접비 + 마진(총원가 기준)
    (외부 매입)      
    
    consignment      ─ long  → 자체 기준 + 위탁 마진 조정
    (위탁)
```

기준표 설정:
```
app/db/pricing-standards/page.tsx
  ├─ 9탭 (🚗차량시세 + 감가/보험/정비/검사/세금/금리/등록/설정)
  │   └─ MarketPriceTab: 외부시세 / 자체 매입가 / 블렌드 3-column
  └─ SimulationPanel (우측 사이드바)
       ↓
  calculateRentCost() 엔진 직접 호출 → 실시간 렌트료 산출
```

외부시세 블렌드 (DEP_MARKET_PRICE_WEIGHT × vmp + DEP_CURVE_WEIGHT × 자체 AVG):
```
vehicle_market_price (외부 크롤러/수동)        ┐
                                                ├─→ blended_price
cars WHERE ownership_type='company'            │     = vmp × 0.7 + avg_purchase × 0.3
  GROUP BY brand,model,year → AVG(purchase)    ┘
                                                      ↓
                                                편차율 표시 (±5% 녹색)
```
