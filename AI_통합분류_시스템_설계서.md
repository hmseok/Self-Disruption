# Self-Disruption AI 통합 입출금 분류 시스템 설계서

## 1. 현재 시스템 진단

### 1.1 현재 보유 중인 페이지 & 기능 맵

| 영역 | 페이지 | 현재 기능 | 상태 |
|------|--------|-----------|------|
| **재무 장부** | `/finance` | 수동 입출금 입력, 월별 예정 스케줄 자동 생성 | 기본 완성 |
| **업로드 분석** | `/finance/upload` | 엑셀/CSV/이미지 업로드 → AI 파싱 → 카테고리 분류 → 계약 매칭 → 일괄 저장 | 핵심 완성 |
| **수금 관리** | `/finance/collections` | 미수금/연체/수금완료 추적, SMS/이메일 독촉 발송 | 기본 완성 |
| **정산** | `/finance/settlement` | 래퍼 페이지 (SettlementDashboard 컴포넌트) | 미확인 |
| **급여 관리** | `/admin/payroll` | 3탭: 급여대장, 급여설정, 실비정산 | 기본 완성 |
| **급여 상세** | `/admin/payroll/[id]` | 개별 급여명세서 편집/계산/PDF 생성 | 완성 |
| **대출 관리** | `/loans` | 할부/리스/렌트/담보대출 관리, OCR 견적서 자동 추출 | 완성 |
| **지입 계약** | `/jiip/[id]` | 계약정보/발송/입금현황/이력 4탭 | 리디자인 완료 |
| **일반 투자** | `/invest/general/[id]` | 계약정보/발송/입금현황/이력 4탭 | 리디자인 완료 |
| **보험** | `/insurance` | 보험증권 OCR 일괄 업로드/매칭 | 완성 |

### 1.2 현재 AI/자동화 API 목록

| API | 기술 | 역할 |
|-----|------|------|
| `/api/finance-parser` | Gemini 2.0 Flash (Vision) | 통장/카드 내역 이미지 → 거래 데이터 추출 |
| `/api/finance/analyze-bank-statement` | 규칙 기반 + 유사도 매칭 | 카테고리 분류 + 계약 매칭 + 스케줄 연결 |
| `/api/analyze-transactions` | Gemini 2.0 Flash | 보조 AI 분류 (카테고리 + 설명 추론) |
| `/api/parse-excel` | Gemini 2.0 Flash | 엑셀/CSV → 거래 데이터 변환 |
| `/api/ocr-receipt` | Gemini 2.0 Flash (Vision) | 영수증 이미지 → 거래 데이터 |
| `/api/ocr-loan-quote` | Gemini 2.0 Flash (Vision) | 할부 견적서 → 대출 조건 추출 |
| `/api/ocr-insurance` | Gemini 2.0 Flash (Vision) | 보험증권/가입신청서 → 보험 데이터 |

### 1.3 현재 DB 테이블 (재무 관련)

| 테이블 | 용도 |
|--------|------|
| `transactions` | 핵심 거래 장부 (type: income/expense, status: completed/pending) |
| `expected_payment_schedules` | 예상 수금/지급 스케줄 |
| `finance_rules` | 사용자 정의 키워드 → 카테고리 매핑 규칙 |
| `employee_salaries` | 직원 급여 설정 |
| `payslips` | 월별 급여명세서 |
| `general_investments` | 일반 투자 계약 |
| `jiip_contracts` | 지입 계약 |
| `loans` | 차량 할부/리스/렌트 대출 |

---

## 2. 문제 분석: 무엇이 부족한가

### 2.1 입력 채널 분산 문제

현재 데이터가 들어오는 경로가 분산되어 있습니다:

```
통장 내역 (엑셀/이미지) ──→ /finance/upload ──→ transactions
법인카드 내역 (엑셀/이미지) ──→ /finance/upload ──→ transactions
직원 급여 ──→ /admin/payroll/generate ──→ payslips (별도)
영수증 (이미지) ──→ /finance/upload (ocr-receipt) ──→ transactions
프리랜서 지급 ──→ ??? (수동 입력만 가능)
보험료 ──→ /insurance (별도 관리)
대출 상환 ──→ /loans (별도 관리)
투자자 이자 지급 ──→ /finance (스케줄 생성)
지입 정산 ──→ /finance (스케줄 생성)
```

**문제점:** 급여, 보험료, 대출상환 등이 `transactions` 테이블과 **동기화되지 않음**. 전체 현금흐름을 한눈에 볼 수 없음.

