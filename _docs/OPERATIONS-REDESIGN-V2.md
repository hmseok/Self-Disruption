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

## 9.6 Phase 1.5 설계 v2.2 (사고접수 / 대차접수 탭 분리 + cafe24 풀스크린)

> **사용자 명시** (2026-05-11 P1.4 표출 검수 후):
> 「사고접수 내역이 다 들어오는것인가? 그럼 사고접수 탭과 대차요청 탭이 분리되어야합니다.
>  사고접수 내역이 너무 간략한데 카페24연동된 페이지의 전체 내역이 확인되어야하고,
>  대차요청된 상태값을 확인해서 대차접수 탭으로 적용되어야합니다.」
>
> **사용자 sample 메시지** (2026-05-11 오늘건 2건 — 잔디 발송, 라이드 주식회사 [Web발신]):
> ```
> 안녕하세요 라이드입니다. 대차진행 부탁드리겠습니다.
> *대차업체 : 라이드대차(잔디)
> *캐피탈사: iM캐피탈 DGB_SELF300,000
> *차량번호,차종: 127호5097, 싼타페 디 올 뉴 싼타페 HEV...
> *접수일시:2026년 05월 11일 16시14분
> *사고일시:2026년 05월 11일 15시00분
> *고객명: 정용근
> *통보자: ... *운전자: ... *사고(가/피해/단독): 피해
> *사고내용 / *파손부위 / *자차보험사 / *상대보험사
> *대차요청날짜 / *대차요청지 / *입고지 / *청구내용 / *추가내용 / *접수자
> ```
>
> **본 세션 cafe24 PHP 소스 분석 결론** (2026-05-11):
> - 「대차요청」 식별 컬럼 = **`acrotpth.otptdcyn = 'Y'`**
>   - 증거: `crm0201a.php:1825` PHP 자체 에러 메시지 「대차여부가 [대차미사용] 입니다」
>   - 증거: `acr0101a.php:139` 주석 「대차없음」 (디폴트 'N')
>   - 증거: `jandi_move.php:144` 잔디 메시지 발송 트리거 = `otptdcyn == "Y"`
> - 「대차업체」 = `acrrentm.rentfact` (라이드 = `rentfacd='2070'`)
> - cafe24 의 ACE/ACR 모듈 분리: ACE0101A=사고 본체 / ACR0101A=대차/출동 본체 (사고 등록 시 동시 INSERT)

### 9.6.0 흐름도 (v2.2)

```
[카페24 어드민 사용자]
  ① 사고 접수 → aceesosh INSERT (ACE0101A) + acrotpth INSERT (ACR0101A, 디폴트 otptdcyn='N')
  ② PMO/ACR 화면에서 대차 사용 결정 → acrotpth.otptdcyn = 'Y' UPDATE
  ③ CRM0201A 「대차업체에 잔디 발송」 액션 → 잔디 메시지 「대차진행 부탁드리겠습니다」

[우리 fmi-erp /operations/intake]
  📋 사고접수 탭 = aceesosh 활성 전체 (esosrgst='R') — 풍성한 표 + cafe24 detail 풀스크린 모달
  🚗 대차접수 탭 = aceesosh + acrotpth WHERE otptdcyn='Y' — sample 메시지 형식 + IntakeModalV2 의 C/D/E (우리 dispatch_order 흐름)
```

### 9.6.1 데이터 모델 — 변경 없음 (read-only)

- 우리 fmi-db 마이그 0건 — 기존 `operations_dispatch_orders` + `operations_consultations` 그대로 사용
- cafe24-db 는 read-only (이미 `lib/cafe24-db.ts` 강제)
- `lib/cafe24-db.ts` 에 새 SQL 추가만

### 9.6.2 cafe24 SQL — 「대차접수」 JOIN

#### (a) 메인 SQL (가설)

