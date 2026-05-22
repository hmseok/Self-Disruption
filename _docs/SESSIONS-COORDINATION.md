# 세션 조율 규칙 — Cowork 협업 (Rule 21 부속)

> **작성**: 2026-05-10 (sweet-amazing-galileo)
> **목적**: 동시 cowork 세션의 commit/deploy 충돌 빈번 → 모듈 책임 + 공통 파일 합의 프로토콜 명시
> **사용자 명령**: 「다른 세션에서 자꾸 커밋 배포 문제가 나는데 조율할 수 있는 기준이 없을까?」

---

## 1. 모듈별 세션 책임 (A안)

각 세션은 **자기 모듈만 자율 commit**. 다른 세션 모듈은 절대 건드리지 않음.

### 1.1 모듈 ↔ 세션 매핑

| 모듈 영역 | 담당 세션 | 자율 commit |
|----------|----------|------------|
| `app/finance/*` | sweet-amazing-galileo (메인) | ✅ |
| `app/api/finance/*` | sweet-amazing-galileo (메인) | ✅ |
| `app/(employees)/CallScheduler/*` | CallScheduler 세션 | ✅ |
| `app/api/call-scheduler/*` | CallScheduler 세션 | ✅ |
| `app/(employees)/factory-search/*` | factory-search 세션 | ✅ |
| `app/(employees)/RideAccidents*/*` | Ride* 세션 | ✅ |
| `app/(employees)/RideSettlements*/*` | Ride* 세션 | ✅ |
| `app/(employees)/RideVehicleRegistry*/*` | Ride* 세션 | ✅ |
| `app/(employees)/RideCustomerData*/*` | Ride* 세션 | ✅ |
| `app/api/ride-*/*` | Ride* 세션 | ✅ |
| `app/operations/*` | **sweet-amazing-galileo (메인) — 2026-05-11 재배정** | ✅ |
| `app/api/operations/*` | **sweet-amazing-galileo (메인) — 2026-05-11 재배정** | ✅ |
| `app/maintenance/*` (신설) | **sweet-amazing-galileo (메인)** | ✅ |
| `app/meetings/*` | **meetings 세션 (신설 2026-05-11)** | ✅ |
| `app/api/meetings/*` | **meetings 세션 (신설 2026-05-11)** | ✅ |
| `app/hr/*` | **hr 세션 (신설 2026-05-11)** | ✅ |
| `app/api/ride-employees/*` | **hr 세션 (신설 2026-05-11)** | ✅ |
| `app/api/ride-departments/*` | **hr 세션 (신설 2026-05-11)** | ✅ |
| `app/RideCompliance/*` | **compliance 세션 (신설 2026-05-11)** | ✅ |
| `app/api/ride-compliance/*` | **compliance 세션 (신설 2026-05-11)** | ✅ |
| `app/RideMTOps/*` | MT팀 세션 (cowork 표시: 「4) 카페24 연동」) | ✅ |
| `app/api/cafe24/maintenance-tours,legal-inspections,chargers/*` | MT팀 세션 (「4) 카페24 연동」) | ✅ |
| `app/loans*/*` | 본 도메인 세션 (자율) | ✅ |
| `app/insurance*/*` | 본 도메인 세션 (자율) | ✅ |

### 1.2.a cowork 세션 표시명 매핑 (혼동 방지 — 2026-05-19 신설)

> cowork UI 의 세션 표시명 (번호+이름) 과 본 문서의 모듈 세션명이 달라 혼동.
> 확인된 매핑만 기록 — 미확인은 각 세션 채팅에서 최근 작업 모듈로 식별.

