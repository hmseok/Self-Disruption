# 배차 시스템 재구성 설계서

> **작성**: 2026-05-09 (sweet-amazing-galileo 세션)
> **목적**: 사용자가 ERP 안에서 실제 업무 (배차 / 상담 / 이력 / 정산) 를 할 수 있도록 본업 시스템 재구성. 매칭/정산 정확도 자연 향상.
> **협업**: 다른 cowork 세션과 협업 필수 (RideAccidents / RideVehicleRegistry / fmi_rentals 등 영역).

---

## 1. 현재 상태 (2026-05-09)

### 1.1 데이터 source
- 카페24 ERP (skyautosvc.co.kr) — `acrotpth`, `aceesosh`, `pmccarsm` (read-only)
- 자체 DB — `cars`, `fmi_rentals`, `ride_employees`, `ride_vehicles`, `transactions`
- 엑셀 import — `transactions`, `fmi_rentals` (수동 등록)

### 1.2 한계
- **데이터 정합성 ↓** — 엑셀 import 의존 → vehicle_id 매핑 누락
- **사후 처리** — 매칭 매처가 추측해서 시도 (50% 정확)
- **사용자 검수 부담** — 매번 잘못된 매칭 제거
- **본업 시스템 X** — 직원이 ERP 에서 실제 업무 못 함 (카페24 + 엑셀 의존)

---

## 2. 목표 — 본업 시스템 통합

### 2.1 운영 흐름 (이상적)
```
사고 발생
  → 카페24 acrotpth (사고 접수) — 외부에서 자동 입력
  → /RideAccidents (read-only) 에서 보면서
  → /RideAccidents 「대차 배정」 버튼 클릭
  → fmi_rentals 자동 생성:
       customer_car_number = acrotpth.사고차량번호
       vehicle_id          = 직원이 선택한 우리 cars.id
       insurance_company   = acrotpth.보험사
  → 사고 종료 → 보험사 청구
  → 보험금 통장 입금
  → auto-match-fmi-rental 매처 자동 매칭 (vehicle_id 기반 100% 정확)
  → 정산 = 차량별 정확한 보험금 수익
```

### 2.2 신규 기능 (사용자 명시)
- **배정 (Dispatch)** — 사고/요청 → 차량 배정 + 운행 등록
- **고객 상담 이력** — 고객별 상담 기록 + 다음 액션
- **차량 사용 이력** — 차량별 운행 기록 (장기/단기/대차)
- **단순 렌탈 계산기** — 일/주/월 단위 견적 (현재 quotes 모듈 기반 강화)
- **뷰** — 대시보드 (오늘 배차 / 진행 중 사고 / 입금 대기 등)

---

## 3. 모듈 분담

| 모듈 | 영역 | 담당 세션 |
|------|------|----------|
| /RideAccidents | 사고 접수 (카페24 read + 우리 자체 입력) | 다른 세션 (cx-team) |
| /RideAccidentReports | 사고 상세 / 처리 진행 | 다른 세션 (cx-team) |
| /RideVehicleRegistry | 우리 차량 등록 (ride_vehicles) | 다른 세션 |
| /RideSettlements | 고객사 마감자료 정산 | 다른 세션 |
| /RideCustomerData | 고객 데이터 | 다른 세션 |
| **fmi_rentals** | 대차건 (사고 + 우리 차량 매핑) | **공동 작업** |
| **finance/auto-match-*** | 매칭 매처 | **본 세션 (sweet-amazing-galileo)** |
| **finance/insurance** | 보험계약 + 분담금 | **본 세션** |
| **/finance/investor** | 투자/지입 정산 | **본 세션** |

---

## 4. 우선순위 — Phase 별

### Phase 1 — 매칭 정확도 단기 개선 (본 세션 — 즉시)
- [x] PR-UX1~UX11 — 매처 + 검수 + 정산 UI 개선
- [x] PR-UX12 — 매처 vehicle_id fallback 강화
- [x] PR-UX13 — fmi_rentals 진단 + 일괄 매핑 도구

### Phase 2 — 본업 통합 (협업 필수)
**Phase 2.1: 카페24 → fmi_rentals 동기화** (다른 세션 작업 필요)
- /RideAccidents 안에 「대차 배정」 버튼 신설
- 클릭 시 모달:
  - 사고 정보 자동 표시 (acrotpth.사고차량번호 / 보험사 / 일자)
  - 우리 차량 선택 (cars dropdown)
  - 배정 일자 / 종료 예정일
  - [💾 저장] → fmi_rentals INSERT (vehicle_id 채워짐)