```sql
SELECT
  -- 사고 본체 (aceesosh)
  a.esosidno, a.esosmddt, a.esossrno,
  a.esosacdt, a.esosactm, a.esosrgst, a.esosrslt,
  a.esosrstx, a.esostypp, a.esosgnus,
  a.esosaddr, a.esosadnm, a.esosadtl,
  a.esosusnm, a.esosustl,
  -- 대차/출동 본체 (acrotpth)
  b.otptdcyn,                               -- ⭐ 대차여부 (Y 필터)
  b.otptacbn, b.otptrgst,
  b.otptdsnm, b.otptdshp,                   -- 운전자 이름/전화
  b.otptcanm, b.otptcahp,                   -- 통보자 이름/전화
  b.otpttonm, b.otpttohp, b.otpttonu, b.otpttomd, b.otpttobm, b.otpttobn, b.otpttobu,  -- 상대차량 정보
  b.otptacdi, b.otptacdm, b.otptacjc, b.otptacjs, b.otptacmb,  -- 사고 종류 Y/N flag
  b.otptdsre,                               -- 대차요청날짜
  b.otptdsbn, b.otptdsbh,                   -- 대차요청지 추정
  b.otptftyn,                               -- 공장입고여부
  -- 차량 마스터 (pmccarsm)
  c.carsnums  AS cars_no,
  c.carsodnm  AS cars_model,
  c.carsuser  AS cars_user,                 -- 고객명 (계약자)
  c.carscust,                               -- 캐피탈사 코드
  -- 캐피탈사 마스터 (pmccustm)
  cu.custname AS capital_co_name,
  -- 대차업체 마스터 (acrrentm) — JOIN 키 가설: rentfact ↔ acrotpth.??? (구현 시 검증)
  r.rentfact, r.rentfacd, r.factusnm AS rental_vendor, r.facthpno AS rental_hp,
  -- 등록자 (picuserm)
  u.username  AS gnus_name
FROM aceesosh a
INNER JOIN acrotpth b
  ON b.otptidno = a.esosidno
 AND b.otptmddt = a.esosmddt
 AND b.otptsrno = a.esossrno
LEFT JOIN pmccarsm c
  ON c.carsidno = a.esosidno
 AND a.esosmddt BETWEEN c.carsfrdt AND c.carstodt
LEFT JOIN pmccustm cu
  ON cu.custcode = c.carscust
LEFT JOIN acrrentm r
  ON r.rentfact = ???                        -- ⚠ JOIN 키 미확정 — 구현 1단계에서 검증
LEFT JOIN picuserm u
  ON u.userpidn = a.esosgnus
 AND a.esosmddt BETWEEN u.userfrdt AND u.usertodt
WHERE
  CHAR_LENGTH(a.esosmddt) = 8
  AND a.esosmddt BETWEEN '20100101' AND '20991231'
  AND a.esosrgst = 'R'
  AND b.otptdcyn = 'Y'                       -- ⭐ 대차요청 필터
  AND (? IS NULL OR a.esosmddt >= ?)         -- from
  AND (? IS NULL OR a.esosmddt <= ?)         -- to
ORDER BY a.esosmddt DESC, a.esossrno DESC
LIMIT ? OFFSET ?
```

#### (b) JOIN 키 검증 단계 (P1.5a 안)

JOIN 키 3종 가설 검증:

| 가설 | acrotpth ↔ aceesosh | 검증 SQL |
|------|---------------------|----------|
| **A** ⭐ | otptidno+mddt+srno = esosidno+mddt+srno | `SELECT COUNT(*) FROM aceesosh a INNER JOIN acrotpth b ON b.otptidno=a.esosidno AND b.otptmddt=a.esosmddt AND b.otptsrno=a.esossrno LIMIT 5` |
| B | otptidno+mddt 만 (srno 다름) | acrotpth.otptsrno 가 별도 일련번호 — 1 사고에 N 출동 가능성 |
| C | acrotpth 가 사고와 1:N (출동마다 row) | 가장 최근 acrotpth row 선택 (`MAX(otptmddt) GROUP BY otptidno`) |

→ P1.5a 새 API 첫 호출 시 응답 row 수 + 사용자 sample 메시지 2건 매칭 여부로 즉시 판정. 가설 A 가 1순위 (acr0101a.php INSERT 패턴이 같은 키 체계 사용).

#### (c) 사고접수 탭 SQL — 풍성화 (기존 + esos* 추가)

