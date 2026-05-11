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

## 9.5 Phase 1.4 설계 v2.1 (상담원 기록 스타일 — 상세 SQL/API/Wireframe)

> **사용자 명시 비즈니스 흐름** (2026-05-11):
> 「접수내역에 사고접수 상세 내용이 나와야 하고 그내역과 콜센터 상담내역을 보고
>  여기서 이관받아 상담 눌러서 여기의 추가 상담을 디비저장하는 구성의 페이지가
>  나와야하는데 상담원 상담기록 스타일로」
>
> **v2.1 작성** (2026-05-11, trusting-relaxed-keller — operations 전용 세션):
> Phase 1.1~1.3 완료 위에 상담 누적 기능 추가. 본 PR 의 「설계 → GO → 코드」 분리.

### 9.5.0 흐름도 (v2.1)

```
[목록 cafe24] ──────────────────────────────────────────┐
                                                          │
[행 클릭] → IntakeModal v2 열림                           │
                                                          ▼
   ┌────────────────────────────────────────────────────────────┐
   │  (병렬 fetch — 모달 마운트 시)                              │
   │   1) GET /api/cafe24/accidents/detail?idno=..&mddt=..&srno=  │
   │      → 사고 위치/요청자/30+ 필드                            │
   │   2) GET /api/cafe24/accidents/memos?idno=..&mddt=..&srno=  │
   │      → 콜센터 메모 timeline (acememoh)                       │
   │   3) GET /api/operations/consultations                       │
   │      ?dispatch_order_id={existing.id}                        │
   │      → 우리 시스템 상담 누적 history                         │
   └────────────────────────────────────────────────────────────┘
                          │
                          ▼
   사용자 「💬 상담 추가」 → POST /api/operations/consultations
                          ▼
   히스토리 prepend (낙관적 갱신)
```

### 9.5.1 데이터 모델 — operations_consultations 신설

#### (a) 마이그레이션 SQL — `migrations/2026-05-11_operations_consultations.sql`

```sql
-- PR-OPS-REDESIGN Phase 1.4a — 상담 누적 (상담원 기록 스타일)
-- 2026-05-11 (trusting-relaxed-keller / operations 세션)
--
-- 신설:
--   operations_consultations — 단일 dispatch_order 에 여러 상담 row 누적
--
-- Rule 23 멱등성: 모든 변경 IF NOT EXISTS 가드. 여러 번 실행 안전.
-- Rule 24 시드: 본 마이그는 시드 없음 (테이블 신설만).

-- ─────────────────────────────────────────────────────────────────
-- 1. operations_consultations — 신설
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operations_consultations (
  id                 CHAR(36)     NOT NULL PRIMARY KEY,
  dispatch_order_id  CHAR(36)     NOT NULL,
  note               TEXT         NOT NULL,
  category           ENUM('intake','followup','status_change','dispatch','return','billing','other')
                     NOT NULL DEFAULT 'followup',
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by         VARCHAR(64)  NULL,
  INDEX idx_ops_consult_dispatch (dispatch_order_id),
  INDEX idx_ops_consult_created (created_at),
  INDEX idx_ops_consult_dispatch_created (dispatch_order_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 의도적 FK 미선언:
--   operations_dispatch_orders 가 향후 분할/마이그레이션 시 유연성 유지.
--   app 레벨에서 POST 전 dispatch_order 존재 확인 (graceful 404).

-- ─────────────────────────────────────────────────────────────────
-- 2. (선택) 기존 dispatch_order.consultation_note 백필
-- ─────────────────────────────────────────────────────────────────
--   기존 consultation_note 가 채워져 있는 row 를 「인테이크 최초 노트」로
--   operations_consultations 1행 INSERT (멱등성: 이미 백필된 row 는 skip).
--
--   본 백필은 P1.4a 마이그 적용 후 1회 수동 실행 권장. 필요 시 주석 해제.
-- INSERT IGNORE INTO operations_consultations (id, dispatch_order_id, note, category, created_at, created_by)
-- SELECT UUID(), o.id, o.consultation_note, 'intake', o.created_at, o.created_by
--   FROM operations_dispatch_orders o
--  WHERE o.consultation_note IS NOT NULL
--    AND o.consultation_note <> ''
--    AND NOT EXISTS (
--          SELECT 1 FROM operations_consultations c
--           WHERE c.dispatch_order_id = o.id AND c.category = 'intake'
--        );

-- ─────────────────────────────────────────────────────────────────
-- 3. 검증 SELECT (Rule 23 의무)
-- ─────────────────────────────────────────────────────────────────
-- 검증 1: 테이블 생성 확인 (기대치 1)
-- SELECT COUNT(*) AS table_exists FROM information_schema.tables
--   WHERE table_schema = DATABASE() AND table_name = 'operations_consultations';

-- 검증 2: 컬럼 6개 확인 (id, dispatch_order_id, note, category, created_at, created_by)
-- SELECT COUNT(*) AS col_count FROM information_schema.columns
--   WHERE table_schema = DATABASE() AND table_name = 'operations_consultations';
-- 기대치: 6

-- 검증 3: 인덱스 3개 확인 (PK 제외)
-- SHOW INDEX FROM operations_consultations;

-- 검증 4: 빈 테이블 확인 (시드 없음)
-- SELECT COUNT(*) AS row_count FROM operations_consultations;
-- 기대치: 0
```

