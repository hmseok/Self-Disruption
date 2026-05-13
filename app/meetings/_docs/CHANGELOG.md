# meetings 모듈 CHANGELOG

본 파일은 `app/meetings/*` + `app/api/meetings/*` 모듈 변경 이력을 누적한다 (Rule 22).

---

## 2026-05-13

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
