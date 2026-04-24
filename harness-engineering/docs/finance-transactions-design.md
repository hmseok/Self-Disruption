# 통장/카드 통합 관리 페이지 — 상세 설계서 v1.0

> **작성**: Planner (GATE 2 → GATE 3)
> **작성일**: 2026-04-24
> **대상 점수**: 9.5+/10
> **경로**: `/finance/transactions` (신규 페이지)

---

## 1. 목적 및 범위

### 1.1 문제점 (현재)
- 통장 데이터(739건)와 정산 지급내역(18건)이 **연결되지 않음** (matched_tx_ids 전부 null)
- SMS 자동수집 데이터(2건)에 **card_id 미연결** (corporate_cards와 매핑 없음)
- 349건 거래의 **imported_from 미식별** (출처 불명)
- 616건(83.4%)의 **related_type 없음** (계약 매칭 안 됨)
- 업로드/카드/정산이 각각 분리된 페이지로 **워크플로우 단절**

### 1.2 목표
1. **단일 통합 페이지**에서 통장·카드·매칭·정산을 원스톱 관리
2. **자동매칭** 알고리즘으로 거래↔정산 연결 자동화 (금액+날짜+이름)
3. **SMS 자동수집** 카드거래 → corporate_cards 자동 연결
4. **기존 739건 + 18건 정산** 데이터 보존 및 매칭
5. 디자인·자동화·정확도·업무효율 모두 최고 수준

---

## 2. 페이지 구조

### 2.1 탭 구성 (NeuFilterTabs)

```
┌─────────────────────────────────────────────────────────┐
│  [통장 거래]  [카드 거래]  [자동매칭]  [정산 연결]        │
└─────────────────────────────────────────────────────────┘
```

| 탭 | key | 설명 |
|----|-----|------|
| **통장 거래** | `bank` | 은행 거래 목록 (엑셀 업로드 입력) |
| **카드 거래** | `card` | 카드 거래 목록 (엑셀 업로드 + SMS 자동수집) |
| **자동매칭** | `matching` | 거래↔계약/정산 자동매칭 실행 및 결과 관리 |
| **정산 연결** | `settlement` | 정산 지급내역과 거래 연결 현황 + 수동매칭 |

### 2.2 상단 통계 (DcStatStrip)

