# 견적 시스템 전체 리팩토링 설계서 v1.0

> **작성일**: 2026-04-05
> **대상**: 견적(Quote) → 고객 공유 → 서명 → 계약 자동생성 전체 파이프라인
> **결정사항**: 두 계산기 통합 유지, 서명 페이지 새로 통합, 단기/전자계약 함께 정리

---

## 1. 현황 진단 요약

### 1-1. 발견된 핵심 문제 (15건)

| # | 구분 | 문제 | 심각도 |
|---|------|------|--------|
| 1 | DB | Prisma Quote 모델에 실제 DB 컬럼 대비 20+개 누락 (company_id, car_id, customer_id, deposit, start_date, end_date 등) | 🔴 Critical |
| 2 | DB | CustomerSignature에 token_id, signature_data, agreed_terms, ip_address, user_agent 누락 | 🔴 Critical |
| 3 | DB | QuoteShareToken에 company_id, access_count, accessed_at 누락 | 🟡 Warning |
| 4 | DB | Contract에 terms_version_id, special_terms 누락 | 🟡 Warning |
| 5 | API | `/api/sign`과 `/api/public/quote/[token]/sign` 중복 — 기능 불일치 | 🔴 Critical |
| 6 | API | `/api/sign`은 계약 자동생성 없음, `/api/public/quote/[token]/sign`만 있음 | 🟡 Warning |
| 7 | API | payment_schedules 모델 Prisma 미정의 | 🟡 Warning |
| 8 | API | quote_detail 테이블 Prisma 미정의 — JSON 구조체로 사용 중 | 🟡 Warning |
| 9 | 프론트 | QuoteCreator vs QuoteCalculator 거의 동일 기능 중복 | 🟡 Warning |
| 10 | 프론트 | `/quotes/create`와 `/quotes/new` 두 개 진입점 | 🟡 Warning |
| 11 | 프론트 | `/sign/[token]`과 `/public/quote/[token]` 서명 페이지 이원화 | 🔴 Critical |
| 12 | 보안 | `$executeRawUnsafe` + 문자열 보간 SQL Injection 위험 (quotes PATCH) | 🔴 Critical |
| 13 | 로직 | DELETE quote 시 cascade 없음 (share_tokens, signatures, lifecycle 고아) | 🟡 Warning |
| 14 | 로직 | signatureId = `Date.now().toString()` — UUID 아님, 충돌 가능 | 🟡 Warning |
| 15 | 로직 | preview/demo 파일 6개 프로덕션 불필요 | 🟢 Info |

---

## 2. 리팩토링 범위 (Scope)

### Phase A: DB 스키마 정렬 (Prisma ↔ 실제 DB)
### Phase B: API 라우트 통합 + 보안 패치
### Phase C: 프론트엔드 페이지 통합
### Phase D: 전체 플로우 검증

---

## 3. Phase A — DB 스키마 정렬

### 3-1. Quote 모델 확장

```prisma
model Quote {
  id            String    @id @default(uuid()) @db.Char(36)
  company_id    String?   @db.Char(36)
  car_id        String?   @db.Char(36)
  customer_id   String?   @db.Char(36)
  customer_name String?

  // 계약 조건
  contract_type String?   @db.VarChar(20)   // return, buyout
  term_months   Int?
  start_date    DateTime? @db.Date
  end_date      DateTime? @db.Date
  deposit       Decimal?  @db.Decimal(12, 0)
  rent_fee      Decimal?  @db.Decimal(12, 0)
  margin        Decimal?  @db.Decimal(12, 0)

  // 상태
  status        String    @default("draft")  // draft, pending, active, signed, archived
  shared_at     DateTime?
  signed_at     DateTime?
  expires_at    DateTime?

  // 약관 연결
  terms_version_id Int?

  // 메타
  quote_type    String?   @default("long_term") // long_term, short_term
  created_by    String?   @db.Char(36)
  created_at    DateTime  @default(now())
  updated_at    DateTime  @default(now()) @updatedAt

  share_tokens  QuoteShareToken[]
  detail        QuoteDetail?

  @@index([company_id])
  @@index([status])
  @@index([customer_id])
  @@map("quotes")
}
```

