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
| `app/operations/*` | **operations 세션 (신설 2026-05-11)** | ✅ |
| `app/api/operations/*` | **operations 세션 (신설 2026-05-11)** | ✅ |
| `app/loans*/*` | 본 도메인 세션 (자율) | ✅ |
| `app/insurance*/*` | 본 도메인 세션 (자율) | ✅ |

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
