# meetings 모듈 CHANGELOG

본 파일은 `app/meetings/*` + `app/api/meetings/*` 모듈 변경 이력을 누적한다 (Rule 22).

---

## 2026-05-13

### PR-MTG-V2-F — V1 → V2 본문 마이그 도구

**사용자 명령**: 「본문 마이그 진행 ㄱㄱ」 (V2-B 검수 후).

**범위**: V2 페이지 「📎 V1 섹션」 탭에 「✨ V2 본문으로 옮기기」 버튼 신설. 클릭 시 `meeting_minutes` 의 안건/결정/메모/첨부 섹션을 TipTap JSON 으로 자동 변환 → body 에 적용 → 자동 저장.

**변경**:

1. **신규 helper** — `app/meetings/_components/v1ToV2Body.ts`:
   - `v1ToV2Body(minutes)` — TipTap doc 생성
   - `appendV1ToBody(existing, minutes)` — 기존 body 끝에 구분선 + V1 변환 결과 append
2. **MeetingsLayoutV2.tsx** — V1 탭에:
   - 우상단 「✨ V2 본문으로 옮기기」 버튼 (편집 권한 + 마이그 적용 시만 노출)
   - 안내 패널 — 변환 결과 설명
   - 변환 후 본문 탭 자동 이동
   - body 비어있으면 즉시 적용 / 있으면 「본문 끝에 추가? / 취소?」 confirm

**변환 규칙** (Rule 14 동형 — 4 section type):

| V1 section_type | V2 변환 |
|----------------|---------|
| `agenda` | H2 「📋 안건」 + 각 row 의 title H3 + content 단락 (\\n 분리) |
| `decision` | H2 「✓ 결정 사항」 + 각 row 의 title H3 + content 단락 |
| `note` | H2 「📝 메모」 + 각 row 의 title H3 + content 단락 |
| `attachment` | H2 「📎 첨부」 + 각 row 의 title H3 + attachment_url 링크 단락 |

섹션 순서: agenda → decision → note → attachment (`SECTION_ORDER`)
각 섹션 안에서는 `order_no` 정렬

**Rule 8 End-to-End 시뮬레이션**:
- STEP 0: V1 회의 (예: minutes 3 row — agenda 1 + decision 1 + note 1) 진입
- STEP 1: V1 탭 클릭 → 「✨ V2 본문으로 옮기기」 표시
- STEP 2: 클릭 → body 비어있음 → 즉시 v1ToV2Body(minutes) 호출 → TipTap doc 생성
- STEP 3: setBody(doc) + pendingBodyRef.current 설정 → debounce 300ms (V1 변환은 빠른 저장)
- STEP 4: flushBody → PATCH /api/meetings/[id]/body → body_version 증가
- STEP 5: AutoSaveIndicator 「✓ 저장됨」 + 본문 탭 자동 이동 / V1 데이터는 그대로 (read-only)

**Rule 11 SQL 검증**: 변경 없음 — V1 데이터 read-only / V2 body 만 update (기존 endpoint 재사용) ✓

**Rule 13 호환성**: 새 라이브러리 없음 — TipTap JSON 직접 구성 ✓

**Rule 14 동형 패턴**: 4 section type (agenda/decision/note/attachment) 모두 동일 알고리즘 변환 ✓

**Rule 21**: 자기 모듈 (`app/meetings/_components/*`) 만 ✓

**Rule 22**: 본 CHANGELOG (본 섹션) ✓

**Rule 23 graceful fallback**: 마이그 미적용 시 버튼 비표시 + alert 안내 — 「먼저 migrations/2026-05-13_meetings_v2.sql 적용 요청」

**GATE 진행 상태**:
- G3 사용자 GO + 설계서 § 6 PR-V2-F ✓
- G5 tsc PASS / G6 lint:harness 새 위반 0건 (boxShadow primary alpha 토큰화 후)
- G7 Designer — 사용자 스크린샷 검수 (V1 회의 진입 → 변환 → 본문 확인)