### 3-2. QuoteDetail 모델 추가

```prisma
model QuoteDetail {
  id                  String   @id @default(uuid()) @db.Char(36)
  quote_id            String   @unique @db.Char(36)

  // 차량 정보 스냅샷
  car_brand           String?
  car_model           String?
  car_trim            String?
  car_year            Int?
  factory_price       Decimal? @db.Decimal(12, 0)

  // 비용 산출 내역
  annual_mileage      Int?
  baseline_km         Int?
  ins_estimate        Decimal? @db.Decimal(12, 0)
  maint_package       String?
  driver_age_group    String?
  deductible          Decimal? @db.Decimal(12, 0)
  excess_mileage_rate Decimal? @db.Decimal(10, 2)
  prepayment          Decimal? @db.Decimal(12, 0)
  buyout_price        Decimal? @db.Decimal(12, 0)
  residual_value      Decimal? @db.Decimal(12, 0)
  residual_rate       Decimal? @db.Decimal(5, 2)

  // JSON 확장 (추가 항목)
  extra_data          Json?

  created_at          DateTime @default(now())

  quote Quote @relation(fields: [quote_id], references: [id], onDelete: Cascade)

  @@map("quote_detail")
}
```

### 3-3. QuoteShareToken 모델 확장

```prisma
model QuoteShareToken {
  id          String    @id @default(uuid()) @db.Char(36)
  quote_id    String    @db.Char(36)
  company_id  String?   @db.Char(36)
  token       String    @unique
  status      String    @default("active") // active, revoked, signed, expired
  expires_at  DateTime?
  access_count Int      @default(0)
  accessed_at DateTime?
  created_at  DateTime  @default(now())

  quote Quote @relation(fields: [quote_id], references: [id], onDelete: Cascade)

  @@index([quote_id])
  @@map("quote_share_tokens")
}
```

### 3-4. CustomerSignature 모델 확장

```prisma
model CustomerSignature {
  id             String    @id @default(uuid()) @db.Char(36)
  quote_id       String?   @db.Char(36)
  token_id       String?   @db.Char(36)
  customer_name  String?
  customer_phone String?
  customer_email String?
  signature_data String?   @db.LongText
  agreed_terms   Boolean   @default(false)
  ip_address     String?   @db.VarChar(45)
  user_agent     String?   @db.Text
  signed_at      DateTime?
  created_at     DateTime  @default(now())
  updated_at     DateTime  @default(now()) @updatedAt

  @@index([quote_id])
  @@map("customer_signatures")
}
```

### 3-5. Contract 모델 확장

```prisma
model Contract {
  id                String    @id @default(uuid()) @db.Char(36)
  quote_id          String?   @db.Char(36)
  car_id            String?   @db.Char(36)
  customer_id       String?   @db.Char(36)
  customer_name     String?
  start_date        DateTime? @db.Date
  end_date          DateTime? @db.Date
  term_months       Int?
  deposit           Decimal?  @db.Decimal(12, 0)
  monthly_rent      Decimal?  @db.Decimal(12, 0)
  status            String    @default("pending")
  signature_id      String?   @db.Char(36)
  terms_version_id  Int?
  special_terms     String?   @db.Text
  contract_pdf_url  String?
  created_at        DateTime  @default(now())
  updated_at        DateTime  @default(now()) @updatedAt

  @@index([status])
  @@index([car_id])
  @@index([customer_id])
  @@index([quote_id])
  @@map("contracts")
}
```

### 3-6. PaymentSchedule 모델 추가

```prisma
model PaymentSchedule {
  id           Int       @id @default(autoincrement())
  contract_id  String    @db.Char(36)
  round_number Int
  due_date     DateTime? @db.Date
  amount       Decimal?  @db.Decimal(12, 0)
  vat          Decimal?  @db.Decimal(12, 0)
  status       String    @default("unpaid") // unpaid, paid, overdue
  paid_at      DateTime?
  created_at   DateTime  @default(now())

  @@index([contract_id])
  @@map("payment_schedules")
}
```

### 3-7. 마이그레이션 전략

> **위험도**: 🟢 Green (기존 DB에 컬럼이 이미 있을 가능성 높음, Prisma 스키마만 정렬)

