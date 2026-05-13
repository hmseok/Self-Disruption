# 회의록 시스템 — 페르소나 & 시나리오

> **작성**: 2026-05-13 (meetings 세션 신설 — 첫 셋업)
> **모듈**: `app/meetings/*`, `app/api/meetings/*`
> **사용자 명령 (2026-05-13 인터뷰)**:
>   - 주 페르소나: **회의록 작성자(organizer) + admin 혼합 1순위**
>   - 권한 UI: 권한 있는 사람에게만 편집/삭제 버튼 노출
>   - 첫 작업: **디자인 표준 리뉴얼 우선** (PageTitle / DcStatStrip / DcToolbar / NeuDataTable)
>   - Rule 11 회고 (회의록 4차례 hotfix): 특정 한 곳 지목 X → 모든 변경에 Rule 8 End-to-End 시뮬레이션 강제

---

## 0. 본 문서의 위치

| 문서 | 역할 |
|------|------|
| **본 문서 (`MEETINGS-PERSONAS.md`)** | 누가 / 어떤 시나리오로 쓰는가 |
| `MEETINGS-DATA-MODEL.md` | 어떤 테이블 / 컬럼 / 권한 매핑 |
| `UI-DESIGN-STANDARD.md` | 디자인 의무 컴포넌트 (DcStatStrip / DcToolbar / NeuDataTable) |
| `SESSIONS-COORDINATION.md` § 1.1 | meetings 모듈 책임 세션 등록 (✓ 2026-05-11) |
| `CLAUDE.md` Rule 11 | 본 모듈 과거 사고 — 「회의록 4차례 hotfix」 회고 |

Rule 7: 본 문서 + 데이터 모델 + 점검 리포트 → 사용자 GO → 리뉴얼/신기능 코드 진입.

---

## 1. 주 페르소나 (1순위 — 혼합)

### 1.1 회의록 작성자 (organizer) — A

> 회의를 주관하고 안건 / 결정 / 액션 아이템을 입력하는 사람.
> 실장 / 팀장 / 부서장 직급. 회의 직후 또는 다음 날 작성.

| 항목 | 내용 |
|------|------|
| **빈도** | 주 1-3회 (정기 / 특정 / 부서별 회의 주관) |
| **주요 도구** | 회의 등록 모달 — 기본정보 + 참석자 + 본문(안건/결정/메모) + 액션 아이템 |
| **기대 흐름** | 회의 직후 등록 → draft 저장 → 검토 후 published 전환 |
| **불편 사항** | 부서원 자동 채우기 / 안건 → 결정 → 액션 흐름이 매끄러워야 함 |
| **권한** | 본인 주관 회의 자유 편집 / 삭제, 타인 회의는 조회만 (admin 위임 시 편집 가능) |

### 1.2 admin (전사 모니터링) — B

> 전 부서 회의 + 액션 아이템 진행률 + 미진행 추적.
> 운영팀 / 경영지원 직급. 주간 리뷰 / 월간 리포트 용도.

| 항목 | 내용 |
|------|------|
| **빈도** | 매일 진입 — 신규 회의 / 미진행 액션 확인 |
| **주요 도구** | 부서별 그룹 + 상태 필터 + 미진행 액션 정렬 |
| **기대 흐름** | 전체 목록 → 부서/유형 필터 → 미진행 액션 많은 회의 우선 확인 |
| **불편 사항** | 누가 어떤 액션을 안 끝냈는지 한눈에 보여야 함 |
| **권한** | 모든 회의 조회 / 편집 / 삭제 (`role=admin\|master` 또는 `user_page_permissions.can_edit`) |

→ **A + B를 동등 비중으로 설계**한다. UI는 한 페이지에 두 페르소나가 자연스럽게 흐르도록.

---

## 2. 보조 페르소나 (2순위)

### 2.1 일반 참석자 — C

