# 사고대차 배차 데이터 정제·코드화 + 운영 통합 — 로드맵 (2026-06-28)

> 사용자 명령: 「전부 검수해서, 정제 안 된 서술형은 컬럼 분리해서 정제·코드화, 기존 업무 그대로 가능,
> 기존 데이터 절대 손실 X(컬럼/내용 안 없어지게), 엑셀 + 추가기능 OK」
> 소스 엑셀: `대차 현황(운영페이지).xlsx` (11 시트)

## 0. 핵심 안전 원칙 (절대)
- **fill-only upsert** — 기존 값이 비었거나 `'(미상)'` 인 것만 채움. 기존 내용 **덮어쓰기/삭제 절대 X**.
- 매칭 key = `vehicle_car_number + dispatch_date + customer_car_number` (5월 N3c 마이그레이션과 동일).
- 멱등 (재실행 안전). 컬럼은 **추가만**.

## 1. 현재 상태 (검수 결과)
- cafe24 사고접수: 라이브 (2026-06-28 IP 화이트리스트 복구) ✅
- 빌려타 533건 → fmi_rentals: 5월(`2026-05-22_N3c`) import 완료. **단 lossy** — `customer_name='(미상)'`, `insurance_company=NULL`, 연락처·담당자·생년 누락.
- fmi_rentals: 부가세/영업지원 컬럼 추가 완료 (`2026-06-28_V1`).

## 2. 파서 (코드화) — 서술형 → 컬럼 분리 (Python 검증 완료, TS 포팅 대상)
빌려타 810행 추출 카운트: 우리차 548 / 사고차 572 / 고객명 527 / 고객폰 509 / 담당명 559 / 담당폰 514 / 생년 490 / 자차 45
- `"(1) 125하4239 / G80 2.5(G)"` → seq + vehicle_car_number + vehicle_car_type
- `"이경수/010-6322-2815"` → customer_name + customer_phone (정규식 PHONE)
- `"구자준/010-5569-3439/"` → adjuster_name + adjuster_phone
- `"199호7301/우리"` → customer_car_number + self_vehicle_yn(자차)
- `"생년월일 650809"` → customer_birth
- 주의 quirk: 빌려타 col4("차량위치")는 실제 **청구상태**("지급완료/재청구"). 일부 고객명에 지역("성남시"), 담당자에 보험사명("메리츠실비차량") 섞임 → 케이스 검수.

## 3. 컬럼 매핑 (정제필드 → fmi_rentals)
대부분 기존 컬럼. 신규 추가 2개:
- `dispatch_seq` INT — 차량별 순번 (➕)
- `self_vehicle_yn` TINYINT(1) — 자차 여부 (➕)

## 4. 빌드 순서 (Phase) — 사용자 4개 추가기능 전부 채택

### Phase 1 — 정제 import 기반 (foundation)
- schema: dispatch_seq, self_vehicle_yn 추가
- `lib/dispatch-excel-parser.ts` — 서술형 분리 (§2 로직 TS)
- import API: 엑셀 업로드 → 파싱·정제 → fmi_rentals **fill-only upsert**
- 운영 페이지 "배차 엑셀 가져오기" 버튼 + 미리보기 → 적용
- **[추가 A] 보험사 자동 채우기** — 부가세(캐피탈)·마춤카 시트에서 사고차량번호로 조인 → insurance_company
- 결과: 빌려타 533건 고객명·연락처·담당·생년·보험사 복구

### Phase 2 — [추가 B] 탁송비용 원장 (차량 운용비용)
- 신규 테이블 (예: `fmi_transport_costs`): 배차·회차일지(55건) → 날짜·담당·업무명·사고차량·단가·합계·지급구분(대차팀/사고팀)
- 차량별 탁송비 집계 → 차량 손익/투자자 정산 **비용측** 연결