**단계:**
1. `prisma db pull` 로 실제 DB 스키마 확인
2. Prisma 모델을 실제 DB에 맞춰 업데이트 (이미 있는 컬럼 추가)
3. 없는 컬럼만 `ALTER TABLE` 추가
4. `prisma generate` 후 빌드 검증

---

## 4. Phase B — API 라우트 통합

### 4-1. 라우트 맵 (Before → After)

| Before | After | 변경 |
|--------|-------|------|
| `GET /api/quotes` | `GET /api/quotes` | 유지 (company_id 필터 강화) |
| `POST /api/quotes` | `POST /api/quotes` | 유지 (필수 필드 validation 추가) |
| `GET /api/quotes/[id]` | `GET /api/quotes/[id]` | 유지 (quote_detail JOIN) |
| `PATCH /api/quotes/[id]` | `PATCH /api/quotes/[id]` | **보안 패치** (SQL Injection 제거) |
| `DELETE /api/quotes/[id]` | `DELETE /api/quotes/[id]` | cascade 추가 |
| `POST /api/quotes/[id]/share` | `POST /api/quotes/[id]/share` | 유지 |
| `POST /api/quotes/[id]/send` | `POST /api/quotes/[id]/send` | 유지 |
| `GET /api/quotes/[id]/timeline` | `GET /api/quotes/[id]/timeline` | 유지 |
| `GET /api/public/quote/[token]` | `GET /api/public/quote/[token]` | 유지 (통합 서명 페이지용) |
| `POST /api/public/quote/[token]/sign` | `POST /api/public/quote/[token]/sign` | 유지 (계약 자동생성 포함) |
| ~~`GET /api/sign`~~ | **삭제** → `/api/public/quote/[token]`으로 통합 | ❌ 제거 |
| ~~`POST /api/sign`~~ | **삭제** → `/api/public/quote/[token]/sign`으로 통합 | ❌ 제거 |
| `GET /api/public/contract/[token]/pdf` | 유지 | — |
| `POST /api/quotes/generate-pdf` | 유지 | — |

### 4-2. 보안 패치 (quotes PATCH)

**문제**: `setClause = fields.map(f => \'${f} = ?\').join(\', \')`
→ `fields`가 사용자 body에서 직접 추출, 컬럼명 injection 가능

**해결**: 허용 필드 화이트리스트

```typescript
const UPDATABLE_FIELDS = [
  'customer_id', 'customer_name', 'car_id', 'status',
  'contract_type', 'term_months', 'start_date', 'end_date',
  'deposit', 'rent_fee', 'margin', 'shared_at', 'signed_at',
  'expires_at', 'quote_type'
]

const fields = Object.keys(body)
  .filter(k => UPDATABLE_FIELDS.includes(k) && body[k] !== undefined)
```

### 4-3. Quote DELETE cascade

```typescript
// 1. payment_schedules (계약 경유)
// 2. contracts
// 3. customer_signatures
// 4. quote_share_tokens
// 5. quote_lifecycle_events
// 6. quote_detail
// 7. quotes
```

### 4-4. signatureId UUID 전환

```typescript
// Before
const signatureId = Date.now().toString()

// After
const signatureId = crypto.randomUUID()
```

---

## 5. Phase C — 프론트엔드 페이지 통합

### 5-1. 페이지 구조 (Before → After)

```
Before:
  /quotes/create/          → QuoteCreator (간단 계산기)
  /quotes/new/             → QuoteCalculator (고급 계산기)
  /sign/[token]/           → 단기/간편 서명 페이지
  /public/quote/[token]/   → 장기 서명+약관 동의 페이지
  /quotes/layout-preview   → 프리뷰 (개발용)
  /quotes/calc-preview     → 프리뷰 (개발용)

After:
  /quotes/create/          → 통합 계산기 (탭: 간편모드 / 상세모드)
  /public/quote/[token]/   → 통합 공개 서명 페이지 (장기+단기 자동 판별)
  ─── 삭제 대상 ───
  /quotes/new/             ❌ → /quotes/create로 통합
  /sign/[token]/           ❌ → /public/quote/[token]으로 통합
  /quotes/layout-preview   ❌ → 삭제 (개발용)
  /quotes/calc-preview     ❌ → 삭제 (개발용)
```