```sql
SELECT
  -- 식별 (기존)
  a.esosidno, a.esosmddt, a.esossrno,
  a.esosacdt, a.esosactm, a.esosrgst, a.esosrslt, a.esostypp, a.esosgnus,
  -- 표출 추가 (사용자 풀스크린 요구)
  a.esosrstx,                               -- 사고 텍스트 (사고내용)
  a.esosaddr, a.esosadnm, a.esosadtl,       -- 위치 3종
  a.esosusnm, a.esosustl,                   -- 요청자 이름/전화
  a.esoskilo,                               -- 주행거리
  -- 차량 마스터 (기존)
  c.carsnums AS cars_no,
  c.carsodnm AS cars_model,
  c.carsuser AS cars_user,
  c.carscust AS capital_co_code,
  -- 캐피탈사 (신설)
  cu.custname AS capital_co_name,
  -- 등록자 이름 (신설)
  u.username AS gnus_name
FROM aceesosh a
LEFT JOIN pmccarsm c
  ON c.carsidno = a.esosidno
 AND a.esosmddt BETWEEN c.carsfrdt AND c.carstodt
LEFT JOIN pmccustm cu
  ON cu.custcode = c.carscust
LEFT JOIN picuserm u
  ON u.userpidn = a.esosgnus
 AND a.esosmddt BETWEEN u.userfrdt AND u.usertodt
WHERE
  CHAR_LENGTH(a.esosmddt) = 8
  AND a.esosmddt BETWEEN '20100101' AND '20991231'
  AND a.esosrgst = 'R'
ORDER BY a.esosmddt DESC, a.esossrno DESC
LIMIT ? OFFSET ?
```

→ 기존 `/api/cafe24/accidents/route.ts` 의 SELECT 절 확장만 (LEFT JOIN 2개 추가). breaking change 0 (기존 컬럼 유지).

### 9.6.3 API 명세

#### (a) 신설 — `/api/operations/cafe24-dispatch-requests`

```http
GET /api/operations/cafe24-dispatch-requests?from=20260101&to=20261231&q=...&limit=50&offset=0
Authorization: Bearer <token>
```

```jsonc
// 200 OK
{
  "success": true,
  "data": [
    {
      "esosidno": "...", "esosmddt": "20260511", "esossrno": 12,
      "esosacdt": "20260511", "esosactm": "150000",
      "otptdcyn": "Y", "otptdsre": "", "otptdsbn": "",
      "otptcanm": "정용근", "otptcahp": "01047543902",
      "otptdsnm": "정용근", "otptdshp": "01047543902",
      "cars_no": "127호5097", "cars_model": "싼타페...",
      "cars_user": "정용근", "capital_co_name": "iM캐피탈 DGB_SELF300,000",
      "rental_vendor": "...", "rental_hp": "...",
      "gnus_name": "정우진",
      // ...
    }
  ],
  "meta": { "fetched_at": "...", "limit": 50, "offset": 0,
            "join_diagnostics": { "row_count": 12, "join_key_hypothesis": "A" } }
}

// 200 OK — cafe24 미연결
{ "success": false, "data": [], "error": "cafe24-unavailable", "meta": { "db_error": "ETIMEDOUT" } }
```

권한: `canAccessPage(user, '/RideAccidents')` (기존 cafe24 endpoint 와 동일).

#### (b) 수정 — `/api/cafe24/accidents` (사고접수 풍성화)

기존 endpoint 의 SQL SELECT 확장 + LEFT JOIN 2개 (`pmccustm`, `picuserm`) 추가. 응답 키 추가:
- `capital_co_name`, `gnus_name`, `esosrstx`, `esosaddr`, `esosusnm`, `esosustl`, `esoskilo`

기존 키 (`cars_no`, `cars_model` 등) 유지 — breaking change 0.

#### (c) detail/memos — 변경 없음

`/api/cafe24/accidents/detail` 와 `/memos` 는 이미 30+ 필드 반환. 풀스크린 모달이 그대로 활용.

### 9.6.4 UI 변경 명세

#### (a) `/operations/intake` 페이지 구조

```
[PageTitle 자동 헤더]
─────────────────────────────────
DcStatStrip (5 카드 — 두 탭 합산 또는 활성 탭 기준)

┌─ 탭 영역 ─────────────────────────────────────────────────┐
│ [📋 사고접수 (N)]  [🚗 대차접수 (M)]                          │  ← sub-tab
└────────────────────────────────────────────────────────────┘

DcToolbar (검색 / 필터 / 기간 — 활성 탭 컨텍스트)
NeuDataTable (활성 탭의 데이터)

[행 클릭]
  📋 사고접수 → AccidentDetailFullscreen 모달 (cafe24 detail + memos 그대로)
  🚗 대차접수 → DispatchRequestFullscreen 모달 (sample 메시지 형식 + IntakeModalV2 C/D/E)
```