> 회의에 호출되어 참석하고 액션 아이템을 할당받는 사람.
> 일반 직원.

| 항목 | 내용 |
|------|------|
| **빈도** | 주 0-5회 (회의 참석 빈도에 따라) |
| **주요 도구** | 내 회의만 필터 + 내 액션 아이템 진행 처리 |
| **기대 흐름** | `/meetings?mine=true` → 내가 참석한 회의 → 내 액션 아이템 status 변경 |
| **권한** | 본인 참석 회의 조회만. 편집 X (organizer가 위임 시 예외) |

> 향후 PR — 「내 액션 아이템」 전용 위젯 (대시보드 카드)으로 분리 검토.

---

## 3. 페르소나별 시나리오 (워크-스루)

### 3.1 시나리오 A1 — organizer 정기 회의 등록

```
1. /meetings 진입 → 「+ 회의 등록」 클릭
2. 모달:
   · 제목: 「2026년 5월 정기 본부장 회의」
   · 유형: 📅 정기 회의 (regular)
   · 일시: 2026-05-15 14:00, 60분
   · 주관자: 본인 (auto user.id)
   · 부서: 비움 (전사)
   · 상태: draft
3. 참석자 — 직원 검색 → 본부장 5명 추가, role=attendee
4. 본문:
   · [안건] 5월 매출 현황 검토
   · [결정] 6월 예산 5% 증액 승인
   · [메모] 차주 부서장 회의에서 세부 배정
5. 액션 아이템:
   · 「6월 예산 분배안 작성」 — 담당: 경영지원 팀장, due: 2026-05-20
6. 저장 → status='draft' 로 저장 (검토 후 published 수동 전환)
```

### 3.2 시나리오 A2 — organizer 부서 회의 + 부서원 자동

```
1. /meetings → 「+ 회의 등록」
2. 유형: 🏢 부서별 회의 (department)
3. 부서: 「영업본부」 선택
4. 「부서원 자동」 버튼 노출 (현재 page.tsx line 444) → 클릭
   → meeting_attendees 자동 채워짐 (영업본부 전원, role=attendee, attendance=present)
5. 본문 + 액션 입력 → 저장
```

**잠재 회귀 — 끝까지 따라가야 함 (Rule 11)**:
- ⚠️ 부서 회의지만 외부인(NULL profile) 1명 추가 → DB 컬럼 `external_name`만 있고 부서는 알 수 없음. 부서 회의 권한 검증 시 외부인은 통과? 차단? **설계 결정 필요**.
- ⚠️ 부서원 자동 후 organizer가 임의로 다른 부서원 추가 → 가능 (UI 제한 없음). 의도된 동작? **운영 사실 확인 필요**.

### 3.3 시나리오 B1 — admin 일일 모니터링

```
1. /meetings 진입 (대시보드 메인)
2. 통계 카드 한눈에:
   · 전체 / 정기 / 특정 / 1:1 / 부서별 / 작성중(draft)
   · ※ 추가 제안 — 「미진행 액션 합계」 카드 (DcStatStrip 5번째 자리)
3. 그룹: 부서별 → 각 부서 회의 묶음
4. 필터: 상태=draft → 미공개 회의 검토
5. NeuDataTable 정렬: 「미진행 액션 수」 DESC → 액션 많이 밀린 회의부터
6. 각 회의 클릭 → 모달에서 결정/액션 확인
```

**잠재 회귀**:
- 현재 grid 카드 형태라 정렬 불가 (Rule 18 위반). NeuDataTable 도입 시 sortBy 컬럼 필수.
- admin이 타인 회의 편집 시 — API는 통과(권한 있음), UI 버튼이 노출되어야 함 (현재 모든 사용자에게 노출 → 권한 있는 사람에게만 노출로 정정).

### 3.4 시나리오 C1 — 참석자 본인 회의만