```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ 전체 거래 │ 통장     │ 카드     │ 매칭완료  │ 미매칭    │
│ 739건    │ 97건     │ 293건    │ 123건    │ 616건    │
│ blue     │ green    │ purple   │ green    │ amber    │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

---

## 3. 탭별 상세 설계

### 3.1 통장 거래 탭 (`bank`)

#### UI 구성
```
┌─ DcToolbar ─────────────────────────────────────────┐
│ 🔍 검색 | [전체|입금|출금] | [엑셀 업로드 ▲] 버튼    │
└─────────────────────────────────────────────────────┘
┌─ NeuDataTable ──────────────────────────────────────┐
│ 날짜 | 적요 | 입금 | 출금 | 잔액 | 거래처 | 상태     │
│ ─────────────────────────────────────────────────── │
│ 04/21 | 월세입금 | 1,200,000 | - | ... | 홍길동 | ● 매칭 │
│ 04/20 | 보험료  | - | 350,000 | ... | 삼성화재 | ○ 미매칭│
└─────────────────────────────────────────────────────┘
```

#### 엑셀 업로드 플로우
1. **파일 선택** → XLSX 파싱 (클라이언트 `xlsx` 라이브러리)
2. **컬럼 자동 매핑**: 날짜, 적요, 입금, 출금, 잔액, 거래처 컬럼 인식
3. **미리보기 테이블** — 파싱 결과 확인 (최대 50행 미리보기)
4. **중복 검사** — 날짜+금액+적요 해시로 기존 데이터와 중복 확인
5. **확인 후 저장** → `POST /api/finance/transactions/import`
6. **결과 요약** — N건 저장, M건 중복 스킵

#### 컬럼 자동인식 규칙
```typescript
const BANK_COLUMN_PATTERNS = {
  date: ['거래일', '거래일자', '일자', 'date'],
  description: ['적요', '거래내용', '내용', '메모', 'description'],
  deposit: ['입금', '입금액', '입금금액', 'credit', 'deposit'],
  withdrawal: ['출금', '출금액', '출금금액', 'debit', 'withdrawal'],
  balance: ['잔액', '거래후잔액', 'balance'],
  counterpart: ['거래처', '상대방', '이체인', 'payee'],
}
```

### 3.2 카드 거래 탭 (`card`)

#### UI 구성
```
┌─ DcToolbar ─────────────────────────────────────────┐
│ 🔍 검색 | [전체|KB|우리|현대] | [엑셀 업로드 ▲] [SMS 설정 ⚙]│
└─────────────────────────────────────────────────────┘
┌─ NeuDataTable ──────────────────────────────────────┐
│ 날짜 | 카드사 | 가맹점 | 금액 | 카드 | 사용자 | 상태   │
│ ─────────────────────────────────────────────────── │
│ 04/21 | KB | CU편의점 | 3,500 | *1234 | 홍길동 | ● 연결 │
│ 04/20 | 우리 | 주유소 | 52,000 | *5678 | 김철수 | ● 연결 │
└─────────────────────────────────────────────────────┘
```

#### SMS 자동수집 연동
- 기존 `/api/finance/sms-webhook` 엔드포인트 활용
- SMS 수신 → `card_sms_transactions` 저장 → **card_id 자동매핑**
- 카드번호 끝 4자리 + 카드사 이름으로 `corporate_cards` 매칭
- 매칭 성공 시 `transactions` 테이블에도 자동 INSERT (imported_from = 'sms')

#### SMS → corporate_cards 자동매핑 로직
```typescript
async function linkSmsToCard(sms: CardSmsTransaction): Promise<string | null> {
  // 1. 카드번호 끝 4자리 추출
  const last4 = sms.card_last4 || extractLast4(sms.raw_message)
  if (!last4) return null

  // 2. 카드사 + 끝4자리로 corporate_cards 검색
  const card = await findCorporateCard(sms.card_company, last4)
  if (!card) return null

  // 3. card_sms_transactions.card_id 업데이트
  await updateSmsCardId(sms.id, card.id)

  // 4. transactions 테이블에 거래 생성
  await createTransactionFromSms(sms, card)

  return card.id
}
```

### 3.3 자동매칭 탭 (`matching`)

#### UI 구성
```
┌─ 매칭 제어판 (GLASS.L3) ───────────────────────────┐
│ 미매칭 거래: 616건    매칭률: 16.6%                   │
│                                                     │
│ [🔄 자동매칭 실행]  [⚙ 매칭 설정]                     │
│                                                     │
│ 매칭 기준: 금액(±5%) + 날짜(±3일) + 이름(포함검사)    │
└─────────────────────────────────────────────────────┘

┌─ 매칭 결과 (NeuDataTable) ──────────────────────────┐
│ 거래 | 매칭 대상 | 신뢰도 | 매칭 기준 | 액션           │
│ ─────────────────────────────────────────────────── │
│ 04/21 홍길동 1,200,000 | 계약#C-042 | 95% | 금액+이름 | [✓ 확인] [✗]│
│ 04/20 삼성화재 350,000 | 정산#S-018 | 82% | 금액+날짜 | [✓ 확인] [✗]│
└─────────────────────────────────────────────────────┘
```

#### 3-Dimension 매칭 알고리즘 (핵심)

```typescript
interface MatchScore {
  total: number        // 0~1 종합 점수
  amountScore: number  // 금액 일치도 (가중치 0.45)
  dateScore: number    // 날짜 근접도 (가중치 0.30)
  nameScore: number    // 이름 일치도 (가중치 0.25)
  matchedTo: { type: 'contract' | 'settlement'; id: string }
}

