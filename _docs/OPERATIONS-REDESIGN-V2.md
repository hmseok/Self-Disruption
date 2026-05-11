# 차량운영 (Operations) — 리뉴얼 설계서 v2

> **작성**: 2026-05-11 (sweet-amazing-galileo 메인 세션)
> **목적**: 차량운영 3페이지 + 보험청구 통합 — 직원 실제 업무 도구 + 통장 매칭 정확성 회복.
> **상태**: GATE 3 설계서 — 사용자 GO 키워드 대기 중. 코드 작성 X.
> **Rule**: Rule 1 풀 파이프라인 + Rule 22 _docs + Rule 26 페르소나 + Rule 27 GATE 체크리스트.

---

## 1. 비즈니스 흐름 (사용자 명시)

```
[Ride*세션 — RideAccidents]
  사고 접수 → workflow_stage='replacement_requested' (대차요청 체크)
        ↓ (자동 read, ride_accidents 테이블)
[operations — 접수/오더] ← 본 세션
  대차요청 항목 자동 표출
  → 상담 내용 + 진행 예상 일정 입력
  → workflow_stage 다음 단계로 진행 (customer_contacted → dispatch_preparing)
        ↓
[operations — 차량 일정] ← 본 세션
  배차 진행 (출고 / 반납)
  + 정비로 배차 불가 차량 status 표시 (별도 페이지 X — 차량 일정 안 sub-tab)
        ↓
[operations — 보험 청구] ← 본 세션
  청구 금액 + 청구 번호 입력 (사고 차량번호 자동)
  → fmi_rentals 통합 (별도 페이지 X — 차량 일정 안 청구 모달)
        ↓ (외부) 보험사 입금 (SMS → transactions)
[finance — 통장 페이지 매처]
  fmi_rentals.final_claim_amount + insurance_claim_no 보고 매칭
  + 청구 대비 입금% 동적 계산 (SUM(transactions) / final_claim_amount)
```

---

## 2. 결정 사항 (사용자 권장안 default 채택)

| # | 결정 | 채택 | 사유 |
|---|------|------|------|
| 1 | 정비 메뉴 처리 | **C — 차량 일정 안 sub-tab** | 사용자 「별도보다는 차량스케줄에서」 |
| 2 | 「대차요청」 데이터 출처 | **`ride_accidents.workflow_stage = 'replacement_requested'`** | intake/page.tsx 코드 확인 |
| 3 | 상담/진행 일정 저장 | **B — `operations_dispatch_orders` 신설** | Ride* 세션과 책임 분리 |
| 4 | 보험 청구 입력 위치 | **`fmi_rentals` 안 청구 섹션 통합** | 단일 폼, 중복 X |
| 5 | 입금% 추적 | **동적 계산** (`SUM(transactions)` / `final_claim_amount`) | 컬럼 동기화 부담 X |

---

## 3. 데이터 모델 변경

### 3.1 신설: `operations_dispatch_orders` (상담 + 일정 입력)

```sql
CREATE TABLE IF NOT EXISTS operations_dispatch_orders (
  id                CHAR(36) PRIMARY KEY,
  ride_accident_id  INT NOT NULL,                  -- ride_accidents.id FK (느슨한 참조)
  consultation_note TEXT,                          -- 직원 상담 내용
  customer_request  TEXT,                          -- 고객 요청사항
  expected_dispatch_date DATE,                     -- 예상 배차일
  expected_return_date   DATE,                     -- 예상 반납일
  status            ENUM('new','consulting','scheduled','dispatched','done','cancelled') DEFAULT 'new',
  assigned_to       VARCHAR(64),                   -- 담당 직원 (profiles.id)
  fmi_rental_id     CHAR(36) NULL,                 -- 배차 확정 시 fmi_rentals.id 연결
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by        VARCHAR(64),
  INDEX idx_ride_acc (ride_accident_id),
  INDEX idx_status (status),
  INDEX idx_fmi_rental (fmi_rental_id)
);
```

**Rule 23 멱등성**: `IF NOT EXISTS` + `INSERT IGNORE` 가드. 검증 SELECT 주석 포함.

### 3.2 `fmi_rentals` 컬럼 추가 (보험 청구 통합)

```sql
ALTER TABLE fmi_rentals
  ADD COLUMN IF NOT EXISTS billed_at TIMESTAMP NULL,         -- 청구 입력 시점
  ADD COLUMN IF NOT EXISTS billed_by VARCHAR(64) NULL;       -- 청구 입력자
-- final_claim_amount, insurance_claim_no 등은 이미 있음
```

