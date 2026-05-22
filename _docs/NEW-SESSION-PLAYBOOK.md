# 새 cowork 세션 시작 플레이북

> **작성**: 2026-05-11 (sweet-amazing-galileo 메인 세션)
> **목적**: 새 cowork 세션 만들 때 — 기준 / 첫 프롬프트 / 셋업 절차 / 종료 인계 표준화.
> **대상**: 사용자가 새 세션 시작할 때 + 새 세션이 첫 5분간 할 일.

---

## 1. 새 세션 만들지 결정 기준

### 1.1 새 세션 분리 권장 (Yes)

- ✅ **모듈 영역이 명확히 분리** — `app/X/*` 가 독립적이고 다른 모듈 import 없음
- ✅ **동시 작업 가치** — 메인 세션과 병렬 진행하면 시간 절약 (1주+ 작업)
- ✅ **전문 도메인** — 페르소나/시나리오/데이터모델이 메인과 다른 영역
- ✅ **사용자 직접 운영** — 직원이 실제 쓰는 화면 (배차/콜센터 등)
- ✅ **메인 세션 부하** — 메인이 이미 다른 큰 작업 중

### 1.2 같은 세션 유지 (No)

- ❌ **단순 hotfix** — typo / 버그 1줄 수정 / 디자인 수정
- ❌ **공통 컴포넌트 변경** — `app/components/*` 또는 `lib/*` 수정
- ❌ **마이그레이션** — DB 변경은 메인 세션 책임
- ❌ **CLAUDE.md / 규칙 변경** — 모든 세션 영향
- ❌ **인계 비용 > 분리 이익** — 짧은 작업 (반나절 이내)

### 1.3 결정 트리

```
새 작업 영역 발생
       │
       ├─ 기존 세션 모듈 안? ─── Yes → 해당 세션에서 진행
       │       │
       │       No
       │       ↓
       ├─ 1주+ 큰 작업? ─── No → 메인 세션 (sweet-amazing-galileo) 직접
       │       │
       │       Yes
       │       ↓
       ├─ 독립 모듈 분리 가능? ─── No → 메인 세션 + _docs 인덱스
       │       │
       │       Yes
       │       ↓
       └─ 새 세션 분리 ✓
              ↓
        SESSIONS-COORDINATION.md 등록 + _docs 인계 자료 준비
```

---

## 2. 새 세션 시작 — 사용자 메시지 템플릿 2종

새 세션 만들기 전후로 **두 군데에 메시지 카피** 합니다:
- **[A]** 메인 세션 (sweet-amazing-galileo) — 사전 준비 요청
- **[B]** 신규 세션 (방금 만든 새 채팅창) — 첫 메시지

### 2.1 [A] 메인 세션에 보낼 메시지 — 사전 준비 요청

> **언제 사용?** 새 세션 만들기 **전에** 메인 세션에서 페르소나/데이터모델/모듈등록 받을 때.

```
[새 세션 신설 사전 준비 요청]

세션명: <예: operations / payroll / inventory>
책임 모듈:
  - app/<module>/*
  - app/api/<module>/*
주 페르소나: <예: 배차담당자 / 정산담당자>
첫 작업 (대략): <예: /operations 메인 페이지 리뉴얼>

요청:
1. _docs/<MODULE>-PERSONAS.md 초안 작성 (Rule 26 의무)
   - 인터뷰 질문 답변할 테니 물어주세요 (운영 시간 / 부서 차이 / 권한 등)
2. _docs/<MODULE>-DATA-MODEL.md 작성 (Rule 22 의무)
   - 관련 테이블 / 컬럼 / FK 도식
3. _docs/SESSIONS-COORDINATION.md 에 모듈 등록
4. 전제 조건 점검 (마이그 / 데이터 동기화 등 메인 책임 영역)
5. push 완료되면 신규 세션 시작합니다
```

### 2.2 [B] 신규 세션 첫 메시지 — 표준 템플릿

> **언제 사용?** 메인 준비 끝나고 **새 세션 열어서 첫 채팅창에 입력**.

