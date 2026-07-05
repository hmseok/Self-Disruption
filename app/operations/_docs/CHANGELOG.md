# operations (사고대차) — CHANGELOG

> 규칙 22 — 매 PR 한 줄 이상. 이전 이력은 `harness-engineering/handover/` 참조.

## 2026-07-05 PR-FLOW-CONSULT — 배차 탭 상담·배차완료 재편 + 청구 필터 통합
- 사용자 명시: 「접수 → 상담(대차요청은 자동 유입, 미요청은 수동 대차 진행) → 배차입력 → 배차완료」 / 「청구는 전체 맨앞, 처리대상 제거, 청구전·청구중은 청구대상으로 통합」.
- **배차 탭 = 통합 뷰**: cafe24 대차요청이 자동으로 「상담대기」 유입 (버튼 없이). 필터 = 전체 / 📞 상담(대기+진행) / 🚐 배차완료(예정+출고). scope prop 제거.
- 배지: 상담대기 / 상담중 / 배차예정 / 배차완료.
- **청구 탭 필터** = 💰 전체(맨앞, 기본) / 📤 청구대상(청구전+청구중) / ✅ 청구완료. 스탯 카드 동기화.

## 2026-07-05 PR-PAY-SYNC — 입금 자동 반영 + 완납 자동 청구완료
- 그간 매처는 transactions 링크만 걸고 `fmi_rentals.paid_amount`는 아무도 안 써서 항상 빈값이었음 (지급금액·💰 표시 무의미) — 근본 해소.
- **paid_amount 실시간 파생**: fmi-rentals GET에 매칭 입금합계 LEFT JOIN (저장 안 함 — 언링크에도 항상 정합, 규칙 12). payment_status 파생: 완납/부분입금/입금.
- **완납 자동 청구완료**: 청구중 + 입금합계 ≥ 청구액 → settled 자동 전이. 두 진입점 동형(규칙 14): ① auto-match-fmi-rental 적용 직후(결과에 「완납 청구완료 N건」 보고) ② 수동 1클릭 연결(transactions PATCH). 부분입금은 전이 없이 💰 표시만.

## 2026-07-05 PR-STATUS-LANG — 상태 라벨 업무 언어화
- 사용자 명시: 「배차는 상담완료·배차완료, 청구는 청구전·청구중·청구완료, 청구완료에 금액이나 정산 체크」.
- DB status 불변, 라벨만: pending→상담완료 / returned→청구전 / settled→청구완료.
- 청구완료 행 상태 셀에 재무 자동매칭 입금액 표시 (`💰 N만`, 없으면 「입금 대기」) — 입금 = 정산 체크.
- 동형 적용 (규칙 14): ClaimsTab · RentalListTab · RentalDrawer · rentals/[id] · rentals/page.

## 2026-07-04 PR-QUOTE — 상담 단계 견적 저장 + 청구 전파
- **업무 분석 근거**: 청구액 변수 5개(유형·접수번호·과실·청구율·차종군) 중 4개가 상담 단계 확정 — 저장할 자리가 없어 청구 때 재입력하던 구조 해소. (과실=케이스바이케이스, 청구율=보험사별 관행, 견적=상담 대략+청구 최종 — 사용자 확인)
- **V8 마이그레이션**: `operations_dispatch_orders`에 견적 7컬럼 (⏳ 적용 대기 — DATA-MODEL.md).
- **QuoteCalc 공용 컴포넌트** 신규: 배차하기(상담)·드로어·청구 카드 동일 산출기. calcRentalDays/matchLotteRateIdx 단일 소스화 (ClaimsTab 로컬 복사본 제거).
- **배차하기 화면**: 배차 확정 전에도 청구유형·접수번호·견적 입력/저장 (dispatch_orders PATCH, V8 미적용 시 안내 배너 + 기본 필드만 저장). 「↳ 상담 내용에 추가」로 견적 산식 기록 가능.
- **confirm 전파**: 상담 견적 → fmi_rentals (COALESCE — 기존 값 우선). 접수번호는 상담 저장분 우선.
- **드로어**: 💰 청구 정보·견적 섹션 — fmi_rentals 직접 저장 (마이그레이션 불필요).
- API: dispatch-orders 리스트 SELECT `o.*` 전환 (신규 컬럼 자동 포함), PATCH 견적 필드 + 1054 graceful fallback.

## 2026-07-04 PR-UX-SIMPLE — 접수-배차-청구 3단계 단순화
- **탭 4→3**: 접수 / 배차 / 청구 (라벨 단순화). 「사용가능 차량」 탭 버튼 제거 — 배차하기 화면이 이미 사용가능 차량(waiting-vehicles)에서 선택. `?tab=available` 레거시 링크는 계속 동작.
- **버그 복원**: 청구 탭 행 클릭이 상세페이지로 가면서 청구 카드를 열 방법이 없었음 → 행 클릭 = 청구 카드 복원, 상세는 카드 헤더 「전체 편집 →」.
- **컬럼 다이어트**: 접수(캐피탈사·통보자·대차업체·배정공장·접수자 제거), 배차(플릿·입고공장·보험사 → 드로어), 청구(입고공장·보험접수번호·담당자 제거). 제거 정보는 카드·상세에서 확인, 검색은 유지.
- **청구 카드 접기**: 부가세·지급·영업지원은 기본 접힘 (값 있으면 자동 펼침).

## 2026-07-04 PR-UX-CLAIM — 반납→청구 재입력 제거
- **청구 모달 자동 프리필**: 롯데 차종은 대차 차종 문자열 자동 매칭(`matchLotteRateIdx`), 대여일수는 출고~반납 자동 계산(`calcRentalDays`, rental_days 없을 때) → 청구액 산출까지 자동, 「적용」 클릭만.
- **반납 정보 표시**: 청구 모달 참고 정보에 대여기간(출고~반납·일수) + 반납 메모(notes) 추가 — 재입력 대신 확인.
- **반납 → 청구 직행**: 반납 확정 토스트에 「→ 바로 청구 작성」 버튼 → `operations:switch-tab` 이벤트로 탭 전환 + sessionStorage/`?claim=` 로 해당 건 청구 모달 자동 오픈.
- DB·API 변경 없음. 검증: tsc 0 / lint:harness 새 위반 0.

## 2026-07-04 PR-UX-DRAWER — 배차중 드로어 + 상담 타임라인 + 복귀 수정
- **RentalDrawer** (신규): 배차중 탭 행 클릭 → 페이지 이동 없이 우측 드로어. 상담 기록(즉시 저장), 반납예정·담당자 수정, 반납 버튼, 전체 편집 링크. 기존 `GET/PATCH /api/fmi-rentals/[id]` 재사용, DB 변경 없음.
- **ConsultationTimeline** (신규 공용): `consultation_note` 컬럼 그대로, 새 기록은 `[YYYY-MM-DD HH:mm] 내용` 형태로 위에 append. 타임스탬프 없는 기존 텍스트는 「이전 기록」 블록. 드로어 + 상세페이지 양쪽 적용 (규칙 14 동형). 헬퍼 `appendConsultationEntry()` export.
- **복귀 버그 수정**: 상세페이지 ← 목록이 항상 `?tab=claims` 로 가던 것 → 진입 시 `?from=` 전달받아 출발 탭으로 복귀 (RentalListTab→dispatched, ClaimsTab→claims, 직접 진입 폴백 claims).
- 검증: tsc 수정 파일 에러 0 / lint:harness 새 위반 0 (ui-token 1건 발견 즉시 COLORS 토큰 교체).