### 2.2 카테고리 체계 불완전

현재 `analyze-bank-statement`의 카테고리 규칙:

```
매출, 운반비, 지입정산, 차량할부, 보험료, 세금/공과금,
급여/인건비, 사무실비, 차량유지비, 기타수입, 기타지출, 투자수익,
대출이자, 차량매입, 수수료/수선비, 소모품비, 통신비, 미분류
```

**부족한 카테고리:** 법인카드 결제, 프리랜서/용역비, 직원 실비정산, 복리후생비, 접대비, 교통비, 교육비, 임대료, 광고선전비, 회의비, 수도광열비

### 2.3 매칭 로직 한계

현재 매칭은 `이름 유사도(50%) + 금액 근접도(40%) + 날짜 근접도(10%)`로 동작하지만:
- 법인카드 거래는 가맹점명이 와서 **매칭 불가**
- 급여이체는 "급여" "상여" 등 다양한 적요가 붙어서 **직원 특정 어려움**
- 프리랜서 지급은 **관리 대상 자체가 없음**

### 2.4 수동 결정이 필요한 영역 (핵심 이슈)

| 상황 | 왜 수동이 필요한가 |
|------|-------------------|
| AI 신뢰도 낮은 거래 (confidence < 60%) | 분류 불확실 |
| 동일 금액 다건 (급여 이체 등) | 누구에게 간 건지 특정 불가 |
| 새로운 거래처 첫 등장 | 기존 규칙에 없음 |
| 복합 결제 (A+B 합산 입금) | 분리 필요 |
| 개인/법인 혼용 카드 | 업무용/개인용 구분 필요 |

---

## 3. 제안: AI 통합 분류 허브 설계

### 3.1 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│                  📥 통합 업로드 허브                       │
│  (통장내역, 카드내역, 영수증, 급여대장, 세금계산서)         │
└────────────────────┬────────────────────────────────────┘
                     │
           ┌─────────▼──────────┐
           │  🤖 AI 파싱 엔진    │
           │  (Gemini 2.0 Flash) │
           └─────────┬──────────┘
                     │
        ┌────────────▼────────────────┐
        │  🧠 스마트 분류 엔진 (3단계) │
        │                             │
        │  1단계: DB규칙 매칭 (90%)    │
        │  2단계: 계약매칭 (유사도)     │
        │  3단계: AI 추론 (Gemini)     │
        └────────────┬────────────────┘
                     │
     ┌───────────────▼───────────────┐
     │  ✅ 자동 확정 (confidence ≥ 80%) │
     │  ⚠️ 검토 대기 (60-79%)         │
     │  ❌ 수동 결정 (< 60%)          │
     └───────────────┬───────────────┘
                     │
         ┌───────────▼───────────┐
         │  📋 분류 검토 대시보드  │
         │  (수동 결정 + 규칙 학습)│
         └───────────┬───────────┘
                     │
    ┌────────────────▼───────────────────┐
    │  💾 transactions 테이블 일괄 저장    │
    │  + 스케줄 매칭 + 계약 연동          │
    └────────────────────────────────────┘
```

### 3.2 신뢰도 기반 3단 분류 흐름

```typescript
// 분류 결과 구조
interface ClassificationResult {
  transaction: ParsedTransaction
  category: string
  confidence: number          // 0-100
  decision: 'auto' | 'review' | 'manual'

  // 매칭 결과
  matched_type?: 'jiip' | 'invest' | 'loan' | 'employee' | 'freelancer' | 'insurance'
  matched_id?: string
  matched_name?: string
  matched_schedule_id?: string

  // 분류 근거
  classification_source: 'db_rule' | 'contract_match' | 'ai_inference' | 'user_manual'

