# CHANGELOG — RideVision (비전)

> 매 PR 종료 시 한 줄 이상 기록 (CLAUDE.md 규칙 22).
> 「비전」 그룹 — 라이드 하위 신규 메뉴 그룹.

---

## 2026-05-24 | PR-VISION-2a | 마이그레이션 + 동행복권 결과 조회 API

### 사용자 요청
> "아이디 별로 개인페이지 탭 — 번호 사용여부 체크, 당첨여부, 비당첨 시 투자금액·손실금액 표출"

### 공동 시뮬레이션 확정 (CLAUDE.md §11-1, AskUserQuestion 3문)
- 저장: 서버 DB (정식 기능) / 당첨번호: 동행복권 자동 조회 / 기록: 추출기 "구매함" 체크
- 원 브리프("가벼운 유틸 / DB·API 불필요")에서 범위 확장 — 사용자 명시 GO

### 변경 (PR-VISION-2a — 마이그레이션 + 결과 조회 API)
- **NEW** `migrations/2026-05-24_ride_vision_lotto.sql`
  - `ride_lotto_entries` — 사용자 구매 게임 (계정별·회차별, 멱등 CREATE TABLE)
  - `ride_lotto_results` — 동행복권 당첨번호 캐시 (INSERT IGNORE 멱등 적재)
- **NEW** `app/api/ride-vision/lotto-result/route.ts`
  - `GET ?drwNo=N` / `?latest=1` — 캐시 우선 → 동행복권 서버사이드 조회
  - 첫 호출 raw 응답 로깅 (Rule 3 dry-run), 6초 타임아웃, graceful fallback
  - 인증: verifyUser (로그인 직원 누구나 — page-permission 미적용)
- **NEW** `app/(employees)/RideVision/_docs/DATA-MODEL.md`

### ⚠ 마이그레이션 적용 필요 (Rule 23)
> 석호민님이 Cloud SQL 에 `migrations/2026-05-24_ride_vision_lotto.sql` 직접 적용.
> 미적용 시 결과 조회는 동작(라이브 조회), 캐시만 생략 — 2b 구매기록 저장은 적용 후 가능.
> 메인 세션(sweet-amazing-galileo)에 마이그레이션 신설 공유.

### GATE 진행 상태
- ✅ G3 설계서 v2 + 사용자 GO ("진행")
- ✅ G5 tsc — RideVision 신규 에러 0건
- ✅ G6 lint:harness 새 위반 0건
- ⏳ G7 Designer — UI 없음 (2b/2c 에서 검수)
- ✅ Rule 22 _docs 갱신 (DATA-MODEL / CHANGELOG)

---

## 2026-05-24 | PR-VISION-1 | 로또번호추출기 신설

### 사용자 요청
> "라이드 > 비전(신규 그룹) > 로또번호추출기 — 한국 로또 6/45 번호 추출기.
>  한쪽 구석 가벼운 유틸 — 과하게 만들지 말 것."

### 공동 시뮬레이션 확정 사양 (CLAUDE.md §11-1)
- 제외/고정 번호 옵션 없이 순수 랜덤
- 결과 공은 한국 로또 공식 구간색 (1-10 노랑 / 11-20 파랑 / 21-30 빨강 / 31-40 회색 / 41-45 초록)
- 복사 버튼 + 세션 메모리 히스토리 (새로고침 시 사라짐)

### 변경
- **NEW** `app/(employees)/RideVision/lotto/page.tsx` — 로또번호추출기
  - 1게임 = 1~45 중 비복원 6개 (Fisher–Yates) 오름차순
  - 동시 1~5게임 (세그먼트 컨트롤)
  - 결과: 공식 구간색 공 카드 + 게임별/전체 복사 + 게임 합계 표시
  - 최근 추출 기록 8회 (useState 메모리 — 외부 저장 없음)
  - 클라이언트 only — 외부 API / DB 불필요
  - GLASS L4 카드 + COLORS / BTN 토큰 사용 (ui-token-lint 통과)
- **NEW** `app/(employees)/RideVision/_docs/CHANGELOG.md` — 본 파일

### 페이지 경로
- `/RideVision/lotto` — 파일 `app/(employees)/RideVision/lotto/page.tsx`

### 공통 파일 (본 세션 미변경 — 메인 세션 sweet-amazing-galileo 등록 요청)
- `lib/menu-registry.ts` — 「비전」 그룹 + 「로또번호추출기」 엔트리
- `app/components/PageTitle.tsx` — PATH_TO_GROUP / PAGE_NAMES (`/RideVision/lotto`)
- `app/components/auth/ClientLayout.tsx` — 「비전」 그룹 사이드바 렌더링

### GATE 진행 상태
- ✅ G3 설계 + 사용자 사양 확정 (AskUserQuestion 3문 — §11-1 공동 시뮬레이션)
- ✅ G5 tsc — 신규 위반 0건
- ✅ G6 lint:harness / lint:ui-token 새 위반 0건
- ⏳ G7 Designer — 배포 후 hmseok.com 시각 검수 (Rule 6)
