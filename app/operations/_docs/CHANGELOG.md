# operations (사고대차) — CHANGELOG

> 규칙 22 — 매 PR 한 줄 이상. 이전 이력은 `harness-engineering/handover/` 참조.

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