#### (b) 컬럼 의미 + 카테고리 ENUM

| 컬럼 | 타입 | 의미 |
|------|------|------|
| `id` | CHAR(36) | UUID, app 측 `randomUUID()` 발급 |
| `dispatch_order_id` | CHAR(36) | `operations_dispatch_orders.id` 느슨 참조 (FK 미선언) |
| `note` | TEXT NOT NULL | 상담 본문 (빈 문자열 거부) |
| `category` | ENUM | `intake` 최초 인테이크 / `followup` 일반 팔로업 / `status_change` 상태 변경 메모 / `dispatch` 출고 메모 / `return` 반납 메모 / `billing` 청구 메모 / `other` |
| `created_at` | TIMESTAMP | 자동 — DB now() |
| `created_by` | VARCHAR(64) | profiles.id 또는 username (`verifyUser` 결과) |

#### (c) 기존 `operations_dispatch_orders.consultation_note` 의미 변경

- **변경 전 (Phase 1.1~1.3)**: 「상담 내용」 단일 필드 (수정 가능, 덮어쓰기)
- **변경 후 (Phase 1.4)**: 「최초 인테이크 노트」 (모달 진입 시 read-only 또는 P1.4b 모달에선 노출 X — `operations_consultations` 의 `category='intake'` row 가 같은 역할 수행)
- **호환성**: 기존 540건 급의 작은 테이블이라 backfill 가벼움. 마이그 § 2 백필 SQL 주석 해제 후 1회 실행.

### 9.5.2 API 명세 — `/api/operations/consultations`

#### (a) 엔드포인트 매트릭스

| Method | Path | 용도 | 권한 |
|--------|------|------|------|
| GET | `/api/operations/consultations?dispatch_order_id={uuid}` | 시간순 list | `verifyUser` 필수, role 무관 |
| POST | `/api/operations/consultations` | 신규 상담 INSERT | `verifyUser` + dispatch_order 존재 확인 |
| DELETE | `/api/operations/consultations/[id]` | (옵션, P1.4 외) 본인 작성 1시간 내 회수 | Phase 2 이상에서 결정 |

#### (b) GET — 요청/응답

```http
GET /api/operations/consultations?dispatch_order_id=<uuid>&limit=200
Authorization: Bearer <token>
```

```jsonc
// 200 OK (정상)
{
  "data": [
    {
      "id": "8a3f...-uuid",
      "dispatch_order_id": "9f2c...-uuid",
      "note": "EV6 대차 가능 협의",
      "category": "followup",
      "created_at": "2026-05-11T15:10:32.000Z",
      "created_by": "hjpark"
    },
    // ... DESC 정렬 (최신 먼저)
  ],
  "total": 7
}

// 200 OK (테이블 미적용 graceful — Rule 23)
{ "data": [], "total": 0, "_migration_pending": true }

// 401 / 403 / 400 (dispatch_order_id 누락)
{ "error": "dispatch_order_id required (uuid)" }
```