```
1. /meetings 진입 → 「내 회의만」 체크
   → API: ?mine=true
   → SQL: `m.organizer_id = user.id OR m.id IN (SELECT meeting_id FROM meeting_attendees WHERE profile_id = user.id)`
2. 본인 참석/주관 회의만 표시
3. 액션 아이템 진행 처리 (status: open → done)
```

**잠재 회귀**:
- 액션 아이템 status 변경은 현재 모달 내에서만 가능. 단순 체크박스(인라인) 위젯 검토 (별도 PR).
- 본인 액션이 아닌데 본인이 status 바꿀 수 있음 — API에서 assignee 체크 추가 검토 (별도 PR).

---

## 4. 권한 매트릭스

| 동작 | 일반 직원 | organizer (본인 주관) | created_by (본인 작성) | user_page_permissions.can_edit | admin/master |
|------|----------|---------------------|----------------------|-------------------------------|--------------|
| 회의 생성 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 회의 조회 (전체 목록) | ⚠️ 현재 모두 가능 | ✅ | ✅ | ✅ | ✅ |
| 회의 단건 상세 | ⚠️ 현재 모두 가능 | ✅ | ✅ | ✅ | ✅ |
| 회의 편집 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 회의 삭제 (soft) | ❌ | ✅ | ✅ | ⚠️ can_delete 별도 | ✅ |
| 액션 아이템 status 변경 | ⚠️ 현재 모두 가능 | ✅ | ✅ | ✅ | ✅ |

### 4.1 권한 UI 노출 정책 (2026-05-13 사용자 결정)

> **「권한 있는 사람에게만 편집/삭제 버튼 노출」**

UI에서 다음 함수로 체크 후 버튼 conditional render:

```ts
function canEditMeeting(meeting: Meeting, user: User, pagePerms: PagePerms): boolean {
  return user.role === 'admin'
      || user.role === 'master'
      || pagePerms.can_edit
      || meeting.organizer_id === user.id
      || meeting.created_by === user.id   // ← 현재 API에는 있지만 UI Meeting 인터페이스에 created_by 없음 → 추가 필요
}
```

⚠️ **현재 UI Meeting 인터페이스에 `created_by` 컬럼 없음** (page.tsx line 25-32). API GET 목록 SELECT에도 없음. → 리뉴얼 PR에서 추가.

### 4.2 조회 권한 범위 (별도 논의 필요)

DATA-MODEL의 원안:
> 조회: 참석자 + 같은 부서원(부서회의) + admin

**현재 구현**: 모든 인증 사용자가 전체 회의 조회 가능 (API GET에 조회 필터 없음).

→ 운영 사실 확인 필요: 「전체 직원이 다른 부서 회의 안건/결정을 봐도 되는가?」
- 옵션 1: 현재대로 (전사 투명성)
- 옵션 2: 참석자 + 같은 부서원 + admin만 (원안)
- 옵션 3: status='published' 면 전사 공개, 'draft'면 참석자만

**본 1차 PR에서는 현재 동작 유지**. 별도 후속 PR에서 정책 결정 후 적용.

---

## 5. 동형 패턴 (Rule 14 — type 4종 일관성)

| 흐름 | regular | specific | one_on_one | department |
|------|---------|----------|-----------|------------|
| 등록 모달 동작 | 동일 | 동일 | 동일 | + 부서원 자동 버튼 |
| 통계 카드 표시 | 정기 카드 | 특정 카드 | 1:1 카드 | 부서별 카드 |
| 필터 버튼 | 📅 정기 | 📋 특정 | 👥 1:1 | 🏢 부서별 |
| API SUM(CASE) | regular_count | specific_count | one_on_one_count | department_count |
| DB type 컬럼값 | 'regular' | 'specific' | 'one_on_one' | 'department' |

→ 모든 흐름 4단계 일치 (검증 완료 — 점검 리포트 § A).

---

## 6. Rule 8 End-to-End 시뮬레이션 의무 (4 hotfix 회피)

