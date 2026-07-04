# operations (사고대차) — CHANGELOG

> 규칙 22 — 매 PR 한 줄 이상. 이전 이력은 `harness-engineering/handover/` 참조.

## 2026-07-04 PR-UX-DRAWER — 배차중 드로어 + 상담 타임라인 + 복귀 수정
- **RentalDrawer** (신규): 배차중 탭 행 클릭 → 페이지 이동 없이 우측 드로어. 상담 기록(즉시 저장), 반납예정·담당자 수정, 반납 버튼, 전체 편집 링크. 기존 `GET/PATCH /api/fmi-rentals/[id]` 재사용, DB 변경 없음.
- **ConsultationTimeline** (신규 공용): `consultation_note` 컬럼 그대로, 새 기록은 `[YYYY-MM-DD HH:mm] 내용` 형태로 위에 append. 타임스탬프 없는 기존 텍스트는 「이전 기록」 블록. 드로어 + 상세페이지 양쪽 적용 (규칙 14 동형). 헬퍼 `appendConsultationEntry()` export.
- **복귀 버그 수정**: 상세페이지 ← 목록이 항상 `?tab=claims` 로 가던 것 → 진입 시 `?from=` 전달받아 출발 탭으로 복귀 (RentalListTab→dispatched, ClaimsTab→claims, 직접 진입 폴백 claims).
- 검증: tsc 수정 파일 에러 0 / lint:harness 새 위반 0 (ui-token 1건 발견 즉시 COLORS 토큰 교체).
