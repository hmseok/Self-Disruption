# Finance 통장/카드 매칭 — 인계 문서 (HANDOVER)

> **작성**: 2026-05-19 (sweet-amazing-galileo 메인 세션 → finance-matching 세션 인계)
> **목적**: 본 프로젝트의 **핵심 목적** — 통장/카드 거래 자동 매칭 + 검수 + 정산.
> **사용자 명시**: 「이것 때문에 나머지 (배차 등) 를 정리한 것」 — finance 매칭이 최우선.
> **Rule**: CLAUDE.md Rule 1/8/11/14/18/20/21/22.

---

## 0. 본 모듈 책임

- `app/finance/*` (UI — bank-card / settlement / investor 등)
- `app/api/finance/*` (API — 매처 10종 + 검수 + 정산)
- SESSIONS-COORDINATION.md § 1.1 — sweet-amazing-galileo (메인) 영역.
  finance-matching 세션이 이 영역 자율 commit.

---

## 1. 현재 상태 (2026-05-19)

### 1.1 완료된 작업 (PR-UX1~14)
- 매처 10종: `app/api/finance/transactions/auto-match-{card,employee,fmi-rental,freelancer,insurance,insurance-premium,investor-jiip,loan,maintenance,monthly}/route.ts`
- 운영 흐름 탭 / 1-Click 자동 / 검수 대기 큐 / 정산 보고서 (PR-UX1~14)
- `app/finance/bank-card/page.tsx` (대형 페이지 — 운영 흐름 / 검수 / 정산 연결 탭)
- Track A: cars→fmi_vehicles 동기화 18건 + fmi-rentals-fix 466 매핑

### 1.2 매칭 흐름
```
통장/카드 SMS → transactions INSERT
  → 매처 10종 자동 매칭 (run-workflow 1-Click)
  → transaction_assignments (status: pending/confirmed/rejected)
  → 검수 큐 per-row 확정/거부
  → 정산 (investor-settlement 등)
```

### 1.3 검수 대기
- 검수 대기 약 1,039건 누적 (PR-UX 자동 매칭 결과 — 사용자 확정 대기)

---

## 2. ⚠️ 긴급 이슈 — PR-E 시리즈 영향 (최우선 처리)

다른 세션이 **PR-E1~E4** 로 데이터 모델을 통째로 변경:
- `PR-E1` cars 테이블 통합 (schema.prisma Car 모델 52컬럼)
- `PR-E2` fmi_rentals.vehicle_id 리포인트
- `PR-E3` fmi_vehicles 참조 코드 → cars 전환
- `PR-E4` **fmi_vehicles 테이블 폐기** — cars 통합 완료

→ 본 finance 영역의 **3개 파일이 폐기된 `fmi_vehicles` 아직 참조** (PR-E3 가 finance 모듈은 Rule 21 때문에 안 건드림):

| 파일 | 문제 | 할 일 |
|------|------|------|
| `app/api/finance/transactions/auto-match-fmi-rental/route.ts` | fmi_vehicles SQL 참조 → 테이블 폐기로 에러 가능 | cars 기반 전환 |
| `app/api/finance/transactions/pending-review/route.ts` | fmi_vehicles 3-tier fallback | cars 기반 전환 |
| `app/api/finance/fmi-rentals-fix/route.ts` | fmi_vehicles 폐기 → 도구 무의미 | 제거 또는 cars 재작성 |

**진단 먼저** (Rule 11):
1. `prisma/schema.prisma` 의 Car 모델 확인 (PR-E1 — 52컬럼)
2. `fmi_rentals.vehicle_id` 가 이제 cars.id 가리키는지 (PR-E2)
3. PR-E3 가 어떤 패턴으로 fmi_vehicles → cars 전환했는지 (다른 매처 참고)
4. `git log --all --oneline | grep PR-E` 로 PR-E commit 확인

---

## 3. finance-matching 세션 작업 우선순위

### Phase 1 — 매처 cars 전환 (긴급)
1. PR-E1~E4 데이터 모델 파악 (schema.prisma + PR-E commit diff)
2. `auto-match-fmi-rental` — fmi_vehicles → cars 전환
3. `pending-review` — fmi_vehicles → cars 전환
4. `fmi-rentals-fix` — 제거 또는 cars 재작성 (사용자 결정)
5. `npx next build` — 매처 빌드 검증
6. lint:harness 통과

### Phase 2 — 매칭 재실행 + 검수
1. `/finance/bank-card` 운영 흐름 탭 → 1-Click 자동
2. 매칭 결과 확인 (대차건 매처가 cars 기반 정상 동작?)
3. 검수 대기 1,039건 → per-row 확정/거부

### Phase 3 — 정산 검증
1. 대차 보험 입금 발생 시 (사용자 확인) — auto-match-fmi-rental 매칭
2. investor-settlement 등 정산 페이지 확정/미확정 분리 확인
3. End-to-End: 통장 → 매칭 → 확정 → 정산

---

## 4. 핵심 주의점

- **Rule 8 End-to-End 시뮬레이션** — 매처 수정 시 입력→DB→UI→정산 전 흐름 검증
- **Rule 11 SQL 컬럼 검증** — cars 통합 후 컬럼명 schema.prisma 직접 확인 (추측 X)
- **Rule 14 동형 패턴** — 매처 10종 중 fmi_vehicles 참조 모두 일괄 cars 전환
- **Rule 21** — finance 모듈 자율 commit, 공통 파일 (schema.prisma 등) 변경 시 메인 합의
- bank-card 페이지는 대형 — 부분 수정 시 영향 범위 (Rule 4-1) 확인

---

## 5. 디자인 표준

- `_docs/UI-DESIGN-STANDARD.md` — 정산 관리 / 대출 관리 기준
- DcStatStrip / DcToolbar / NeuDataTable / PageTitle 자동
- Rule 18 sortBy / Rule 19 줄바꿈 최소화 / Rule 20 결과 글래스 패널

---

## 6. 관련 git 커밋 (참고)

- PR-UX1~14: 운영 흐름 / 검수 큐 / 정산 (git log 검색)
- PR-E1~E4: cars 통합 (다른 세션 — `git log --oneline | grep PR-E`)
- Track A: cars→fmi_vehicles + fmi-rentals-fix (이제 PR-E4 로 무의미해진 작업)

---

본 문서는 finance-matching 세션이 Phase 1 완료 후 갱신.
