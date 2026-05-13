# 회의록 V2 에디터 설계 — 노션 업그레이드 버전

> **작성**: 2026-05-13 (meetings 세션, 사용자 인터뷰 직후)
> **사용자 명령**: 「회의록처럼 화면이 열리고 본문을 넓게 작성하는 페이지 — 노션의 업그레이드 버전을 만들고 싶다」
> **트리거**: Rule 1 풀 파이프라인 (새 라우트 / 새 UI 패턴 / 새 라이브러리 / 데이터 모델 영향 / 새 API)
> **참조**: `MEETINGS-PERSONAS.md` (페르소나 + 시나리오) / `MEETINGS-DATA-MODEL.md` (현재 4 테이블)

---

## 0. 인터뷰 결과 (2026-05-13)

| 결정 | 값 | 근거 |
|------|-----|------|
| 핵심 가치 | 블록 + 슬래시 + 멘션 + ERP 임베드 + 협업 (4 다 선택) | 노션 전 기능 + ERP 통합 |
| 데이터 모델 | C. Hybrid — 기존 구조 유지 + `meetings.body JSON` 신설 | 안전 마이그 1회 + 기존 데이터 보존 |
| 라우팅 | R2. Split view (sidebar 목록 + 풀스크린 본문) | 노션 UX 그대로 |
| 에디터 라이브러리 | TipTap + 자체 UI | 무한 커스텀 + 자체 슬래시/멘션/임베드 빌드 |

---

## 1. 라이브러리 — TipTap 도입 근거 + 영향

### 1.1 npm 의존성 (package.json — 공통 파일, Rule 21 사용자 GO 의무)

| 패키지 | 용도 | 버전 (예상) |
|--------|------|-------------|
| `@tiptap/react` | React 통합 | ^2.x |
| `@tiptap/starter-kit` | 기본 노드 (paragraph/heading/bold/italic/list/code/etc.) | ^2.x |
| `@tiptap/extension-placeholder` | 빈 블록 placeholder | ^2.x |
| `@tiptap/extension-task-list` + `@tiptap/extension-task-item` | 체크리스트 | ^2.x |
| `@tiptap/extension-mention` | @멘션 (PR-V2-C에서) | ^2.x |
| `@tiptap/extension-link` | 링크 | ^2.x |
| `@tiptap/extension-image` | 이미지 | ^2.x |
| `@tiptap/extension-table` 외 3종 | 표 | ^2.x |
| `@tiptap/suggestion` | 슬래시 명령 (PR-V2-B에서) | ^2.x |
| `@tiptap/pm` | ProseMirror peer dep | ^2.x |
| `tippy.js` | 슬래시/멘션 popper | ^6.x |

협업(PR-V2-E)는 별도:
- `@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-cursor`
- `y-prosemirror` + `yjs`
- 서버: Hocuspocus 또는 자체 WebSocket (큰 인프라 결정 — 별도 합의)

### 1.2 번들 사이즈 영향

- StarterKit + 기본 extensions: ~150KB gzip
- 슬래시/멘션 추가 시: +30KB
- ERP 임베드 노드 추가 시: +수 KB (자체 구현)
- 협업 (yjs): +80KB

→ `/meetings/[id]` 풀페이지에서만 dynamic import 권장 (목록 페이지엔 미로드).

---

## 2. 데이터 모델 변경 (C. Hybrid)

### 2.1 마이그레이션 (`migrations/2026-05-13_meetings_v2.sql`)

```sql
-- 회의록 V2 에디터 본문 컬럼 추가
-- body: TipTap JSON (ProseMirror 형식) — 노션 같은 블록 트리

ALTER TABLE meetings
  ADD COLUMN body JSON NULL COMMENT 'TipTap JSON 본문 (V2 — Hybrid)',
  ADD COLUMN body_version INT NOT NULL DEFAULT 1 COMMENT '낙관적 락 / 버전 추적',
  ADD COLUMN body_updated_at DATETIME NULL COMMENT '본문 마지막 변경 시각',
  ADD COLUMN body_updated_by CHAR(36) NULL COMMENT '본문 마지막 변경자';

CREATE INDEX idx_m_body_updated ON meetings (body_updated_at);

-- 검증
-- SELECT id, title, JSON_VALID(body) AS body_ok, body_version FROM meetings LIMIT 5;
```