쿼리 SQL (graceful fallback 패턴 — Phase 1.1 동일):
```sql
SELECT id, dispatch_order_id, note, category, created_at, created_by
  FROM operations_consultations
 WHERE dispatch_order_id = ?
 ORDER BY created_at DESC, id DESC
 LIMIT ?
```

#### (c) POST — 요청/응답

```http
POST /api/operations/consultations
Authorization: Bearer <token>
Content-Type: application/json

{
  "dispatch_order_id": "9f2c...-uuid",
  "note": "고객 통화 — 견인 차량 도착 확인",
  "category": "followup"     // optional, default 'followup'
}
```

검증 순서:
1. `verifyUser` → 없으면 401
2. `note` trim 후 빈 문자열이면 400 (`note required`)
3. `dispatch_order_id` UUID 형식 검증 — 어긋나면 400
4. `SELECT id FROM operations_dispatch_orders WHERE id = ? LIMIT 1` — 미존재 시 404 (`dispatch_order not found`)
5. `category` ENUM 화이트리스트 외면 `'followup'` 으로 강제
6. `INSERT INTO operations_consultations (id, dispatch_order_id, note, category, created_by) VALUES (?, ?, ?, ?, ?)`
7. 응답:

```jsonc
// 201 (관습상 200 으로 통일, ok=true)
{
  "ok": true,
  "id": "8a3f...-uuid",
  "dispatch_order_id": "9f2c...-uuid",
  "category": "followup",
  "created_at": "2026-05-11T15:10:32.000Z",
  "created_by": "hjpark"
}

// 503 (테이블 미적용 — Rule 23)
{ "error": "operations_consultations 테이블 미적용 — 마이그레이션 SQL 실행 필요",
  "_migration_pending": true,
  "sql_file": "migrations/2026-05-11_operations_consultations.sql" }
```

#### (d) 보안 / 무결성

- `created_by` 는 클라가 보내지 X → 서버 `verifyUser` 결과만 사용
- `dispatch_order_id` 외 키 (e.g. `cafe24_idno`) 받지 X — operations_dispatch_orders 통해 접근
- POST rate-limit 별도 X (Phase 2 검토)

### 9.5.3 모달 wireframe — IntakeModal v2 (상담원 기록 스타일)

#### (a) 레이아웃 요약 (max-width 760, max-height 90vh, scroll)