```
[새 세션 시작 — <세션명>]

세션명: <예: operations / payroll / inventory>
책임 모듈:
  - app/<module>/*
  - app/api/<module>/*
주 페르소나: <예: 배차담당자 / 콜센터 매니저 / 정산담당자>

5분 셋업 절차:
1. git pull origin main && npm run cowork:init
2. 정독 순서 (반드시 이 순서):
   - CLAUDE.md (전체 규칙)
   - _docs/NEW-SESSION-PLAYBOOK.md (세션 운영 표준)
   - _docs/SESSIONS-COORDINATION.md (모듈 매핑 + 합의 프로토콜 + ★ § 7 commit/push 엉킴 방지 — 필독)
   - _docs/<MODULE>-PERSONAS.md (페르소나/시나리오)
   - _docs/<MODULE>-DATA-MODEL.md (데이터 구조)
   - _docs/UI-DESIGN-STANDARD.md (디자인 표준 — 의무)
3. 기준 페이지 동작 확인: /loans, /finance/settlement
4. git status 자기 영역 외 modified 잔재 없는지 확인
5. 본 세션이 맡을 첫 작업 인지 후 설계서 v2 작성

첫 작업: <예: /operations 메인 리뉴얼 — 배차담당자 대시보드>
범위: <예: 1주 / 3개 PR / Phase 2.1>

⚠️ 규칙 (반드시 준수):
- Rule 1 풀 파이프라인 트리거 작업이면 설계서 v2 → GO 키워드 대기
- Rule 21 자기 모듈만 자율 commit, 공통 파일 변경 시 사용자 GO 대기
- Rule 22 _docs 갱신 의무 (CHANGELOG / DATA-MODEL / UI-SPEC)
- Rule 27 GATE 체크리스트 commit 메시지 명시
- git commit --no-verify 절대 금지

설계서 받기 전 코드 작성 X.
```

### 2.3 실제 사례 — operations 세션 (2026-05-11 신설 대기)

**[A] 메인 세션 작업** — 이미 완료:
- ✅ `_docs/OPERATIONS-PERSONAS.md` (배차담당자 페르소나 + 8-Step 시나리오)
- ✅ `_docs/OPERATIONS-DATA-MODEL.md` (cars/fmi_vehicles/fmi_rentals 도식)
- ✅ `_docs/SESSIONS-COORDINATION.md` § 6 operations 세션 가이드
- ⏳ 전제 조건: PR-UX14 cars→fmi_vehicles 동기화 (사용자 콘솔 액션 대기)

**[B] operations 세션 첫 메시지** — 카피 가능:

```
[새 세션 시작 — operations]

세션명: operations
책임 모듈:
  - app/operations/*
  - app/api/operations/*
주 페르소나: 배차담당자

5분 셋업:
1. git pull origin main && npm run cowork:init
2. 정독 (이 순서):
   - CLAUDE.md
   - _docs/NEW-SESSION-PLAYBOOK.md
   - _docs/SESSIONS-COORDINATION.md (§ 6 operations 세션 가이드)
   - _docs/OPERATIONS-PERSONAS.md
   - _docs/OPERATIONS-DATA-MODEL.md
   - _docs/UI-DESIGN-STANDARD.md
3. 기준 페이지: /loans, /finance/settlement
4. 메인 세션 PR-UX14 (cars→fmi_vehicles) + fmi-rentals-fix 완료 확인
5. 첫 PR — /operations 메인 페이지 리뉴얼 (배차담당자 대시보드)

첫 작업: /operations 메인 페이지 리뉴얼 (Phase 2.1 — 정산 관리 디자인 기준)
범위: 1차 PR — 페이지 헤더 정리 + DcStatStrip 신설 + 가용 차량 카드

⚠️ 규칙:
- Rule 1/21/22/27 준수
- 설계서 v2 → 사용자 GO 키워드 대기 후 코드 진입
- 공통 파일 (app/components/*, lib/*, prisma/) 변경 시 사용자 사전 보고
```

---

## 3. 세션 시작 — 첫 5분 셋업 (세션 본인이 할 일)

새 세션이 시작되면 자동으로 다음 절차 실행:

### 3.1 환경 셋업 (1분)
```bash
git pull origin main           # 최신 hooks + 코드
npm run cowork:init            # hooksPath 설정 + 자가 진단
git status --short             # 다른 세션 잔재 확인
```

### 3.2 정독 (3분 — 빠르게 스캔)
| 순서 | 파일 | 핵심 |
|------|------|------|
| 1 | `CLAUDE.md` | Rule 21 cowork / Rule 22 _docs / Rule 26 페르소나 / Rule 27 GATE |
| 2 | `_docs/SESSIONS-COORDINATION.md` | 자기 모듈 영역 + 공통 파일 합의 + **§ 7 commit/push 엉킴 방지 (필독)** |
| 3 | `_docs/<MODULE>-PERSONAS.md` | 주 페르소나 + 시나리오 (없으면 사용자에게 작성 요청) |
| 4 | `_docs/<MODULE>-DATA-MODEL.md` | 데이터 구조 (없으면 사용자에게 작성 요청) |
| 5 | `_docs/UI-DESIGN-STANDARD.md` | DcStatStrip / DcToolbar / NeuDataTable 의무 + PageTitle 자동 |
| 6 | `_docs/NEW-SESSION-PLAYBOOK.md` | 본 문서 |

### 3.3 첫 작업 진입 전 (1분)
- 사용자 첫 프롬프트의 「첫 작업」 항목 확인
- 작업이 Rule 1 풀 파이프라인 트리거인지 판정:
  - 외부 API / DB 대량 / 새 통합 / 마이그레이션 / 보안 → 풀 파이프라인
  - 단순 typo / UI 색상 → 즉답
- 풀 파이프라인이면 **설계서 v2** 부터 사용자 GO 키워드 (`구현 진행`, `ㄱㄱ`, `진행`) 대기

---

## 4. 세션 작업 절차 (Rule 21 강화)

### 4.1 commit 전 자가 검증
```bash
git diff --cached --name-only    # staged 파일 모두 자기 모듈 영역?
git status --short               # 다른 세션 영역 modified 잔재?
npm run lint:harness             # pre-commit hook 자동 실행 — 미리 확인
```

### 4.2 staging 원칙
- ✅ **명시적 add**: `git add app/<module>/...` (폴더 명시)
- ❌ **금지**: `git add .` / `git add -A` / `git add *`
- ✅ 공통 파일 변경 시: 사용자 사전 보고 + GO 받고 **단독 commit**

### 4.3 commit 메시지 (Rule 27 GATE 명시)
```
[PR-XXX] 작업 한 줄 요약

상세 내용...

GATE 진행 상태:
- G3 설계서 + 사용자 GO
- G5 tsc PASS / 영향 N파일 빌드
- G6 lint:harness 새 위반 0건
- G7 Designer 검수 (Chrome MCP 또는 사용자 스크린샷)
- G8 evaluate.js 8.x/10
- Rule 22 _docs 갱신 (CHANGELOG / DATA-MODEL / UI-SPEC)
```

### 4.4 push 전 보고 (Rule 5)
```
📋 변경 요약: 파일 N개 / 추가 X줄 / 삭제 Y줄
🔬 검증: 빌드 PASS / lint PASS / 영향 페이지 M개 확인
🚨 위험: DB 쓰기 / 토큰 소모 / 외부 API 호출 (있으면)
→ 사용자 GO 받고 push
```

---

## 5. 세션 종료 / 인계 체크리스트

세션 작업 마치고 종료할 때:

### 5.1 _docs 동기화 (Rule 22)
- [ ] `app/<module>/_docs/CHANGELOG.md` 한 줄 추가 (날짜 + PR 코드 + 요약)
- [ ] DB 변경 시 `_docs/<MODULE>-DATA-MODEL.md` 갱신
- [ ] UI 변경 시 `_docs/UI-SPEC.md` 갱신
- [ ] 운영 사실 변경 시 `_docs/OPERATIONS.md` 갱신

### 5.2 미완 작업 정리
- [ ] TaskList 확인 — `in_progress` 작업 다음 세션 인계 메모 또는 완결
- [ ] 임시 파일 / 디버그 코드 정리
- [ ] regression-cases 누락 없는지 (사용자 "안 돼요" 사고 발생 시 의무)

