# 계약 구조 통합 — A안 실행 계획

확정: 2026-07-30 사용자 ("a 안이 좋네요") · 근거 목업: `_mockups/contract-structure-compare.html`

## 1. A안 구조 (확정)

사이드바 「계약」 1메뉴 대신 **사업 성격으로 분리한 2메뉴**:

```
📑 장기계약    견적 · 원장/수납 · 만기 관리 (3탭)   — 영업 담당자의 하루
🚙 단기·대차   접수/견적 · 오늘 배차/반납 · 보험사 청구 · 단기 원장 (4탭) — 배차/보험 담당자의 하루
```

## 2. 데이터 매핑 (현행 → A안)

| A안 화면 | 데이터 소스 | 현행 페이지 |
|---|---|---|
| 장기계약 > 견적 | `lt_quotes` | /long-term-rentals 견적 탭 |
| 장기계약 > 원장·수납 | `long_term_rentals` (+수납 연결) | /long-term-rentals |
| 장기계약 > 만기 관리 | `long_term_rentals` (end_date 필터) | (신규 뷰) |
| 단기·대차 > 접수/견적 | `fmi_accidents` + `fmi_rentals` | /operations 사고접수·대차접수 |
| 단기·대차 > 배차/반납 | `fmi_rentals` | /operations 배차스케줄 |
| 단기·대차 > 보험사 청구 | `fmi_claims` | /operations 청구관리 |
| 단기·대차 > 단기 원장 | `fmi_rentals` 전체 | (신규 뷰) |
| (통합 계약 원장 — 홈/보고용) | long_term_rentals + fmi_rentals UNION 뷰 | (신규 API) |

## 3. 구 `contracts` 계통 처리

- L1 마이그레이션 주석(2026-05-24): **"기존 contracts 는 비어 있어 의존하지 않고 전용 테이블 신설"** → 구 계통에 실데이터가 없을 가능성이 높음.
- ⚠ **실행 전 확인 필수** (사용자 또는 Cloud SQL Studio):
  ```sql
  SELECT COUNT(*) FROM contracts;          -- 0 이면 마이그레이션 불필요
  SELECT COUNT(*) FROM payment_schedules;  -- 0 이면 함께 은퇴
  ```
- **0건이면**: 데이터 마이그레이션 없이 /contracts 페이지·메뉴 은퇴(HIDDEN_PATHS) → 9단계에서 코드 삭제.
- **데이터가 있으면**: contracts → long_term_rentals 이전 스크립트 작성 (컬럼 매핑: customer_name/start_date/end_date/monthly_rent→monthly_fee/deposit/status). 멱등 + 사용자 승인 후 실행 (CLAUDE.md 규칙 7).

## 4. 구현 순서

1. ✅ **메뉴 1보** — 사이드바 core: 「계약」→ 「장기계약」(/long-term-rentals) + 「단기·대차」(/operations). 구 /contracts 는 세부 화면으로 강등 (데이터 확인 전까지 접근 유지).
2. 장기계약 페이지 3탭 재구성 (견적/원장·수납/만기) — 기존 /long-term-rentals 리팩터, 새 쿼리는 타입드 Prisma (규칙 8)
3. 단기·대차 페이지 4탭 재구성 — 기존 /operations 리팩터
4. 통합 계약 원장 API (홈 만기 카운트 대체 — 현재 양계통 합산 로직 단순화)
5. contracts 계통 은퇴 (3장 확인 결과에 따라)

## 5. 배차 완료 → 차량 상태 자동 동기화 (REDESIGN 원칙)

- 단기 배차 완료 시 cars.status 자동 「대여중」 — 2·3단계에서 함께 구현 (수동 상태 변경 제거).