// 금액 점수: 정확 일치 = 1.0, ±1% = 0.9, ±5% = 0.7, ±10% = 0.3
function calcAmountScore(txAmount: number, targetAmount: number): number {
  const diff = Math.abs(txAmount - targetAmount) / targetAmount
  if (diff === 0) return 1.0
  if (diff <= 0.01) return 0.9
  if (diff <= 0.05) return 0.7
  if (diff <= 0.10) return 0.3
  return 0
}

// 날짜 점수: 같은 날 = 1.0, ±1일 = 0.8, ±3일 = 0.5, ±7일 = 0.2
function calcDateScore(txDate: Date, targetDate: Date): number {
  const diffDays = Math.abs(daysBetween(txDate, targetDate))
  if (diffDays === 0) return 1.0
  if (diffDays <= 1) return 0.8
  if (diffDays <= 3) return 0.5
  if (diffDays <= 7) return 0.2
  return 0
}

// 이름 점수: 정확 일치 = 1.0, 포함 = 0.7, 부분(2글자+) = 0.4
function calcNameScore(txName: string, targetName: string): number {
  const a = normalize(txName), b = normalize(targetName)
  if (a === b) return 1.0
  if (a.includes(b) || b.includes(a)) return 0.7
  if (commonChars(a, b) >= 2) return 0.4
  return 0
}

// 종합 점수 (가중 합산)
const WEIGHTS = { amount: 0.45, date: 0.30, name: 0.25 }
const total = amountScore * WEIGHTS.amount
            + dateScore * WEIGHTS.date
            + nameScore * WEIGHTS.name

// 임계값: 0.50 이상 → 매칭 후보 제시, 0.75 이상 → 자동매칭 추천
```

#### 매칭 대상 소스
1. **contracts** — 계약 테이블 (월 납입금, 관리비, 원금 등)
2. **settlement_ledger** — 정산 지급내역 (18건)
3. **dispatch_payments** — 배차 정산

#### 매칭 플로우
```
[자동매칭 실행] 클릭
    ↓
1. 미매칭 거래 전체 로드 (related_type IS NULL)
    ↓
2. 각 거래에 대해 contracts + settlement_ledger에서 후보 검색
    ↓
3. 3-Dimension 점수 계산
    ↓
4. 0.75+ → "자동매칭 추천" 표시 (일괄 확인 가능)
   0.50~0.74 → "수동 확인 필요" 표시
   0.50 미만 → 미매칭 유지
    ↓
5. 사용자가 [일괄 확인] 또는 개별 [✓] 클릭
    ↓
6. transactions.related_type/related_id 업데이트
   settlement_ledger.matched_tx_ids 업데이트
   settlement_ledger.status → 'matched'
```

### 3.4 정산 연결 탭 (`settlement`)

#### UI 구성
```
┌─ DcStatStrip ───────────────────────────────────────┐
│ 전체 정산: 18건 | 연결됨: 0건 | 미연결: 18건 | 총액: ₩XX│
│ blue          | green      | red        | amber     │
└─────────────────────────────────────────────────────┘

