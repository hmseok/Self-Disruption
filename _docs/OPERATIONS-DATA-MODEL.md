# 차량운영 (Operations) — 데이터 모델 도식

> **작성**: 2026-05-11 (sweet-amazing-galileo 메인 세션)
> **목적**: 신설 operations 세션이 데이터 구조 파악할 수 있게 도식 제공.
> **Rule**: CLAUDE.md Rule 22 (_docs 갱신 의무) + Rule 11/12 (SQL 컬럼 검증).
> **상태**: 1차 초안 — 현 시점 (2026-05-11) 운영 사실 반영. 추가 마이그 후 갱신.

---

## 1. 핵심 테이블 4개

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│      cars       │     │  fmi_vehicles   │     │  ride_vehicles  │
│  (INT id 1500+) │     │   (UUID, FK 대상) │     │  (별도 회사 차?) │
└────────┬────────┘     └────────┬────────┘     └─────────────────┘
         │                       │
         │ car_number JOIN       │ id (UUID)
         │ (PR-UX14 동기화 대상)   │ ←── FK ──┐
         │                       │           │
         └───────────────────────┘           │
                                              │
                                    ┌─────────┴────────┐
                                    │   fmi_rentals    │
                                    │ (vehicle_id UUID) │
                                    │  customer_car_no  │
                                    └──────────────────┘
```

### 1.1 `cars` — 레거시 차량 테이블 (INT id)
- **목적**: **회사 직영 대차용 차량 등록 (2026-05-11 진단: 18건)**
- **PK**: `id INT AUTO_INCREMENT`
- **컬럼**: `number` (차량번호), `brand`, `model`, `year`, `status`
- **상태**: 18건 (활성), 모두 2025년식 (1건 2023 G80) — EV6/Model Y/아이오닉/카니발/벤츠 등
- **중요**: `fmi_rentals.customer_car_number` (고객차) 는 여기 안 들어감 — **회사 보유 차량만**
- **문제**: `fmi_rentals.vehicle_id FK` 가 `fmi_vehicles.id (UUID)` 를 가리키는데 cars 는 INT id → 매핑 불가

### 1.2 `fmi_vehicles` — 신규 FK 대상 테이블 (UUID)
- **목적**: `fmi_rentals` 의 `vehicle_id FK` 대상 (2026-05 신설)
- **PK**: `id CHAR(36)` (UUID)
- **컬럼**: `car_number`, `car_brand`, `car_model`, `car_year`, `ownership_type` ('owned' / 'jiip' / 'investor')
- **상태**: **0건 → PR-UX14 동기화 후 cars 기준 채울 예정**
- **권장 진행**: cars 활성 차량 모두 fmi_vehicles 로 UUID 신규 발급 + INSERT

### 1.3 `fmi_rentals` — 대차/배차 기록 (사용자 본업 핵심)
- **목적**: 사고 대차 + 단기/장기 렌탈 통합 관리
- **PK**: `id CHAR(36)` (UUID)
- **FK**: `vehicle_id` → `fmi_vehicles.id` (필수, 현재 NULL 다수)
- **컬럼**: `rental_no`, `customer_name`, `customer_phone`, `customer_car_number`, `vehicle_car_number`, `insurance_company`, `insurance_claim_no`, `adjuster_name`, `dispatch_date`, `expected_return_date`, `actual_return_date`, `rental_days`, `daily_rate`, `total_rental_fee`, `final_claim_amount`, `status`
- **상태 enum**: `pending / dispatched / returned / claiming / settled / cancelled`
- **현 상태**: 546건 → 모두 `vehicle_id NULL` (PR-UX12/13 으로 매핑 시도 중)

### 1.4 `ride_vehicles` — 별도 회사 차량 (Ride*)
- **목적**: 다른 세션 (Ride* 모듈) 책임 — 본 세션과 분리
- 본 세션 (operations) 은 참조 권장하지 않음
- 추후 통합 필요 시 사용자 결정

---

## 2. 연결 — `transactions` (finance) ↔ `fmi_rentals`

```
┌─────────────────────────────────┐
│         transactions            │  (통장 / 카드 거래)
│  - amount                       │
│  - type (income/expense)        │
│  - related_type ('fmi_rental')  │  ←── 매칭 결과
│  - related_id (fmi_rentals.id)  │
│  - description                  │
│  - imported_from (bank/card)    │
└───────────────┬─────────────────┘
                │
       ┌────────┴────────┐
       │  매처 4종:                          │
       │  - auto-match-fmi-rental           │
       │  - auto-match-investor-jiip        │
       │  - auto-match-freelancer            │
       │  - auto-match-insurance-payment    │
       └────────────────────────────────────┘
                │
       ┌────────┴────────────────────────┐
       │   transaction_assignments       │
       │  - transaction_id               │
       │  - target_type (rental/owner)    │
       │  - target_id                    │
       │  - status (pending/confirmed/   │
       │            rejected)            │
       │  - confirmed_at, confirmed_by   │
       └─────────────────────────────────┘