### 5-2. 통합 계산기 (`/quotes/create`)

**구조**: 단일 페이지, 탭 전환

```
┌─────────────────────────────────────┐
│ 견적 작성                            │
│ ┌────────────┬─────────────┐        │
│ │ 간편 모드   │  상세 모드   │ (탭)   │
│ └────────────┴─────────────┘        │
│                                      │
│ [공통] 고객 선택 / 차량 선택          │
│                                      │
│ [간편모드]                            │
│   - 월 렌탈료 직접 입력               │
│   - 기간, 보증금, 마진 설정            │
│   - QuoteCreator 로직                 │
│                                      │
│ [상세모드]                            │
│   - 금융상품, 감가, 보험, 정비 산출     │
│   - AI 시세 추정 연동                 │
│   - business-rules, pricing 연동      │
│   - QuoteCalculator 로직              │
│                                      │
│ ┌──────────────────────────┐        │
│ │ 견적 결과 패널 (공통)      │        │
│ │ 월 렌탈료, VAT, 보증금    │        │
│ │ [임시저장] [확정]          │        │
│ └──────────────────────────┘        │
└─────────────────────────────────────┘
```

**핵심**: QuoteCreator + QuoteCalculator 공통 코드 추출 → 하위 컴포넌트 분리

- `components/quote/CustomerSelector.tsx` — 고객 선택 (공통)
- `components/quote/CarSelector.tsx` — 차량 선택 (공통)
- `components/quote/SimpleCalculator.tsx` — 간편 모드 (QuoteCreator 기반)
- `components/quote/AdvancedCalculator.tsx` — 상세 모드 (QuoteCalculator 기반)
- `components/quote/QuoteSummaryPanel.tsx` — 결과 패널 (공통)

### 5-3. 통합 공개 서명 페이지 (`/public/quote/[token]`)

**변경**: 기존 `/sign/[token]` 로직을 `/public/quote/[token]`에 병합

```
┌─────────────────────────────────────┐
│ 견적 확인 및 계약 동의                │
│                                      │
│ ┌──────────────────────────┐        │
│ │ 회사 로고 + 이름           │        │
│ └──────────────────────────┘        │
│                                      │
│ [차량 정보] 브랜드/모델/트림/연식      │
│ [계약 조건] 기간/보증금/월렌탈료       │
│ [비용 내역] 보험/정비/세금 (상세모드)  │
│                                      │
│ ── 장기/단기 자동 판별 ──             │
│ [장기] 약관 전문 표시 + 동의 체크      │
│ [단기] 간이 이용약관 + 보험안내        │
│                                      │
│ ┌──────────────────────────┐        │
│ │ 고객 정보 입력              │       │
│ │ 이름 / 연락처 / 이메일      │       │
│ └──────────────────────────┘        │
│                                      │
│ ┌──────────────────────────┐        │
│ │ 서명 패드 (터치/마우스)     │        │
│ │         [지우기]           │        │
│ └──────────────────────────┘        │
│                                      │
│ [계약 체결하기] 버튼                  │
│                                      │
│ ── 서명 완료 후 ──                   │
│ ✅ 체결 완료 안내                     │
│ [계약서 PDF 다운로드]                 │
└─────────────────────────────────────┘
```

**기능 병합 포인트**:
1. `/api/public/quote/[token]` GET — 견적 데이터 + quote_type 판별
2. quote_type에 따라 약관 섹션 분기 (장기: contract_terms / 단기: 간이약관)
3. `/api/public/quote/[token]/sign` POST — 통합 서명 처리 (기존 로직 유지)
4. `/api/sign` 라우트 삭제 → 기존 `/sign/[token]` 페이지에서 `/public/quote/[token]`으로 redirect

### 5-4. 단기 견적 통합

단기 견적(`/quotes/short-term`)은 별도 탭 유지하되, 공유/서명 플로우는 장기와 동일하게 통합:

- **견적 생성**: `/quotes/short-term` 유지 (ShortTermCalcPage — 복잡도가 높아 분리 유지)
- **공유/서명**: 장기와 동일 `/public/quote/[token]` 사용 (quote_type='short_term'으로 분기)