### 2.2 기존 구조와의 관계

| 컬럼 / 테이블 | V1 (기존) | V2 (신설) | V2에서의 역할 |
|--------------|----------|-----------|---------------|
| `meetings.agenda` (TEXT) | 안건 요약 | 유지 | 빠른 미리보기 / 요약 |
| `meetings.summary` (TEXT) | 회의 결과 요약 | 유지 | 목록 카드용 한 줄 |
| `meeting_minutes` 테이블 | 섹션(안건/결정/메모/첨부) | 유지 (read-only legacy) | V1 데이터 호환 |
| `meetings.body` JSON | — | **신설** | V2 자유 본문 (블록 트리) |
| `meeting_attendees` | 참석자 | 유지 | 멘션 후보 데이터 |
| `meeting_action_items` | 액션 아이템 | 유지 | 본문에서 인라인 임베드 / 별도 영역 모두 |

### 2.3 V1 → V2 데이터 흐름

- **신규 회의** (PR-V2-A 이후): `body` 채워짐, `agenda` / `summary` 는 본문 첫 줄 / 자동 추출
- **기존 회의** (마이그 적용 직후): `body = NULL` — 모달 진입 시 V1 섹션 표시, 「V2 본문으로 전환」 옵션 제공
- **마이그 도구 (선택)**: `meeting_minutes` 섹션을 V2 블록으로 자동 변환하는 백필 (별도 PR-V2-F)

---

## 3. 페이지 라우팅 + 컴포넌트 구조 (R2. Split view)

### 3.1 새 라우트

```
/meetings                         ← 기존 (목록 페이지, PR-MTG-1 완료)
                                      그대로 유지, 클릭 시 /meetings/[id] 로 이동
/meetings/new                     ← 신규 (PR-V2-A에서 신설)
                                      Split view + 새 회의 + 본문 비어있음
/meetings/[id]                    ← 신규 (PR-V2-A에서 신설)
                                      Split view + 회의 본문 + 자동 저장
```

### 3.2 Split view 컴포넌트 트리

```
<MeetingsLayoutV2>                ← /meetings/new + /meetings/[id] 공용
  <Sidebar collapsible>           ← 좌측 320px (접기 가능, 모바일은 dropdown)
    <SearchBar />                 ← DcToolbar 압축 버전
    <FilterPills />               ← type 4종
    <MeetingList compact>         ← 카드형 미니 리스트
      ... 클릭 시 router.push(/meetings/[id])
  </Sidebar>
  <main flex-1>                   ← 우측 본문 영역
    <MeetingHeader>               ← 제목 (inline edit) + meta (일시/주관자/상태)
      <MeetingMetaBar />          ← 유형/일시/장소/주관자 inline edit
    </MeetingHeader>
    <Tabs>
      <Tab "📝 본문">
        <TiptapEditor />          ← 핵심 — 풀 본문 (PR-V2-A에서 StarterKit, B에서 확장)
      </Tab>
      <Tab "👥 참석자 N">
        <AttendeeManager />       ← 기존 모달 안 컴포넌트 분리
      </Tab>
      <Tab "✓ 액션 아이템 M">
        <ActionItemList inline />  ← 인라인 체크/완료
      </Tab>
      <Tab "📎 V1 섹션 (legacy)">
        <V1MinutesReadonly />     ← body=NULL인 회의만 표시
      </Tab>
    </Tabs>
    <AutoSaveIndicator />          ← 우상단 「✓ 저장됨 · 3초 전」 / 「저장 중...」
  </main>
</MeetingsLayoutV2>
```

### 3.3 자동 저장 전략

- **본문**: TipTap onUpdate → debounce 1.5초 → PATCH `/api/meetings/[id]` `{ body: editor.getJSON() }`
- **메타** (제목/일시/유형 등): blur 또는 enter 시 즉시 PATCH
- **참석자/액션**: 변경 즉시 PATCH (낙관적 UI)
- **낙관적 락**: `body_version` 비교 — 다른 세션에서 변경 감지 시 conflict UI (PR-V2-E 협업과 별개)