### Phase 3 — [추가 C] 대차료 입금 ↔ 배차 자동대조
- 통장 입금(transactions) ↔ fmi_rentals(customer_car_number=사고차량번호) 매칭
- 청구 대비 입금률 + 미입금 추적 → 차량 수익 → **투자자 정산 수익측** (사장님 원래 목표 완성)

### Phase 4 — [추가 D] 요금표 자동 청구액 + 관리 알림
- "정비대차요금계산" 시트 → 요금표 테이블, 차종×대여일수 → 청구액 자동 제안 (롯데 요금 자동계산 패턴 재사용)
- 관리 대시보드: 장기 미입금 / 부가세 미청구(법인) / 미회수 한눈에 + 알림

## 5. 보너스 시트 활용 (참고)
- 따봉(120) → 영업지원(이미 컬럼 추가) 채움
- 보유차량 → fleet 마스터 대조
- 출고예약,대기 → 배차 예약 큐 (선택)

## 6.5 사고대차 화면 사용성 개선 (2026-06-28 사용자 피드백 — 진행중)
사용자: 「쓰기가 편해보이지 않는다」 — 4개 개선 요청.
- [x] **stat 카드 클릭 → 리스트 필터** — DcStatStrip 에 onClick/active 추가(하위호환), ClaimsTab 카드 클릭 시 filter 전환 + 활성 강조. ← 완료
- [ ] **RentalListTab(배차중)·WaitingTab 도 카드 클릭 필터** 동일 적용 — 같은 패턴 (StatItem onClick) 복제
- [ ] **흐름 탭 재구성** — 사고접수 → 대차요청 → 배차중 → 반납·청구 순서/단계로. (현재 접수·상담/사용가능/배차중/반납·청구)
- [ ] **상세페이지 사고접수 매칭 표출** — /operations/rentals/[id] 에서 customer_car_number(사고차량번호)로 cafe24 사고접수(cafe24-accidents) 조회 → 「이 배차 = ○○ 사고」 + 링크. (지금 메모만 있고 매칭 표시 없음)
- [ ] **메모 잘못된 값 정제** — 일부 행 담당자 칸에 차종("6인승 반납") 등 소스 오류. 상세페이지에서 수정 가능하나, 검수 도구/일괄정리 검토.
- 데이터 quirk: V3 enrich 가 소스 엑셀 그대로 → 담당자/고객명에 비정상값 섞임. 검수 필요.

## 6.6 운영 DB 적용 완료 (2026-06-28)
- V2(dispatch_seq, self_vehicle_yn) — 이미 존재(중복) → skip
- V3(빌려타 533 enrich) — 적용 완료 (고객명·보험사 등 채움)
- V4(operations_dispatch_orders.delivery_json) — 탁송 배차지시 구조화

## 6.7 반납 오류 + 상담 입력 (2026-06-28 추가)
- **반납 오류 fix**: `/api/fmi-rentals/[id]/return` — UPDATE 를 핵심(status·actual_return_date·notes)과
  옵션(return_mileage·driven_km·fuel·condition·damage·정산금)으로 분리. 옵션은 try/catch graceful skip.
  → `return_fuel_level`/`return_condition` 등이 라이브 DB 미적용이어도 반납 status 전환은 무조건 성공.
- **상담 입력**: fmi_rentals 에 `consultation_note TEXT` 추가(V5, 멱등). 배차 상세페이지(/operations/rentals/[id])
  에 '💬 상담 내용' 섹션(메모와 분리). PATCH ALLOWED_FIELDS += consultation_note, dispatch_seq.
  배차 확정 시 입력은 배차 페이지 consultations 기능이 이미 담당.
- **적용 필요**: `migrations/2026-06-28_V5_fmi_rentals_consultation_note.sql` (Cloud SQL 실행).

## 7. 산출물 위치
- 파싱 검증본: outputs/billyeota_normalized.json (810행 정제 결과)
- 5월 import: migrations/2026-05-22_N3c_bilryeota_import.sql (533 INSERT, 멱등)
- 부가세 컬럼: migrations/2026-06-28_V1_fmi_rentals_vat_sales.sql
