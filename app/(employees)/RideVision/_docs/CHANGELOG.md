# CHANGELOG — RideVision (비전)

> 매 PR 종료 시 한 줄 이상 기록 (CLAUDE.md 규칙 22).
> 「비전」 그룹 — 라이드 하위 신규 메뉴 그룹.

---

## 2026-05-24 | PR-VISION-9 | 당첨/꽝 축하 멘트 배너

### 사용자 요청
> "당첨되면 만든 사람한테 입 딱으면 3년 재수없다는 멘트 / 꽝일 때도 비슷한 류로 더 쎄게"

### 변경
- **수정** `lotto/page.tsx`
  - 멘트 풀 4종 추가 — WIN_COMMON(5) / WIN_JACKPOT(1·2등 2) / WIN_SMALL(4·5등 2) / MISS_MESSAGES(6)
  - 「내 기록」 탭 상단 축하 배너 — 당첨 건 있으면 당첨 멘트(보라 글래스),
    당첨 없이 꽝만 있으면 꽝 멘트(회색), 추첨 대기만이면 배너 없음
  - 등수별 풀 선정: 1·2등→대박 멘트, 4·5등→소액 멘트, 3등→공통
  - 모두 클라이언트 랜덤 — 외부 연동 없음

### GATE
- ✅ G5 tsc 0건 / G6 lint:harness 위반 0건 / Rule 22 CHANGELOG

---

## 2026-05-24 | PR-VISION-8 | 재로그인 시 추출 재개방 차단

### 사용자 피드백
> "이미 복사 구매 완료했는데 재로그인하면 추출이 또 진행되는 것도 막아주세요"

### 원인
`drawCount` 는 메모리 상태 → 재로그인·새로고침 시 0으로 초기화되어 추출이 다시 열림.

### 변경
- **수정** `lotto/page.tsx`
  - `alreadyBought = purchasedTotal > 0` — DB 구매 기록 기준 (재로그인 후에도 유지)
  - `canDraw = drawsLeft > 0 && !alreadyBought` — 이미 구매한 회차면 추출 잠금
  - `handleDraw` 가드에 `purchasedTotal > 0` 추가
  - 컨트롤 카드·빈 상태 문구 — 이미 구매 시 「이번 회차 구매 완료 / 내 기록에서 확인」 안내

### GATE
- ✅ G5 tsc 0건 / G6 lint:harness 위반 0건 / Rule 22 CHANGELOG

---

## 2026-05-24 | PR-VISION-7 | 추출 탭 전체 너비 + 회차당 추출 1회

### 사용자 피드백
> "페이지 기준대로 정리 안 되고 센터에 나온다" / "5게임이면 1번 해야 한다, 5번이 아니라"

### 변경
- **수정** `lotto/page.tsx`
  - 「번호 추출」 탭 내부 래퍼 `maxWidth:680 + margin:auto` 제거 → 전체 너비
    (PR-5에서 최상위만 처리 → 탭 내부도 §1.6 표준대로 전체 너비)
  - `MAX_DRAWS` 5 → **1** — 회차당 추출 1회 (5게임 = 운명의 한 장, 재추출 없음)
  - 컨트롤 카드·빈 상태·버튼 문구 정정 (재추출 5회 → 1회 추출)

### GATE
- ✅ G5 tsc 0건 / G6 lint:harness·lint:ui-design 위반 0건
- ✅ Rule 22 CHANGELOG 갱신

---

## 2026-05-24 | PR-VISION-6 | 자동조회 버그 수정 — lt645 배열 처리

### 배경
PR-4 배포 후 `?drwNo` 호출 → `lt645 미발견`. 쿠키 없는 요청(서버와 동일 조건)으로
재확인 → `pstLtEpstInfo.lt645` 는 **객체가 아니라 배열** (`"lt645":[{...}]`).
PR-4 가 객체로 처리해 파싱 실패. egress·응답은 정상.

### 변경
- **수정** `app/api/ride-vision/lotto-result/route.ts`
  - `lt645` 를 배열로 처리 — `parseLt645()` 로 각 항목 파싱 + 유효성 검사
  - 제공되는 회차 전부 `ride_lotto_results` 캐시 → 요청 회차 매칭 시 반환
  - 검증된 응답 예: lt645[0] = 회차 1224 / 9·18·21·27·44·45 / 보너스 28 / 2026-05-16