┌─ 정산 지급내역 목록 (NeuDataTable) ─────────────────┐
│ 정산월 | 수령인 | 금액 | 계좌 | 상태 | 연결 거래       │
│ ─────────────────────────────────────────────────── │
│ 2025-03 | 홍길동 | 1,200,000 | 우리*1234 | 미연결 | [매칭 검색]│
│ 2025-03 | 김철수 | 850,000 | KB*5678 | 연결됨 | 거래#TX-042│
└─────────────────────────────────────────────────────┘
```

#### 수동매칭 모달
정산 항목의 [매칭 검색] 클릭 시:
1. 금액 ±10%, 날짜 ±7일 범위로 후보 거래 자동 검색
2. 후보 목록 표시 (신뢰도 점수 포함)
3. 사용자가 선택 → 연결 확인

---

## 4. API 설계

### 4.1 신규 API 라우트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/finance/transactions/summary` | 탭별 통계 (전체/통장/카드/매칭/미매칭 건수) |
| POST | `/api/finance/transactions/import` | 엑셀 데이터 일괄 저장 (중복검사 포함) |
| POST | `/api/finance/transactions/auto-match` | 자동매칭 실행 (3D 알고리즘) |
| POST | `/api/finance/transactions/confirm-match` | 매칭 확인 (단건/일괄) |
| POST | `/api/finance/transactions/unlink` | 매칭 해제 |
| GET | `/api/finance/transactions/match-candidates` | 특정 거래의 매칭 후보 조회 |
| POST | `/api/finance/sms/link-cards` | SMS 거래 → corporate_cards 일괄 연결 |

### 4.2 기존 API 활용

| API | 용도 |
|-----|------|
| `GET /api/transactions` | 거래 목록 조회 (필터: source, type, status) |
| `PATCH /api/transactions/[id]` | 거래 개별 수정 |
| `GET /api/settlement/ledger` | 정산 지급내역 조회 |
| `POST /api/settlement/ledger/match` | 정산↔거래 매칭 (기존 로직 개선) |

---

## 5. DB 스키마 활용

### 5.1 주요 테이블 (기존 — 변경 없음)

```sql
-- transactions (739건)
-- id, date, type(income/expense), amount, description,
-- related_type, related_id, imported_from, bank_name, ...

-- settlement_ledger (18건)
-- id, settlement_month, recipient_name, amount, bank_name,
-- account_number, status(pending/matched/confirmed), matched_tx_ids

-- corporate_cards (16건)
-- id, card_number, card_company, card_name, holder_name, ...

-- card_sms_transactions (2건)
-- id, card_company, card_last4, merchant, amount, card_id(null), ...

-- upload_batches (4건)
-- id, file_name, uploaded_by, row_count, status, ...
```

### 5.2 인덱스 추가 (성능 최적화, 선택)
```sql
-- 매칭 성능 향상용 인덱스 (필요 시 Migrator가 추가)
CREATE INDEX idx_tx_amount_date ON transactions(amount, date);
CREATE INDEX idx_tx_related ON transactions(related_type, related_id);
CREATE INDEX idx_sms_card ON card_sms_transactions(card_company, card_last4);
```

---

## 6. 디자인 명세 (Soft Ice Glass)

### 6.1 페이지 레이아웃
```
┌─ 페이지 헤더 (GLASS.L5 nav에 포함) ──────────────────┐
│  💰 통장/카드 관리                                     │
├─ 통계 (DcStatStrip, GLASS.L3) ──────────────────────┤
│  [전체 739] [통장 97] [카드 293] [매칭 123] [미매칭 616] │
├─ 탭 (NeuFilterTabs, GLASS.L1 인셋) ────────────────┤
│  [통장 거래] [카드 거래] [자동매칭] [정산 연결]           │
├─ 툴바 (DcToolbar, GLASS.L3) ────────────────────────┤
│  🔍 검색 | 필터 | 액션 버튼                             │
├─ 테이블 (NeuDataTable, GLASS.L4) ───────────────────┤
│  데이터 목록                                          │
└─────────────────────────────────────────────────────┘
```

### 6.2 색상 체계
- **통장 입금**: `green-500` 텍스트 + `green-50` 배경 배지
- **통장 출금**: `red-500` 텍스트 + `red-50` 배경 배지
- **카드 거래**: `purple-500` 텍스트
- **매칭 완료**: `green-500` 도트 인디케이터 `●`
- **미매칭**: `amber-500` 도트 인디케이터 `○`
- **신뢰도 높음(75%+)**: `green` 배지
- **신뢰도 중간(50~74%)**: `amber` 배지
- **신뢰도 낮음(<50%)**: `red` 배지

