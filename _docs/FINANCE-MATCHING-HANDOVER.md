# Finance 통장/카드 매칭 — 인계 문서 (HANDOVER)

> **작성**: 2026-05-19 (sweet-amazing-galileo 메인 세션 → finance-matching 세션 인계)
> **갱신**: 2026-05-21 (finance-matching 세션 / vigilant-sharp-bardeen) — Phase 1 검증 완료, § 2 전제 정정.
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

## 2. ✅ PR-E 시리즈 영향 — 해결 완료

> **2026-05-21 정정 (finance-matching 세션 / vigilant-sharp-bardeen)**:
> 본 문서 최초 작성 시 「PR-E3 가 Rule 21 때문에 finance 모듈은 안 건드림」 으로 가정했으나
> **사실과 다름**. git 이력 검증 결과 **PR-E3 (9b3ef18) 가 finance 매처 3개를 직접 cars 전환 완료**함.

다른 세션이 **PR-E1~E4** 로 데이터 모델을 통째로 변경:
- `PR-E1` (79719ac) cars 테이블 통합 (schema.prisma Car 모델 52컬럼, `@@map("cars")`)
- `PR-E2` (0399bbb) fmi_rentals.vehicle_id 리포인트 → cars.id (schema 관계로 확인)
- `PR-E3` (9b3ef18) fmi_vehicles 참조 코드 → cars 전환 — **finance 매처 3개 포함**
- `PR-E4` (9fbd691) **fmi_vehicles 테이블 폐기** — cars 통합 완료

**finance 매처 cars 전환 상태 — PR-E3 에서 완료**:

| 파일 | 상태 |
|------|------|
| `app/api/finance/transactions/auto-match-fmi-rental/route.ts` | ✅ cars 전환 완료 (cars.id / cars.number lookup) |
| `app/api/finance/transactions/pending-review/route.ts` | ✅ cars 전환 완료 (cars 정본 + fmi_rentals 폴백) |
| `app/api/finance/fmi-rentals-fix/route.ts` | ✅ cars 전환 완료 — 도구 유효 (fmi_rentals.vehicle_id → cars 매핑). 제거 불필요 |

**검증 결과 (2026-05-21, Rule 11)**:
1. `grep` — `app/finance` + `app/api/finance` 전체에 실제 `fmi_vehicles` 테이블 참조 **0건** (전환 설명 주석 4줄만 잔존)
2. `schema.prisma` — Car(`@@map cars`) id/number/brand/model + FmiRental.vehicle_id→Car.id 관계 확인
3. `lint:harness` — 새 critical 위반 **0건**
4. `tsc --noEmit` — 매처 3개 타입 오류 **0건** (`next.config.ts` 는 `ignoreBuildErrors:true`)

**잔여 (비차단, 선택)**: `fmi-rentals-fix` 의 SQL 테이블 alias 가 아직 `fv` (구 fmi_vehicles 네이밍 잔재) — cars 를 가리키므로 동작 무해, cosmetic 정리만 선택 사항.

---

## 3. finance-matching 세션 작업 우선순위

### Phase 1 — 매처 cars 전환 ✅ 완료 (PR-E3 + 2026-05-21 검증)
1. ✅ PR-E1~E4 데이터 모델 파악 (schema.prisma + PR-E commit)
2. ✅ `auto-match-fmi-rental` — cars 전환 완료 (PR-E3)
3. ✅ `pending-review` — cars 전환 완료 (PR-E3)
4. ✅ `fmi-rentals-fix` — cars 전환 완료, 도구 유효 (제거 불필요) (PR-E3)
5. ◐ `npx next build` — `ignoreBuildErrors:true` 라 타입 오류 무관 / 샌드박스 FS 제약(.next EPERM)으로 미완 → 로컬 `npx next build` 최종 확인 권장
6. ✅ lint:harness 통과 (새 critical 위반 0)

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

Phase 1 완료·검증 (2026-05-21). 다음 갱신: Phase 2 (매칭 재실행 + 검수) 완료 후.