Rule 11 회고: 「회의록 4차례 hotfix — 데이터 흐름 끝까지 안 따라감」.
사용자 인터뷰 결과 특정 단계 지목 X → **모든 변경에 끝점 검증 의무**.

### 6.1 변경 전 의무 시뮬레이션 (코드 작성 전 보고)

```
[STEP 0] 실제 데이터 샘플 1건 (어떤 회의 / 어떤 액션)
[STEP 1] 입력 → API 요청 body
[STEP 2] API → SQL (INSERT/UPDATE/DELETE 어느 테이블 어느 컬럼)
[STEP 3] DB 상태 변화 (deleted_at / status / 자식 row 영향)
[STEP 4] 표출 SQL (SELECT 어느 컬럼) → API 응답 → UI 표시
[STEP 5] 영향 다른 도구 (예: 액션 status 변경 → 통계 카드 / 진행률 / 알림)
```

### 6.2 본 모듈 안전장치 (1차 리뉴얼 PR에 포함)

- 모든 신규 SQL 쿼리는 `migrations/2026-04-30_meetings.sql` 컬럼명 직접 확인 후 작성
- 새 API 경로 신설 X (1차 PR — `/api/meetings` 기존 단일 라우트 유지)
- UI 컬럼 추가 시 (`created_by` 등) API SELECT + Meeting 인터페이스 + UI 표시 4단계 동시 수정

---

## 7. 첫 작업 계획 — 디자인 표준 리뉴얼 (1차 PR)

> 사용자 GO 받은 후 진입. 본 문서 + DATA-MODEL 사용자 승인이 GO 조건.

### 7.1 범위 (1차 PR)

| 영역 | 변경 | 표준 / Rule |
|------|------|-------------|
| 헤더 | 자체 RGY 도트 + 「RIDE INC > 회의록」 + `<h1>` 제거 | PageTitle 자동 (PATH_TO_GROUP에 `/meetings` 등록) |
| 통계 카드 | 자체 div 6 카드 → DcStatStrip 5 카드 | UI-DESIGN-STANDARD § 2 |
| 검색 + 필터 + 액션 | 자체 input/button/select → DcToolbar | § 3 |
| 목록 | 자체 grid 카드 → NeuDataTable + sortBy 컬럼 | § 1.5 / Rule 18 |
| 권한 UI | 편집/삭제 버튼 conditional (`canEditMeeting`) | 사용자 결정 (§ 4.1) |
| 결과 메시지 | `confirm` + `alert` → 글래스 패널 | Rule 20 |

### 7.2 1차 PR에서 제외 (별도 후속 PR)

- 조회 권한 범위 변경 (§ 4.2)
- 액션 아이템 인라인 status 토글
- 외부인 부서 회의 권한 정책
- soft delete cascade (자식 테이블 `deleted_at` 추가)
- organizer 변경 시 attendees role 자동 동기화

### 7.3 GATE 체크리스트 (Rule 27)

```
- G3 설계서 (본 문서 + DATA-MODEL) + 사용자 GO
- G5 tsc PASS / page.tsx + route.ts 빌드 PASS
- G6 lint:harness — 신규 위반 0건
- G7 Designer 검수 — 기준 페이지(/finance/settlement) 비교 스크린샷
- G8 evaluate.js 8.x/10
- Rule 22 _docs 갱신 (본 문서 + DATA-MODEL CHANGELOG)
- Rule 8 End-to-End 시뮬레이션 보고 (각 변경)
- Rule 11 컬럼/API 사전 검증 보고
```

---

## 8. 변경 이력

| 날짜 | 변경 | 작성자 |
|------|------|--------|
| 2026-05-13 | 1차 초안 — 페르소나 A/B/C + 시나리오 4종 + 권한 매트릭스 + 1차 PR 범위 | meetings 세션 |

본 문서는 페르소나 추가 발견 / 시나리오 변경 시 갱신.