**알려진 이슈**:
- 본 PR 진단으로 발견된 IME 한글 자모 분리 (V2-B 시 발견) — 별도 hotfix 예정

---

### hotfix #1 — 「← 회의록 목록」 버튼 + 토큰화 누락 정리

**사용자 보고**: "목록으로 가는 버튼은 없어보여요" (2026-05-13 V2-B 검수).

**변경**:
1. `MeetingsLayoutV2.tsx` 헤더 상단에 「← 회의록 목록」 버튼 추가 (사이드바 외 명시적 이동 경로 — 사용자가 사이드바 접었거나 사이드바에 회의 없을 때 대비)
2. `TabBtn` 의 `background: 'rgba(255,255,255,0.5)'` → `GLASS.L1.background` 토큰화 (PR-V2-A 누락분 — ui-token-lint 새 위반 1건 정리)

**별도 진단 — IME 한글 자모 분리** (스크린샷에서 본문 발견):
- 체크리스트 안에 `ㅁㄴ어라ㅣㅓㄴㅁ어라...` 자모 분리 표시
- 「안녕하세요~」 일반 단락은 정상 → 슬래시 메뉴 후 / TaskItem 안 한글 입력 시점 의심
- 원인 후보:
  · TipTap `@tiptap/suggestion` 이 IME composition 중 키 입력 가로채기 (ueberdosis/tiptap#3284 / #3454)
  · TaskItem extension IME composition 호환성
- **hotfix 미포함** — 추가 진단 + 사용자 시나리오 확인 후 별도 PR 처리

---

### PR-MTG-V2-B — 슬래시 명령 + 블록 확장 (이미지/표)

**사용자 명령**: V2-A 완료 후 「ㄱㄱㄱ」 / 「PR-V2-B 슬래시 명령 + 블록 확장 (Recommended)」 선택.

**범위**:
- 신규 컴포넌트 — `app/meetings/_components/SlashCommandMenu.tsx` (forwardRef + 키보드 ↑↓Enter)
- 신규 extension — `app/meetings/_components/extensions/SlashCommand.ts` (TipTap Extension + Suggestion)
- 기존 `TiptapEditor.tsx` 수정 — Image / Table / SlashCommand extensions 추가 + 표/이미지 CSS
- 공통 — `package.json` + `package-lock.json` (deps 7종 추가: @tiptap/suggestion, extension-image, extension-table (+row/header/cell), tippy.js)

**핵심 변경**:

1. **슬래시 명령 `/`** — 본문에서 `/` 입력 시 tippy.js popper 메뉴 표시. 카테고리: 기본 / 미디어. 키보드 ↑↓ 이동, Enter 선택, Esc 닫기. 마우스 hover 도 선택 동기화. 빈 검색 결과 시 안내 화면.
2. **블록 메뉴** (총 12 항목):
   - 기본 (10): 제목1/2/3, 단락, 불릿 목록, 번호 목록, 체크리스트, 인용, 코드 블록, 구분선
   - 미디어 (2): 이미지 (window.prompt로 URL 입력), 표 (3×3 with header)
3. **이미지** — `@tiptap/extension-image` (inline:false, allowBase64:false). max-width 100% + border-radius 8 + shadow + selected 시 outline.
4. **표** — `@tiptap/extension-table` resizable + TableRow / TableHeader / TableCell. 헤더 행 강조 (primary alpha 6%) + selectedCell 오버레이 (primary alpha 12%) + 컬럼 리사이즈 핸들.
5. **tippy.js CSS 자동 임포트** — `tippy.css` + `themes/light-border.css` 를 SlashCommand.ts 에서 side-effect import. 다른 페이지 영향 X (CSS scope는 popper 한정).
6. **ui-token-lint 통과** — 모든 색상 `${COLORS.primary}XX` (8자리 hex alpha) 형식 토큰화 / 배경은 `GLASS.L1.background` / `GLASS.L5.background` 사용.
7. **푸터 안내 갱신** — `/` 블록 메뉴를 첫 자리에 명시 + V2-C 멘션 / V2-D 임베드 예고.

**Rule 8 End-to-End 시뮬레이션**:
- 사용자 `/` 입력 → TipTap Suggestion plugin → tippy popper 표시
- 화살표/마우스 선택 → Enter/Click → `editor.chain().focus().deleteRange(range).{command}().run()`
- onUpdate 트리거 → debounce 1.5s → PATCH `/api/meetings/[id]/body`
- AutoSaveIndicator 「✓ 저장됨」
- 다른 페이지 영향 X (TipTap 내부 확장 + 모듈 한정 CSS)

**Rule 11 SQL 검증**: SQL 변경 없음 ✓

**Rule 13 라이브러리 호환성**:
- `@tiptap/suggestion` / `extension-image` / `extension-table` 등 — TipTap 3.23.2 (V2-A 동일 버전)
- `tippy.js` 6.3.7 — popper.js 기반, peer 충돌 없음

**Rule 14 동형 패턴**: 슬래시 카테고리에 (V2-C 멘션) + (V2-D ERP 임베드) 자리 예고. 후속 PR 에서 추가.

**Rule 21 공통 파일 분리 commit**:
1. `package.json` + `package-lock.json` (단독 commit)
2. 자기 모듈 `app/meetings/_components/*` (단독 commit)

**Rule 22 _docs 갱신**: 본 CHANGELOG (이 섹션) ✓

**GATE 진행 상태**:
- G3 설계서 (MEETINGS-EDITOR-DESIGN.md § 6 PR-V2-B 범위) + 사용자 GO (「Recommended」 선택) ✓
- G5 tsc PASS (Table named export 수정 후 0 에러)
- G6 lint:harness 새 위반 0건 (ui-token-lint 6건 토큰화 정리 후)
- G7 Designer — 사용자 스크린샷 검수 (슬래시 메뉴 / 표 / 이미지 동작)
- Rule 8 / 11 / 13 / 14 / 21 / 22 모두 준수

**알려진 이슈 (후속 PR 대상)**:
- 이미지 업로드 미구현 — 현재 URL 입력만 (Cloud Storage 업로드는 별도 PR)
- 표 / 이미지 우클릭 메뉴 미구현 — TipTap BubbleMenu / FloatingMenu 도입은 별도 PR
- 슬래시 메뉴 한글 입력 시 자모 분리 동작 — IME composition 처리는 별도 검증 필요

---

### PR-MTG-V2-A — 노션형 풀페이지 에디터 기반 (Split view + TipTap)

**사용자 명령**: 「회의록처럼 화면이 열리고 본문을 넓게 작성하는 페이지 — 노션의 업그레이드 버전을 만들고 싶다」.

**범위**:
- 새 라우트 신설 — `app/meetings/new/page.tsx` + `app/meetings/[id]/page.tsx`
- 공용 컴포넌트 7개 — `app/meetings/_components/{MeetingsLayoutV2, MeetingSidebar, MeetingHeaderBar, TiptapEditor, AutoSaveIndicator, AttendeeManager, ActionItemList}.tsx`
- API body endpoint — `app/api/meetings/[id]/body/route.ts` (GET / PATCH 낙관적 락 + Rule 23 graceful fallback)
- 마이그 — `migrations/2026-05-13_meetings_v2.sql` (공통 — 사용자 직접 실행)
- 공통 — `package.json` + `package-lock.json` (TipTap deps 7종) / `app/components/PageTitle.tsx` (`/meetings/new` 등록)
- 목록 페이지 — 모달 제거 + 라우트 이동 (「+ 회의 등록」 → `/meetings/new`, 행 클릭/「열기」 → `/meetings/[id]`)
- 설계서 — `_docs/MEETINGS-EDITOR-DESIGN.md` 신설

**핵심 변경**:

1. **R2. Split view 레이아웃** — 좌측 sidebar(접기 가능, width 320 / collapsed 48) + 우측 본문 풀스크린 (max-width 1080)
2. **TipTap 에디터** — StarterKit + Placeholder + TaskList + TaskItem + Link. SSR 안전 (`immediatelyRender: false`). 단축키 안내 footer. 슬래시/멘션/임베드는 후속 PR.
3. **자동 저장** — body debounce 1.5s / meta blur 즉시 / attendees·actions debounce 1s. 낙관적 락 (`body_version` WHERE 조건).
4. **AutoSaveIndicator** — idle/pending/saving/saved/error/conflict/migration 7 상태. 「✓ 저장됨 · N초 전」 자동 갱신.
5. **권한 conditional** — `canEdit = admin/master/organizer/created_by`. 비편집자는 read-only 모드 + 🔒 안내 패널.
6. **Tabs** — 본문 / 참석자 N / 액션 M / V1 섹션 (legacy, body=NULL 회의 메뉴 표시).
7. **「+ 회의 등록」 Notion 방식** — `/meetings/new` 진입 즉시 POST `{title: '제목 없는 회의', status: 'draft'}` → `router.replace(/meetings/[id])`. 빈 form 회피.
8. **삭제** — 헤더바 「삭제」 버튼 (편집 권한자만) → soft delete + `/meetings` 이동.
9. **목록 페이지 통합** — 모달 제거. NeuDataTable의 「열기」 버튼이 V2 라우트로 이동.

**데이터 모델 변경** (C. Hybrid — 기존 4 테이블 그대로 유지):
- `meetings.body JSON NULL` — TipTap JSON 본문 (ProseMirror)
- `meetings.body_version INT DEFAULT 1` — 낙관적 락
- `meetings.body_updated_at DATETIME NULL` — 본문 마지막 변경 시각
- `meetings.body_updated_by CHAR(36) NULL` — 변경자 (profiles.id 논리 FK)
- `INDEX idx_m_body_updated (body_updated_at)` — sidebar 최근 작업 정렬 (PR-V2-B 활용)
- 기존 `meeting_minutes` / `meeting_attendees` / `meeting_action_items` 모두 유지 — V1 데이터 read-only 보존

**Rule 8 End-to-End 시뮬레이션**:
- 사용자 「+ 회의 등록」 → POST blank → `/meetings/[id]` 이동 → 본문 타이핑 → debounce 1.5s → PATCH `/api/meetings/[id]/body` `{body, body_version}` → UPDATE meetings SET body=?, body_version+1 WHERE id=? AND body_version=? → AutoSaveIndicator 「✓ 저장됨」
- 마이그 미적용 시: GET `_migration_pending: true` → 배너 표시 + 본문 read-only / PATCH 503 → AutoSaveIndicator 'migration'
- 버전 충돌 시: 409 conflict → server 본문 reset + 'conflict' 상태

**Rule 11 SQL 컬럼 사전 검증**:
- `meetings.body / body_version / body_updated_at / body_updated_by` — 본 PR 마이그에서 신설 ✓
- JSON 컬럼 타입 — Cloud SQL MySQL 8.x 지원 ✓ (CLAUDE.md Rule 13 화이트리스트 외 — 단순 ALTER ADD COLUMN JSON 으로 안전)

**Rule 14 동형 패턴**: type 4종 (regular/specific/one_on_one/department) sidebar / 헤더 / 자동 채우기 모두 동형.

**Rule 18 sortBy**: 목록 페이지 NeuDataTable 그대로 유지. Sidebar 카드는 정렬 미지원 (목록 페이지 정렬과 분리 — PR-V2-B 에서 「최근 작업」 정렬 옵션 추가).

**Rule 19 줄바꿈 최소화**: 모든 sidebar 카드 / 헤더 메타 / 액션 row `whiteSpace: 'nowrap'`.

**Rule 20 결과 메시지**: 삭제는 confirm + 토스트 / 저장 실패는 AutoSaveIndicator 'error' 톤 / 마이그 미적용은 배너.

**Rule 21 공통 파일 분리 commit**:
1. `app/components/PageTitle.tsx` — `/meetings/new` 등록 (단독 commit)
2. `migrations/2026-05-13_meetings_v2.sql` — 단독 commit + 사용자 직접 실행
3. `package.json` + `package-lock.json` — TipTap deps install (단독 commit)
4. 자기 모듈 (`app/meetings/*` + `app/api/meetings/*`) — 묶음 commit (cross-module 회피 위해 api 와 분리 가능)

**Rule 22 _docs 갱신**: 본 CHANGELOG + DATA-MODEL.md V2 컬럼 섹션 추가 + EDITOR-DESIGN.md (신설).

**Rule 23 graceful fallback**: body endpoint 의 GET / PATCH 가 ER_BAD_FIELD_ERROR (1054) 캐치 시 `_migration_pending: true` 반환. UI 배너 + read-only.

**Rule 27 GATE 체크리스트**:
- G3 설계서 (MEETINGS-EDITOR-DESIGN.md) + 사용자 GO ✓
- G4 마이그 안전 — ALTER ADD COLUMN (NULL 허용 + 인덱스) — 멱등 @col_exists 패턴
- G5 tsc PASS (본 세션 영역)
- G6 lint:harness 새 위반 0건
- G7 Designer — 사용자 스크린샷 검수 (split view + TipTap 동작)
- Rule 8 / 11 / 14 / 18 / 19 / 20 / 21 / 22 / 23 모두 준수

**1차 V2-A 제외 (후속 PR)**:
- V2-B 슬래시 명령 + 블록 확장 (체크리스트/표/이미지 — 부분만 A에 포함, 슬래시 메뉴는 B)
- V2-C @멘션 (직원/회의/계약)
- V2-D ERP 데이터 인라인 임베드
- V2-E 협업 (yjs + WebSocket — 별도 인프라 합의)
- V2-F V1 → V2 본문 마이그 도구 (meeting_minutes → body 자동 변환)

---

### PR-MTG-1 — 디자인 표준 1차 리뉴얼

**범위**: `app/meetings/page.tsx` + `app/api/meetings/route.ts` (m.created_by 한 컬럼 추가) + `app/components/PageTitle.tsx` (공통, 분리 commit) + `_docs/MEETINGS-PERSONAS.md` (신설) + `_docs/MEETINGS-DATA-MODEL.md` (신설).

**변경 내용**:

1. **PageTitle 자동 헤더 적용** — 자체 RGY 도트 / 「RIDE INC > 회의록」 / `<h1>🗓 회의록</h1>` 제거. `PATH_TO_GROUP['/meetings'] = 'work'` + `PAGE_NAMES['/meetings'] = '회의록'` 등록 → 「Employee of Ride Inc. > 회의록」 자동 표시 (UI-DESIGN-STANDARD § 1.3).
2. **DcStatStrip 5 카드 + 액션 버튼** — 자체 div 6 카드 제거 → DcStatStrip 사용 (정기/특정/1:1 면담/부서별/작성중 + `+ 회의 등록` actions) (§ 2).
3. **DcToolbar 통합 검색 + 필터** — 자체 input/button/select 제거 → DcToolbar (검색 / 5 filter pills / trailing: 그룹 select + 내 회의 체크박스) (§ 3).
4. **NeuDataTable + sortBy 8 컬럼** — 자체 grid 카드 제거 → 정렬 가능한 표 (일시/유형/제목/주관자·부서/참석/액션 진행률/상태/액션 버튼). Rule 18 — 액션 버튼 컬럼 제외 모든 컬럼 sortBy 정의. 기본 정렬 `{ key: 'date', dir: 'desc' }`. mobileCard 설정으로 모바일 반응형.
5. **권한 UI conditional** — `canEditMeeting(m, user)` 헬퍼 (admin/master/organizer/created_by 체크) → 편집/삭제 버튼 conditional render. API canEdit/canDelete 조건과 1:1 일치 (사용자 결정 2026-05-13).
6. **결과 메시지 글래스 토스트** — 저장 성공/실패, 삭제 결과를 alert 대신 글래스 토스트로 (success=녹색 / error=빨강 / 4초 자동 dismiss). 삭제 confirm은 data-loss 위험으로 native confirm 유지 (Rule 20 화이트리스트). 모달 내 저장 실패 alert도 부모 토스트로 전달.
7. **API SELECT 컬럼 추가** — `app/api/meetings/route.ts` GET 목록 SELECT에 `m.created_by` 추가 (권한 UI 위해). Meeting 인터페이스에도 `created_by` 추가. Rule 11 사전 검증 — `migrations/2026-04-30_meetings.sql:35` 에서 컬럼 존재 확인.
8. **줄바꿈 최소화** — 셀에 `whiteSpace: 'nowrap'` 적용 (Rule 19). 제목 + 위치는 한 셀 한 줄, 주관자 + 부서는 한 셀 한 줄.

**Rule 8 End-to-End 시뮬레이션** (변경 전 보고 완료):
- STEP 1 입력: 사용자가 페이지 진입 + 회의 클릭/편집/삭제 시도
- STEP 2 API/SQL: GET /api/meetings (created_by 추가) / PATCH / DELETE — 기존 SQL 그대로
- STEP 3 DB: 변경 없음 (created_by는 이미 존재 컬럼)
- STEP 4 UI: PageTitle 자동 + DcStatStrip 5 카드 + DcToolbar + NeuDataTable + 권한 conditional 버튼 + 토스트
- STEP 5 영향: 다른 페이지 영향 X (PageTitle 등록은 path 추가만), API GET 응답 키 확장(created_by) — 다른 페이지 미사용

**Rule 11 SQL 컬럼 사전 검증**:
- `meetings.created_by` — `migrations/2026-04-30_meetings.sql:35` 확인 ✓
- `user_page_permissions.user_id / page_path / can_edit / can_delete` — 본 PR 미사용 (별도 후속 PR에서 fetch 검토)

**Rule 14 동형 패턴**:
- type 4종 (regular/specific/one_on_one/department) 카드 / 필터 / 정렬 모두 동형 적용

**Rule 18 컬럼 sortBy 의무**:
- 일시 → meeting_date timestamp
- 유형 → TYPE_META label
- 제목 → title
- 주관자 → organizer_name + department concat
- 참석 → attendee_count number
- 액션 진행 → progress ratio (done / total)
- 상태 → status string
- 액션 버튼 → sortBy 미정의 (액션 컬럼 화이트리스트)

**GATE 진행 상태** (Rule 27):
- G3 설계서 (PERSONAS + DATA-MODEL) + 사용자 GO ✓
- G5 tsc PASS — verification 단계에서 확인
- G6 lint:harness 신규 위반 0건 — pre-commit hook 자동 검증
- G7 Designer — 사용자 스크린샷 검수 요청 (push 후)
- G8 evaluate.js — 있으면 실행 (없으면 skip)
- Rule 22 _docs 갱신 ✓ (본 파일)

**1차 PR 제외 (별도 후속 PR)**:
- 조회 권한 범위 변경 (전사 vs 참석자 + 부서원 vs status 기반)
- 액션 아이템 인라인 status 토글
- 외부인 부서 회의 권한 정책
- soft delete cascade (meeting_attendees / minutes / action_items에 deleted_at)
- organizer 변경 시 attendees role 자동 동기화
- `user_page_permissions` 페이지 권한 fetch (현재 admin/master/organizer/created_by만 체크)

---

## 2026-04-30

### 초기 모듈 신설 (메인 세션)

- `migrations/2026-04-30_meetings.sql` 적용 — 4 테이블 (meetings / meeting_attendees / meeting_minutes / meeting_action_items)
- `app/meetings/page.tsx` 작성 — 자체 헤더 + 자체 stat 카드 + 자체 grid 카드 (디자인 표준 적용 전)
- `app/api/meetings/route.ts` 작성 — GET / POST / PATCH / DELETE (soft delete) + 권한 체크