### 5.3 다음 세션 인계
- [ ] 핸드오버 메모 (필요 시 `harness-engineering/handover/<date>-<module>.md`)
- [ ] 미해결 이슈 + 다음 작업 1-3개

### 5.4 commit + push 최종
- [ ] 자기 영역만 staged 확인
- [ ] 단독 commit (공통 파일 섞지 X)
- [ ] push 후 git status clean 확인

---

## 6. 세션별 현재 상태 (2026-05-11)

| 세션명 | 책임 모듈 | 상태 | 첫 프롬프트 위치 |
|--------|----------|------|------------------|
| **sweet-amazing-galileo (메인)** | app/finance/* + 공통 + 마이그레이션 | 운영 중 | (메인) |
| **CallScheduler 세션** | app/(employees)/CallScheduler/* | 운영 중 | N/A |
| **factory-search 세션** | app/(employees)/factory-search/* | 운영 중 | N/A |
| **Ride* 세션** | app/(employees)/RideAccidents/RideSettlements/RideVehicleRegistry/RideCustomerData | 운영 중 | N/A |
| **friendly-laughing-pascal** | (역할 미확정 — CallScheduler 하위 작업?) | 진단 보고 받음 | N/A |
| **operations 세션 (신설 대기)** | app/operations/* + app/api/operations/* | **시작 대기** | § 2.2 |

---

## 7. 자주 발생하는 사고 + 예방 (체크리스트)

### 7.1 다른 세션 작업물 흡수
- **사고**: `git add .` 로 다른 세션 modified 함께 staging → commit
- **예방**: 명시적 add + cowork-staging-lint (pre-commit 자동)

### 7.2 공통 파일 충돌
- **사고**: 메인 세션이 `app/components/PageTitle.tsx` 갱신 중인데 다른 세션이 동시 수정
- **예방**: SESSIONS-COORDINATION.md § 2 합의 프로토콜 — 사용자 사전 보고 + GO 대기

### 7.3 stale lock 누적
- **사고**: workspace mount 환경에서 한 세션이 만든 .lock 파일이 정리 안 됨
- **예방**: PR-COWORK-LOCK 적용됨 (pre-commit hook 이 3분+ 자동 정리)

### 7.4 페르소나 부재 → 설계 큰 폭 변경
- **사고**: 페르소나 없이 코드 시작 → 사용자 운영하면서 미흡 발견 → 큰 폭 재구성
- **예방**: Rule 26 — 새 모듈 시작 전 _docs/<MODULE>-PERSONAS.md 의무

### 7.5 마이그레이션 미적용 + UI 만 변경
- **사고**: 새 테이블 마이그 만들고 UI 까지 빌드했는데 사용자가 SQL 적용 안 함 → 500
- **예방**: Rule 23 — graceful fallback + 사용자 적용 확인 후 UI 빌드

---

## 8. 빠른 참조 — 어디 가서 무엇 보나

| 궁금한 것 | 파일 |
|----------|------|
| 전체 규칙 / 작업 절차 | `CLAUDE.md` |
| 어느 세션이 어느 모듈? | `_docs/SESSIONS-COORDINATION.md` § 1 |
| 공통 파일 변경 절차 | `_docs/SESSIONS-COORDINATION.md` § 2 |
| 새 세션 만드는 법 | `_docs/NEW-SESSION-PLAYBOOK.md` (본 문서) |
| 디자인 표준 / 의무 컴포넌트 | `_docs/UI-DESIGN-STANDARD.md` |
| 차량운영 페르소나/데이터 | `_docs/OPERATIONS-PERSONAS.md` / `OPERATIONS-DATA-MODEL.md` |
| 매칭/정산 시스템 | `_docs/RENTAL-SYSTEM-REDESIGN.md` |
| lint 위반 누적 | `harness-engineering/knowledge/lint-violations.md` |
| 회귀 케이스 | `harness-engineering/regression-cases/` |

---

본 문서는 새 세션 시작 패턴 변경 / 사고 발생 시 갱신.