  // 대안 후보 (수동 결정용)
  alternatives?: Array<{
    category: string
    matched_type: string
    matched_id: string
    confidence: number
    reason: string
  }>
}
```

**자동 확정 (≥ 80%):** DB 규칙 정확 매칭 또는 계약 매칭 점수 80점 이상 → 바로 저장

**검토 대기 (60-79%):** AI가 분류했으나 확신 부족 → 대시보드에서 원클릭 확인 또는 수정

**수동 결정 (< 60%):** AI도 모르겠음 → 카테고리/계약 직접 선택, 선택 결과가 새로운 규칙으로 학습

---

## 4. 구현 로드맵

### Phase 1: 기반 정비 (필수 선행)

#### 4.1.1 카테고리 체계 표준화 [신설]

`finance_categories` 테이블 신설:

```sql
CREATE TABLE finance_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  code VARCHAR(20) NOT NULL,       -- 'SALARY', 'FREELANCER', 'CARD_EXPENSE' 등
  name VARCHAR(50) NOT NULL,       -- '급여/인건비', '프리랜서/용역비' 등
  parent_code VARCHAR(20),         -- 대분류 코드
  type VARCHAR(10) NOT NULL,       -- 'income' | 'expense' | 'both'
  icon VARCHAR(10),                -- '💰', '💳' 등
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false, -- 시스템 기본 카테고리 여부
  created_at TIMESTAMPTZ DEFAULT now()
);
```

기본 카테고리:

```
[수입]
- REVENUE_RENTAL: 렌탈 매출
- REVENUE_SALES: 차량 매각
- REVENUE_OTHER: 기타 수입
- INVEST_DEPOSIT: 투자금 입금
- JIIP_DEPOSIT: 지입 투자금 입금

[지출 - 인건비]
- SALARY: 급여/인건비
- FREELANCER: 프리랜서/용역비
- BONUS: 상여금
- EXPENSE_CLAIM: 직원 실비정산

[지출 - 차량]
- VEHICLE_PURCHASE: 차량 매입
- VEHICLE_LOAN: 차량 할부/리스
- VEHICLE_MAINTENANCE: 차량 유지보수
- VEHICLE_FUEL: 유류비
- VEHICLE_TOLL: 통행료/주차비
- INSURANCE: 보험료
- VEHICLE_TAX: 자동차세

[지출 - 계약 정산]
- JIIP_SETTLEMENT: 지입 정산금
- INVEST_INTEREST: 투자자 이자 지급
- LOAN_REPAYMENT: 대출 상환

[지출 - 운영비]
- OFFICE_RENT: 사무실 임대료
- UTILITY: 수도광열비
- TELECOM: 통신비
- OFFICE_SUPPLY: 사무용품/소모품
- ADVERTISING: 광고선전비

[지출 - 접대/복리]
- ENTERTAINMENT: 접대비
- WELFARE: 복리후생비
- MEETING: 회의비
- TRAVEL: 교통비/출장비
- EDUCATION: 교육비

[지출 - 세금/수수료]
- TAX: 세금/공과금
- FEE: 수수료
- INTEREST: 이자비용

[기타]
- UNCATEGORIZED: 미분류
```

#### 4.1.2 프리랜서/용역 관리 [신설]

`freelancers` 테이블 신설:

```sql
CREATE TABLE freelancers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  name VARCHAR(50) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  bank_name VARCHAR(20),
  account_number VARCHAR(30),
  account_holder VARCHAR(20),
  reg_number VARCHAR(20),          -- 사업자등록번호 또는 주민등록번호
  tax_type VARCHAR(20) DEFAULT '사업소득3.3%', -- 사업소득3.3% | 기타소득8.8% | 세금계산서
  service_type VARCHAR(50),        -- 제공 서비스 유형
  is_active BOOLEAN DEFAULT true,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE freelancer_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  freelancer_id UUID REFERENCES freelancers(id),
  payment_date DATE NOT NULL,
  gross_amount BIGINT NOT NULL,     -- 총 지급액
  tax_amount BIGINT DEFAULT 0,      -- 원천징수액
  net_amount BIGINT NOT NULL,       -- 실지급액
  description TEXT,
  transaction_id UUID REFERENCES transactions(id), -- 거래 장부 연결
  status VARCHAR(20) DEFAULT 'pending', -- pending/paid/cancelled
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### 4.1.3 법인카드 관리 [신설]

`corporate_cards` 테이블 신설:

```sql
CREATE TABLE corporate_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  card_company VARCHAR(20) NOT NULL, -- 신한, 삼성, 현대 등
  card_number VARCHAR(20),           -- 마스킹된 카드번호
  card_alias VARCHAR(30),            -- '대표님 카드', '영업팀 법인카드' 등
  holder_name VARCHAR(20),           -- 카드 명의자
  assigned_employee_id UUID REFERENCES profiles(id), -- 사용 직원
  monthly_limit BIGINT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Phase 2: AI 분류 엔진 고도화

#### 4.2.1 통합 분류 API 고도화 [기존 수정]

`/api/finance/analyze-bank-statement` 확장:

**추가 매칭 대상:**
- `employee_salaries` → 급여 이체 매칭 (이름+금액)
- `freelancers` → 프리랜서 지급 매칭 (이름+금액)
- `corporate_cards` → 법인카드 거래 매칭 (카드번호 뒷자리)
- `insurance_contracts` → 보험료 납부 매칭 (보험사명+금액)

**분류 신뢰도 산출 공식 개선:**

```typescript
function calculateConfidence(sources: ClassificationSource[]): number {
  // 1. DB 규칙 정확 매칭
  if (dbRuleMatch) return 95

  // 2. 계약/직원/프리랜서 매칭
  if (contractMatch.score >= 80) return 85
  if (contractMatch.score >= 60) return 70

  // 3. AI 추론
  if (aiResult && aiResult.confidence >= 0.8) return 75
  if (aiResult && aiResult.confidence >= 0.6) return 60

  // 4. 키워드 부분 매칭
  if (keywordPartialMatch) return 50

  // 5. 전혀 모르겠음
  return 30
}
```

#### 4.2.2 분류 검토 대시보드 [신설]

`/finance/review` 페이지 신설:

**핵심 기능:**
- 미확정 거래 목록 (confidence < 80%)
- 거래별 AI 추천 카테고리 + 대안 후보 표시
- 원클릭 확정 / 카테고리 변경 / 계약 연결
- "동일 거래처 일괄 적용" 기능
- 확정 시 `finance_rules`에 자동 학습
- 필터: 신뢰도 범위, 날짜, 카테고리, 미분류만

**UI 설계:**

```
┌─────────────────────────────────────────────────┐
│ 📋 분류 검토 대시보드                     2025-02 │
├─────────────────────────────────────────────────┤
│ [자동 확정: 245건] [검토 대기: 32건] [수동: 8건] │
├─────────────────────────────────────────────────┤
│                                                  │
│ ⚠️ 검토 대기 (32건)                              │
│ ┌──────────────────────────────────────────────┐ │
│ │ 01/15 | 김철수 | 3,300,000원 | 출금           │ │
│ │ 🤖 AI 추천: [급여/인건비 72%]                  │ │
│ │ 후보: [프리랜서 45%] [지입정산 30%]            │ │
│ │ [✅ 확정] [✏️ 변경] [🔗 계약연결]             │ │
│ └──────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────┐ │
│ │ 01/15 | (주)ABC | 550,000원 | 카드            │ │
│ │ 🤖 AI 추천: [차량유지보수 65%]                 │ │
│ │ 후보: [소모품비 55%] [수수료 40%]              │ │
│ │ [✅ 확정] [✏️ 변경] [🚗 차량연결]             │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ❌ 수동 결정 필요 (8건)                           │
│ ┌──────────────────────────────────────────────┐ │
│ │ 01/20 | 이*호 | 15,000,000원 | 입금           │ │
│ │ 🤖 분류 불가 (신뢰도 25%)                      │ │
│ │ 카테고리: [드롭다운 ▾]                         │ │
│ │ 연결 대상: [투자자 ▾] [지입 ▾] [기타 ▾]       │ │
│ │ 규칙 저장: [☐ 이 거래처 동일 규칙 적용]        │ │
│ │ [💾 확정 저장]                                 │ │
│ └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Phase 3: 통합 & 동기화

#### 4.3.1 급여 → 장부 자동 연동 [기존 수정]

`/api/payroll/generate` 수정: 급여 확정(paid) 시 `transactions` 테이블에 자동 기록

```typescript
// 급여 지급 확정 시
if (action === 'pay') {
  // payslip 상태 업데이트
  await supabase.from('payslips').update({ status: 'paid', paid_date: today })

  // transactions에 자동 기록
  await supabase.from('transactions').insert({
    company_id,
    transaction_date: today,
    type: 'expense',
    category: 'SALARY',
    client_name: employee.employee_name,
    amount: payslip.net_salary,
    description: `${payPeriod} 급여 (${employee.employee_name})`,
    payment_method: '이체',
    status: 'completed',
    related_type: 'payroll',
    related_id: payslip.id,
  })
}
```

#### 4.3.2 프리랜서 지급 → 장부 자동 연동 [신설]

프리랜서 지급 확정 시 동일하게 `transactions` 연동

#### 4.3.3 보험료/대출상환 → 장부 자동 연동 [기존 수정]

보험료 납부, 대출 상환 시 자동으로 `transactions` 기록

---

## 5. 신설/변경 필요 항목 정리

### 5.1 신설 (New)