| cowork 표시명 | 모듈 세션 | 담당 영역 |
|--------------|----------|----------|
| (메인) | sweet-amazing-galileo | app/finance/* + 공통 파일 + 마이그 |
| 「4) 카페24 연동」 | MT팀 세션 | app/RideMTOps/* (순회정비/법정검사/충전기) |
| (확인 필요) | CallScheduler 세션 | app/(employees)/CallScheduler/* |
| (확인 필요) | compliance 세션 | app/(employees)/RideCompliance/* |
| (확인 필요) | hr 세션 | app/hr/* |
| (확인 필요) | meetings 세션 | app/meetings/* |
| (확인 필요) | operations 세션 | app/operations/* (또는 메인 직접) |
| (확인 필요) | Ride* 세션 | app/(employees)/RideAccidents 등 |

→ 미확인 항목은 사용자가 각 세션 채팅 확인 후 채움.

→ 새 모듈 추가 시 본 표에 등록 + 사용자 합의

### 1.2 위반 시
- cowork-staging-lint (자동 hook) 차단
- GitHub Actions cowork-validate (서버 검증)
- 회귀 케이스 자동 기록

---

## 2. 공통 파일 — 합의 프로토콜 (B안)

### 2.1 공통 파일 목록 (모든 세션 영향)

| 파일 | 영향 | 변경 책임 |
|------|------|---------|
| `CLAUDE.md` | 규칙 — 모든 세션 정독 | 사용자 합의 후 수정 |
| `_docs/*.md` | 가이드 — 세션 참고 | 합의 권장 |
| `app/components/PageTitle.tsx` | 페이지 헤더 (breadcrumb) | 합의 의무 |
| `app/components/ClientLayout.tsx` | 사이드바 / 레이아웃 | 합의 의무 |
| `app/components/DcStatStrip.tsx` | 의무 컴포넌트 | 합의 의무 |
| `app/components/DcToolbar.tsx` | 의무 컴포넌트 | 합의 의무 |
| `app/components/NeuDataTable.tsx` | 의무 컴포넌트 | 합의 의무 |
| `lib/menu-registry.ts` | 메뉴 등록 — 모든 세션 영향 | 합의 의무 |
| `lib/auth-server.ts` / `auth-client.ts` | 인증 — 모든 페이지 | 합의 의무 |
| `lib/prisma.ts` | DB client | 합의 의무 |
| `lib/last4-match.ts` | helper — 매칭 매처 사용 | 합의 권장 |
| `app/utils/ui-tokens.ts` | 디자인 토큰 | 합의 의무 |
| `prisma/schema.prisma` | DB 스키마 — 모든 세션 영향 | 합의 의무 |
| `package.json` | npm scripts / dependencies | 합의 의무 |
| `harness-engineering/scripts/*` | 자동화 도구 | 합의 권장 |
| `harness-engineering/git-hooks/*` | repo-tracked hooks | 합의 의무 |
| `.github/workflows/*` | CI/CD | 합의 의무 |
| `Dockerfile` | 빌드 | 합의 의무 |
| 마이그레이션 (`migrations/*.sql`) | DB 변경 | 합의 의무 |

### 2.2 합의 프로토콜

**「합의 의무」 파일 변경 시 절차**:

1. **사용자에게 사전 보고**:
   ```
   [공통 파일 변경 알림]
   세션: sweet-amazing-galileo
   변경 파일: app/components/PageTitle.tsx
   변경 내용: PATH_TO_GROUP 에 '/finance/new-feature' 추가
   영향 범위: 다른 세션 페이지 등록 X
   다른 세션 작업 중이면 알려주세요
   → GO 받고 진행
   ```

2. **사용자가 다른 세션 확인** (수동):
   - 메인 세션 (또는 다른 세션) 도 PageTitle 변경 중인지
   - 충돌 가능성 있으면 순차 진행

3. **GO 받으면 commit + push**:
   - 작은 단위로 나눠서 push (큰 PR 회피)
   - 같은 commit 에 모듈 파일 + 공통 파일 섞지 X (Rule 21)

4. **공통 파일만 별도 commit**:
   ```
   [개별] PageTitle.tsx — '/finance/new-feature' 등록
   ```
   다른 세션이 같은 파일 변경 시 빠르게 rebase 가능

### 2.3 공통 파일 변경 우선권 (충돌 시)

1. **사용자 명시 GO** > 자율 변경
2. **메인 세션 (sweet-amazing-galileo)** > 모듈 세션 (공통 파일 책임 = 메인)
3. 마이그레이션 — 한 세션이 작성, 다른 세션은 적용만 합의

---

## 3. 충돌 발생 시 처리

### 3.1 stale lock (5분+)
- `npm run cowork:fix` (자동 제거 — 5분 이상)
- 또는 `find .git -name "*.lock" -delete`

### 3.2 staging 흡수 사고 발생 시
- `git reset HEAD~N --soft` (잘못된 commit 풀기)
- 자기 모듈만 add → 재 commit
- 흡수된 파일은 다른 세션이 다시 commit

### 3.3 동시 push 충돌 (force push X)
- `git pull --rebase` 후 재시도
- 충돌 시 자기 영역만 keep → 자기 commit 유지

---

## 4. 본 세션 (sweet-amazing-galileo) 약속

- ✅ 본 모듈 (`app/finance/*`, `app/api/finance/*`) 만 자율 commit
- ✅ 공통 파일 변경 시 사용자 사전 보고 + GO 대기
- ✅ 메인 세션 책임 — 공통 컴포넌트 / 디자인 / 하네스 / 마이그레이션 표준
- ✅ 다른 세션 모듈 코드 직접 수정 금지 (요청 시만)

---

## 5. 다른 세션 권장 사항

새 cowork 세션 시작 시 다음 절차:

```bash
git pull origin main           # 최신 가져오기
npm run cowork:init            # core.hooksPath + health-check
```

CLAUDE.md 정독 후:
- 자기 모듈 영역 확인
- 공통 파일 변경 필요 시 본 문서 (`_docs/SESSIONS-COORDINATION.md`) 의 합의 프로토콜 따름
- `npm run lint:harness` 매 commit 자동 실행 (cowork-staging-lint 포함)
- 위반 시 GitHub Actions 도 차단 (서버측)

---

본 문서는 운영 중 발생 패턴에 따라 갱신.

---

## 6. operations 세션 시작 가이드 (2026-05-11 신설)

신설 operations 세션이 첫 commit 전 다음 절차 의무:

1. `git pull origin main && npm run cowork:init`
2. `CLAUDE.md` 정독 (Rule 21 협업 / Rule 22 _docs / Rule 26 페르소나)
3. **`_docs/OPERATIONS-PERSONAS.md` 정독** — 배차담당자 페르소나 + 시나리오 (사용자 명시 주 페르소나)
4. **`_docs/OPERATIONS-DATA-MODEL.md` 정독** — cars / fmi_vehicles / fmi_rentals 관계
5. `_docs/UI-DESIGN-STANDARD.md` 정독 — 디자인 표준
6. 기준 페이지 (`/loans`, `/finance/settlement`) 실제 동작 확인
7. 신규 PR 시작 시 Rule 27 GATE 체크리스트 의무

### 6.1 책임 모듈
- `app/operations/*` (페이지 4개 + OperationsMain / CalendarView / FleetBoard / DispatchModal / TransportRequestModal)
- `app/api/operations/*` (신설 예정)

### 6.2 연계 데이터 (READ ONLY, 변경 시 메인 세션 합의)
- `fmi_rentals` (메인 세션 finance 매처가 사용)
- `fmi_vehicles` (메인 세션 PR-UX14 동기화 도구 사용)
- `cars` (레거시 — 운영 데이터 다수)

### 6.3 전제 조건 (operations 세션 시작 전 메인 세션이 완료)
- [ ] PR-UX14 cars→fmi_vehicles 동기화 실 INSERT 완료
- [ ] fmi-rentals-fix 재실행 (vehicle_id 일괄 매핑)
- [ ] 1-Click 자동 매칭 + 정산 검증
- [x] _docs/OPERATIONS-PERSONAS.md 작성 (2026-05-11)
- [x] _docs/OPERATIONS-DATA-MODEL.md 작성 (2026-05-11)
- [x] _docs/SESSIONS-COORDINATION.md 갱신 (본 갱신)

### 6.4 권장 1차 작업 (operations 세션)
- Phase 2.1: `/operations` 메인 — 배차담당자 대시보드 (정산 관리 디자인 기준)
- Phase 2.2: `/operations/dispatch` 신설 — Step 2/3 차량 선정 + 모달
- Phase 2.3: `/operations/rentals` 리뉴얼 — 진행 모니터 + 검색/필터 강화

자세한 시나리오는 `_docs/OPERATIONS-PERSONAS.md` § 7 참고.

---

## 7. commit / push 엉킴 방지 — 강화 규정 (2026-05-21 신설)

> **사용자 명령** (2026-05-21): 「각 세션들 커밋 푸시가 좀 엉키는것같은데 하네스 규정 강화」
> 동시 다발 세션 운영 중 commit 유실 / 공통 파일 변경 섞임 / .git lock 빈발.
> 본 § 7 은 Rule 21 의 강화 조항 — 모든 cowork 세션 의무.

### 7.1 표준 작업 사이클 (모든 세션 — 매 작업 의무)

```
1. 작업 시작:  git pull --rebase origin main      # 다른 세션 commit 먼저 받기
2. 코드 작업
3. commit 직전: git fetch origin                   # 최신 확인
                git add <자기 영역만 명시>          # git add . / -A 절대 금지
4. git commit                                      # pre-commit hook 통과
5. push 직전:  git pull --rebase origin main       # 또 받기
6. git push origin main
7. push 실패 (non-fast-forward / fetch first):
                git pull --rebase origin main → git push  재시도 (루프)
```

### 7.1.a 순차 push — 「한 번에 한 세션만」 원칙

> origin/main 은 git 이 자체적으로 순차성 보장 (동시 push 시 뒤가 reject).
> 진짜 위험은 **local commit 을 push 안 한 채 방치** → 다른 세션 rebase 에 유실.

- **commit → push 사이에 다른 작업 끼우지 X** (7.3 참조)
- push reject (`fetch first`) = 다른 세션이 먼저 push 함 → `pull --rebase` → push 재시도.
  **이것이 정상 순차 동작** — 에러 아님
- push 재시도 루프 3회 초과 = 다른 세션 연속 push 중 → 1~3분 대기 후 재개
- 큰 변경은 작은 commit 으로 쪼개 push (rebase 충돌 표면적 ↓)

### 7.1.b 새 멀티 세션 국면 진입 전 — 선행 강화 (사고 예방)

> 2026-05-21 회고: 멀티 세션 동시 운영을 **시작한 뒤** 엉킴이 터지고 나서야 본 § 7 을
> 신설 — 선행 강화 실패. 이후 새 다세션 국면 진입 전 다음을 먼저 점검:

- [ ] 모든 세션이 `npm run cowork:init` 실행 (hooksPath + lock 자동정리)
- [ ] 공통 파일 (menu-registry / PageTitle / ClientLayout / schema.prisma) working
      tree clean 확인 — 미commit 잔재 먼저 정리
- [ ] 각 세션 모듈 영역 § 1.1 에 등록 확인
- [ ] 본 § 7 을 각 세션 정독 (NEW-SESSION-PLAYBOOK 정독 순서 포함)

### 7.2 공통 파일 — 즉시 단독 commit 원칙 (엉킴 1순위 원인)

공통 파일 (`lib/menu-registry.ts` / `app/components/PageTitle.tsx` /
`app/components/auth/ClientLayout.tsx` / `prisma/schema.prisma` / `.gitignore` 등):

- ❌ **working tree 에 방치 절대 금지** — 여러 세션 변경이 누적되면 누가 commit 하든 섞임
- ✅ 변경 **즉시 그 파일만 단독 commit + push** (1분 이내)
- ✅ 모듈 파일과 같은 commit 에 섞지 X (Rule 21 § 2.2)

> 2026-05-19 사고: menu-registry.ts + PageTitle.tsx 에 3개 세션 (call-scheduler /
> PR-ASSETS / CX-KPI) 변경이 commit 안 된 채 누적 → 한 세션이 commit 시 전부 섞임.

### 7.3 commit 유실 방지 — "commit + push 는 한 동작"

- commit 만 하고 push 안 하면 다른 세션 rebase/reset 으로 **유실 가능**
- commit 직후 **즉시 push** — 사이에 다른 작업 X
- push 안 된 local commit 을 신뢰하지 말 것

> 2026-05-19 사고: PR-MT-OPS-FIX commit 이 push 전 다른 세션 작업에 묻혀 유실 →
> 동일 내용 재commit (7a9dc0b) 필요했음.

### 7.4 staging 침범 차단 (재강조)

- `git add .` / `git add -A` / `git add *` **절대 금지**
- 항상 `git add <폴더/파일 명시>` — 자기 모듈 영역만
- commit 직전 `git status --short` 로 staged 목록 자기 영역인지 확인
- 다른 세션 파일이 staged 면 `git reset HEAD <그 파일>` 로 unstage
- cowork-staging-lint (pre-commit) 가 모듈 ≥ 2 자동 차단

### 7.5 임시 파일 누적 방지

- `.commit-msg-*.txt` / `backup_*.sql` 등 임시 파일 → `.gitignore` 등록 (본 PR)
- commit 메시지는 heredoc 으로 인라인 — 임시 파일 생성 X 권장

### 7.6 .git lock

- pre-commit hook 이 3분+ stale `.lock` 자동 정리 (PR-COWORK-LOCK 2d8a461)
- 수동 정리: `rm -f .git/*.lock .git/refs/remotes/origin/*.lock` (본인 세션 작업 중일 때만)
- lock 빈발 = 다른 세션 commit 진행 중 신호 → 1~3분 대기 후 재시도

### 7.7 위반 시

- commit 유실 / 공통 파일 섞임 / staging 침범 발생 → `harness-engineering/regression-cases/` 기록
- 같은 부류 3회+ → 자동화 hook 신설 (Rule 15)

---

본 § 7 은 운영 중 엉킴 패턴 발생 시 갱신.