---

## 4. 본문 블록 종류 (PR-V2-A 기본 + PR-V2-B 확장)

### 4.1 PR-V2-A — StarterKit + 기본 toolbar

| 블록 | 단축키 | 슬래시 |
|------|--------|--------|
| 단락 | — | — |
| 제목 H1/H2/H3 | Ctrl+Alt+1~3 | `/h1` |
| 굵게/기울임/취소선/코드 | Ctrl+B/I/Shift+X/E | — |
| 불릿 목록 | Ctrl+Shift+8 | `/ul` |
| 번호 목록 | Ctrl+Shift+7 | `/ol` |
| 체크리스트 | — | `/todo` |
| 인용구 | Ctrl+Shift+B | `/quote` |
| 코드 블록 | Ctrl+Alt+C | `/code` |
| 구분선 | — | `/hr` |

### 4.2 PR-V2-B — 슬래시 명령 메뉴

- `/` 입력 → tippy.js popper 메뉴 → 화살표/검색
- 카테고리: 기본 블록 / 미디어 / 임베드 / ERP

### 4.3 PR-V2-C — @멘션

| 트리거 | 후보 데이터 | 클릭 시 |
|--------|-------------|---------|
| `@` + 이름 | profiles (직원) | `/admin/employees/[id]` 또는 hover 카드 |
| `#` + 키워드 | meetings (다른 회의록) | `/meetings/[id]` 이동 |
| `>` + 키워드 | contracts / cars / customers (ERP 엔티티) | 각 도메인 페이지 |

### 4.4 PR-V2-D — ERP 데이터 인라인 임베드

| 블록 노드 | 데이터 | 표시 |
|----------|--------|------|
| `<meeting-action-embed>` | 본 회의의 액션 아이템 | 인라인 체크리스트 + status 색상 |
| `<contract-card>` | 계약 1건 요약 | 계약명/고객/금액/상태 |
| `<vehicle-card>` | 차량 1건 요약 | 차량번호/모델/상태 |
| `<sales-chart>` | 기간별 매출 표 | 작은 표 / 합계 |
| `<settlement-summary>` | 정산 회기 요약 | 매출/지출/이익 한 줄 |

→ 모두 TipTap Node Extension으로 자체 구현. SSR 안전한 read-only 노드.

### 4.5 PR-V2-E — 협업 (별도 큰 인프라 결정)

- yjs CRDT + Hocuspocus 서버 (Node WebSocket)
- 또는 자체 WebSocket + 단순 last-write-wins (저비용 대안)
- Cloud Run 의 WebSocket 지원 확인 필요 (limited — 별도 검토)
- 댓글: 블록 ID + comments 테이블 신설
- 주석: 텍스트 selection range + comments 테이블 동일

**PR-V2-E는 사용자 명시 GO + 인프라 합의 후에만 진입**. 우선 PR-V2-A~D 완료 후 검토.

---

## 5. API 확장

### 5.1 PR-V2-A에서 추가

| 경로 | 메서드 | 동작 |
|------|--------|------|
| `/api/meetings/[id]/body` | GET | body JSON 단독 조회 (페이지 첫 로드용) |
| `/api/meetings/[id]/body` | PATCH | body 자동 저장 — `{ body, body_version }` 낙관적 락 |
| `/api/meetings` (기존 GET 목록) | — | `body_updated_at` 응답 추가 (sidebar 정렬용) |

### 5.2 PR-V2-C 멘션 후보 검색

| 경로 | 메서드 | 동작 |
|------|--------|------|
| `/api/meetings/mentions/profiles` | GET ?q= | 직원 검색 (이름/부서) — top 10 |
| `/api/meetings/mentions/meetings` | GET ?q= | 회의 검색 (제목) — top 10 |
| `/api/meetings/mentions/contracts` | GET ?q= | 계약 검색 — top 10 (가능 시) |

### 5.3 PR-V2-D ERP 임베드 데이터