#### (b) 📋 사고접수 탭 — 표 컬럼 (12~15개)

| 컬럼 | 출처 | 정렬 |
|------|------|------|
| 사고일시 | esosacdt + esosactm | ✓ |
| 접수번호 | esosidno | ✓ |
| 차량번호 | cars_no | ✓ |
| 차종 | cars_model | ✓ |
| 캐피탈사 | capital_co_name | ✓ |
| 고객 | cars_user | ✓ |
| 위치 | esosaddr (요약) | ✓ |
| 요청자 | esosusnm + esosustl | ✓ |
| 사고메모 | esosrstx (요약 1줄) | ✓ |
| 단계 | esosrslt (라벨화: 1=접수/3=종결) | ✓ |
| 등록자 | gnus_name | ✓ |
| 등록상태 | esosrgst (R=활성) | ✓ |

Rule 18 — 모든 컬럼 sortBy 의무. Rule 19 — `whiteSpace: 'nowrap'` 우선.

#### (c) 📋 사고접수 풀스크린 모달 — `AccidentDetailFullscreen.tsx`

레이아웃 (max-width 1200px, max-height 95vh, scroll):

```
┌─ Header: 🚨 [차량번호] · 접수번호 · 사고일시 · [×] ───────┐
├─ A. 사고 정보 (cafe24 detail 30+ 필드 — 카페24 어드민 그대로) ┤
│  · 위치 / 요청자 / 차량 / 사고메모 / 등록 시각 / 메모 / 추가│
│  · 점검 (배터리/타이어/오일/잠금/이동/구조 Y/N)              │
├─ B. 콜센터 메모 timeline (cafe24 memos — read-only)        ┤
│  · #1, #2, ... 시간순 (memosort/memonums)                   │
├─ C. 차량 마스터 (pmccarsm 정보) ──────────────────────────┤
│  · 캐피탈사 / 모델 / 색상 / 보유 정보                       │
└─ Footer: ↻ 새로고침 [×] 닫기 ─────────────────────────────┘
```

→ **dispatch_order 관리 흐름은 사고접수 탭에 X** — 사고접수 단계는 read-only. 대차로 변환된 후 대차접수 탭에서 우리 dispatch_order 관리.

#### (d) 🚗 대차접수 탭 — 표 컬럼 (10~12개, 메시지 sample 기준)

| 컬럼 | 출처 | 정렬 |
|------|------|------|
| 사고일시 | esosacdt + esosactm | ✓ |
| 접수번호 | esosidno | ✓ |
| 차량번호 | cars_no | ✓ |
| 차종 | cars_model | ✓ |
| 캐피탈사 | capital_co_name | ✓ |
| 고객 | cars_user | ✓ |
| 통보자 | otptcanm + otptcahp | ✓ |
| 대차업체 | rental_vendor | ✓ |
| 대차요청날짜 | otptdsre (없으면 「협의필요」) | ✓ |
| 우리 dispatch_order | (있으면 status / 없으면 「미생성」) | ✓ |
| 입고지 (공장) | (별도 SQL — ajaoderh.factname) | ✓ |

#### (e) 🚗 대차접수 풀스크린 모달 — `DispatchRequestFullscreen.tsx`

레이아웃 (max-width 1280px, max-height 95vh, scroll):

```
┌─ Header: 🚗 [차량번호] [차종] · 접수 [일시] · 사고 [일시] · [×] ┐
├─ A. 대차요청 정보 (사용자 sample 메시지 형식 그대로) ─────────┤
│  *대차업체: rental_vendor                                      │
│  *캐피탈사: capital_co_name                                    │
│  *차량번호,차종: cars_no, cars_model                            │
│  *접수일시 / *사고일시                                          │
│  *고객명: cars_user                                            │
│  *통보자: otptcanm / otptcahp                                  │
│  *운전자: otptdsnm / otptdshp                                  │
│  *사고종류: (가/피해/단독 — otptacd*)                          │
│  *사고내용: esosrstx                                           │
│  *파손부위: (별도 컬럼 검증)                                    │
│  *자차/상대 보험사: ...                                        │
│  *대차요청날짜: otptdsre / *대차요청지: otptdsbn               │
│  *입고지: ajaoderh.factname (별도 lookup)                      │
│  *청구내용: (대물/자차 — otptacd* flag 조합)                   │
│  *추가내용: acememoh 메모                                      │
│  *접수자: gnus_name                                            │
├─ B. 콜센터 메모 timeline (cafe24 memos read-only) ─────────────┤
├─ C. 우리 상담 히스토리 (operations_consultations DESC) ────────┤
├─ D. 새 상담 입력 (POST → C prepend) ──────────────────────────┤
└─ E. 우리 dispatch_order 기본 (status/일정 + 저장/배차확정) ───┘
```

