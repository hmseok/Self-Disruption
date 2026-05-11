# 차량운영 (Operations) — 페르소나 & 시나리오

> **작성**: 2026-05-11 (sweet-amazing-galileo 메인 세션)
> **목적**: 신설 operations 세션이 시작 시 1차 참고. 배차담당자 중심 워크플로우 명시.
> **Rule**: CLAUDE.md Rule 26 (페르소나 사전 워크-스루) 의무.
> **상태**: 1차 초안 — 사용자 검수 후 확정. 운영 사실 추가 인터뷰 필요 시 사용자 답변 받아 갱신.

---

## 0. 운영 사실 인터뷰 (Rule 25 의무)

| 항목 | 본 세션 추정 (확인 필요) |
|------|------------------------|
| 운영 시간 | 사고/대차 24/365 가능 (보험사고는 야간도 발생) |
| 주 페르소나 | **배차담당자** (사용자 명시) |
| 보조 페르소나 | 사고 접수자 (CX) / 정산담당자 (회계) / 매니저 |
| 마스터 데이터 변동 | 차량 추가/처분 빈번 (월 N건) — fmi_vehicles 등록 워크플로우 필요 |
| 부서 차이 | 사고대차 vs 단기/장기 렌탈 — 다른 흐름 |
| 외부 시스템 | 카페24 acrotpth (사고접수) — read-only 동기화 |

> ⚠️ 미확인 항목 — 사용자 답변 필요:
> - 야간 사고 대차도 24시간 가능? 또는 09-18 처리?
> - 배차담당자 1명/팀? 동시 처리 건수?
> - 차량 출고/반납 직접 차주에게 vs 차고지 방문?

---

## 1. 페르소나 1 — 배차담당자 (주 페르소나)

### 1.1 프로필
- 직무: 사고 발생 → 대차 차량 배정 + 출고/반납 + 보험 청구 준비
- 도구 (현재): **카페24 ERP** (사고 접수 확인) + **엑셀** (배차 기록) + **카카오톡** (고객/보험사 소통)
- 도구 (이상): **FMI ERP** 한 곳에서 모두 처리
- 페인 포인트:
  1. 카페24 ↔ FMI ↔ 엑셀 3중 입력 → 정합성 깨짐
  2. 차량 상태 (가용/배차 중/정비 중) 실시간 확인 어려움
  3. 매칭/정산 시 vehicle_id 누락 → 사후 매핑 부담
  4. 사고 진행 단계 (사고접수 → 대차 → 수리 → 종결) 시각화 부재

### 1.2 KPI
- 대차 차량 가동률 (낮은 공차 시간)
- 사고 발생 → 대차 배정 시간 (목표 1시간 이내)
- 보험사 청구 데이터 정합성 100% (vehicle_id / 일자 / 일대)

---

## 2. 시나리오 — 사고 대차 워크플로우 (End-to-End)

### Step 1. 사고 접수 인지 (외부 → ERP)
- 카페24 `acrotpth` 에 사고 신규 등록 (CX 팀 또는 외부 채널)
- FMI ERP `/RideAccidents` 가 read-only 동기화 (다른 세션 책임)
- 배차담당자가 `/operations` 또는 `/operations/intake` 에서 **신규 사고 알림** 확인
- **필요 데이터**: 사고차량 (`고객차`) 번호, 보험사, 사고일, 고객 연락처

### Step 2. 대차 차량 선정
- `/operations/rentals` 또는 신설 `/operations/dispatch` 에서:
  - 가용 차량 목록 (fmi_vehicles.ownership_type='owned' + 현재 미배차)
  - 차종/위치/연식 필터
  - **드래그 or 클릭으로 차량 선택**
- 시스템 자동 검증:
  - 해당 차량이 이미 fmi_rentals 에 active 상태로 있으면 차단
  - 보험사가 인정하는 동급차 여부 표시

### Step 3. fmi_rentals 등록
- 모달:
  - 고객차 번호 (acrotpth 에서 자동)
  - 우리 차량 (Step 2 선택) → `vehicle_id` 자동 채움 (UUID)
  - 배차일 / 예상 반납일 / 일대료
  - 보험사 / 청구번호 / adjuster (담당자)
- **commit 시 INSERT INTO fmi_rentals (vehicle_id=UUID, customer_car_number, insurance_company, ...)**
- `status='dispatched'`

### Step 4. 출고 (현장)
- 차량 키 전달 + 인수 사진 (외관/계기판)
- ERP 모바일 뷰 (옵션) — 사진 업로드 + GPS
- `status='dispatched'` 유지, `actual_dispatch_at=NOW()`

### Step 5. 진행 중 — 사고 수리 모니터
- 공장 입고 / 수리 진행 / 부품 수급 등 사고 상세는 `/RideAccidents` 측 (다른 세션 책임)
- 본 페이지 (operations) 는 **대차 진행 일수** + **예상 반납 일자** 만 표시

### Step 6. 반납
- 차량 회수 → ERP 「반납 처리」 클릭
- 실제 일대 = (반납일 - 배차일) × daily_rate
- 추가비용 (사고/오염/연료) 입력
- `status='returned'`, `actual_return_date=NOW()`, `total_rental_fee=N`