각 임베드 노드가 자체 API로 fetch. 본문 저장 시 노드 attrs에 entity id 저장만 (실제 데이터는 렌더 시 fresh fetch).

---

## 6. PR 분할 계획 (5단계)

| PR | 범위 | 의존 | 우선순위 |
|----|------|------|---------|
| **V2-A** | 기반 — 마이그 + 라우트 신설 + Split view + TipTap StarterKit + 자동 저장 | (없음) | 즉시 |
| **V2-B** | 슬래시 명령 + 기본 블록 확장 (체크리스트/표/이미지/링크/인용) | A | A 완료 후 |
| **V2-C** | @멘션 (직원/회의/계약) | B | B 완료 후 |
| **V2-D** | ERP 인라인 임베드 (액션/계약/차량/매출 표) | B | B 완료 후 |
| **V2-E** | 협업 (yjs + 서버 + 댓글) | C, D | **별도 인프라 합의 필요** |

각 PR은 별도 사용자 GO 받고 진입. 각각 자체 GATE 체크리스트 + Rule 8 시뮬레이션.

---

## 7. PR-V2-A 상세 (즉시 진입 대상)

### 7.1 범위

1. **마이그**: `migrations/2026-05-13_meetings_v2.sql` — `body` / `body_version` / `body_updated_at` / `body_updated_by` 컬럼 추가
2. **API**:
   - `app/api/meetings/[id]/body/route.ts` — GET / PATCH (자동 저장)
   - 기존 `app/api/meetings/route.ts` GET 목록 SELECT 에 `body_updated_at` 추가
3. **라우트 신설**:
   - `app/meetings/new/page.tsx` — `/meetings/new`
   - `app/meetings/[id]/page.tsx` — `/meetings/[id]`
4. **공용 컴포넌트** (`app/meetings/_components/`):
   - `MeetingsLayoutV2.tsx` — Split view + Sidebar + main
   - `MeetingSidebar.tsx` — 좌측 컴팩트 목록 (DcToolbar 압축)
   - `MeetingHeaderBar.tsx` — 제목 inline edit + meta
   - `TiptapEditor.tsx` — TipTap React + StarterKit + Placeholder + 기본 toolbar
   - `AutoSaveIndicator.tsx` — 「✓ 저장됨」 인디케이터
   - `AttendeeManager.tsx` — 기존 모달 안 분리 (재사용)
   - `ActionItemList.tsx` — 인라인 체크 토글 (액션 status open/done)
5. **PageTitle 등록** (공통 — 분리 commit):
   - `/meetings/new`, `/meetings/[id]` → group: 'work', name: '회의록' (목록과 동일 label, breadcrumb은 자동)
6. **목록 페이지 통합**:
   - `/meetings` (PR-MTG-1) 의 모달 → 「상세 페이지로 이동」 버튼으로 교체
   - 기존 모달은 일정 기간 fallback 유지 (body=NULL 회의만 V1 모달 자동)

### 7.2 Rule 8 End-to-End 시뮬레이션

```
[STEP 0] 실제 사용자 흐름
   - 사용자가 /meetings/new 진입 → 제목 입력 → 본문 타이핑 → 자동 저장 → 목록으로

[STEP 1] 입력 → 클라이언트 상태
   - title: '5월 정기회의', body: { type: 'doc', content: [{ type: 'paragraph', ... }] }
   - debounce 1.5초 후 PATCH /api/meetings/[id]/body

[STEP 2] API → SQL
   - PATCH: UPDATE meetings SET body = ?, body_version = body_version + 1, body_updated_at = NOW(), body_updated_by = ? WHERE id = ? AND body_version = ?
   - 낙관적 락: WHERE body_version = ? 만족 시 update, 안 되면 conflict 반환

[STEP 3] DB
   - meetings.body JSON 저장 (MySQL 8.x JSON 컬럼 — 화이트리스트 ✓ Rule 13)
   - body_version 1 증가
   - body_updated_at 갱신

[STEP 4] UI
   - 응답 받으면 AutoSaveIndicator 「✓ 저장됨 · 방금」
   - 사이드바 목록의 해당 회의 highlight + body_updated_at 갱신

[STEP 5] 영향 다른 도구
   - 기존 모달 → body=NULL 회의 한정 fallback (영향 X)
   - V1 meeting_minutes 데이터 → 「📎 V1 섹션」 탭에서 read-only 표시
   - 통계 카드 / 필터 / 검색 → 영향 X (제목 / 안건 / 요약 검색은 그대로)
```