**입금 % 계산** (별도 컬럼 X, SQL 동적):
```sql
SELECT
  fr.id,
  fr.final_claim_amount AS billed,
  COALESCE(SUM(t.amount), 0) AS paid,
  CASE
    WHEN fr.final_claim_amount > 0
    THEN ROUND(COALESCE(SUM(t.amount), 0) / fr.final_claim_amount * 100, 1)
    ELSE 0
  END AS paid_rate
FROM fmi_rentals fr
LEFT JOIN transactions t
  ON t.related_type = 'fmi_rental'
 AND t.related_id = fr.id
 AND t.type = 'income'
GROUP BY fr.id, fr.final_claim_amount;
```

### 3.3 ride_accidents — read-only

본 세션은 **read 만**. Ride* 세션이 책임. 단 `workflow_stage` UPDATE 는 다음 협의:
- intake/page.tsx 이미 PATCH `/api/ride-accidents/:id` 호출 → 본 세션도 같은 방식 (직접 컬럼 수정 X, API 통해서만)

---

## 4. 페이지 변경 명세

### 4.1 `/operations/intake` — 접수/오더 (리뉴얼)

**현재**: 791줄 self-built 페이지 — Glass 디자인 일부 적용, 자체 헤더 (PageTitle 자동과 중복)

**리뉴얼 후**:
- 자체 헤더 제거 (PageTitle 자동 사용)
- `DcStatStrip` (5 stat 카드):
  - 신규 대차요청 N건 (replacement_requested)
  - 상담 진행 중 M건
  - 배차 확정 K건
  - 출고 완료 L건
  - 청구 대기 P건
- `DcToolbar` (검색 + 필터)
- `NeuDataTable` — 컬럼: 사고번호 / 사고일 / 고객 / 사고차량 / 보험사 / stage / 상담 상태 / 액션
- 상세 모달:
  - ride_accidents 정보 (read-only)
  - operations_dispatch_orders 신설/수정 (상담 + 예상 일정)
  - 「배차 확정」 버튼 → fmi_rentals 신규 row 생성 + status 'dispatched' + fmi_rental_id 연결

**페이지 path 유지**: `/operations/intake`

### 4.2 `/operations` — 차량 일정 (리뉴얼 + 정비 sub-tab)

**현재**: 1,247줄 OperationsMain + CalendarView + FleetBoard + DispatchModal

**리뉴얼 후**:
- 자체 헤더 제거 (PageTitle 자동)
- `DcStatStrip`:
  - 가용 차량 N대 (status='available')
  - 대차 중 M대 (status='dispatched')
  - 정비 중 K대 (status='maintenance')
  - 출고 예정 L건
  - 반납 예정 P건
- Sub-tab 3개:
  - 📅 **캘린더** (기존 CalendarView 유지 + 디자인 표준 적용)
  - 🚗 **차량 보드** (기존 FleetBoard 유지)
  - 🔧 **정비 상태** (신설 sub-tab — 정비 중 차량 list + 정비 사유 / 예상 복구일)
- DispatchModal 유지 (배차 모달)
- 보험 청구 모달 (신설 — 청구액 / 청구번호 / 청구일 입력)
- 사이드바 「🔧 정비」 메뉴 **삭제** (별도 페이지 X)

**페이지 path 유지**: `/operations`

### 4.3 `/maintenance` — 메뉴 삭제

- `lib/menu-registry.ts` 에서 `mod-maint` 제거
- 페이지 신설 X
- 정비 정보는 `/operations` sub-tab 「정비 상태」 로 통합

### 4.4 `/operations/rentals` — 그대로 (참고용)

- 배반차 스케줄 (현재 463줄)
- 사이드바 미등록 → 직접 URL 접근만
- 향후 별도 작업

### 4.5 `/operations/intake-bulk` — 그대로 (일괄 입력)

- 엑셀 일괄 입력 도구 — 운영 초기용
- 사이드바 미등록 유지

---

## 5. API 명세

### 5.1 신설

| Endpoint | Method | 용도 |
|----------|--------|------|
| `/api/operations/dispatch-orders` | GET | operations_dispatch_orders list (ride_accident JOIN) |
| `/api/operations/dispatch-orders` | POST | 상담/일정 입력 |
| `/api/operations/dispatch-orders/[id]` | PATCH | 상담/일정 수정 |
| `/api/operations/dispatch-orders/[id]/confirm` | POST | 배차 확정 → fmi_rentals 신규 + 연결 |
| `/api/operations/vehicles/available` | GET | 가용 차량 list (status='available') |
| `/api/operations/maintenance` | GET | 정비 중 차량 list |
| `/api/operations/billing` | POST | fmi_rentals 청구 정보 입력 (final_claim_amount + insurance_claim_no) |
| `/api/operations/billing/[fmi_rental_id]/stats` | GET | 청구 vs 입금 % (동적 계산) |

### 5.2 수정

- `/api/finance/transactions/auto-match-fmi-rental` (메인 세션 기존) — fmi_rentals.final_claim_amount 가중 매칭 강화

---

## 6. PR 분할 (Phase 1/2/3)