```
┌─────────────────────────────────────────────────────────────────┐
│ 🚗 12가1234 김지훈              사고일 2026-05-09 · 청구#101…  ×│
│ ─────────────────────────────────────────────────────────────── │
│                                                                  │
│ ┌── A. 사고 상세 (read-only, cafe24 detail) ────────────────┐   │
│ │ 📍 위치    서울 강남구 테헤란로 123  (esosaddr)           │   │
│ │ 🧍 요청자  김지훈 010-1234-5678 (esosusnm/esosustl)        │   │
│ │ 🚗 사고차  12가1234 EV6 화이트 (cars_no/cars_model)        │   │
│ │ 📝 사고 메모 (esosrstx) ...                                │   │
│ │ 🕓 등록    2026-05-09 14:30 hjpark (esosgndt/gnus)         │   │
│ │ ↻ 새로고침  [⚠ cafe24 미연결 시 회색 안내]                │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌── B. 콜센터 메모 timeline (cafe24 acememoh, read-only) ──┐   │
│ │ #1  2026-05-09 14:30  (memognus)                          │   │
│ │     [memotitl] 견인 요청                                  │   │
│ │     memotext: 강남 사거리 견인 요청, 30분 후 도착 예정    │   │
│ │ #2  2026-05-09 15:00  (memognus)                          │   │
│ │     ...                                                    │   │
│ │ — 메모 없음 시: 「콜센터 메모 없음」 회색 안내              │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌── C. 💬 상담 히스토리 (operations_consultations) ────────┐   │
│ │ 🆕  2026-05-11 14:30  hjpark         [intake]              │   │
│ │     고객 통화 — 견인 차량 도착 확인                        │   │
│ │ 📞  2026-05-11 15:10  hjpark         [followup]            │   │
│ │     EV6 대차 가능 협의                                     │   │
│ │ 🚀  2026-05-11 16:05  hjpark         [dispatch]            │   │
│ │     출고 완료, 차고지 인수 사진 전달                       │   │
│ │ — dispatch_order 미생성 시: 「먼저 저장 후 상담 추가 가능」│   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌── D. ✍ 새 상담 입력 ────────────────────────────────────┐   │
│ │ [textarea — 상담 내용 (note required)]                     │   │
│ │ [select — 카테고리: 팔로업/상태변경/출고/반납/청구/기타]   │   │
│ │                              [💬 상담 추가] [Ctrl+Enter]   │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌── E. dispatch_order 기본 필드 (기존 유지, 축소) ─────────┐   │
│ │ status [select]   예상 배차일 [date]   예상 반납일 [date]  │   │
│ │                          [취소] [💾 저장] [🚀 배차 확정]   │   │
│ └────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

#### (b) 섹션별 동작 명세

| 섹션 | 데이터 출처 | 마운트 시 fetch | 사용자 조작 |
|------|------------|----------------|-------------|
| A 사고 상세 | `/api/cafe24/accidents/detail` (esosidno+mddt+srno) | ✅ 병렬 fetch | ↻ 새로고침 (수동) |
| B 콜센터 메모 | `/api/cafe24/accidents/memos` (같은 키) | ✅ 병렬 fetch | ↻ 새로고침 (수동) |
| C 상담 히스토리 | `/api/operations/consultations?dispatch_order_id=` | dispatch_order 있을 때만 fetch | 새 상담 추가 시 prepend |
| D 새 상담 입력 | — | — | POST 후 D textarea clear + C 갱신 |
| E dispatch_order 기본 | 기존 props (`existing` dispatch_order) | — | 저장 / 배차 확정 (Phase 1.2 기능 유지) |

#### (c) 상태/에러 케이스

| 케이스 | 표시 |
|--------|------|
| cafe24 detail 응답 `success=false` | A 섹션 회색 「⚠ cafe24 미연결 — 메모만 입력 가능」 |
| cafe24 memos 0건 | B 섹션 「콜센터 메모 없음」 회색 |
| dispatch_order 미생성 (existing=null) | C 섹션 비활성 「먼저 [💾 저장] 으로 dispatch_order 를 만들어주세요」 / D 입력 비활성 |
| consultations API `_migration_pending=true` | C 섹션 「⚠ operations_consultations 테이블 미적용」 + D 비활성 |
| POST 실패 | resultMsg 토스트 + textarea 내용 유지 |
| POST 성공 | textarea clear + 히스토리 prepend (낙관적, 응답 row 활용) |

#### (d) 키보드 / UX

- `Ctrl/Cmd + Enter` 입력 중 → POST 트리거
- 모달 열림 즉시 D textarea autofocus (단, dispatch_order 미생성 시 status select 로)
- C 섹션 max-height 280, overflow-y auto (긴 히스토리 시 스크롤)
- 카테고리 select 색상 코딩 (intake=빨강 / followup=파랑 / dispatch=녹 / return=보라 / billing=황 / status_change=주 / other=회색) — `STAGE_TINT` 패턴 재사용

#### (e) intake/page.tsx 클라이언트 변경 포인트

```ts
// (i) Cafe24Accident 타입 확장 — detail 호출 키 보강
type Cafe24Accident = {
  id: number              // 기존 idnoInt (dispatch_order.ride_accident_id 매핑용)
  esosidno: string        // raw idno (detail/memos 호출 키)  ← NEW
  esosmddt: string        // YYYYMMDD (detail/memos 호출 키)  ← NEW
  esossrno: number        // (detail/memos 호출 키)            ← NEW
  // ... 기존 필드
}

// (ii) fetchCafe24() 매핑 시 esos* 그대로 보존
//   detail/memos 호출 시 idno=esosidno&mddt=esosmddt&srno=esossrno

