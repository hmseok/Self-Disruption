# meetings 모듈 CHANGELOG

본 파일은 `app/meetings/*` + `app/api/meetings/*` 모듈 변경 이력을 누적한다 (Rule 22).

---

## 2026-05-13

### PR-MTG-V2-Visibility — 회의별 공개 범위 + 공동 편집자

**사용자 명령**:
> 「인사마스터에 페이지 읽고 쓰고 수정 삭제 권한과 전체인지 부서만인지의 설정이 있는데 그걸다 열어줬고... 일단 외부매니저한테도 다공개되는것 보니 인사마스터 기준으로 그냥 다열리는것같아 추가적인 회의록 특성에 맞는 별도 권한관리가 있어야 되지않을까」
> → 「B 메인 (회의록 안 통합) + C 일부 (admin/master 자동)」 추천대로 가시죠

**3 commit 분리**:
- 31d6d91 [공통/DB] migrations/2026-05-16_meetings_visibility.sql
- 13c6c98 [API] route.ts visibility 필터 + meeting_editors CRUD
- 본 commit [UI] MeetingHeaderBar visibility select + MeetingPermissionsPanel + 「🔒 권한」 탭

**Visibility 4종 (meetings.visibility)**:
| 값 | 의미 | 조회 가능 |
|----|------|---------|
| `public` 🌐 | 전사 공개 | 모든 인증 직원 (외부매니저 포함) |
| `department` 🏢 | 부서 공개 | 회의 부서 === ride_employees.department 인 사람 |
| `attendees` 🔒 | 참석자만 (DEFAULT) | meeting_attendees + organizer + created_by |
| `private` 🔐 | 비공개 | organizer + created_by + meeting_editors |

**API 권한 매트릭스**:
- 조회: admin/master (모두) + visibility 별 필터
- 편집: admin/master + organizer + created_by + meeting_editors.role='editor' + can_edit_perm
- 편집자 관리 (POST/DELETE editors): organizer/created_by/admin/master 만

**신규 API**: `/api/meetings/[id]/editors` GET / POST / DELETE
- POST `{ profile_id, role? }` → INSERT ON DUPLICATE KEY UPDATE
- profile_id 필수 — 인증 계정 없는 직원 (ride_employees.profile_id=null) 은 편집자 지정 불가

**신규 컴포넌트**: `MeetingPermissionsPanel.tsx`
- 「🔒 공개 범위」 4 radio + 각 옵션 상세 설명 (외부 노출 위험 등)
- 「👤 공동 편집자/조회자」 직원 추가 select (role: editor / viewer)
- 마이그 미적용 시 amber 배너 + 기능 차단

**MeetingHeaderBar 통합**:
- 메타 라인에 「🔒 공개 범위」 inline select (4 옵션, 헤더에서 빠른 변경)
- read-only 모드: 태그 표시 (🌐 전사 / 🏢 부서 / 🔒 참석자만 / 🔐 비공개)

**MeetingsLayoutV2 통합**:
- meta.visibility 로드/저장 (default 'attendees')
- Tab type 'permissions' 추가
- 「🔒 권한」 탭 → MeetingPermissionsPanel 마운트 (canManage=canEdit)

**Rule 8 End-to-End 시뮬레이션**:
- 사용자 회의 페이지 진입 → meta.visibility 로드
- 헤더 또는 권한 탭에서 visibility 변경 → onMetaChange → PATCH meetings (visibility allowed)
- 「공동 편집자 추가」 → POST editors → 다음 GET 목록부터 그 사용자도 조회 가능
- 외부매니저 사용자 진입 시: visibility=attendees 인 회의는 안 보임 (meeting_attendees 에 없으면)

**Rule 11 SQL 사전 검증** ✓:
- meetings.visibility (본 PR 마이그)
- meeting_editors.id/meeting_id/profile_id/role/added_by/added_at (본 PR 마이그)
- ride_employees.profile_id/department/is_active (기존)
- meeting_attendees.profile_id (기존)

**Rule 14 동형 패턴 ✓**:
- AttendeeManager / ActionItemList / MentionEmployee / MeetingPermissionsPanel 모두 ride_employees 기반 + profile_id 분기 (외부 fallback)

**Rule 21**: 3 commit 분리 (공통/DB + api:meetings + meetings)
**Rule 22**: 본 CHANGELOG ✓
**Rule 23**: graceful fallback
- meeting_editors 테이블 미적용 시 → editors 패널에 배너
- meetings.visibility 컬럼 미적용 시 → 1054 발생 (사용자 마이그 적용 권장 — 현재 명시 fallback 없음)

**GATE 진행 상태**:
- G3 사용자 GO ✓
- G5 tsc PASS / G6 lint:harness 새 위반 0건
- G7 Designer — 사용자 검수 (공개 범위 4 옵션 / 편집자 추가 동작 / 외부매니저 안 보이는지)

**후속 PR (HR 세션 협업)**:
- ride_departments.leader_employee_id 완성 후 부서장 자동 편집 권한 추가 (V2-Visibility-FK)