### Phase 1 — 접수/오더 리뉴얼 + dispatch_orders 신설
- 마이그레이션 SQL (`operations_dispatch_orders` + fmi_rentals 컬럼)
- `/api/operations/dispatch-orders/*` 신설
- `/operations/intake/page.tsx` 리뉴얼 (DcStatStrip + NeuDataTable + 모달)
- _docs/CHANGELOG.md 갱신
- 시각 검수 (스크린샷)

**예상 작업량**: 2~3 commit

### Phase 2 — 차량 일정 리뉴얼 + 정비 sub-tab
- `/operations/page.tsx` (OperationsMain) 리뉴얼
- 정비 상태 sub-tab + `/api/operations/maintenance` 신설
- 사이드바 「정비」 메뉴 삭제 (menu-registry.ts — 공통 파일, 사용자 합의 의무)
- 배차 모달 강화 (가용 차량 + 청구 정보 입력 통합)

**예상 작업량**: 3~4 commit

### Phase 3 — 보험 청구 통합 + 입금 % 표출
- `/api/operations/billing/*` 신설
- `/operations` 안 청구 모달 + 입금 % 위젯
- finance 매처 강화 (fmi_rentals 청구 데이터 가중치)

**예상 작업량**: 2~3 commit

**총 예상**: 7~10 commit / 1주

---

## 7. 공통 파일 변경 (Rule 21 § 2.1 합의 의무)

| 파일 | 변경 | 합의 시점 |
|------|------|----------|
| `lib/menu-registry.ts` | 「정비」 메뉴 삭제 | Phase 2 진입 시 사용자 사전 보고 |
| `prisma/schema.prisma` | (선택) operations_dispatch_orders 모델 추가 | Phase 1 |
| `app/components/PageTitle.tsx` | `/operations/intake` group/name 등록 확인 | 필요 시 (이미 등록됐을 가능성) |

---

## 8. GATE 체크리스트 (Rule 27)

### Phase 1
```
□ G3 설계서 v2 + 사용자 GO ← 현재 단계
□ G4 마이그레이션 — operations_dispatch_orders + fmi_rentals 컬럼
  - 사용자 SQL 적용 확인
  - 멱등성 (IF NOT EXISTS)
□ G5 코드 — tsc PASS + 영향 페이지 빌드
□ G6 lint — sql/sql-fn/api-trace/ui-coverage 새 위반 0
□ G7 Designer — Chrome MCP 또는 사용자 스크린샷
  - PageTitle 자동 / DcStatStrip / DcToolbar / NeuDataTable 의무
□ G8 evaluate.js 8.0+/10
□ Rule 22 _docs — CHANGELOG / DATA-MODEL 갱신
```

Phase 2/3 동일 절차.

---

## 9. 위험 요소 + 회피

### 9.1 ride_accidents UPDATE 충돌 (Ride* 세션과)
- 본 세션은 PATCH `/api/ride-accidents/:id` 통해서만 (직접 SQL X)
- workflow_stage 변경은 정해진 단계 전환만 (random update X)

### 9.2 fmi_rentals.final_claim_amount 변경 시 매처 영향
- 본 세션이 청구액 변경 → finance 매처가 다음 실행 시 자동 반영
- 매칭 정확도는 동적 계산이라 즉시 회복

### 9.3 사이드바 「정비」 삭제 시 다른 세션 영향
- menu-registry.ts 는 공통 파일 — 합의 의무
- 다른 세션이 정비 관련 작업 중인지 사용자 확인 후 진행

### 9.4 새 컬럼 / 테이블 lint baseline 영향
- sql-lint baseline 갱신 필요 (마이그 직후)

---

## 9.5 Phase 1.4 설계 (사용자 명시 — 상담원 기록 스타일)

> **사용자 명시 비즈니스 흐름** (2026-05-11):
> 「접수내역에 사고접수 상세 내용이 나와야 하고 그내역과 콜센터 상담내역을 보고
>  여기서 이관받아 상담 눌러서 여기의 추가 상담을 디비저장하는 구성의 페이지가
>  나와야하는데 상담원 상담기록 스타일로」

### 9.5.1 데이터 모델 — operations_consultations 신설