### 6.3 모달 디자인
- GLASS.L4 배경 + `backdrop-filter: blur(20px)`
- 보더: `rgba(0,0,0,0.06)` + `border-radius: 16px`
- 그림자: `0 8px 32px rgba(0,0,0,0.08)`

### 6.4 모바일 카드 뷰 (MobileCardConfig)
```
┌─────────────────────────────────┐
│ 04/21 CU편의점          3,500원 │
│ KB국민카드 *1234 · 홍길동  ● 연결│
└─────────────────────────────────┘
```

---

## 7. 업무 플로우 시나리오

### 7.1 월간 정산 플로우
```
1. 월말: 은행 엑셀 다운로드 → [통장 거래] 탭에서 업로드
2. 카드 거래: SMS 자동수집 (실시간) + 카드사 엑셀 보조 업로드
3. [자동매칭] 탭에서 [🔄 자동매칭 실행] 클릭
4. 자동매칭 결과 확인 → 75%+ 항목 [일괄 확인]
5. 50~74% 항목 수동 검토 후 개별 확인
6. [정산 연결] 탭에서 미연결 정산 건 수동매칭
7. 전체 매칭률 확인 → 완료
```

### 7.2 일상 거래 추적 플로우
```
1. SMS 자동수집 → 카드 거래 자동 등록
2. corporate_cards 자동 연결 (카드번호 끝4자리)
3. 주기적 자동매칭으로 계약 연결
```

---

## 8. 구현 파일 목록

### 프론트엔드
| 파일 | 설명 |
|------|------|
| `app/finance/transactions/page.tsx` | 통합 페이지 (메인) |

### API 라우트
| 파일 | 설명 |
|------|------|
| `app/api/finance/transactions/summary/route.ts` | 통계 API |
| `app/api/finance/transactions/import/route.ts` | 엑셀 가져오기 |
| `app/api/finance/transactions/auto-match/route.ts` | 자동매칭 |
| `app/api/finance/transactions/confirm-match/route.ts` | 매칭 확인 |
| `app/api/finance/transactions/unlink/route.ts` | 매칭 해제 |
| `app/api/finance/transactions/match-candidates/route.ts` | 매칭 후보 |
| `app/api/finance/sms/link-cards/route.ts` | SMS↔카드 연결 |

---

## 9. Must-have / Nice-to-have

### Must-have (GATE 5 통과 조건)
- [x] 4탭 통합 페이지 UI (통장/카드/매칭/정산)
- [x] 엑셀 업로드 (통장 + 카드 공통)
- [x] 3-Dimension 자동매칭 알고리즘
- [x] 매칭 확인/해제 기능
- [x] 정산 지급내역 연결 현황 표시
- [x] 수동매칭 모달
- [x] SMS 자동수집 → corporate_cards 연결
- [x] DcStatStrip 실시간 통계
- [x] Soft Ice 글래스 디자인 준수
- [x] 모바일 반응형 (MobileCardConfig)
- [x] 중복 업로드 방지 (해시 기반)

### Nice-to-have
- [ ] 매칭 이력 타임라인
- [ ] 엑셀 내보내기
- [ ] 거래 카테고리 자동 분류 (AI)
- [ ] 월간 리포트 자동 생성

---

## 10. 평가 기준 (9.5+ 목표)

| 항목 | 비중 | 목표 |
|------|------|------|
| UI/UX | 30% | Soft Ice 글래스 완벽 준수, 탭 전환 매끄러움, 모바일 최적화 |
| 기능 완성도 | 30% | Must-have 전항목 완료, 자동매칭 정확도 80%+ |
| 코드 품질 | 20% | SQL Injection 없음, 에러 핸들링, 타입 안전성 |
| 반응형 | 10% | 데스크톱/모바일 완벽 전환, MobileCardConfig 활용 |
| 보안 | 10% | 파라미터 바인딩, 인증 체크, 권한 검증 |