→ A 섹션 = 사용자 sample 메시지 형식 그대로 (label-value 좌우 정렬). B/C/D/E 는 P1.4 IntakeModalV2 의 섹션 재사용.

### 9.6.5 작업 분할 (Phase 1.5)

#### (a) P1.5a — 새 API + 사고접수 풍성화 (백엔드만)

| 산출물 | 경로 |
|--------|------|
| 신설 | `app/api/operations/cafe24-dispatch-requests/route.ts` (~200 lines) |
| 수정 | `app/api/cafe24/accidents/route.ts` (LEFT JOIN 2개 추가, 응답 키 7개 추가) |
| _docs | 본 파일 § 9.6 + § 11 CHANGELOG |

GATE 체크리스트:
```
☑ G3 설계서 v2.2 + 사용자 GO ← 현재 단계
☐ G4 마이그 0개 (해당 X)
☐ G5 tsc PASS — 본 PR 신규/변경 파일 0 errors
☐ G6 lint:harness — sql-fn (cafe24 MariaDB 10.1 호환), api-trace 새 위반 0
☐ G7 (UI 무변경 — P1.5b/c 에서)
☐ Rule 22 _docs (본 작업)
```

JOIN 키 검증 — production API 첫 호출 시 응답 row 수 + 사용자 sample 메시지 2건 (정용근 / 김낭경) 매칭 확인.

commit (예상 1):
```
[PR-OPS-1.5a] cafe24 dispatch-requests API + accidents 풍성화

- app/api/operations/cafe24-dispatch-requests/route.ts (신설)
  · aceesosh + acrotpth + pmccarsm + pmccustm + acrrentm + picuserm 6-table JOIN
  · WHERE otptdcyn='Y' (대차요청 필터, 카페24 PHP 증거 기반)
- app/api/cafe24/accidents/route.ts (LEFT JOIN 2개 추가)
  · pmccustm 캐피탈사 / picuserm 등록자
  · 응답 키 추가: capital_co_name, gnus_name, esosrstx, esosaddr, esosusnm, esosustl, esoskilo
- _docs/OPERATIONS-REDESIGN-V2.md § 9.6 v2.2 + § 11

GATE 진행 상태:
✅ G3 설계서 v2.2 + 사용자 GO
✅ G4 마이그 0
✅ G5 tsc PASS
✅ G6 lint:harness 새 위반 0
ℹ️ G7 본 단계 UI 무변경 (P1.5b/c 에서)
✅ Rule 22 _docs
```

#### (b) P1.5b — 페이지 sub-tab + 사고접수 탭 풍성화 (UI)

| 산출물 | 경로 |
|--------|------|
| 수정 | `app/operations/intake/page.tsx` (sub-tab + 탭별 fetch / state 분리) |
| 신설 | `app/operations/intake/AccidentDetailFullscreen.tsx` (~350 lines) |
| types.ts | Cafe24Accident 타입 풍성화 (capital_co_name 등) |

GATE 체크리스트:
```
☑ G3 v2.2 wireframe = 설계
☐ G5 tsc PASS + /operations/intake 페이지 빌드
☐ G6 lint:harness 새 위반 0 (ui-token GLASS, ui-data-coverage)
☐ G7 Designer — Chrome MCP 또는 사용자 스크린샷 (사고접수 탭 + 풀스크린 모달)
☐ Rule 22 _docs § 11
```

commit (예상 1~2):
```
[PR-OPS-1.5b] /operations/intake — 사고접수 sub-tab + 풀스크린 모달

- page.tsx: sub-tab 2개 ([📋 사고접수] [🚗 대차접수]) + 탭별 state
- AccidentDetailFullscreen.tsx 신설 (cafe24 detail + memos 풀스크린)
- types.ts 풍성화

ℹ️ 대차접수 탭은 P1.5c — 본 commit 은 placeholder 만
```