---

### PR-MTG-V2-Note — 개인 메모 (회의별, 본인만)

**사용자 명령**: 「여기 회의록 안에 메모라던가 to do 같은것도 구성하면 좀 도움되지않을까?」 → 「개인 메모 + 내 TODO 대시보드」 둘 다 선택 (2 + 4) → 「ㄱㄱ」

**4 commit 분리 진행**:
- 30f99d6 [공통/DB] migrations/2026-05-16_meeting_personal_notes.sql
- cb7166e [API] /api/meetings/[id]/personal-note GET/PUT
- 79693bf [UI 컴포넌트] PersonalNoteEditor.tsx (TipTap 간소화)
- 본 commit [UI 통합] MeetingsLayoutV2 「📓 내 메모」 탭 + CHANGELOG

**MeetingsLayoutV2 변경**:
- import PersonalNoteEditor
- Tab type 'note' 추가
- noteBody / noteMigrationPending / noteSaveStatus / noteLastSavedAt / noteError state
- loadNote (mount 시 GET) / flushNote (PUT upsert) / onNoteChange (debounce 1.5s)
- noteTimerRef cleanup on unmount + best-effort flush
- 마이그 미적용 시 amber 배너 + editable=false
- AutoSaveIndicator 별도 표시 (본문과 분리)

**Rule 8/11/14/21/22/23 모두 준수** (전체 PR 묶음 기준):
- Rule 11: meeting_personal_notes 컬럼 사전 검증 ✓
- Rule 14: V2-A body endpoint 패턴 동형 (loadBody/loadNote, flushBody/flushNote)
- Rule 21: 4 commit 분리 (공통/DB + api:meetings + meetings 컴포넌트 + meetings 통합)
- Rule 23: ER_NO_SUCH_TABLE (1146) 캐치 → _migration_pending

**🔧 진행 중 사고 회고**:
- UI 통합 commit 도중 다른 세션 race 로 working tree 변경 소실
- 사용자 「잠시 대기」 후 재시도 → 본 commit 으로 복구 완료
- 향후 같은 race 발생 시: 단일 commit 즉시 + 작은 단위 + 다른 세션 안정화 후 진입

---

### PR-MTG-V2-Dept — 부서 표현 일관성 + UX 강화

**사용자 명령**:
> 「회의록 부서별 구성이라던가 그런것들이 제대로 표현나 구성이 안되어있는것같은데 인사마스터쪽으로 조금 더 정리해야하나」
> 「완성도 측면에서 ㄱㄱ」

**문제 진단**:
- `meetings.department` (VARCHAR 64) + `ride_employees.department` (VARCHAR 32) — 둘 다 자유 입력 → 동기 불가
- 부서별 회의 type 선택 시 부서 입력 검증 없음 → 「부서원 자동」 매칭 실패 가능
- 「부서원 자동」 버튼이 type=`department` 한정 → 다른 type 회의는 부서 입력해도 자동 채우기 불가
- 부서 매칭이 정확 일치 (`=`) → 공백/대소문자 차이 시 매칭 실패

**변경 (본 PR 본 세션 책임)**:

1. **MeetingHeaderBar 「🏢 부서」 inline input + datalist**:
   - `ride_employees` 의 unique department 자동 추출 → `<datalist id="dept-options">` 옵션
   - 자유 입력 + 자동완성 동시 (브라우저 native datalist)
   - placeholder 분기: type=department 시 「(필수)」 / 그 외 「(선택)」
   - **type=department 인데 부서 비어있으면 빨간 border + 「⚠ 필수」 라벨**
   - read-only 모드: `🏢 부서명` 태그

2. **AttendeeManager 부서원 자동 매칭 강화**:
   - 기존: `e.department === department` (대소문자 + 공백 민감)
   - 신규: `e.department.trim().toLowerCase() === department.trim().toLowerCase()` (PR-V2-Dept)
   - 「부서원 자동」 동작 변경: **기존 attendees 삭제 X → 부서원만 추가** (dedup 적용, 이미 있는 사람 skip)
   - 버튼 라벨: `🏢 {부서} 자동 (N)` — 매칭 직원 수 미리 표시
   - 매칭 0명 시: 버튼 disabled + tooltip 「인사마스터에 부서 없음 → /hr/people 등록 안내」

3. **AttendeeManager 노출 조건 변경**:
   - 기존: `showAutoFill={meta.type === 'department'}` (부서별 회의 한정)
   - 신규: `showAutoFill={!!meta.department?.trim()}` (PR-V2-Dept — 부서 입력되어 있으면 항상 노출)
   - → 「정기 회의」나 「특정 회의」 도 부서 지정 시 부서원 자동 추가 가능

4. **헤더 메타 라인 순서 정리**:
   - 유형 → 일시 → 시간(분) → 장소 (+ 주소 검색) → **부서** → 주관자 → 상태
   - 부서가 주관자 옆이라 부서별 회의 시 두 영역 함께 입력 자연스러움