### 5-5. 삭제 대상 파일

```
삭제:
  app/quotes/new/page.tsx
  app/quotes/new/QuoteCalculator.tsx
  app/sign/[token]/page.tsx
  app/api/sign/route.ts
  app/quotes/layout-preview/page.tsx
  app/quotes/layout-preview.jsx
  app/quotes/calc-preview/page.tsx
  app/quotes/calc-preview.jsx
  app/quotes/pricing/preview-design.jsx
  app/quotes/pricing/preview.jsx

리다이렉트 추가:
  app/quotes/new/ → /quotes/create (302)
  app/sign/[token]/ → /public/quote/[token] (301)
```

---

## 6. Phase D — 전체 플로우 검증

### 6-1. 장기 견적 플로우

```
1. [직원] /quotes/create → 간편/상세 모드로 견적 작성
2. [직원] 임시저장 (draft) 또는 확정 (pending)
3. [직원] /quotes/[id] → "공유" 버튼 → 토큰 생성
4. [직원] SMS/이메일/카카오 전송 → 공유 링크 발송
5. [고객] /public/quote/[token] → 견적 확인
6. [고객] 약관 동의 + 서명 → POST sign
7. [시스템] 계약 자동생성 + 납부 스케줄 + 차량 상태 변경
8. [시스템] 이메일 발송 (고객 + 담당자)
9. [직원] /contracts → 체결된 계약 확인
```

### 6-2. 단기 견적 플로우

```
1. [직원] /quotes/short-term → 단기 견적 작성
2. [직원] 견적 확정 → 토큰 생성 → 공유
3. [고객] /public/quote/[token] → 단기 간이약관 + 서명
4. [시스템] 단기 계약 생성
```

### 6-3. 검증 체크리스트

- [ ] 견적 CRUD (생성, 조회, 수정, 삭제+cascade)
- [ ] quote_detail 저장/조회
- [ ] 공유 토큰 생성/만료/취소
- [ ] SMS/이메일 전송 (Aligo/Resend)
- [ ] 공개 페이지 토큰 검증 + 견적 표시
- [ ] 서명 저장 + 계약 자동생성
- [ ] 납부 스케줄 생성
- [ ] 차량 상태 변경 (active → rented)
- [ ] 라이프사이클 이벤트 기록
- [ ] PDF 생성/다운로드
- [ ] 이메일 발송 (고객+담당자)
- [ ] 장기/단기 분기 처리

---

## 7. 작업 순서

| 순서 | 작업 | 예상 시간 | 의존성 |
|------|------|----------|--------|
| 1 | Prisma 스키마 정렬 (Phase A) | 30분 | 없음 |
| 2 | API 보안 패치 (PATCH whitelist) | 15분 | 없음 |
| 3 | `/api/sign` 삭제 + redirect 설정 | 10분 | Phase A |
| 4 | 통합 서명 페이지 리팩토링 | 1시간 | 3번 |
| 5 | 통합 계산기 컴포넌트 분리 | 1.5시간 | Phase A |
| 6 | Quote DELETE cascade | 15분 | Phase A |
| 7 | signatureId UUID 전환 | 5분 | 없음 |
| 8 | 불필요 파일 삭제 | 10분 | 4, 5번 |
| 9 | 전체 플로우 테스트 | 30분 | 전체 |

---

## 8. 위험 요소

| 위험 | 대응 |
|------|------|
| 실제 DB에 컬럼이 없을 수 있음 | `prisma db pull` 먼저 → 누락 컬럼만 ALTER TABLE |
| 기존 공유 링크(`/sign/[token]`)가 이미 고객에게 전달됨 | 301 redirect로 기존 링크 호환 |
| ShortTermCalcPage 115KB 대형 컴포넌트 | 이번 스코프에서는 구조만 정리, 내부 로직은 다음 스프린트 |
| payment_schedules 테이블 존재 여부 불확실 | try/catch + 테이블 없으면 자동 생성 |

---

## 승인 요청

위 설계서 검토 후 진행 승인 부탁드립니다. 승인 시 Phase A (DB 스키마 정렬)부터 순서대로 진행합니다.