#### (c) P1.5c — 대차접수 탭 + 풀스크린 모달

| 산출물 | 경로 |
|--------|------|
| 수정 | `app/operations/intake/page.tsx` (대차접수 탭 활성화 + dispatch-requests fetch) |
| 신설 | `app/operations/intake/DispatchRequestFullscreen.tsx` (~500 lines) |
| 재사용 | `IntakeModalV2` 의 C/D/E 섹션 컴포넌트 분리 (선택) |

GATE 체크리스트:
```
☑ G3 v2.2 wireframe = 설계
☐ G5 tsc PASS + 영향 페이지 빌드
☐ G6 lint:harness — ui-data-coverage (양 탭 같은 데이터 정합성)
☐ G7 Designer — 사용자 sample 메시지 ↔ 모달 A 섹션 1:1 매칭 확인
☐ Rule 22 _docs § 11
```

### 9.6.6 위험 요소 + 회피

| 위험 | 회피 |
|------|------|
| JOIN 키 가설 A 틀림 (acrotpth.otptsrno ≠ esossrno) | P1.5a 첫 호출 시 응답 row 수 + 사용자 sample 매칭 확인. 틀리면 가설 B/C 즉시 시도 |
| `acrrentm.rentfact` JOIN 키 미상 | P1.5a 1차에선 JOIN 생략 (rental_vendor=null) → 사용자 확인 후 키 확정 → 2차 hotfix |
| cafe24 detail 응답 한국어 Buffer 깨짐 | `lib/cafe24-db.ts` 의 typeCast utf8 강제 (이미 적용) |
| acrotpth INSERT 가 ACE 와 동시 안 됨 (대차 미신청) | INNER JOIN → 행 자동 제외 (정상 동작) |
| MariaDB 10.1 회색 함수 (REGEXP_REPLACE) 사용 X | sql-fn-lint 가 자동 차단 (CLAUDE.md 규칙 13) |
| 대차접수 탭 풍성도 vs 응답 크기 | 페이지네이션 (limit 50 default, max 200) — 기존 패턴 동일 |
| 같은 데이터 두 탭 정합성 | DcStatStrip 합산 표시 + 「📊 사고접수 N건 중 대차요청 M건」 안내 위젯 |
| 사고접수 탭 풀스크린 모달과 대차접수 탭 모달 중복 | A/B 섹션 (사고 정보 + 콜센터 메모) 컴포넌트 분리 → 두 모달 공유 |

### 9.6.7 다음 단계 (사용자 결정 대기)

설계서 v2.2 검토 후:

- **「설계 OK / 구현 진행 / ㄱㄱ」** → P1.5a 진입 (새 API + accidents 풍성화)
- **「수정 필요」** → 구체 항목 지적 → v2.3 갱신
- **「P1.5a 만 먼저, b/c 별도 GO」** → 단계 분리 진행

---



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
| 2026-05-11 | Phase 1.4b | 9ec42c7 | `IntakeModalV2` — 상담원 기록 스타일 (A 사고상세 / B 콜센터메모 / C 상담히스토리 / D 새상담 / E dispatch_order) + types.ts 분리 |
| 2026-05-11 | 설계 v2.2 | (本) | § 9.6 Phase 1.5 — 사고접수/대차접수 탭 분리 + 풀스크린 모달 (cafe24 PHP 소스 분석 — 「대차요청 = `acrotpth.otptdcyn='Y'`」 확정) |
| 2026-05-12 | Phase 1.5a | TBD | `/api/operations/cafe24-dispatch-requests` 신설 (5-table JOIN, otptdcyn='Y' 필터) + `/api/operations/cafe24-accidents` 신설 (사고접수 풍성화 — 별도 endpoint, 기존 `/api/cafe24/accidents` 안 건드림). Rule 21 자기 모듈 영역 (operations) 만 사용. |
| TBD | Phase 1.5b | TBD | `/operations/intake` sub-tab + `AccidentDetailFullscreen` (사고접수 풀스크린) |
| TBD | Phase 1.5c | TBD | 대차접수 탭 + `DispatchRequestFullscreen` (sample 메시지 형식 + dispatch_order 흐름) |
| TBD | Phase 2 | TBD | 차량 일정 리뉴얼 + 정비 sub-tab |
| TBD | Phase 3 | TBD | 보험 청구 통합 + 입금% 표출 |
