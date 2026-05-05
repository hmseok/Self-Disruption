# CHANGELOG — Cafe24 ERP 모듈

> 매 PR 종료 시 한 줄 이상 기록 의무 (규칙 22).
> 형식: `YYYY-MM-DD | PR-CODE | 한 줄 요약`

---

## 2026-05-05 | PR-6.0a | Researcher 단계 — `_docs` 표준 세트 신설

본 모듈 최초 PR. 코드 변경 없음, 문서 + 분석 결과만.

**산출물**:
- `_docs/CLAUDE-Cafe24.md` — 본 모듈 보조 규칙 (MariaDB 10.1 호환성 / 보안 / 분석 재개 절차)
- `_docs/SOURCE-ANALYSIS.md` — 카페24 시스템 정밀 분석 보고서 (PHP + PB + DB)
- `_docs/DATA-MODEL.md` — 식별된 30+ 테이블 추정 모델 (PK / 컬럼 / 명명 규칙)
- `_docs/OPERATIONS.md` — 운영 사실 인터뷰 자리 (TBD)
- `_docs/SCENARIOS.md` — 페르소나 / 시나리오 자리 (TBD)
- `_docs/UI-SPEC.md` — UI 사양 자리 (TBD)
- `_docs/CHANGELOG.md` — 본 파일
- `_docs/VERIFICATION.md` — 검증 로그 자리

**확정 사실**:
- 카페24 = `skyautosvc.co.kr` 자체 PHP + PowerBuilder + MariaDB 10.1 ERP
- 도메인 = 사고차 대차 (Accident Car Replacement) + 보험 정산
- 외부 IP read-only 직접 접속 방향 (사용자 결정 Q1=A)
- cafe24_source 폴더는 FMI repo 와 완전 분리 유지 (Q2=A)

**다음 PR 예고**:
- PR-6.1 — Planner 단계 (운영 인터뷰 + 시나리오 확정)
- PR-6.2 — `lib/cafe24-db.ts` mysql2 read-only pool 단일 진입점
- PR-6.3 — `/api/cafe24/accidents` 1차 구현 (broken call 해소)

**GATE 체크 (규칙 27)**:
- ✅ G2 Researcher 보고서 (SOURCE-ANALYSIS.md)
- ✅ G3 Planner — 사용자 GO 후 본 PR 진행 (Q1/Q2/Q3 응답 받음)
- ⏭ G5 / G6 / G7 / G8 — 코드 변경 없음, 문서 only PR
- ✅ Rule 22 _docs 갱신 (본 PR 자체)

**Cowork 협업 (규칙 21)**:
- 본 세션 영역: `app/(employees)/Cafe24 ERP/_docs/` 만
- 다른 세션 영역 침범 X (CallScheduler / admin / factory-search 절대 staging X)
- 공통 파일 (CLAUDE.md / lint-violations.md / migrations) staging X — 다른 세션 영역
