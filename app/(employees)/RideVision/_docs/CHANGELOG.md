# CHANGELOG — RideVision (비전)

> 매 PR 종료 시 한 줄 이상 기록 (CLAUDE.md 규칙 22).
> 「비전」 그룹 — 라이드 하위 신규 메뉴 그룹.

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