### Step 7. 보험사 청구
- ERP 자동 청구 양식 생성 (PDF / 엑셀)
- `status='claiming'`
- 보험사 입금 대기

### Step 8. 정산 (finance 세션 책임)
- 통장 입금 SMS → `transactions` 신규 row
- `auto-match-fmi-rental` 매처 자동 매칭 (vehicle_id 기반 100% 정확)
- 검수 큐 → 확정 → `fmi_rentals.status='settled'`
- 차량별 보험금 수익 정확 계산

---

## 3. 페르소나 2 — 사고 접수자 (CX, 다른 세션)

- /RideAccidents 에서 외부 접수 처리
- 본 세션 책임 외 — Rule 21 cowork 협업 의무 (intake 페이지에서 read-only 동기화)

## 4. 페르소나 3 — 매니저

- /operations 메인 대시보드:
  - 오늘 배차 N건 / 진행 중 M건 / 입금 대기 K건
  - 차량 가동률 (월간)
  - 이상 신호 (예상 반납일 초과, 매칭 누락 등)
- read-only 중심, 의사결정용

## 5. 페르소나 4 — 정산담당자 (finance 세션 책임)

- /finance/bank-card + /finance/settlement 에서 처리
- operations 와 데이터 연결만 (fmi_rentals.vehicle_id ↔ transactions.matched_*)

---

## 6. 현재 페이지 매핑 — Gap 분석

| 페이지 | 현재 (1247줄 OperationsMain 등) | 목표 (Step ↔) | Gap |
|--------|------------------------------|-------------|------|
| `/operations` (Main) | Calendar / FleetBoard / DispatchModal | Step 2/3/5 통합 대시보드 | 차량 가용 상태 실시간성 부족 |
| `/operations/rentals` | fmi_rentals 목록 (463줄) | Step 5/6 진행 모니터 | vehicle_id 누락 다발 — 데이터 마이그 우선 |
| `/operations/intake` | 사고접수 + 대차요청 (791줄) | Step 1 인지 | 카페24 동기화 + 대차요청 워크플로우 |
| `/operations/intake-bulk` | 일괄 입력 (375줄) | 이행 마이그용 | 단발 운영 후 사용 빈도 ↓ |
| **신설 `/operations/dispatch`** | — | **Step 2/3** 차량 선정 + 등록 | 본 작업 |

---

## 7. 신설 operations 세션 작업 우선순위

### Phase 1 — 데이터 정합 (본 세션이 사전 완료)
- [x] cars 1500+건 → fmi_vehicles UUID 동기화 (PR-UX14)
- [x] fmi_rentals.vehicle_id 일괄 매핑 (PR-UX13 → 재실행 예정)
- [x] _docs/OPERATIONS-DATA-MODEL.md 도식

### Phase 2 — 페이지 리뉴얼 (operations 세션)
1. `/operations` 메인 — 배차담당자 대시보드 (정산 관리 디자인 기준)
2. `/operations/dispatch` 신설 — Step 2/3 차량 선정 + 모달
3. `/operations/rentals` 리뉴얼 — 진행 모니터 + 검색/필터 강화
4. `/operations/intake` — 카페24 동기화 read + 대차요청 액션
5. 모바일 뷰 (옵션) — 현장 출고/반납

### Phase 3 — 매칭 자동화 (본 세션 + operations 세션 협업)
- fmi_rentals 등록 시 `vehicle_id` 강제 (DB 제약)
- finance/auto-match-fmi-rental 매처 정확도 100% 달성

---

## 8. 디자인 표준 (이미 확정)

신설 operations 세션은 `_docs/UI-DESIGN-STANDARD.md` 정독 + 다음 의무:
- `PageTitle` 자동 사용 (자체 헤더 X)
- `DcStatStrip` (5 stat + 액션 버튼)
- `DcToolbar` (검색 + 필터)
- `NeuDataTable` (정렬 가능 테이블, Rule 18)
- Glass 5단계 (Level 5/4/3/2/1)
- Soft Ice 색상 (Blue/Green/Red/Amber/Purple 틴트)

기준 페이지: `/loans` (대출 관리) + `/finance/settlement` (정산 관리)

---

## 9. 본 세션 ↔ operations 세션 인계 체크리스트

신설 operations 세션 시작 시 다음 5분 작업:

1. `git pull origin main` + `npm run cowork:init`
2. `CLAUDE.md` 정독 (Rule 21 협업 / Rule 22 _docs / Rule 26 페르소나)
3. `_docs/SESSIONS-COORDINATION.md` 자기 모듈 영역 확인
4. **본 문서 (OPERATIONS-PERSONAS.md)** 정독 → 시나리오 이해
5. `_docs/OPERATIONS-DATA-MODEL.md` 정독 → 데이터 구조 이해
6. `_docs/UI-DESIGN-STANDARD.md` 정독 → 디자인 표준
7. `app/finance/settlement` 페이지 한 번 열어보고 기준 동작 확인

본 페이지가 완성된 후 → Phase 2 작업 시작.

---

본 문서는 운영 중 사용자 피드백에 따라 갱신.
