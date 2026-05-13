# 회의록 시스템 — 데이터 모델

> **작성**: 2026-05-13 (meetings 세션 신설)
> **마이그레이션**: `migrations/2026-04-30_meetings.sql` (✓ 적용 완료 2026-04-30)
> **현재 코드**: `app/meetings/page.tsx` (643줄) / `app/api/meetings/route.ts` (331줄)
> **데이터 흐름 일치성**: 4단계 검증 완료 ✓ (점검 리포트 § A)

---

## 1. 4 테이블 ERD

```
┌────────────────────────────────────────────────────────────┐
│  meetings (회의 마스터)                                       │
│  ─────────────────────────                                  │
│  id            CHAR(36) PK                                  │
│  title         VARCHAR(255)                                 │
│  type          VARCHAR(32)  ← regular|specific|one_on_one|department │
│  meeting_date  DATETIME                                     │
│  duration_min  INT                                          │
│  location      VARCHAR(255)                                 │
│  organizer_id  CHAR(36)     ← profiles.id (논리 FK, 실 FK X)│
│  department    VARCHAR(64)  ← 부서별 회의 시 부서명              │
│  status        VARCHAR(16)  ← draft|published|archived       │
│  agenda        TEXT                                         │
│  summary       TEXT                                         │
│  created_by    CHAR(36)     ← profiles.id (논리 FK)          │
│  created_at / updated_at / deleted_at                       │
└────────────────────────────────────────────────────────────┘
        │
        │ 1:N (meeting_id)
        ├─────────────────────┬─────────────────────────┐
        ▼                     ▼                         ▼
┌──────────────────┐  ┌─────────────────────┐  ┌────────────────────────┐
│ meeting_         │  │ meeting_minutes     │  │ meeting_action_items   │
│   attendees      │  │ ────────────────    │  │ ────────────────────   │
│ ────────────     │  │ id                  │  │ id                     │
│ id  PK           │  │ meeting_id  FK*     │  │ meeting_id  FK*        │
│ meeting_id  FK*  │  │ section_type        │  │ assignee_id (profiles) │
│ profile_id       │  │  agenda|decision|   │  │ external_assignee      │
│  (profiles 논리) │  │  note|attachment    │  │ content                │
│ external_name    │  │ order_no            │  │ due_date               │
│ role             │  │ title / content     │  │ status                 │
│  organizer|      │  │ attachment_url      │  │  open|done|dropped     │
│  attendee|       │  │ created_by          │  │ done_at                │
│  observer        │  │ created_at /        │  │ done_note              │
│ attendance       │  │  updated_at         │  │ created_by             │
│  present|absent| │  │                     │  │ created_at / updated_at│
│  excused         │  └─────────────────────┘  └────────────────────────┘
│ note             │
│ UNIQ (meeting_id,│
│       profile_id)│  ※ FK*: 논리적 FK — 실제 FOREIGN KEY 제약 없음
└──────────────────┘     (마이그 SQL 미적용 — collation drift 회피용 COLLATE JOIN)
```

---

## 2. 컬럼 상세

### 2.1 `meetings` (회의 마스터)

| 컬럼 | 타입 | NULL | DEFAULT | 설명 |
|------|------|------|---------|------|
| id | CHAR(36) | NO | — | UUID (PK) |
| title | VARCHAR(255) | NO | — | 회의 제목 |
| type | VARCHAR(32) | NO | 'specific' | 회의 유형 — regular/specific/one_on_one/department |
| meeting_date | DATETIME | YES | NULL | 회의 일시 |
| duration_min | INT | YES | NULL | 회의 시간(분) |
| location | VARCHAR(255) | YES | NULL | 장소 / URL |
| organizer_id | CHAR(36) | YES | NULL | profiles.id (논리 FK) |
| department | VARCHAR(64) | YES | NULL | 부서별 회의 시 부서명 |
| status | VARCHAR(16) | NO | 'draft' | draft/published/archived |
| agenda | TEXT | YES | NULL | 안건(요약) |
| summary | TEXT | YES | NULL | 회의 결과 요약 |
| created_by | CHAR(36) | YES | NULL | 작성자 profiles.id |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | |
| updated_at | DATETIME | NO | ON UPDATE | |
| deleted_at | DATETIME | YES | NULL | soft delete 마커 |

**인덱스**: `idx_m_date / idx_m_organizer / idx_m_dept / idx_m_status / idx_m_type`

### 2.2 `meeting_attendees` (참석자)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | CHAR(36) PK | UUID |
| meeting_id | CHAR(36) | meetings.id (논리 FK) |
| profile_id | CHAR(36) NULL | profiles.id — 외부인은 NULL |
| external_name | VARCHAR(64) NULL | 외부 참석자 이름 (profile_id NULL일 때) |
| role | VARCHAR(16) DEFAULT 'attendee' | organizer / attendee / observer |
| attendance | VARCHAR(16) DEFAULT 'present' | present / absent / excused |
| note | VARCHAR(255) NULL | 비고 |
| created_at | DATETIME | |

