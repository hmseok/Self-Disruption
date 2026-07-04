# operations (사고대차) — CHANGELOG

> 규칙 22 — 매 PR 한 줄 이상. 이전 이력은 `harness-engineering/handover/` 참조.

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