```sql
CREATE TABLE operations_consultations (
  id                 CHAR(36) PRIMARY KEY,
  dispatch_order_id  CHAR(36) NOT NULL,
  note               TEXT NOT NULL,
  category           ENUM('intake','followup','status_change','other') DEFAULT 'followup',
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by         VARCHAR(64),
  INDEX idx_dispatch_order (dispatch_order_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**원칙**: 단일 dispatch_order 에 여러 상담 row 누적 — 시간순 히스토리. 기존 `dispatch_orders.consultation_note` 는 「최초 인테이크 노트」 로 의미 변경.

### 9.5.2 API 명세

| Endpoint | Method | 용도 |
|----------|--------|------|
| `/api/operations/consultations?dispatch_order_id=` | GET | 시간순 list (DESC) |
| `/api/operations/consultations` | POST | 신규 상담 row INSERT |
| `/api/operations/consultations/[id]` | DELETE | (옵션) 수정/삭제는 Phase 2 |

### 9.5.3 모달 새 구성 — 상담원 기록 스타일

```
┌─ 사고 정보 (cafe24 detail fetch — /api/cafe24/accidents/detail) ─┐
│  사고일/시간/위치 / 차량번호 / 차종 / 요청자 / 사고 메모        │
└────────────────────────────────────────────────────────────────────┘

┌─ 콜센터 메모 (cafe24 read-only) ─────────────────────────────────┐
│  esosrstx (사고 텍스트) / esosmemo (상담 메모) / esosinft (정보) │
│  외부 시스템에 등록된 메모, 우리는 변경 X                       │
└────────────────────────────────────────────────────────────────────┘

┌─ 💬 상담 히스토리 (operations_consultations 시간순 누적) ────────┐
│  📞 2026-05-11 14:30 hjpark                                      │
│     고객 통화 — 견인 차량 도착 확인                              │
│  📞 2026-05-11 15:10 hjpark                                      │
│     EV6 대차 가능 협의                                           │
│  ...                                                             │
└────────────────────────────────────────────────────────────────────┘

┌─ 새 상담 입력 ──────────────────────────────────────────────────┐
│  [textarea — 상담 내용]                                         │
│  [category dropdown: 인테이크/팔로업/상태변경/기타]              │
│  [💬 상담 추가] → POST → 위 히스토리에 새 row 표시               │
└────────────────────────────────────────────────────────────────────┘

┌─ dispatch_order 기본 필드 (기존 유지) ───────────────────────────┐
│  status / expected_dispatch_date / expected_return_date          │
│  [💾 저장] [🚀 배차 확정]                                         │
└────────────────────────────────────────────────────────────────────┘
```

### 9.5.4 cafe24 detail 응답 활용

`/api/cafe24/accidents/detail?idno=&mddt=&srno=` 호출 시 30+ 필드:
- 위치: `esosaddr`, `esosadnm`, `esosadtl`
- 요청자: `esosusnm` (이름), `esosustl` (전화), `esosusvp` (차량 정보), `esosusvd` (차종)
- 메모: `esosrstx`, `esosmemo`, `esosinft`
- 등록: `esosgndt`, `esosgntm`, `esosgnus`

list 응답에서 `esosmddt + esossrno` 도 받아두기 (detail 호출 키). 현재 매핑에 없으므로 보강 필요.

### 9.5.5 Phase 1.4 작업 분할

| 단계 | 내용 |
|------|------|
| **P1.4a** | 마이그 `operations_consultations` + API `/api/operations/consultations` GET/POST |
| **P1.4b** | 모달 리뉴얼 — detail fetch + 콜센터 메모 + 상담 히스토리 + 새 상담 입력 |

---

## 10. 다음 단계 (사용자 결정 대기)

설계서 v2 검토 후 다음 키워드 중 하나 응답:

- **「설계 OK / 구현 진행 / ㄱㄱ」** → GATE 4 마이그레이션 SQL 작성 진입
- **「수정 필요」** → 구체 항목 지적 → 설계서 v2.1 갱신
- **「Phase 1 만 먼저」** → Phase 1 완료 후 v3 재계획

---

본 설계서는 Phase 진행 중 변경 사항 발생 시 갱신.

---

## 11. 진행 상태 (CHANGELOG)

| 일자 | Phase | commit | 내용 |
|------|-------|--------|------|
| 2026-05-11 | 설계 | bfb9386 | 설계서 v2 + operations 메인 세션 재배정 |
| 2026-05-11 | Phase 1.1 | c01656e | 마이그레이션 SQL + GET/POST API 신설 (사용자 SQL 적용 ✅) |
| 2026-05-11 | Phase 1.2 | 3481012 | PATCH/confirm API |
| 2026-05-11 | Phase 1.3 | 7449315 | /operations/intake UI 리뉴얼 — 791줄 → ~570줄 |
| 2026-05-11 | hotfix #1 | 4b02421 | cafe24 fetch Authorization 헤더 + 365일 |
| 2026-05-11 | hotfix #2 | 9a2af66 | cafe24 응답 필드명 매핑 (esos* 정정) |
| TBD | Phase 1.4a | TBD | operations_consultations 마이그 + API |
| TBD | Phase 1.4b | TBD | 모달 리뉴얼 — 상담원 기록 스타일 |
| TBD | Phase 2 | TBD | 차량 일정 리뉴얼 + 정비 sub-tab |
| TBD | Phase 3 | TBD | 보험 청구 통합 + 입금% 표출 |
