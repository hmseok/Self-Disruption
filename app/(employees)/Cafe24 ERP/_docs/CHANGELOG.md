# CHANGELOG — Cafe24 ERP 모듈

> 매 PR 종료 시 한 줄 이상 기록 의무 (규칙 22).
> 형식: `YYYY-MM-DD | PR-CODE | 한 줄 요약`

---

## 2026-05-05 | PR-6.1 | Planner 단계 — 운영 인터뷰 결과 _docs 갱신

운영 사실 인터뷰 (규칙 25 + 26) 완료. 코드 변경 없음.

**확정 사실**:
- Q1=A: 24/365 운영
- Q2=B: 카페24 단계적 폐기 + FMI 마이그레이션 (장기 목표)
- Q3=A,D: 사고 접수 목록 (PR-6.3) + 통합 대시보드 (PR-6.4) 우선
- Q4=B: FMI 우선 (단계 2 이후 source of truth = FMI)
- Q5=D: 페르소나 다양 (운영자/관리자/보험) — 권한별 화면 분리
- Q6=D: 마이그레이션 타임라인 미정 — **장기 운영 설계 의무**
- Q7=A: 분당 변동 — 캐시 30~60초
- Q8=D: 일단 관리자 전용 — 직군별 분리는 별도 PR

**갱신 파일**:
- `_docs/OPERATIONS.md` — 운영 시간 / 흐름 / 부서 / 변동 / 권한 / 동기화 채움
- `_docs/SCENARIOS.md` — Persona 1~4 확정 + Scenario A,D 명세
- `_docs/UI-SPEC.md` — PR-6.3 사고 접수 + PR-6.4 대시보드 화면 사양 명시
- `_docs/CLAUDE-Cafe24.md` — 캐시 / 권한 / 단계별 source-of-truth 추가

**다음 PR 예고**:
- PR-6.2 — `lib/cafe24-db.ts` mysql2 read-only pool (사용자 외부 IP 허용 후)
- PR-6.3 — `/api/cafe24/accidents` + `/Cafe24 ERP/accidents` 페이지
- PR-6.4 — `/Cafe24 ERP/dashboard` + 5개 KPI 위젯

**GATE 진행 상태**:
- ✅ G3 Planner — 운영 인터뷰 4축 완료 (Q1~Q8)
- ⏭ G5/G6/G7/G8 — 코드 변경 없음, 문서 only PR
- ✅ Rule 21 Cowork — 본 세션 영역만 staging
- ✅ Rule 22 _docs 갱신 (4개 파일 동시)
- ✅ Rule 25 운영 사실 인터뷰
- ✅ Rule 26 페르소나 / 시나리오 워크-스루

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