- 본 세션 협업: fmi_rentals 스키마 + auto-match 매처 동작 확인

**Phase 2.2: 차량 운행 이력** (다른 세션)
- /RideVehicleRegistry 확장 — 차량별 사용 이력 (대차 / 장기 / 단기)
- 본 세션 협업: 차량별 정산 데이터 (transactions related_type='car')

**Phase 2.3: 고객 상담** (다른 세션)
- /RideCustomerData 확장 — 상담 이력 / 다음 액션 / 응답 history

### Phase 3 — 자체 사고 접수 + 단순 렌탈 (장기)
- 카페24 의존 ↓ → 자체 ERP 에서 사고 접수
- 단순 렌탈 계산기 — quotes 모듈 강화

---

## 5. 데이터 모델 변경 제안 (협의 필요)

### 5.1 fmi_rentals 보강
```sql
ALTER TABLE fmi_rentals
  ADD COLUMN cafe24_otpt_idno VARCHAR(64) NULL COMMENT '카페24 acrotpth.otptidno 연결',
  ADD COLUMN cafe24_otpt_mddt DATE NULL COMMENT '카페24 acrotpth.otptmddt',
  ADD COLUMN cafe24_otpt_srno INT NULL COMMENT '카페24 acrotpth.otptsrno',
  ADD COLUMN dispatch_status ENUM('requested','dispatched','active','returned','closed') DEFAULT 'requested',
  ADD COLUMN dispatched_by CHAR(36) NULL COMMENT '대차 배정한 직원 (profiles.id)',
  ADD COLUMN dispatched_at DATETIME NULL,
  ADD INDEX idx_cafe24_link (cafe24_otpt_idno, cafe24_otpt_mddt, cafe24_otpt_srno);
```

→ 카페24 acrotpth row 와 1:1 연결. 사용자가 「대차 배정」 시 cafe24_* 채워서 trace.

### 5.2 ride_vehicle_history (신규 — 다른 세션)
```sql
CREATE TABLE ride_vehicle_history (
  id CHAR(36) PRIMARY KEY,
  car_id CHAR(36) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  use_type ENUM('rental','dispatch','jiip','invest','idle'),
  ref_table VARCHAR(64),
  ref_id CHAR(36),
  ...
);
```

### 5.3 customer_consultation (신규 — 다른 세션)
```sql
CREATE TABLE customer_consultation (
  id CHAR(36) PRIMARY KEY,
  customer_id CHAR(36),
  consultation_date DATETIME,
  topic VARCHAR(128),
  content TEXT,
  next_action VARCHAR(128),
  next_due DATE,
  ...
);
```

---

## 6. 협업 흐름 (다른 세션과)

### 6.1 본 세션 (sweet-amazing-galileo) 책임
- finance/* (매칭 / 검수 / 정산 / 보험 / 분담금)
- 매처 정확도 개선
- 정산 정확성 검증

### 6.2 다른 세션 (RideAccidents / Vehicle / Customer 등) 책임
- 사고 접수 + 대차 배정 UI
- 차량 운행 이력
- 고객 상담 이력
- /RideAccidents 「대차 배정」 모달 → fmi_rentals 생성

### 6.3 공유 영역 (충돌 방지)
- `fmi_rentals` 스키마 변경 → 한 세션이 마이그레이션 + 다른 세션 코드 업데이트 협의
- `cars` 테이블 — 양쪽 모두 read 만 (수정은 RideVehicleRegistry 만)
- `transactions` — 본 세션만 수정 (매처 / 검수)

---

## 7. 추적 (Phase 2 진행 시 갱신)

- [ ] Phase 2.1 — /RideAccidents 「대차 배정」 (다른 세션)
- [ ] fmi_rentals 스키마 보강 (협의)
- [ ] Phase 2.2 — ride_vehicle_history (다른 세션)
- [ ] Phase 2.3 — customer_consultation (다른 세션)
- [ ] Phase 3 — 자체 사고 접수 (장기)

---

본 문서는 협업 진행 상태에 따라 갱신.