### GATE
- ✅ G5 tsc 신규 에러 0건 / G6 lint:harness 새 위반 0건
- ⏳ G7 배포 후 ?drwNo=1224 호출로 실제 번호 반환 확인
- ✅ Rule 22 CHANGELOG 갱신

---

## 2026-05-24 | PR-VISION-5 | 페이지 전체 너비 표준 적용 (UI-DESIGN-STANDARD §1.6)

하네스 표준 갱신(PR-DESIGN-4/5) 반영 — 페이지 최상위 래퍼 중앙정렬 금지.
- `lotto/page.tsx` 최상위 래퍼 `maxWidth: 940 + margin:'0 auto'` 제거 → `padding: 16` 전체 너비
- 추출 탭 내부 래퍼 `maxWidth: 680` 유지 (의도된 좁은 유틸 영역 — §1.6 허용 예외)
- 검증: `npm run lint:ui-design` — RideVision/lotto 경고·위반 0건

---

## 2026-05-24 | PR-VISION-4 | 동행복권 자동조회 복구 (selectMainInfo.do JSON API)

### 배경 — egress 판가름 결과
PR-3 배포 후 `?drwNo=1100` 3회 호출 → 모두 http 200, `egressBlocked:false`.
→ **Cloud Run egress 정상.** 앞선 PR-2d 의 AbortError 는 일시적 타임아웃이었음 (정정).
옛 `getLottoNumber` JSON 엔드포인트는 폐기(HTML 응답) 확인.

### 발견 — 동행복권 홈 AJAX 엔드포인트
홈페이지 네트워크 추적 → `selectMainInfo.do` (application/json) 발견.
`data.result.pstLtEpstInfo.lt645` = `{ ltEpsd, tm1~6WnNo, bnsWnNo, ltRflYmd }`
→ 회차·당첨번호 6개·보너스·추첨일이 JSON 으로 제공. egress 정상 → 서버 조회 가능.

### 변경
- **수정** `app/api/ride-vision/lotto-result/route.ts`
  - 조회 소스를 `getLottoNumber`(폐기) → `selectMainInfo.do` 로 교체
  - `lt645` 파싱 → 최근 회차 결과 ride_lotto_results 에 캐시 (호출 시마다 점진 적재)
  - 요청 회차가 캐시/최근회차에 없으면 추첨 대기로 응답
  - AbortController 6초, egress 차단 시 인스턴스 캐시로 이후 skip

### 한계 / 비고
- `selectMainInfo.do` 는 최근 회차 1건 제공 → 페이지 열람 시마다 호출되어 점진 캐시.
- 매우 오래된 회차(캐시에도 없고 최근회차도 아님)는 미제공 — 실사용(최근 회차 확인)엔 무방.

### GATE 진행 상태
- ✅ G5 tsc — 신규 에러 0건 / G6 lint:harness 새 위반 0건
- ⏳ G7 배포 후 ?drwNo 호출로 실제 회차 적재 확인
- ✅ Rule 22 _docs 갱신 (CHANGELOG)

---

## 2026-05-24 | PR-VISION-3 | UX 전면 개편 + egress 판가름 라우트

### 사용자 요청 (시각 검수 후 누적)
> 이번 회차·추첨일 표시 / 5게임 고정 / 「구매함」 제거 → 「복사」=구매 / 내 기록 즉시 반영 /
> 회차당 5게임·재추출 5회 제한 / 동행복권 자동조회는 server 라우트로 egress부터 판가름

### 변경
- **수정** `app/(employees)/RideVision/lotto/page.tsx` — 전면 개편
  - 이번 회차 + 추첨일자 자동 표시 (날짜계산 — 1회차 2002-12-07 기준, 외부 API 없음)
  - 5게임 고정 (게임 수 선택 제거), 재추출 회차당 5회 제한
  - 「구매함」 제거 → 「복사」 = 클립보드 복사 + 구매 자동 기록
  - 구매 직후 entries 재조회 → 「내 기록」 즉시 반영, 결과 패널에 「내 기록 보기」
  - 회차당 5게임 구매 제한 (구매 N/5 표시, 마감 시 버튼 잠금)
  - 최근 추출 기록 섹션 제거 (내 기록으로 대체)