// (iii) IntakeModal v2 — 신설 컴포넌트 (현 IntakeModal 교체 또는 분기)
//   - useEffect 마운트 시 3 fetch 병렬 (Promise.all)
//   - 새 상담 POST 후 prepend
//   - 기존 save / confirmDispatch 그대로 유지 (E 섹션)
```

### 9.5.4 cafe24 detail / memos 응답 활용 매핑

`/api/cafe24/accidents/detail` 응답 (이미 hotfix 9a2af66 정정 완료):
| 모달 표출 | cafe24 필드 |
|----------|-------------|
| 위치 | `esosaddr` + `esosadnm` + `esosadtl` (concat, null skip) |
| 요청자 이름 | `esosusnm` |
| 요청자 전화 | `esosustl` |
| 요청자 차량 | `esosusvp` (번호) / `esosusvd` (차종) |
| 사고 메모 | `esosrstx` |
| 상담 메모 (cafe24 측) | `esosmemo` |
| 추가 정보 | `esosinft` |
| 차량 마스터 (조인) | `cars_no` / `cars_model` |
| 등록 시각 | `esosgndt` + `esosgntm` (8+6 → 표시 변환) |
| 등록자 | `esosgnus` |

`/api/cafe24/accidents/memos` 응답:
| 모달 표출 | cafe24 필드 |
|----------|-------------|
| 메모 정렬 | `memosort ASC, memonums ASC` (서버 측 ORDER BY) |
| 등록 시각 | `memogndt` + `memogntm` |
| 등록자 | `memognus` |
| 제목 | `memotitl` |
| 본문 | `memotext` |

### 9.5.5 Phase 1.4 작업 분할

#### (a) P1.4a — 마이그 + API (백엔드만, UI 무변경)

| 산출물 | 경로 |
|--------|------|
| 마이그 SQL | `migrations/2026-05-11_operations_consultations.sql` |
| API GET/POST | `app/api/operations/consultations/route.ts` |
| _docs 갱신 | 본 파일 § 9.5 v2.1 + § 11 CHANGELOG |
| _docs 갱신 | `_docs/OPERATIONS-DATA-MODEL.md` (table 추가) |

GATE 체크리스트:
```
□ G3 설계서 v2.1 + 사용자 GO ← 현재 단계
□ G4 마이그 SQL — 사용자 SQL Studio 적용 확인
   - 멱등성 (CREATE TABLE IF NOT EXISTS + 검증 SELECT 4종)
   - 시드 없음 (Rule 24 해당 X)
□ G5 코드 — tsc PASS
   - 영향 파일: 신설 1 (route.ts), 모달은 P1.4b
□ G6 lint:harness — sql / sql-fn / api-trace 새 위반 0
□ G7 Designer — 본 단계 UI 무변경 (P1.4b 에서)
□ G8 evaluate.js (있으면) 8.0+/10
□ Rule 22 _docs — REDESIGN-V2 § 9.5 v2.1 + § 11 CHANGELOG + DATA-MODEL
```

commit (예상 1):
```
[PR-OPS-1.4a] operations_consultations 마이그 + API GET/POST

- migrations/2026-05-11_operations_consultations.sql (멱등성)
- app/api/operations/consultations/route.ts
- _docs/OPERATIONS-REDESIGN-V2.md § 9.5 v2.1 + § 11
- _docs/OPERATIONS-DATA-MODEL.md (table 추가)