| 항목 | 유형 | 우선순위 | 설명 |
|------|------|---------|------|
| `finance_categories` | DB 테이블 | ★★★ | 표준 카테고리 체계 |
| `freelancers` | DB 테이블 | ★★★ | 프리랜서/외주 인력 관리 |
| `freelancer_payments` | DB 테이블 | ★★★ | 프리랜서 지급 기록 |
| `corporate_cards` | DB 테이블 | ★★☆ | 법인카드 관리 |
| `/finance/review` | 페이지 | ★★★ | 분류 검토 대시보드 |
| `/admin/freelancers` | 페이지 | ★★★ | 프리랜서 관리 페이지 |
| `/admin/cards` | 페이지 | ★★☆ | 법인카드 관리 페이지 |
| `/api/finance/classify` | API | ★★★ | 통합 분류 엔진 (기존 analyze-bank-statement 대체) |

### 5.2 고도화 (Enhancement)

| 항목 | 현재 | 변경 | 우선순위 |
|------|------|------|---------|
| `/finance/upload` | 파싱 → 수동 확인 → 저장 | 파싱 → AI 3단 분류 → 자동확정/검토분리 → 저장 | ★★★ |
| `/api/finance/analyze-bank-statement` | 계약 3종만 매칭 | 직원/프리랜서/카드/보험 등 전체 매칭 | ★★★ |
| `/finance` (장부) | 수동 입력 위주 | 모든 모듈 자동 연동 + 통합 현금흐름 | ★★★ |
| `/admin/payroll` | 급여 독립 관리 | 지급 시 장부 자동 반영 | ★★☆ |
| `/finance/collections` | 미수금 추적만 | 지급 스케줄도 통합 관리 (수금+지급 일원화) | ★★☆ |
| `/api/ocr-receipt` | 단순 추출 | 법인카드/직원 매칭 + 카테고리 자동분류 | ★★☆ |
| `finance_rules` | 키워드 → 카테고리 | + 금액범위, 요일패턴, 결합조건 지원 | ★☆☆ |

### 5.3 변경 불필요 (현재 충분)

| 항목 | 이유 |
|------|------|
| `/jiip/[id]` | 리디자인 완료, 기능 충분 |
| `/invest/general/[id]` | 리디자인 완료, 기능 충분 |
| `/loans/[id]` | OCR + 상환 추적 완성 |
| `/insurance` | OCR 일괄 업로드 완성 |
| `/admin/payroll/[id]` | 급여명세서 편집/PDF 완성 |

---

## 6. 권장 구현 순서

```
Week 1-2: Phase 1 기반 정비
├── finance_categories 테이블 생성 + 기본 데이터 시딩
├── freelancers / freelancer_payments 테이블 생성
├── corporate_cards 테이블 생성
├── /admin/freelancers 관리 페이지 구현
└── /admin/cards 법인카드 관리 페이지 구현

Week 3-4: Phase 2 AI 엔진 고도화
├── /api/finance/classify 통합 분류 API 구현
│   ├── 직원 급여 매칭 로직 추가
│   ├── 프리랜서 매칭 로직 추가
│   ├── 법인카드 매칭 로직 추가
│   └── 신뢰도 기반 3단 분류 적용
├── /finance/review 분류 검토 대시보드 구현
└── /finance/upload 업로드 플로우 개선 (자동확정/검토 분리)

Week 5-6: Phase 3 통합 & 동기화
├── 급여 지급 → transactions 자동 연동
├── 프리랜서 지급 → transactions 자동 연동
├── 보험료/대출상환 → transactions 자동 연동
├── /finance 장부 페이지에 통합 현금흐름 뷰 추가
└── /finance/collections 수금+지급 통합 관리 개선
```

---

## 7. 핵심 설계 원칙

1. **단일 진실 공급원 (Single Source of Truth):** 모든 입출금은 최종적으로 `transactions` 테이블에 반영되어야 합니다. 급여, 프리랜서, 보험, 대출 등 어디서 발생하든 장부에 자동 반영.

2. **AI First, Human Final:** AI가 먼저 분류하되, 신뢰도가 낮으면 사람이 최종 결정. 사람의 결정은 다음 분류의 규칙이 됨 (학습 루프).

3. **점진적 학습:** `finance_rules` 테이블을 통해 사용할수록 정확도가 올라가는 구조. 한 번 수동 분류한 거래처는 다음부터 자동 분류.

4. **모듈 독립성 유지:** 급여, 프리랜서, 보험 등 각 모듈은 독립적으로 작동하되, `transactions` 테이블을 통해 재무 장부와 자동 연결.

5. **수동 결정의 UX 최적화:** 수동 결정이 필요한 경우, AI가 후보를 제시하고 사용자는 원클릭으로 선택. "동일 거래처 일괄 적용"으로 반복 작업 최소화.