- **수정** `app/api/ride-vision/lotto-entries/route.ts` — 회차당 5게임 제한 (POST 시 기존 수 검증)
- **수정** `app/api/ride-vision/lotto-result/route.ts` — egress 판가름 라우트
  - 캐시 우선 → 없으면 동행복권 common.do JSON 조회 (AbortController 5초 + User-Agent)
  - 응답에 `egressBlocked` / `endpointDead` 플래그 명시
  - egress 차단 1회 확인 시 인스턴스 캐시로 이후 호출 skip (5초 대기 방지)

### egress 판가름 (배포 후 ?drwNo=1100 1회 호출)
- JSON 번호 반환 → egress 정상 → 자동조회 완성 단계로
- egressBlocked → Cloud Run 외부 송신 차단 확정 → 메인 세션 인프라 과제로 보고
- (PR-2d 진단에서 이미 fetch-throw AbortError 확인 — egress 차단 유력)

### GATE 진행 상태
- ✅ G3 사용자 지시 누적 반영
- ✅ G5 tsc — RideVision·ride-vision 신규 에러 0건
- ✅ G6 lint:harness 새 위반 0건
- ⏳ G7 Designer — 배포 후 hmseok.com 시각 검수
- ✅ Rule 22 _docs 갱신 (CHANGELOG)

---

## 2026-05-24 | PR-VISION-2d | 동행복권 조회 진단 (시각 검수 후속)

### 배경
배포 후 시각 검수(Rule 6)에서 `/api/ride-vision/lotto-result` 가 502 — Cloud Run
서버사이드 동행복권 fetch 실패 확인. 회차 자동입력·당첨판정이 막힘.

### 변경
- **수정** `app/api/ride-vision/lotto-result/route.ts`
  - 실패 응답에 `meta.debug` 노출 — fetch-throw(에러명/메시지) / parse-fail(status·ct·body) /
    returnValue 구분 (Rule 3 [C] — 원인 즉시 파악)
  - 요청 헤더 보강 (브라우저 UA + Accept + Referer) — HTML 차단 페이지 응답 케이스 대비
  - 타임아웃 6초 → 8초

### 다음 단계
배포 후 `meta.debug` 로 실패 원인 확정 → 타깃 수정 (또는 egress 차단 시 사용자 직접입력 폴백).

---

## 2026-05-24 | PR-VISION-2b | 구매기록 API + 페이지 탭 전면개편 (운세 + 당첨추적)

> PR-VISION-2b 가 페이지 전면개편을 포함 → 당초 분리 예정이던 2c(내 기록 탭)도 본 PR 에 통합.

### 변경
- **NEW** `app/api/ride-vision/lotto-entries/route.ts` — GET(내 기록) / POST(구매 일괄 기록)
- **NEW** `app/api/ride-vision/lotto-entries/[id]/route.ts` — DELETE(본인 기록만)
- **수정** `app/(employees)/RideVision/lotto/page.tsx` — 탭 2개로 전면개편
  - 탭 1 「🎱 번호 추출」 — 기존 추출기 + 오늘의 로또 운세(클라 랜덤·행운지수)
    + 구매 회차 입력 + 게임별/전체 「구매함」 버튼 → DB 기록
  - 탭 2 「📒 내 기록」 — 로그인 본인 구매·당첨 기록
    · DcStatStrip 5카드 (총 게임 / 총 투자금 / 당첨 / 비당첨 손실 / 순손익)
    · NeuDataTable — 회차 / 구매번호(당첨공 강조) / 결과 등수 / 손익 / 삭제
    · 당첨번호 동행복권 자동 조회 → 클라이언트 당첨판정
  - 구매 결과는 글래스 패널로 표시 (Rule 20 — alert 미사용)

### 운세 (사용자 추가 요청)
- 추출 시 "오늘의 로또 운세" 한 줄 + 행운지수 — 16개 큐레이션 문구 클라 랜덤. 외부 연동 없음.

### GATE 진행 상태
- ✅ G3 설계서 v2 + 사용자 GO ("진행")
- ✅ G5 tsc — RideVision/ride-vision 신규 에러 0건
- ✅ G6 lint:harness 새 위반 0 / ui-token RideVision 위반 0
- ⏳ G7 Designer — 배포 후 hmseok.com 시각 검수 (Rule 6)
- ✅ Rule 22 _docs 갱신 (DATA-MODEL / CHANGELOG)
- ⚠ Rule 23 마이그레이션(2a) 적용 후 구매기록 저장 정상화 — graceful fallback 적용

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