### 7.3 Rule 11 SQL 사전 검증

- `meetings.body / body_version / body_updated_at / body_updated_by` — **본 PR 마이그에서 신설**
- `JSON` 컬럼 타입 — MySQL 8.0+ 지원 ✓ (Cloud SQL = 8.x)
- `JSON_VALID()` — 검증 SQL 화이트리스트 ✓

### 7.4 graceful fallback (Rule 23 마이그 미적용 시)

```ts
try {
  const m = await prisma.$queryRawUnsafe<any[]>(`SELECT body, body_version FROM meetings WHERE id = ?`, id)
} catch (e) {
  // 마이그 미적용 시
  return NextResponse.json({ data: { body: null, body_version: 1 }, _migration_pending: true })
}
```

UI에서 `_migration_pending: true` 받으면 「⚠ DB 마이그 미적용 — 관리자 문의」 배너.

### 7.5 GATE 체크리스트 (Rule 27)

```
- G3 본 설계서 (MEETINGS-EDITOR-DESIGN.md) + 사용자 GO + PR-V2-A 범위 합의
- G4 마이그레이션 안전 — 🟡 ALTER + ADD COLUMN (기존 row 영향 X, NULL 허용)
- G5 tsc PASS (본 세션 영역)
- G6 lint:harness 새 위반 0건
- G7 Designer — 스크린샷 검수 (split view 레이아웃)
- Rule 8 시뮬레이션 (위 § 7.2) / Rule 11 사전 검증 (위 § 7.3)
- Rule 22 _docs 갱신 (CHANGELOG + DATA-MODEL V2 섹션 추가)
- Rule 23 graceful fallback (위 § 7.4)
- Rule 21 공통 파일 분리 commit:
  · package.json (TipTap deps) — 단독 commit, 사용자 GO
  · PageTitle.tsx (/meetings/new, /meetings/[id] 등록) — 단독 commit, 사용자 GO
  · migrations/2026-05-13_meetings_v2.sql — 단독 commit, 사용자 적용 확인
```

---

## 8. 별도 합의 필요 사항 (사용자 결정)

### 8.1 PR-V2-A 시작 전

| 항목 | 결정 필요 | 옵션 |
|------|----------|------|
| TipTap deps 설치 | package.json 변경 — Rule 21 공통 파일 | A) 본 세션이 단독 commit 후 사용자 install / B) 사용자가 메인 세션에 install 요청 |
| 마이그 SQL 실행 | DB 변경 — 사용자 콘솔 직접 | 본 세션이 마이그 파일 생성 + 검증 SQL 포함 → 사용자가 DBeaver/CLI에서 실행 |
| V1 모달 운명 | body=NULL 회의 fallback | A) 모달 영구 유지 / B) 마이그 도구로 V1 → V2 자동 변환 후 모달 폐기 (PR-V2-F) |
| 「+ 회의 등록」 버튼 | 현재 모달 → V2 페이지 이동 | DcStatStrip actions onClick: router.push('/meetings/new') |

### 8.2 PR-V2-E (협업) 전

| 항목 | 결정 필요 |
|------|----------|
| 인프라 | Hocuspocus 서버 / Cloud Run WebSocket / Pusher 등 외부 서비스 |
| 비용 | 협업 트래픽 모니터링 / 메시지 비용 |
| 권한 | 동시 편집 — 참석자 + organizer 한정 / 부서원 한정 |

---

## 9. 변경 이력

| 날짜 | 변경 | 작성자 |
|------|------|--------|
| 2026-05-13 | 1차 설계 — 인터뷰 결과 + 5 PR 분할 + V2-A 상세 | meetings 세션 |

본 문서는 PR-V2-A 시작 / PR 분할 변경 / 인프라 합의 시 갱신.