GATE 진행 상태:
✅ G3 설계서 v2.1 + 사용자 GO
✅ G4 마이그 — 사용자 SQL 적용 확인
✅ G5 tsc PASS
✅ G6 lint:harness 새 위반 0
ℹ️ G7 본 단계 UI 무변경 (P1.4b 에서)
✅ Rule 22 _docs 갱신
```

#### (b) P1.4b — 모달 리뉴얼 (프론트만, 백엔드 변경 X)

| 산출물 | 경로 |
|--------|------|
| 모달 컴포넌트 | `app/operations/intake/page.tsx` (IntakeModal → IntakeModal v2) |
| (선택) 분리 | `app/operations/intake/IntakeModalV2.tsx` (모달 단독 파일 분리 권장 — 600 줄 page.tsx 비대화 회피) |
| _docs 갱신 | 본 파일 § 11 CHANGELOG + UI-SPEC (있으면) |

GATE 체크리스트:
```
□ G3 본 v2.1 wireframe = 설계서 (별도 GO 받았으면 추가 GO 불필요, 사용자 확인)
□ G5 tsc PASS + 영향 페이지 빌드 (/operations/intake)
□ G6 lint:harness 새 위반 0
   - ui-data-coverage: 새 fetch 3종 모두 graceful fallback 처리
   - ui-token-lint: 색상/스페이싱 GLASS / ui-tokens 사용
□ G7 Designer — Chrome MCP 시도 또는 사용자 스크린샷
   - A/B/C/D/E 섹션 모두 표출 확인
   - cafe24 미연결 시 회색 안내 표시
   - dispatch_order 미생성 시 C/D 비활성 표시
□ G8 evaluate.js (있으면) 8.0+/10
□ Rule 22 _docs — REDESIGN-V2 § 11 CHANGELOG
```

commit (예상 1~2):
```
[PR-OPS-1.4b] IntakeModal v2 — 상담원 기록 스타일

- app/operations/intake/page.tsx (Cafe24Accident 타입 확장 + IntakeModal v2)
  · A 사고 상세 (cafe24 detail fetch)
  · B 콜센터 메모 (cafe24 memos fetch)
  · C 상담 히스토리 (consultations GET)
  · D 새 상담 입력 (consultations POST)
  · E dispatch_order 기본 필드 (기존 유지)
- _docs/OPERATIONS-REDESIGN-V2.md § 11

GATE 진행 상태:
✅ G3 v2.1 wireframe = 설계
✅ G5 tsc PASS / next build (/operations/intake) PASS
✅ G6 lint:harness 새 위반 0
✅ G7 Chrome MCP 또는 사용자 스크린샷 확인
✅ Rule 22 _docs 갱신
```

### 9.5.6 위험 요소 + 회피

| 위험 | 회피 |
|------|------|
| cafe24 외부 의존성 (DB 다운/방화벽) | A/B 섹션 graceful (`success:false` 시 회색 안내), 모달 자체는 정상 동작 |
| 다중 사용자 동시 상담 추가 | 낙관적 prepend 후 1초 후 silent re-fetch 로 동기화 (Phase 2 검토) |
| dispatch_order 미생성 상태에서 상담 시도 | D 섹션 비활성 + 안내 — 먼저 E 「💾 저장」 → C/D 활성화 |
| 기존 consultation_note backfill | 마이그 § 2 주석 처리 — 사용자 결정 후 1회 실행 (멱등성 가드 포함) |
| operations_consultations 마이그 미적용 | API graceful fallback (`_migration_pending: true`) + 모달 C 섹션 안내 배너 |
| Cafe24Accident 타입 변경 영향 | `id` 기존 필드 유지 (dispatch_order.ride_accident_id 매핑) — esos* 추가만, 회귀 영향 0 |
| TEXT 컬럼 크기 (note 본문 매우 길면) | TEXT = 64KB, app 측 5,000자 제한 권장 (Phase 2 frontend validate) |

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
| 2026-05-11 | 설계 v2.1 | (本) | § 9.5 Phase 1.4 상세 설계 — 마이그 SQL + API + wireframe (trusting-relaxed-keller, operations 세션) |
| 2026-05-11 | Phase 1.4a | TBD | `operations_consultations` 마이그 + `/api/operations/consultations` GET/POST (graceful fallback + UUID 검증) |
| 2026-05-11 | Phase 1.4b | TBD | `IntakeModalV2` — 상담원 기록 스타일 (A 사고상세 / B 콜센터메모 / C 상담히스토리 / D 새상담 / E dispatch_order) + types.ts 분리 |
| TBD | Phase 2 | TBD | 차량 일정 리뉴얼 + 정비 sub-tab |
| TBD | Phase 3 | TBD | 보험 청구 통합 + 입금% 표출 |
