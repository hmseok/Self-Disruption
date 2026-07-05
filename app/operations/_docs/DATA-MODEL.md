# operations (사고대차) — DATA-MODEL

> 규칙 22. 마이그레이션 추가 시 본 문서 갱신.

## 흐름 요약

```
cafe24 대차요청 (외부)
  → operations_dispatch_orders (상담 단계 — 견적 포함, V8)
  → [confirm] fmi_rentals (배차~청구 원장) ← 견적 전파
  → 반납(returned) → 청구(claiming) → 정산(settled)
```

## operations_dispatch_orders (상담 단계)

| 컬럼 | 도입 | 설명 |
|---|---|---|
| consultation_note | V5 | 상담 내용 — confirm 시 fmi_rentals 전파 |
| delivery_json | PR-V4 | 탁송 지시 구조 |
| cafe24_otpt_idno/mddt/srno | P2.1c | cafe24 대차요청 키 |
| **claim_type** | **V8** | 청구유형 — 상담 단계 확정 |
| **insurance_claim_no** | **V8** | 보험 접수번호 |
| **fault_rate / claim_rate** | **V8** | 과실율·청구율(%) — 케이스바이케이스 / 보험사별 관행 |
| **quote_vehicle_category** | **V8** | 견적 차종 (롯데 요금표 행 라벨) |
| **quote_days / quote_amount** | **V8** | 견적 일수 / 예상 청구액(VAT 포함) |

**confirm 전파 규칙** (`dispatch-orders/[id]/confirm`): claim_type·fault_rate·claim_rate·insurance_claim_no·quote_amount(→final_claim_amount)를 fmi_rentals에 `COALESCE`(기존 값 우선)로 복사. V8 미적용 DB는 graceful skip.

## fmi_rentals (배차~청구 원장)

청구 관련: claim_type, insurance_claim_no, fault_rate, claim_rate, final_claim_amount,
vat_* (V1), sales_* (V1), consultation_note (V5), repair_factory (N6c).
반납 관련: actual_return_date, return_mileage/driven_km 등 (옵션 컬럼 — graceful).

## 견적 산식 (QuoteCalc 공용 — lib/lotte-short-term-rates)

```
청구액 = 구간일요금(1~3/4/5~6/7일+) × 일수 × 과실율% × 청구율%   (VAT 포함)
```

사용처: 배차하기(상담) · RentalDrawer(배차 탭) · 청구 카드 — 규칙 14 동형.

## 마이그레이션 인덱스

| 파일 | 내용 | 적용 |
|---|---|---|
| 2026-06-28_V5 | fmi_rentals.consultation_note | ✅ |
| 2026-06-28_V6 | 빌려타 엑셀 refresh | ✅ |
| 2026-06-28_V7 | fmi_rentals.vehicle_id 백필 | ✅ |
| **2026-07-04_V8** | **dispatch_orders 견적 7컬럼** | ⏳ 사용자 적용 대기 |