**Rule 8 End-to-End 시뮬레이션**:
- 사용자 type=「부서별 회의」 선택 → 부서 input 빨간 border + 「⚠ 필수」 표시
- 사용자 「콜센터」 입력 시 datalist 자동완성 → 클릭/선택 → onMetaChange → PATCH meetings
- 「부서원 자동 (N)」 버튼 클릭 → autoFillDept → trim+lowercase 매칭 → 신규 부서원만 추가 (기존 보존)
- DB: meeting_attendees INSERT (각 row 의 profile_id 또는 external_name 채움 — V2-Ride-2 로직)

**Rule 11 SQL**:
- `meetings.department` 컬럼 그대로 — schema 변경 X ✓
- `ride_employees.department` 그대로 ✓

**Rule 14 동형 패턴** — 부서 표현 일관성:
- MeetingHeaderBar 부서 input → ride_employees.department 자동완성
- AttendeeManager 부서원 자동 → 같은 source
- 사이드바 V2-Tree-1 「부서별」 그룹 → `m.department` 사용 (이미 통합)
- MentionEmployee subtitle → `e.department` 표시 (이미 통합)
- 모든 곳이 ride_employees.department + meetings.department 두 source 사용

**Rule 21**: 자기 모듈 (app/meetings/_components/* + CHANGELOG) ✓
**Rule 22**: 본 CHANGELOG (본 섹션) ✓

**별도 PR (HR/메인 세션 위임 — 본 PR 범위 외)**:
- **부서 마스터 테이블 (`ride_departments`)** 신설 — 부서 표준화, 부서장 지정, 부서 트리 등
- `ride_employees.department_id` FK 마이그
- `meetings.department_id` FK 마이그 (본 세션 협업 가능 — 후속 PR-V2-Dept-FK)

**GATE 진행 상태**:
- G3 사용자 GO 「ㄱㄱ」 + 「완성도 측면에서」 ✓
- G5 tsc PASS (본 세션 영역 0 에러)
- G6 lint:harness 새 위반 0건
- G7 Designer — 사용자 검수 (부서 input + datalist + 「자동 (N)」 버튼)
- Rule 8/11/14/21/22 모두 준수

---

### PR-MTG-V2-Tree-1 + V2-Address + organizer select hotfix (3 PR 묶음)

**사용자 명령**: 「v2-d 만 미루고 나머지 ㄱㄱ」 (V2-D 보류, 나머지 3건 일괄).

---

#### ① organizer select hotfix (MeetingHeaderBar)

V2-A 신설 시 organizer 변경 UI 누락 → 회의 생성자가 곧 organizer 로 고정되던 이슈 해결.

**변경**:
- `MeetingHeaderBar.Props` 에 `employees?: EmployeeOption[]` 추가
- 주관자 select inline — `ride_employees` 기반 + `profile_id` 있는 직원만 선택 가능
- value 형식: ride_employees.id (정상) 또는 `pid:<profileId>` (인사마스터에 없지만 DB 에 organizer_id 있는 경우)
- DB 저장: 항상 `meta.organizer_id` (profiles.id) — 외부 직원은 organizer 불가
- read-only 모드: profile_id 매칭으로 이름 표시
- `MeetingsLayoutV2` 에서 `employees={employees}` prop 전달

**Rule 8**: 사용자가 organizer 변경 → onMetaChange → blur 즉시 PATCH /api/meetings → DB organizer_id 갱신
**Rule 11**: `meetings.organizer_id` (profiles.id) — schema 그대로 ✓

---

#### ② PR-V2-Address — Daum 우편번호 popup

**라이브러리**: `react-daum-postcode` (무료, API 키 X)

**신규 컴포넌트** — `_components/AddressSearchModal.tsx`:
- dynamic import — SSR 안전
- onComplete: 도로명 우선 / 지번 fallback + 우편번호 + 건물명 자동 조합
- 결과 형식: `[12345] 서울특별시 강남구 ... (FMI빌딩)`

**MeetingHeaderBar 통합**:
- 장소 input 우측에 「🔍 주소」 버튼
- 클릭 → AddressSearchModal open → 선택 → location 자동 채움
- 자유 입력 (회의실 / Zoom URL) 도 그대로 가능

**Rule 13 호환성**: react-daum-postcode peer dependency 충돌 없음 ✓
**Rule 21**: 공통 `package.json` + `package-lock.json` 단독 commit

---

#### ③ PR-V2-Tree-1 — 사이드바 그룹화 + collapse

**범위**: 좌측 sidebar 회의 목록을 그룹별로 묶고 접기 가능. DB 변경 X (client-side grouping).

**Meeting 인터페이스 확장**: `department: string | null` 추가
**API SELECT**: `m.department` 는 V1 모듈부터 SELECT 됨 → 변경 X ✓

**그룹화 방식** (GroupBy):
- `none` — 전체 평면 (기본)
- `type` — 유형별 (📅 정기 / 📋 특정 / 👥 1:1 / 🏢 부서별) 정해진 순
- `department` — 부서별 (alphabetic)
- `organizer` — 주관자별 (alphabetic)
- `month` — 월별 (`YYYY-MM` desc)

**기능**:
- 그룹 select (sidebar 상단, 검색바와 type pill 사이)
- 그룹 헤더 클릭 → 접기 (▼ ↔ ▶)
- 그룹 항목 개수 우측 표시
- **localStorage 보존** — `meetings.sidebar.groupBy` + `meetings.sidebar.collapsedGroups` — 새로고침 / 라우트 이동 후에도 상태 유지

**Rule 8**: 사용자가 그룹 select 변경 → setGroupBy → localStorage 저장 + 회의 그룹화 + collapse 토글 가능

**별도 PR (큰 작업, 본 PR 미포함)**:
- **V2-Tree-2** — 커스텀 폴더 (사용자가 직접 만들기, drag&drop) — 신규 테이블 `meeting_folders` + `meeting.folder_id` 마이그 필요

---

**3 PR 공통 GATE**:
- G3 사용자 GO 「ㄱㄱ」 ✓
- G5 tsc PASS (본 세션 영역 0 에러)
- G6 lint:harness 새 위반 0건
- G7 Designer — 사용자 검수 (organizer select / 주소 검색 popup / sidebar 그룹 collapse)
- Rule 8/11/13/14/21/22 모두 준수

**별도 PR 보류**:
- V2-D ERP 임베드 (사용자 명시 보류)
- V2-Tree-2 커스텀 폴더 (마이그 영향 — 별도 결정)

---

### hotfix #2 — 단위 라벨 + 「← 목록」 버튼 강조 + 장소 placeholder + ride_employees graceful

**사용자 피드백** (V2-Ride-2 push 후 스크린샷 검수):
> 「저 60 숫자가 뭔지 모르겠고 / 장소는 뭐 주소검색이라도 되게 해주는게 좋고 / 참석자는 추가 누르면 라이드 직원구성이 제대로 안나오는것같은데 / 회의 작성중 목록으로 가는 기능이나 버튼이 없는것같고 / 좌측 목록에는 뭔가 트리구조로 만들던가 폴더구조로 관리할수있는게 필요하지않을까요?」

**hotfix 처리 (5건 중 4건)**:

1. **`duration_min` 단위 라벨** (`MeetingHeaderBar.tsx`):
   - 60 input 옆에 「분」 텍스트 + ⏱ 아이콘 prefix 추가
   - placeholder「60」 + title 툴팁「회의 진행 시간 (분)」
   - input width 80 → 64 (compact)
2. **「← 회의록 목록」 버튼 강조** (`MeetingsLayoutV2.tsx`):
   - 11px small → 13px medium, fontWeight 600 → 700
   - 색상: `transparent` → `GLASS.L4.background` + `${COLORS.primary}40` border
   - text: 「← 회의록 목록」 → 「← 회의록 목록으로」 (명확)
   - hover 시 background + shadow 강조
3. **장소 placeholder 명확화** (`MeetingHeaderBar.tsx`):
   - 「📍 장소」 → 「📍 회의 장소 또는 화상 링크 (예: 본사 회의실 / Zoom URL)」
   - minWidth 140 → 240 (더 길게)
   - title 툴팁 추가 — 「주소 검색은 별도 PR」
   - ※ 카카오 주소 API 통합은 별도 PR (V2-Address)
4. **ride_employees 비어있을 때 graceful** (`MeetingsLayoutV2.tsx`):
   - `loadEmployees` 결과 0건 → `employeesEmpty: true`
   - amber 배너 표시 — 「인사마스터 직원 데이터 없음 — 참석자/담당자 선택 불가」
   - 마이그 안내 + `/hr/people` 등록 요청 명시 (Rule 23)

**별도 PR (큰 작업, 본 hotfix 미포함)**:
- **V2-Tree** — 좌측 sidebar 트리/폴더 구조 (부서/유형/주관자 그룹 collapse + 커스텀 폴더)
- **V2-Address** — 장소 카카오/네이버 주소 API 통합

**Rule 8 시뮬레이션**:
- 사용자 회의 페이지 진입 → MeetingsLayoutV2 mount
- `loadEmployees` 호출 → ride_employees 마이그 미적용 시 빈 응답 → `employeesEmpty=true`
- UI 에 amber 배너 표시 (참석자 추가 시도 시 사용자가 원인 파악 가능)
- duration 「분」 단위 표시 → 「60 분」 명확
- 「← 회의록 목록으로」 더 잘 보임 (medium 크기 + primary border + hover)

**Rule 11**: DB 변경 X ✓
**Rule 21**: 자기 모듈 (MeetingHeaderBar / MeetingsLayoutV2 / CHANGELOG)
**Rule 22**: CHANGELOG 갱신

**GATE**:
- G3 사용자 피드백 ✓
- G5 tsc PASS
- G6 lint:harness — `'rgba(255,255,255,0.6)'` → `GLASS.L1.background` 토큰화 후 0건
- G7 Designer — 사용자 스크린샷 검수 (push 후)

---

### PR-MTG-V2-Ride-2 — AttendeeManager + ActionItemList ride_employees 전환

**사용자 명령**: 「V2-Ride-2 ㄱㄱ」 (V2-C-Ride 검수 후).

**범위**: 회의록 모달의 직원 select 두 곳(참석자 추가 / 액션 담당자) 도 `ride_employees` 기반으로 일관성 확보.

**전략 — Option C (DB 마이그 없이)**:
- DB 컬럼 (`meeting_attendees.profile_id` / `meeting_action_items.assignee_id`) 의미 그대로 (profiles.id 가리킴)
- UI 데이터 소스만 `ride_employees` 로 변경 (loadEmployees URL)
- 선택 시 `ride_employees.profile_id` 가 있으면 → `profile_id` 에 저장 (정상 인증 직원)
- `profile_id` 없으면 → `external_name` / `external_assignee` 로 fallback (인증 계정 없는 직원)
- **마이그 SQL 불필요** ✓

**변경**:

1. **MeetingsLayoutV2.tsx `loadEmployees`** — URL 변경:
   - `/api/finance-upload?table=profiles` → `/api/meetings/mentions/employees?limit=200`
   - 응답: ride_employees row `[{ id, name, department, position, employment_type, color_tone, group_label, profile_id }]`

2. **AttendeeManager.tsx**:
   - Employee 타입 확장 — `profile_id` / `position` / `employment_type` / `color_tone` / `group_label`
   - `rideToAttendee(e)` 헬퍼 — `profile_id` 있으면 정상 attendee / 없으면 external_name fallback
   - `isAlreadyAttending(e, attendees)` — profile_id 또는 external_name 으로 dedup
   - `add(rideId)` — `e.id` 가 ride_employees.id. profile_id/external_name 분기 후 추가
   - `autoFillDept` — 부서원 자동 채우기. 같은 분기 적용
   - select option label 확장: `이름 (부서 · 직급/그룹 · 고용형태) — 외부` (profile 없는 직원 표시)
   - 참석자 행에 외부/인증無 라벨 노출

3. **ActionItemList.tsx**:
   - Employee 타입 확장 — 같음
   - select value 형식 변경 — `pid:<profileId>` 또는 `ext:<name>` 으로 두 케이스 분기 처리
   - onChange — kind 분기 후 `assignee_id` (profiles.id) 또는 `external_assignee` (이름) 채움
   - read-only 표시 — `employees.find(e => e.profile_id === ai.assignee_id)` 매칭 또는 external_assignee
   - option label — `이름 (외부)` 표시

**Rule 8 End-to-End 시뮬레이션**:
- STEP 0: MeetingsLayoutV2 mount → loadEmployees → /api/meetings/mentions/employees → ride_employees 16명+ 가져옴
- STEP 1: 참석자 탭에서 「+ 직원 추가 (인사마스터)」 → ride 직원 선택
- STEP 2: 직원 e.profile_id 있음 → meeting_attendees.profile_id = e.profile_id 저장
- STEP 2': 직원 e.profile_id 없음 → external_name = e.name 저장 (profile_id = null)
- STEP 3: 액션 탭에서 담당자 select → 같은 분기 (assignee_id 또는 external_assignee)
- STEP 4: PATCH /api/meetings?id=... → DB 저장 (기존 의미 그대로)
- STEP 5: 다른 페이지 영향 X (loadEmployees URL 변경만)

**Rule 11**: DB 컬럼 변경 X — schema 검증 불필요 ✓
**Rule 13**: 새 라이브러리 없음 ✓
**Rule 14 동형 패턴**:
- MentionEmployee (V2-C-Ride) + AttendeeManager (V2-Ride-2) + ActionItemList (V2-Ride-2) 모두 ride_employees 일관성
- 부서 자동 채우기, 외부 직원 fallback 모두 동일 패턴

**Rule 21**: 자기 모듈 (app/meetings/_components/* 만)

**Rule 22**: 본 CHANGELOG (본 섹션) ✓

**GATE 진행 상태**:
- G3 사용자 GO 「V2-Ride-2 ㄱㄱ」 ✓
- G5 tsc PASS (본 세션 영역 0 에러)
- G6 lint:harness 새 위반 0건
- G7 Designer — 사용자 검수 (참석자 추가 / 액션 담당자 select 에 ride 직원 16명)
- Rule 8/11/13/14/21/22 모두 준수

**알려진 한계 / 후속**:
- ride 직원 중 `profile_id` 없는 사람은 external_name/external_assignee 로 저장 — DB 의미는 「외부 사람」 으로 처리됨 (인사 마스터에는 등록되어 있지만 인증 계정 없는 직원)
- 조회 / 정렬 / 통계 (예: action_count, attendee_count) 는 그대로 동작
- 후속 PR-V2-Ride-3: `/hr/people` 페이지에서 `?focus=<id>` 강조 (메인 세션 위임 — /hr 모듈 외부 영역)
- 후속 PR (조직 동기화): `ride_employees` 가 추가될 때 profiles 인증 계정 자동 매핑 정책 — 별도 결정

---

### PR-MTG-V2-C-Ride — @멘션을 ride_employees (인사마스터) 기반으로 변경

**사용자 명령**:
> 「라이드 니까 라이드 등록 직원기준으로 진행」
> 「우리 인사마스터쪽에 직원 관리가 있어요」
> 「회사별 그룹별 기준으로 어차피 회의록작성시 권한이 부여되니 문제없을듯합니다」

**문제 인식**:
- 기존 `/api/meetings/mentions/profiles` 는 `profiles` 테이블 (인증 계정) 기반
- 실제 직원 데이터는 `ride_employees` (Ride Inc. 인사 마스터, 2026-05-03 도입) → `/hr/people` 페이지에서 관리
- `profiles` 는 외부 사용자 / 미직원 계정도 포함 가능 → @멘션 결과 부정확

**변경**:

1. **신규 API** — `app/api/meetings/mentions/employees/route.ts`:
   - `SELECT id, name, department, position, employment_type, color_tone, group_label, profile_id FROM ride_employees WHERE is_active = 1`
   - 검색 컬럼 확장: `name / department / position / group_label` (사용자 「그룹별 기준」 반영)
   - 이름 prefix 우선 + `match_prio CASE`
2. **기존 API 제거** — `app/api/meetings/mentions/profiles/route.ts` 삭제 (deprecated 표시 X — 데이터 부정확이라 즉시 폐기)
3. **MentionEmployee.ts 수정**:
   - fetch URL → `/api/meetings/mentions/employees`
   - 함수명 `fetchProfiles` → `fetchEmployees`
   - subtitle 확장: `[부서, 직급 또는 그룹, 고용형태].join(' · ')` (예: `콜센터 · 매니저 · 정규`, `콜센터 · 주간 · 파트`)
   - emptyHint: "이름 / 부서 / 직책 / 그룹 검색"
4. **TiptapEditor handleClickOn** — 직원 멘션 클릭 시:
   - `/admin/employees?focus=<id>` → `/hr/people?focus=<id>` (Ride 인사 마스터 페이지로 이동)
   - focus 강조는 `/hr/people` 별도 PR (메인 세션 위임)

**Rule 11 SQL 컬럼 사전 검증**:
- `migrations/2026-05-03_ride_employees_init.sql` 직접 확인:
  - `id (CHAR 36), name, profile_id, department, position, employment_type, hire_date, resign_date, phone, email, color_tone, group_label, memo, is_active, created_at, updated_at`
  - INDEX: `(is_active, department)`, `(profile_id)`, `(name)` ✓

**Rule 14 동형 패턴 — 후속 검토 영역 (본 PR 미포함)**:
- `AttendeeManager` 의 참석자 추가 select — 현재 `profiles` 사용 (page.tsx `loadEmployees` 가 `/api/finance-upload?table=profiles`)
- `ActionItemList` 의 담당자 select — 같음
- 두 영역도 ride_employees 로 변경 권장 — but DB 컬럼 `meeting_attendees.profile_id` 와 `meeting_action_items.assignee_id` 가 profiles.id 가리키는 의미 — 마이그 영향
- **별도 PR (V2-Ride-2)** 필요 — 사용자 GO 받고 진행
- ⚠️ 현재 사용자 명시 "회의록 작성시 권한 부여" — 작성/편집 권한은 profiles (인증) 기반 유지. ride_employees 는 멘션 노출 용도 한정.

**Rule 21 분리 commit**: API 단독 + UI 단독

**Rule 22 _docs**: 본 CHANGELOG (본 섹션) ✓

**GATE 진행 상태**:
- G3 사용자 GO ✓
- G5 tsc PASS / G6 lint:harness 새 위반 0건
- G7 Designer — 사용자 검수 (`@` 입력 시 ride 직원 16명 표시 / 클릭 → /hr/people)
- Rule 8 시뮬레이션 ✓ (단순 SQL 소스 교체 + URL 변경)

**후속 (별도 PR 필요)**:
- V2-Ride-2: AttendeeManager / ActionItemList 도 ride_employees 로 전환 (사용자 GO 후)
- V2-Ride-3: `/hr/people` 페이지 ?focus=<id> 강조 (메인 세션 위임 — `/hr` 모듈 외부 영역)

---

### PR-MTG-V2-C-2/3/4 — #회의 + >ERP 멘션 + 클릭 페이지 이동 (통합)

**사용자 명령**: 「1, 3번 다해야죠」 (V2-C-1 검수 후) — V2-C-2 + V2-C-3 + V2-C-4 한 PR 묶음 진행.

**범위**:

1. **#회의 멘션 (V2-C-2)** — `MentionMeeting` extension + `/api/meetings/mentions/meetings` API
2. **>ERP 멘션 (V2-C-3)** — `MentionEntity` extension + `/api/meetings/mentions/entities` API (계약/차량/고객 mixed)
3. **클릭 페이지 이동 (V2-C-4)** — TiptapEditor `editorProps.handleClickOn` 으로 모든 멘션 클릭 처리

**신규 API**:

| 경로 | 검색 컬럼 | 정렬 |
|------|----------|------|
| `GET /api/meetings/mentions/meetings?q=&limit=` | `m.title` (prefix 우선) / `m.agenda` / `m.summary` | `match_prio ASC, meeting_date DESC` |
| `GET /api/meetings/mentions/entities?q=&limit=` | (계약) customer_name / (차량) number·brand·model / (고객) name·phone·email | type 순 (계약 → 차량 → 고객), 각 perType 분할 |

**Rule 11 SQL 사전 검증**:
- `meetings.title / agenda / summary / meeting_date / deleted_at` — V1 모듈부터 사용 중 ✓
- `contracts.customer_name` — `app/api/contracts/*` grep 확인 ✓
- `cars.number / brand / model / created_at` — `app/api/cars/*` + `card-match-diag` grep 확인 ✓
- `customers.name / phone / email / created_at` — `app/api/customers/*` grep 확인 ✓
- `sql-reserved-alias-lint`: `match_prio` 사용 (rank 예약어 회피) ✓

**신규 컴포넌트**:

- `app/meetings/_components/extensions/MentionMeeting.ts`
  - char='#' / suggestion debounce 180ms + AbortController
  - HTMLAttributes: `class: 'mention mention-meeting'` + `data-mention-type: 'meeting'`
  - icon: type 별 (📅정기 / 📋특정 / 👥1:1 / 🏢부서)

- `app/meetings/_components/extensions/MentionEntity.ts`
  - char='>' / suggestion debounce 180ms
  - `addAttributes` — `entityType` attr 추가 (contract/car/customer 구분)
  - HTMLAttributes: `class: 'mention mention-entity'` + `data-mention-type: 'entity'` + `data-entity-type`
  - icon: type 별 (📑계약 / 🚗차량 / 👤고객)

**클릭 핸들러 (V2-C-4)** — TiptapEditor `editorProps.handleClickOn`:

```ts
mentionEmployee → window.open(`/admin/employees?focus=<id>`, '_blank', 'noopener')
mentionMeeting  → window.location.href = `/meetings/<id>`
mentionEntity   → type 별 base path (/contracts | /cars | /customers) + `?focus=<id>` + 새 탭
```

**Rule 8 End-to-End 시뮬레이션** (대표 — `#매출`):
- STEP 0: 본문에 `#매출` 입력
- STEP 1: Suggestion → debounce 180ms → fetch `/api/meetings/mentions/meetings?q=매출`
- STEP 2: SQL `WHERE m.deleted_at IS NULL AND (title LIKE '매출%' OR agenda LIKE ... OR summary LIKE ...) ORDER BY match_prio ASC, ...`
- STEP 3: MentionList 표시 → 선택 → mention 노드 inline 삽입
- STEP 4: onUpdate → PATCH body
- STEP 5: 클릭 → `window.location.href = '/meetings/<id>'` 같은 탭 이동 (회의록은 그대로 이동, 다른 도메인은 새 탭)

**Rule 13 호환성**:
- `@tiptap/extension-mention@3.23.2` — V2-C-1 에서 이미 install (재사용)
- 3 extension 같은 패키지 base — peer 충돌 없음 ✓

**Rule 14 동형 패턴** — 멘션 3 종류 (직원 / 회의 / ERP) 동일 구조:
- API: `/api/meetings/mentions/{type}?q=&limit=`
- Extension: `Mention.extend({ name: 'mention{Type}' }).configure({ char, suggestion: { items, render } })`
- UI: `MentionList` 공용
- 클릭: `handleClickOn` 의 type 분기

후속 PR-V2-C-4 추가 강화 (현재 PR 외):
- hover 카드 (상세 정보 미리보기) — 별도 PR
- focus 강조 (?focus=<id> 쿼리 받아 list 페이지에서 해당 행 highlight) — 각 도메인 모듈 별도 PR

**Rule 21 분리 commit**: API 2개 단독 + UI 통합 + CHANGELOG

**Rule 22 _docs**: 본 CHANGELOG (이 섹션) ✓

**GATE 진행 상태**:
- G3 설계서 § 4.3 / § 5.2 + 사용자 GO 「1,3번 다해야죠」 ✓
- G5 tsc PASS (본 세션 영역 0 에러)
- G6 lint:harness 새 위반 0건
- G7 Designer — 사용자 스크린샷 검수 (push 후 # / > 동작 + 클릭 이동)

**알려진 한계 (후속 PR)**:
- ERP entities API 가 graceful — 한 테이블 (예: contracts) 컬럼 누락 시에도 다른 type 결과 반환 (별도 PR-V2-C-5 에서 schema 정확도 강화 검토)
- focus= 쿼리 강조는 각 list 페이지 (cars/contracts/customers/admin/employees) 가 별도 수신 처리 필요 — 본 PR 미포함

---

### PR-MTG-V2-C-1 — @직원 멘션 (패턴 확립)

**사용자 명령**: 「멘션 진행 ㄱㄱ」 (V2-B 검수 후).

**범위**: `@` + 이름/부서/직책 입력 → 자동완성 → 클릭 시 인라인 멘션 노드 삽입. 패턴 확립 후속 PR (#회의 / >ERP) 동일 구조로 진행.

**변경**:

1. **공통 deps** — `@tiptap/extension-mention@3.23.2` (peer dependency 충돌 회피 위해 minor 명시)
2. **신규 API** — `app/api/meetings/mentions/profiles/route.ts`:
   - GET `?q=&limit=10`
   - 활성 직원 (`is_active IS NULL OR is_active = 1`) 만
   - 빈 쿼리 → 이름 ASC top 10
   - 쿼리 있음 → 이름 prefix 우선 (`CASE WHEN name LIKE ? THEN 0 ELSE 1 END AS match_prio`) + 부분 매칭 (이름/부서/직책)
   - `rank` 예약어 회피 → `match_prio` (sql-reserved-alias-lint 통과)
3. **신규 컴포넌트** — `app/meetings/_components/MentionList.tsx`:
   - forwardRef + useImperativeHandle 로 onKeyDown 노출
   - ↑↓ 이동 / Enter 선택 / Esc 닫기 / mouse hover 동기화
   - 공용 — `MentionItem` 형식 (id / label / subtitle / icon) — 향후 #회의 / >ERP 도 재사용
4. **신규 extension** — `app/meetings/_components/extensions/MentionEmployee.ts`:
   - `Mention.extend({ name: 'mentionEmployee' }).configure({...})` — 동일 노드 종류로 다른 char 트리거 등록 가능 (향후 #회의 / >ERP)
   - `HTMLAttributes`: `class: 'mention mention-employee'` + `data-mention-type: 'employee'`
   - `renderText`: `@{label}`
   - `suggestion.items` — debounce 180ms (빈 쿼리는 즉시) + AbortController 로 race 회피
   - `render` — ReactRenderer + tippy.js light-border theme
5. **TiptapEditor 통합** — extensions 배열에 `MentionEmployee` 추가 + CSS 멘션 노드 스타일 (`background: ${COLORS.primary}1F` + hover `33`) + footer 안내 `@` 직원 멘션 명시

**Rule 8 End-to-End 시뮬레이션**:
- STEP 0: 본문에 `@박` 입력
- STEP 1: TipTap Suggestion → debounce 180ms → fetch `/api/meetings/mentions/profiles?q=박`
- STEP 2: API → SQL `WHERE is_active IS NULL OR is_active = 1 AND (name LIKE '박%' OR ...)` ORDER BY match_prio, name LIMIT 10
- STEP 3: MentionList 표시 (이름 prefix 우선 정렬) → 사용자 선택
- STEP 4: command 호출 → 인라인 mention 노드 삽입 → onUpdate → debounce 1.5s → PATCH body
- STEP 5: 다른 페이지 영향 X (mention 노드는 본문 안 inline)

**Rule 11 SQL 컬럼 사전 검증**:
- `profiles.id / name / department / position / is_active` — V1 module 부터 사용 중 ✓
- `sql-reserved-alias-lint`: 초기 `AS rank` → MySQL 예약어 (window function RANK()) — `AS match_prio` 로 변경 ✓

**Rule 13 호환성**:
- `@tiptap/extension-mention@3.23.2` — 다른 TipTap 패키지 (3.23.2) 와 minor 일치 (latest 3.23.4 는 peer dependency conflict)
- ProseMirror peer 충돌 없음

**Rule 14 동형 패턴 (후속 PR 위한 자리 예고)**:
- 본 PR 의 `MentionEmployee` + `MentionList` + `/api/meetings/mentions/profiles` 패턴 → PR-V2-C-2 `#회의` (`MentionMeeting` + `/api/meetings/mentions/meetings`), PR-V2-C-3 `>ERP` (`MentionEntity` + `/api/meetings/mentions/entities`) 동일 구조

**Rule 21**: 공통 `package.json` + `package-lock.json` 단독 commit / 자기 모듈 별도 commit

**Rule 22**: 본 CHANGELOG ✓

**GATE 진행 상태**:
- G3 설계서 § 4.3 + 사용자 GO 「ㄱㄱ」 ✓
- G5 tsc PASS (renderHTML 타입 충돌 → HTMLAttributes configure 로 회피)
- G6 lint:harness 새 위반 0건 (`rank` 예약어 → `match_prio` 치환 후)
- G7 Designer — 사용자 스크린샷 검수 (`@` 입력 → 메뉴 / 클릭 → 멘션 삽입)

**1차 PR (V2-C-1) 제외 (후속)**:
- PR-V2-C-2: `#` 회의 멘션 — `MentionMeeting` + `/api/meetings/mentions/meetings`
- PR-V2-C-3: `>` ERP 엔티티 멘션 — `MentionEntity` + `/api/meetings/mentions/entities` (contracts / cars / customers)
- 멘션 클릭 시 hover 카드 / 페이지 이동 — 별도 PR (V2-C-4)

---

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