```

### 핵심: 매칭 정확도는 `fmi_rentals.vehicle_id` 정확성에 의존
- `vehicle_id` 비어있으면 차량 식별 fallback (vehicle_car_number) → 부정확
- `vehicle_id` 채워지면 매처 100% 정확 매칭

---

## 3. 현재 데이터 상태 (2026-05-11)

| 테이블 | 건수 | 상태 | 비고 |
|--------|------|------|------|
| `cars` | **18** (2026-05-11 진단) | 회사 직영 대차용 | EV6 / Model Y / 아이오닉 / 카니발 등 |
| `fmi_vehicles` | **0** | 비어있음 | **PR-UX14 동기화 대상 (18건)** |
| `fmi_rentals` | 546 (이전 진단) | 모두 vehicle_id NULL | PR-UX13 일괄 매핑 도구 신설 |
| `transactions` | 다수 | finance 매처 가동 중 | 검수 큐 운영 |
| `ride_vehicles` | (다른 세션) | — | 본 세션 미참조 |

---

## 4. 마이그레이션 이력 (시간순)

| 일자 | 변경 | 이유 |
|------|------|------|
| 2026-04~ | cars 테이블 운영 | 초기 구조 |
| 2026-05-09 | fmi_rentals 신설 + vehicle_id FK | 대차 관리 통합 |
| 2026-05-09 | fmi_vehicles 신설 (UUID FK 대상) | INT id 와 분리 |
| 2026-05-10 | hotfix: 매처 fmi_vehicles 전환 | 잘못된 cars 참조 정정 |
| 2026-05-11 | PR-UX14 cars→fmi_vehicles 동기화 도구 | 0건 상태 해결 |
| 2026-05-11 | Phase 1.1 operations_dispatch_orders 신설 (c01656e) | 사고 → 대차 상담/일정 |
| 2026-05-11 | Phase 1.1 fmi_rentals.billed_at / billed_by 컬럼 추가 (c01656e) | 청구 입력 추적 |
| TBD | Phase 1.4a operations_consultations 신설 | 단일 dispatch_order 에 상담 누적 (상담원 기록 스타일) |
| TBD | fmi_rentals 일괄 매핑 재실행 | vehicle_id NULL 해결 |

---

## 5. 신설 operations 세션 작업 시 주의

### 5.1 새 테이블 추가 시
- **UUID PK** 사용 권장 (fmi_* 표준 따름)
- INT id 신규 사용 금지 (cars 레거시 외)
- 마이그레이션 SQL: `IF NOT EXISTS` 가드 + 검증 SELECT (Rule 23)
- 시드 데이터: `INSERT IGNORE` / `ON DUPLICATE KEY UPDATE` 멱등성 (Rule 24)

### 5.2 기존 테이블 컬럼 추가
- 모든 변경 prisma/schema.prisma 반영 (Rule 11 컬럼 검증)
- 마이그레이션 SQL 별도 작성
- 사용자 적용 후 작업 진행

### 5.3 모듈 영역 (Rule 21)
- 본 세션 (operations) 자율 commit: `app/operations/*`, `app/api/operations/*`
- 공통 파일 변경 시 사용자 사전 보고 + GO 대기
- `prisma/schema.prisma`, `lib/menu-registry.ts`, `app/components/PageTitle.tsx` 등은 합의 의무

### 5.4 데이터 모델 변경 사용자 결정 사항

| 사항 | 결정 필요 | 본 세션 권장 |
|------|----------|------------|
| cars 처분 | fmi_vehicles 완전 이행 후 archive? | 6개월 데이터 검증 후 결정 |
| ride_vehicles 통합 | 별도 회사 차로 분리 유지? | 사용자 결정 — 회사 구조 영향 |
| 차량 상태 enum | 현재 status / detailed_status 2개 | 통합 권장 (operations 세션 작업) |
| 출고/반납 기록 | vehicle_operations 별도 테이블 | 현재 fmi_rentals 안 dispatch_date/return_date — 단순 케이스 OK, 복잡해지면 분리 |

---

## 6. 진단 도구 (이미 신설)

### `/api/finance/cars-to-fmi-vehicles-sync` (PR-UX14)
- GET — 동기화 가능 차량 통계 + 샘플 10건
- POST — 실제 INSERT (`{ dryRun: true }` 또는 `false`)

### `/api/finance/fmi-rentals-fix` (PR-UX13)
- GET — vehicle_id NULL 진단 + 매핑 가능 통계
- POST — vehicle_car_number → fmi_vehicles 일괄 매핑

### 사용 순서 (현 시점)
1. `cars-to-fmi-vehicles-sync` GET — 동기화 가능 확인
2. `cars-to-fmi-vehicles-sync` POST `{ dryRun: true }` — dry-run 검증
3. `cars-to-fmi-vehicles-sync` POST `{ dryRun: false }` — 실 동기화
4. `fmi-rentals-fix` POST — vehicle_id 일괄 매핑
5. finance 매칭 1-Click 자동 → 검수 큐 → 확정 → 정산

---

본 문서는 운영 중 데이터 모델 변경에 따라 갱신.