**UNIQUE**: `(meeting_id, profile_id)` — MySQL은 NULL distinct → 외부인 여러 명 중복 허용
**인덱스**: `idx_ma_meeting / idx_ma_profile`

### 2.3 `meeting_minutes` (회의록 본문 섹션)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | CHAR(36) PK | |
| meeting_id | CHAR(36) | 논리 FK |
| section_type | VARCHAR(16) DEFAULT 'note' | agenda / decision / note / attachment |
| order_no | INT DEFAULT 1 | 섹션 순서 |
| title | VARCHAR(255) NULL | |
| content | TEXT NULL | |
| attachment_url | VARCHAR(500) NULL | (현재 UI 미사용 — 향후 첨부) |
| created_by | CHAR(36) NULL | |
| created_at / updated_at | DATETIME | |

**인덱스**: `idx_mm_meeting / idx_mm_section / idx_mm_order (meeting_id, order_no)`

### 2.4 `meeting_action_items` (액션 아이템)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | CHAR(36) PK | |
| meeting_id | CHAR(36) | 논리 FK |
| assignee_id | CHAR(36) NULL | profiles.id — 외부 담당자는 NULL |
| external_assignee | VARCHAR(64) NULL | 외부 담당자 이름 |
| content | TEXT | TODO 내용 |
| due_date | DATE NULL | 마감일 |
| status | VARCHAR(16) DEFAULT 'open' | open / done / dropped |
| done_at | DATETIME NULL | 완료 시각 |
| done_note | VARCHAR(255) NULL | 완료 비고 |
| created_by | CHAR(36) NULL | |
| created_at / updated_at | DATETIME | |

**인덱스**: `idx_mai_meeting / idx_mai_assignee / idx_mai_status / idx_mai_due`

---

## 3. JOIN 패턴 (collation drift 회피)

`meetings.organizer_id` / `meeting_attendees.profile_id` / `meeting_action_items.assignee_id` 가 `profiles.id` 를 가리키지만 **collation이 다를 수 있어** API에서 명시적 `COLLATE utf8mb4_unicode_ci` 강제 적용 중:

```sql
LEFT JOIN profiles p
  ON p.id COLLATE utf8mb4_unicode_ci = m.organizer_id COLLATE utf8mb4_unicode_ci
```

→ Rule 11 (SQL 컬럼/조인 사전 검증) 통과 ✓

---

## 4. 유효 enum 값 (Rule 14 — 동형 패턴)

| 컬럼 | 값 | UI 표시 | API 키 |
|------|-----|---------|--------|
| meetings.type | regular | 📅 정기 회의 | regular_count |
| meetings.type | specific | 📋 특정 회의 | specific_count |
| meetings.type | one_on_one | 👥 1:1 면담 | one_on_one_count |
| meetings.type | department | 🏢 부서별 | department_count |
| meetings.status | draft | ✏️ 작성중 | draft_count |
| meetings.status | published | ✓ 공개 | — |
| meetings.status | archived | 📦 보관 | — |
| meeting_attendees.role | organizer | 주관 | — |
| meeting_attendees.role | attendee | 참석 | — |
| meeting_attendees.role | observer | 참관 | — |
| meeting_attendees.attendance | present | 출석 | — |
| meeting_attendees.attendance | absent | 불참 | — |
| meeting_attendees.attendance | excused | 결석 | — |
| meeting_minutes.section_type | agenda | 안건 | — |
| meeting_minutes.section_type | decision | 결정 | — |
| meeting_minutes.section_type | note | 메모 | — |
| meeting_minutes.section_type | attachment | 첨부 | — |
| meeting_action_items.status | open | 진행중 | — |
| meeting_action_items.status | done | 완료 | — |
| meeting_action_items.status | dropped | 취소 | — |

→ 모든 enum DB/API/UI 4단계 일치 ✓

---

## 5. 권한 매핑

### 5.1 권한 결정 기준 (API `route.ts` PATCH/DELETE)

```ts
canEdit  = user.role === 'admin'
        || user.role === 'master'
        || hasEditPagePerm   // user_page_permissions.can_edit WHERE page_path = '/meetings'
        || existing.organizer_id === user.id
        || existing.created_by === user.id

canDelete = user.role === 'admin'
         || user.role === 'master'
         || hasDeletePagePerm  // user_page_permissions.can_delete WHERE page_path = '/meetings'
         || existing.organizer_id === user.id
         || existing.created_by === user.id
```

### 5.2 연계 테이블 — `user_page_permissions`

본 모듈은 `user_page_permissions` 테이블을 읽는다 (페이지 단위 권한 매트릭스):

```sql
SELECT can_edit, can_delete
  FROM user_page_permissions
 WHERE user_id = ? AND page_path = '/meetings' LIMIT 1
```

→ 이 테이블은 **공통 권한 체계** — 다른 세션도 사용 중. 본 세션은 READ ONLY (Rule 21 — 변경 시 메인 세션 합의).

### 5.3 UI 권한 노출 (2026-05-13 결정)

UI에서 편집/삭제 버튼은 위 `canEdit / canDelete` 와 **동일한 조건**으로 conditional render. 1차 PR에서:

1. Meeting 인터페이스에 `created_by` 추가
2. API GET 목록 SELECT에 `m.created_by` 추가
3. `useUserPagePerms('/meetings')` 훅 (또는 기존 유틸 사용) 으로 `can_edit / can_delete` 가져옴
4. `canEditMeeting(m, user, perms)` 헬퍼로 버튼 표시 결정

---

## 6. soft delete 정책

| 테이블 | deleted_at 컬럼 | cascade |
|--------|-----------------|---------|
| meetings | ✅ | API `WHERE m.deleted_at IS NULL` 필터로 모든 SELECT 보호 |
| meeting_attendees | ❌ | — |
| meeting_minutes | ❌ | — |
| meeting_action_items | ❌ | — |

### 6.1 현재 동작

`DELETE /api/meetings?id=...` 호출 → `UPDATE meetings SET deleted_at = NOW()`. 자식 row는 그대로 남음.

GET 단건 (`?id=...`) 은 `WHERE id = ? AND deleted_at IS NULL` 로 보호 → 삭제된 회의는 표시 X. **자식 row 직접 조회 도구가 추가될 경우 위험 가능성** — 1차 PR 외 후속 PR에서 cascade soft delete 또는 helper 도입 검토.

### 6.2 잠재 이슈

- 같은 회의를 soft delete 후 같은 organizer_id + meeting_date로 재생성 → meeting_attendees UNIQUE `(meeting_id, profile_id)` 영향 없음 (meeting_id 새로 생성).
- 통계 카드는 `WHERE deleted_at IS NULL` 필터 적용 ✓.

---

## 7. 알려진 잠재 회귀 케이스 (Rule 11 — 끝까지 따라간 결과)

| # | 시나리오 | 영향 | 대응 |
|---|---------|------|------|
| 1 | UI 편집/삭제 버튼이 권한 없는 사용자에게 노출 → 클릭 시 403 | UX 혼란 | **1차 PR 포함** (§ 5.3) |
| 2 | 전체 직원이 모든 회의 조회 가능 (조회 권한 필터 없음) | 정보 노출 정책 미정 | **별도 PR** (운영 사실 확인 후) |
| 3 | soft delete 시 자식 row 잔존 | 미래 도구 추가 시 위험 | **별도 PR** (cascade helper) |
| 4 | organizer 변경 시 attendees `role='organizer'` 미동기화 | 데이터 일관성 | **별도 PR** |
| 5 | 외부 참석자 부서 회의 권한 판정 모호 | 운영 정책 미정 | **별도 PR** (운영 사실 확인 후) |
| 6 | 액션 status 변경 시 assignee 본인 검증 X (organizer가 임의 변경 가능) | 운영 정책 차이 | **별도 PR** |
| 7 | meeting_attendees UNIQUE (meeting_id, profile_id) — NULL 다수 OK | 외부인 중복 가능 | 의도된 동작으로 추정 (운영 확인) |

---

## 8. 데이터 흐름 4단계 검증 (점검 리포트 § A 발췌)

| 흐름 | DB 컬럼 | SQL SELECT | API 응답 키 | UI 표시 |
|------|---------|-----------|------------|---------|
| 통계 | type / status | SUM(CASE WHEN type=...) AS *_count | stats.*_count | DcStatStrip(예정) value |
| 목록 | meetings.* + JOIN profiles.name | m.id, m.title, ..., p.name AS organizer_name | data[i].organizer_name | NeuDataTable(예정) 컬럼 |
| 단건 | meetings / meeting_attendees / meeting_minutes / meeting_action_items | SELECT * + 3 JOIN | data.meeting / attendees / minutes / action_items | MeetingEditor 4 섹션 |
| 참석자 | meeting_attendees + profiles | a.*, p.name AS profile_name, p.department AS profile_department | attendees[i].profile_name / profile_department | Editor 참석자 row |

→ 4단계 모두 일치 ✓ (현재 운영 코드는 데이터 흐름이 깨끗함. 디자인 표준만 미준수.)

---

## 9. 1차 리뉴얼 PR에서 추가될 데이터 흐름 (예고)

| 흐름 | 추가 컬럼 / 키 |
|------|---------------|
| 목록 SELECT에 `m.created_by` 추가 | API: data[i].created_by / UI Meeting 인터페이스: created_by |
| `user_page_permissions` 조회 (페이지 진입 시 1회) | UI 훅: { can_edit, can_delete } |
| 액션 진행률 % (action_count > 0일 때 (action_count - open_action_count) / action_count) | UI 표시 (DcStatStrip 6번째 카드 후보) |

→ 모든 추가는 Rule 8 시뮬레이션 보고 후 진행.

---

## 10. 변경 이력

| 날짜 | 변경 | 작성자 |
|------|------|--------|
| 2026-04-30 | 4 테이블 마이그 적용 | (메인 세션) |
| 2026-05-13 | 본 문서 1차 초안 — ERD + 컬럼 + 권한 + 잠재 회귀 7건 | meetings 세션 |

본 문서는 마이그 / 컬럼 변경 / 운영 정책 결정 시 갱신.
