# UI 디자인 표준 — FMI ERP

> **기준 페이지**: `/finance/settlement` (정산 관리)
> **작성**: 2026-05-10 (sweet-amazing-galileo 세션)
> **목적**: 다른 cowork 세션이 같은 디자인 패턴을 따르도록 명시. 사용자 보고 기반 수립.

---

## 0. 사용자 명령

> 「정산 관리가 우리의 기준입니다. 다른 세션들이 하네스를 지키지만 다른 방향으로 나오고 있어서
> 조금 강화가 필요해보입니다.」

본 문서는 **모든 cowork 세션이 따라야 할 페이지 디자인 패턴**을 정의.

---

## 0-A. 📐 리스트 페이지 표준 아나토미 (2026-05-26 명문화)

> **「같은 기능이면 같은 UI」** — 모든 리스트/대시보드 페이지는 다음 5층 구조 사용 의무.

```
┌─────────────────────────────────────────────────────────────┐
│ [1] PageTitle              ← ClientLayout 자동, 페이지 등록만   │
│  · 블루 도트 + 그룹 › 페이지 brebcrumb                       │
│  · 디바이더 자동                                              │
├─────────────────────────────────────────────────────────────┤
│ [2] NeuFilterTabs (선택)    ← 큰 모드 분리 시 (견적/계약 등)    │
│  · 자체 탭 strip 금지 (§ 4.0)                                │
├─────────────────────────────────────────────────────────────┤
│ [3] DcStatStrip            ← 의무                            │
│  · 5 stat 카드 (이모지+라벨+숫자) + 우측 액션 버튼              │
│  · 자체 stat 카드 div 금지                                    │
├─────────────────────────────────────────────────────────────┤
│ [4] DcToolbar              ← 의무                            │
│  · 검색 input + 필터 칩 (count 포함) + (선택) 날짜 범위        │
│  · 자체 search input 금지                                     │
├─────────────────────────────────────────────────────────────┤
│ [5] NeuDataTable           ← 의무                            │
│  · 정렬 가능한 컬럼 + 모바일 카드 자동                          │
│  · 자체 <table> 금지                                         │
└─────────────────────────────────────────────────────────────┘
```

**기준 페이지 (같은 아나토미 사용)**:
- `/finance/settlement` — 정산 관리 (원형 기준)
- `/operations` — 사고대차
- `/long-term-rentals` — 장기렌트
- `/meetings` — 회의록
- `/loans` — 대출 관리

**검사**: `npm run lint:ui-design` — 누락 시 정보성 경고.
- `DcStatStrip` 있는데 `DcToolbar` 없음 → "아나토미 불완전" 경고
- `DcToolbar` 있는데 `NeuDataTable` 없음 → 경고
- 자체 stat 카드 / 검색바 / 탭 / 테이블 → 위반

---

## 1. 페이지 헤더 표준 — **자동 (PageTitle 컴포넌트)**

**ClientLayout 이 자동으로 PageTitle 컴포넌트를 모든 페이지에 렌더링**.
따라서 페이지 자체에서 헤더를 만들 필요 X.

### 1.1 자동 표시 내용 (PageTitle 컴포넌트):
```
[블루 도트 점] 페이지명 ····················· 그룹 > 페이지명
─────────────────────── 디바이더 ─────────────────────────
```

- `app/components/PageTitle.tsx` — 그룹/페이지 매핑 + neumorphism 스타일
- 페이지 path 만 등록하면 자동 렌더링 (PageTitle.tsx 의 `PATH_TO_GROUP` + `PAGE_NAMES`)

### 1.2 페이지 자체에서 해야 할 일
- ❌ 자체 큰 헤더 박스 만들기 (PageTitle 이 이미 함)
- ❌ `<h1>출고/반납 관리</h1>` 같은 커스텀 큰 제목
- ❌ 「Employee of Ride Inc.」 회사명 직접 추가
- ❌ 빨강 / 노랑 / 녹색 점 직접 추가 (PageTitle 의 블루 도트 자동)
- ✅ PageTitle 자동 표시 — 페이지 컨텐츠만 작성

### 1.3 새 페이지 등록 절차
1. 새 페이지 path 추가 (예: `/finance/new-feature`)
2. `app/components/PageTitle.tsx` 의 `PATH_TO_GROUP` 에 path → group 추가:
   ```ts
   '/finance/new-feature': 'finance',
   ```
3. `PAGE_NAMES` 에 path → 페이지명 추가:
   ```ts
   '/finance/new-feature': '신규 기능',
   ```
4. 자동으로 「재무/경영 > 신규 기능」 breadcrumb 표시

**그 외에 헤더 영역에 손대지 마세요**.

---

## 1.5 페이지 본문 레이아웃 표준 (대출 관리 / 정산 관리 기준)

PageTitle 자동 헤더 아래 페이지 본문 구조:

```
┌─────────────────────────────────────────────────┐
│ [PageTitle 자동 헤더]                              │
│ ─────────────────── 디바이더 ──────────────────── │
│                                                  │
│ ┌─DcStatStrip (5 카드 + 액션 버튼)─┐               │
│ │ 통계 카드 1│2│3│4│5  [+ 직접 등록] │               │
│ └─────────────────────────────────────┘               │
│                                                  │
│ ┌─선택: 드롭존 / 배너 / 안내─────────┐            │
│ │ AI 자동 인식 / 만기 임박 등         │            │
│ └────────────────────────────────────┘            │
│                                                  │
│ ┌─DcToolbar (검색 + 필터)───────────┐             │
│ │ 🔍 검색  [전체│할부│리스│렌트]  ↕   │             │
│ └────────────────────────────────────┘             │
│                                                  │
│ ┌─NeuDataTable (데이터 테이블)──────┐             │
│ │ 정렬 가능한 컬럼들                  │             │
│ └────────────────────────────────────┘             │
└─────────────────────────────────────────────────┘
```

### 의무 사용 컴포넌트
- **`DcStatStrip`** (`app/components/DcStatStrip.tsx`) — 5 stat 카드 + 액션 버튼
- **`DcToolbar`** (`app/components/DcToolbar.tsx`) — 검색 + 필터
- **`NeuDataTable`** (`app/components/NeuDataTable.tsx`) — 데이터 테이블

❌ **금지**:
- 자체 div 로 stat 카드 만들기
- 자체 검색바 + 필터 영역 만들기
- 자체 테이블 만들기 (NeuDataTable 사용)

### 1.6 페이지 너비 — 전체 너비 (2026-05-24)

페이지 최상위 래퍼는 콘텐츠 프레임 **전체 너비**를 채운다. ClientLayout 의
콘텐츠 프레임이 이미 사이드바를 제외한 영역을 잡아주므로, 페이지가 다시
`maxWidth` 로 가운데 정렬하면 좌우가 비어 답답해진다 (반응형으로 펴지지 않음).

❌ 금지 — 페이지 최상위 래퍼 중앙정렬 (`maxWidth` + `margin: '0 auto'`):

    <div style={{ padding: 16, maxWidth: 940, margin: '0 auto' }}>

✅ 올바름 — 전체 너비:

    <div style={{ padding: 16 }}>

- `maxWidth` + `margin: '0 auto'` 는 **모달 / 카드 내부** 등 의도된 좁은
  영역에만 사용. 페이지 본문 최상위 래퍼에는 금지.
- 검사: `npm run lint:ui-design` — page.tsx 최상위 래퍼 중앙정렬 패턴 경고.

### 1.7 가로 스크롤 금지 — 반응형이 표준 (2026-05-31 신설)

> **사용자 명령 (2026-05-31)**: 「좌우 화면 안 짤리게 반응형 필수」 +
> 「좌우 스크롤은 없애야죠」 — 가로 스크롤은 회피책이 아니라 그 자체로 위반.

**원칙**: viewport 너비에 맞춰 **컨텐츠가 줄어들거나 재배치** 돼야 한다.
가로 스크롤 (`overflowX: 'auto'`) 은 **응급 대피용**일 뿐 표준 해결책이 아님.

**금지 패턴**:

```tsx
{/* ❌ wide content + 가로 스크롤 — 사용자가 스크롤해야 함 */}
<div style={{ overflowX: 'auto' }}>
  <table style={{ minWidth: 1000 }}>...</table>
</div>

{/* ❌ fixed wide grid — 좁은 화면에서 짤림 */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 150px)' }}>...</div>

{/* ❌ minWidth 의존 — 좁아지면 부모 잘림 */}
<table style={{ minWidth: 1200 }}>...</table>

{/* ❌ 자체 <table> — 모바일 카드 폴백 없음 */}
<table>...</table>
```

**올바른 패턴**:

```tsx
{/* ✅ NeuDataTable — 모바일 카드 자동 폴백 */}
<NeuDataTable columns={cols} rows={rows} />

{/* ✅ flex-wrap — 좁아지면 줄바꿈 */}
<div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>...</div>

{/* ✅ minmax grid — 자동 컬럼 수 조정 */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>...</div>

{/* ✅ 컬럼 우선순위 — narrow 에서 부차 컬럼 숨김 */}
{!isMobile && <td>{secondary}</td>}
```

**wide content 검출 패턴 (자동 차단 대상)**:
- `<table>` 직접 사용 (NeuDataTable 사용 의무)
- `minWidth: 600+` 또는 `min-w-[600px+]` (반응형 단위 X — 600 이상 fixed)
- `gridTemplateColumns: 'repeat(6+, NNNpx)'` (auto-fit minmax 사용)
- `overflowX: 'auto' / 'scroll'` (가로 스크롤 자체 금지)
- `overflow-x-auto` / `overflow-x-scroll` Tailwind 동일

**예외** (명시적 사유 주석 의무):
- Excel 같은 데이터 그리드 (드릴다운 도구) — `// 가로 스크롤 허용: 데이터 그리드`
- 코드 블록 (`<pre>`) — 자동 처리됨
- 차트 / 시각화 — `<svg>` 자체 viewBox 처리

**검사** (ui-design-lint check 19, 2026-05-31 신설):
- page.tsx 안 wide pattern 검출 → 정보성 경고
- `overflowX: 'auto'` 도 위반 (회피책 X)
- baseline 동결: 기존 위반 통과, 신규만 차단

---

## 2. Stat Strip — DcStatStrip 사용

5개 통계 카드 라인. 정산 관리 = 5 카드 (총매출 / 총지출 / 영업이익 / 미정산 / 미정산액).

### 2.1 컴포넌트 사용
```tsx
import DcStatStrip, { StatItem } from '@/app/components/DcStatStrip'

const statItems: StatItem[] = [
  { label: '총 매출', value: '0', color: 'green' },
  { label: '총 지출', value: '0', color: 'red' },
  { label: '영업이익', value: '0', color: 'amber' },
  { label: '미정산', value: '25', color: 'blue' },
  { label: '미정산액', value: '5,080,229', color: 'violet' },
]

<DcStatStrip items={statItems} />
```

### 2.2 색상 매핑 (Glass borderTint)
- green: 수익 / 정상
- red: 지출 / 위험
- amber: 영업 / 경고
- blue: 정보 / 진행 중
- violet: 누적 / 합계

❌ **금지**:
- 직접 div + style 로 5 카드 만들기 (DcStatStrip 사용 의무)
- 색상 임의 변경 (정의된 5색만)

---

## 3. Toolbar — DcToolbar 사용

검색 + 필터 + 트레일링 (월/엑셀 등) 통합 바.

```tsx
import DcToolbar from '@/app/components/DcToolbar'

<DcToolbar
  search={search}
  onSearchChange={setSearch}
  placeholder="..."
  filters={[
    { key: 'all', label: '전체', count: 5 },
    { key: 'jiip', label: '위수탁(지입)', count: 3 },
    { key: 'invest', label: '투자/펀딩', count: 2 },
  ]}
  activeFilter={activeFilter}
  onFilterChange={setActiveFilter}
  trailing={<>📅 2026년 5월 / 📊 장부 / 📊 엑셀</>}
/>
```

❌ **금지**:
- 검색 / 필터 / 액션 버튼을 별도 div 로 분산
- 회색 배경 외 다른 색상 toolbar

---

## 4. 탭 (sub-section) — 공용 NeuFilterTabs 사용 의무 (2026-05-26 강화)

**「같은 기능이면 같은 UI」 원칙 — 탭 strip 은 모든 페이지가 공용 컴포넌트 사용.**

```tsx
import NeuFilterTabs, { FilterTab } from '@/app/components/NeuFilterTabs'

const tabs: FilterTab[] = [
  { key: 'overview', label: '📋 계약 현황', count: 25 },
  { key: 'sales',    label: '📈 매출 분석' },
  { key: 'payment',  label: '💸 지급 관리', count: 12 },
]

<NeuFilterTabs tabs={tabs} activeKey={tab} onSelect={setTab} />
```

### 4.0 자체 탭 strip 금지 (2026-05-26 신설)

- ❌ `<div><button onClick={() => setTab('x')} style={{ active ? ... }}>` 자체 구현
- ❌ 탭마다 다른 padding / border / color 패턴
- ❌ 같은 페이지 안에서도 상단 탭은 자체 / 하단 탭은 NeuFilterTabs 처럼 혼용
- ✅ 모든 페이지·세션 공통 `NeuFilterTabs` 사용
- 검사: `npm run lint:ui-design` — `setActiveTab` / `setTopTab` / `setSubTab` 등 setter 가 있는데
  `NeuFilterTabs` 미 import 면 경고 (정보성 — 합의 시 차단으로 승격).

**예외 케이스**:
- 단순 toggle (2개 옵션, on/off 의미) → 라디오/스위치 사용
- 탭 안 sub-tab → NeuFilterTabs `compact` prop 사용

### 4.1 활성(선택) 탭 색상 — 표준 (2026-05-24 변경)

활성 탭: **브랜드 블루 배경 `#3b6eb5` + 흰 글씨**.

- 구 표준이던 네이비 `#0f2440` → 디자인 시스템 primary(`#3b6eb5`)와 통일.
  헤더 배지(F/R) / DcStatStrip 활성 / NeuFilterTabs 가 모두 이 블루.
- 솔리드 `#3b6eb5` 또는 블루 그라데이션 `linear-gradient(135deg, #3b6eb5, #5a8fd4)`
  (NeuFilterTabs) 둘 다 표준으로 허용 — 같은 블루 계열.
- ❌ 금지 — 활성 탭에 네이비 `#0f2440` / 슬레이트 `#1e293b` / 퍼플 등
  primary 외 색상 사용.
- 검사: `npm run lint:ui-design` — 활성 탭에 비표준 색상 사용 시 경고.
비활성 탭: 투명 배경 + 회색 글씨 (`#64748b`)

---

## 2.3 Stat 카드 사이즈 표준 (2026-05-27 사용자 보고 — RideCompliance 사고)

DcStatStrip 의 카드는 **콘텐츠 자연 높이** — 액션 컬럼이 stacked 라도 카드는 inflate X.

**고정 값** (`app/components/DcStatStrip.tsx`):
- padding: `16px 14px`
- 라벨: fontSize 10, fontWeight 700, UPPERCASE letterSpacing 0.06em
- 값: fontSize 22 (≤5 카드) / 18 (>5)
- borderRadius: 16
- minHeight: 자연 — outer grid `alignItems: 'start'` 강제로 액션 컬럼 키에 안 끌려감

**금지**:
- ❌ `align-items: stretch` (기본값) outer grid — 액션 stacked 시 카드 inflate
- ❌ 카드 안 `height: 100%` / `flex: 1` — DcStatStrip 내부 token 만 사용

회귀 점검: `npm run lint:ui-design` — DcStatStrip 자체 div 구현 감지 (§ 2 기존).

---

## 7. 표시 텍스트 — 100% 한글 (2026-05-28 사용자 결정)

> **사용자 명령**: 「AI 개발이다 보니 코드나 영어가 많이 쓰이는 것 같은데 100% 한글로 했으면 좋겠어」

**원칙**: 사용자에게 보이는 모든 텍스트는 **한글**. 영어는 기술적 식별자 (변수명·파일명·URL·DB 컬럼) 만 허용.

### 7.1 한글 의무 영역 (위반 시 lint 경고)

| 영역 | 한글 의무 | 예외 |
|---|---|---|
| 버튼·라벨·헤더 | ✅ | 짧은 기술 약어 (API / ID / AI / URL / PDF / SMS / KPI) 는 허용 |
| 메뉴·breadcrumb | ✅ | 위와 동일 |
| 에러 / 안내 메시지 | ✅ | — |
| 모달 제목·본문 | ✅ | — |
| 테이블 컬럼 라벨 | ✅ | 단위 (kg / km / hr / % 등) 허용 |
| 폼 placeholder | ✅ | 이메일 / URL 입력 형식 예시 허용 |
| 페이지 제목 (PageTitle) | ✅ | — |

### 7.2 영어 허용 영역 (기술적 식별자 — 사용자에게 안 보임)

- 변수·함수·컴포넌트명: `DcStatStrip`, `useMyCompanyKey`, `getCompanyOfProfile`
- 파일·디렉토리명: `app/(employees)/RideCompliance/policies/page.tsx`
- URL 경로: `/RideCompliance/policies` (사용자에게는 breadcrumb 의 한글 라벨로 매핑)
- DB 컬럼·테이블명: `profiles.company_id`
- 코드 주석 / 커밋 메시지: 한글 권장하되 영어 OK

### 7.3 PageTitle breadcrumb (2026-05-28 적용)

URL segment 가 영어라도 `PAGE_NAMES[path]` 에 등록된 한글 라벨만 표시.
한글 라벨 없는 segment 는 **표시 안 함** (영어 path fragment 노출 금지).

```ts
// 잘못된 fallback (수정 전):
label: isCurrent ? (dynamicMenuName || registered || segments[i]) : registered
                                                       ↑ 영어 path 누설
// 표준 (수정 후):
const koreanLabel = isCurrent ? (dynamicMenuName || registered) : registered
if (!koreanLabel) continue  // 한글 라벨 없으면 segment skip
```

### 7.4 검사 (ui-design-lint check 17, 2026-05-28 신설)

JSX text content 안 한글이 0 + 영어 단어가 5자 이상 + 짧은 기술 약어가 아닌 케이스 → 정보성 경고.

**예외 사전** (영어 허용 — 기술 약어):
```
API, URL, ID, AI, ML, PDF, CSV, XLS, XLSX, DOC, DOCX, PPTX,
HTTP, HTTPS, JSON, SQL, CRM, ERP, SMS, KPI, CSV, OK, NG,
DB, IP, MAC, SSL, OAuth, JWT, UUID, RGB, HEX, IRR, PG,
+ 페이지 코드 (POLICY-2026-001 등 영문+숫자 조합 ID)
```

---

## 8. AI 잔존 표현 금지 — 「인간 손길」 표준 (2026-05-28 사용자 결정)

> **사용자 명령**: 「AI 가이드 같은 설명은 삭제해 주세요. 이런 표현들은 누가 봐도
> AI 가 개발한 느낌이잖아요. 사람이 만든 것처럼 해야죠.」

### 8.1 사용자에게 보이는 곳 절대 금지

**금지 패턴 (UI 텍스트)**:

| 위반 예시 | 문제 | 올바른 표현 |
|---|---|---|
| 「💡 외부 카페24 폐기 결재 — 어댑터 모드: direct」 | 💡 + 기술 용어 (어댑터·direct) 노출 | 「외부 결재 목록」 (제목만) |
| 「등록된 결재가 없습니다 — 외부 시스템 sync 후 표시됩니다」 | 기술 용어 (sync) 노출 + 운영 설명 | 「등록된 결재가 없습니다」 |
| 「데이터를 fetch 중…」 | fetch 노출 | 「불러오는 중…」 |
| 「adapter 모드 전환」 | adapter 노출 | 「연동 방식 변경」 |
| 「OAuth 토큰 갱신 — 자동 재시도 (max 3)」 | token / max 3 등 노출 | 「로그인 갱신 중…」 |

**금지 키워드 (사용자 노출 X)**:
- `어댑터` / `adapter` / `direct` / `proxy` / `sync` / `fetch` / `cache` / `hash`
- `token` / `env` / `mode` / `flag` / `config`
- `INSERT` / `UPDATE` / `DELETE` / `SQL` / `query`
- `OAuth` / `JWT` / `localStorage` 같은 기술 식별자

**금지 표현 패턴**:
- ❌ `💡` 라이트벌브 + 기술 설명 박스 (AI 생성 hint 풍)
- ❌ em-dash (`—`) 로 연결된 기술 부연 ("X — Y 모드: Z")
- ❌ 운영 단계 노출 ("외부 시스템 sync 후 표시")
- ❌ 디버그 정보 노출 ("status=pending — 검수 대기 → 원본 파일 등록 → CPO 검수 → 활성화")

### 8.2 올바른 「인간 손길」 표현

- ✅ **간결한 명사구**: 「결재 목록」, 「내규 마스터」
- ✅ **자연스러운 빈 상태**: 「등록된 결재가 없습니다」 / 「검색 결과가 없습니다」
- ✅ **운영 흐름은 사용자 언어로**: 「검수 대기」 / 「승인 완료」 (단계명만)
- ✅ **도움말 별도**: 우측 상단 「?」 아이콘 → 클릭 시 모달 도움말. 화면 본문에 설명 박힘 X
- ✅ **기술 정보 admin 페이지로 격리**: 어댑터 모드·env 변수 등은 관리자 도구 전용

### 8.3 검사 (ui-design-lint check 18, 2026-05-28 신설)

다음 패턴 발견 시 정보성 경고:
- `💡` 이모지 + 200 char 이내 기술 키워드 (adapter / direct / sync / fetch 등)
- 「어댑터 모드:」 / 「sync 후」 / 「adapter:」 / 「fetch 중」 / `INSERT` `UPDATE` 등 노출

회귀 후보 시각 검수 (Designer 작업) — 사용자에게 보이는 곳 점검.

### 8.4 개발 메타 식별자 노출 절대 금지 (2026-05-31 강화)

> **사용자 명령**: 「쓸데없이 AI 티 나는 설명이나 네이밍 설정은 하네스 기준으로 못 하게 해 주세요」

화면 본문·헤더·도움말·placeholder 어디에도 다음을 노출 금지:

| 위반 예시 | 문제 |
|---|---|
| 「🔧 **Phase 1.3-C 예정**: 서식별 fields 정의」 | Phase 표기 + PR 코드 + 영어 명사 노출 |
| 「P12-D 에서 추가 예정」 | PR 코드 + 「예정」 = 미완성 메타 노출 |
| 「Phase 4.0 — 외부 yangjaehee DB 어댑터」 | 버전 + 스키마명 노출 |
| 「mock 모드 — 시연용 데이터」 | 운영 모드 노출 |
| 「placeholder — 추후 구현」 | 개발 상태 노출 |
| 「향후 …에서 …로 대체 예정」 | 로드맵·기술 부채 노출 |

**금지 식별자 (사용자 노출 X)**:
- `Phase\s+\d+(\.\d+)?(-[A-Z])?` (Phase 1.3-C, Phase 4.0)
- `PR-[A-Z][A-Z0-9-]+` (PR-MULTI-BRAND, PR-COORD-13)
- `\bP\d+-[a-z0-9]+` (P12-D, P3+a)
- `v\d+\.\d+(\.\d+)?` (v1.3, v2.0.1) — UI 버전 라벨 빼고 본문 X
- `placeholder` / `stub` / `TBD` / `WIP` / `TODO` — 한글 「준비 중」 으로
- `mock` / `direct` / `etl` 운영 모드명 — UI 보임 X
- `JSON\s*schema` / `fields\s*정의` / `interface` 같은 코드 개념어
- 「향후 …」 / 「추후 구현」 / 「대체 예정」 — 미완성 자백 표현

### 8.5 사용자가 보는 「이름」 한글 100% (네이밍 — 2026-05-31 강화)

페이지·메뉴·모달·버튼·탭·섹션 헤더 등 **사용자에게 보이는 모든 「이름」** 은 한글 의무.
기술 약어 화이트리스트 (API / ID / URL / PDF / SMS / KPI / DB / IP / JWT / OAuth / OK / NG / ERP / CRM / AI / ML / RIDE / FMI / CARE) 만 영어 허용.

| 영역 | 잘못된 예 (영어 단독) | 올바른 예 (한글) |
|---|---|---|
| 페이지 제목 | `Disposal Approval` | 「폐기 결재」 |
| 메뉴 라벨 | `Compliance Forms` | 「개인정보 서식」 |
| 모달 제목 | `Edit Form Submission` | 「제출 내역 편집」 |
| 버튼 | `Sync All` | 「전체 동기화」 |
| 탭 | `Pending / Approved` | 「대기 / 승인 완료」 |
| 빈 상태 | `No data` | 「등록된 항목이 없습니다」 |
| 알림 | `Saved successfully` | 「저장됐습니다」 |

**검사**: `ui-design-lint` check 17 (한글 100%) + check 18 (메타 식별자) 동시 작동.

### 8.6 위반 시 페널티 (Rule 0-1 §「위반 누적 횟수」 연동)

| 누적 | 액션 |
|---|---|
| 1회 | check 18 정보성 경고 + 자가 기록 |
| 2회 | 사용자에게 즉시 보고 + hotfix |
| 3회+ | `UI_DESIGN_LINT_STRICT=1` 강제 활성화 — commit 차단 |

---

## 6. 체크박스 표준 (2026-05-27 신설)

> **사용자 보고 (2026-05-27)**: RideCompliance 페이지 「전체 선택」 체크박스가
> 행 체크박스보다 작아 답답. 헤더·행 체크박스 동일 크기 표준 명문화.

**고정 값**:
```tsx
<input
  type="checkbox"
  style={{
    width: 18,        // 표준 — 헤더·행 모두 동일
    height: 18,
    cursor: 'pointer',
    accentColor: '#3b6eb5',  // 브랜드 블루 (체크 상태 색)
  }}
/>
```

| 위치 | 사이즈 | 색 |
|---|---|---|
| 테이블 헤더 (전체 선택) | 18×18 | accentColor `#3b6eb5` |
| 테이블 행 (개별) | 18×18 | accentColor `#3b6eb5` |
| 폼 (단일 토글) | 18×18 (또는 switch) | accentColor `#3b6eb5` |
| 모달 안 옵션 | 18×18 | accentColor `#3b6eb5` |

**금지**:
- ❌ 헤더 체크박스만 14px / 16px 같이 더 작게 — 헤더가 더 어렵게 클릭됨
- ❌ accentColor 미지정 — 브라우저 기본 (강조색 일관성 깨짐)
- ❌ `<div onClick>` 으로 자체 체크박스 구현 — 접근성·focus ring 깨짐

**lint** (`ui-design-lint` check 16 — 2026-05-27 신설):
- `<input type="checkbox">` 사용 시 `width:` 또는 `width=` 18 이외 → 경고
- `accentColor` 미지정 → 경고

---

## 5.1 모달 표준 — Overlay + Body (2026-05-27 사용자 결정 — 옵션 C)

> **사용자 보고 (2026-05-27)**: RideCompliance 모달이 `bg-black/60 + backdrop-blur-xl`
> 조합으로 뒷 콘텐츠가 거의 안 보여 답답. 「우리 기준 모달」 표준 명문화 요청.
> 시안 5종 비교 후 **옵션 C** 채택.

```tsx
{/* Overlay — 표준 (모든 모달 의무) */}
<div className="fixed inset-0 z-50 flex items-center justify-center
                bg-black/40 backdrop-blur-sm
                animate-fade-in px-4">
  {/* Body — Glass L4 */}
  <div style={{ ...GLASS.L4, maxWidth: 520, borderRadius: 16, padding: 24 }}>
    ...
  </div>
</div>
```

**Overlay 표준 값**:

| 속성 | 값 | 의미 |
|---|---|---|
| 배경 dimming | `bg-black/40` | 40% — focus 유도, 답답 X |
| backdrop blur | `backdrop-blur-sm` | 가벼움, 뒷 콘텐츠 형태 인지 가능 |
| z-index | `z-50` | 사이드바·헤더 위 |
| 진입 애니메이션 | `animate-fade-in` | 부드러운 등장 |

**Body 표준 값**:

| 속성 | 값 | 의미 |
|---|---|---|
| Glass 레벨 | `GLASS.L4` (white/0.72) | 콘텐츠 컨테이너 |
| max-width | 단순 form 520px / 복합 720px | 가독성 |
| border-radius | 16px | Glass 카드와 통일 |
| padding | 24px | 충분한 여백 |

**금지 패턴** (lint 차단 — `ui-design-lint` check 15):
- ❌ `bg-black/50` 이상 + `backdrop-blur-xl`/`-2xl` 조합 — 뒷 콘텐츠 완전 차단, 답답
- ❌ `bg-black/90` — 사실상 페이지 차단 (정말 critical confirm 만 예외)
- ❌ Body 에 자체 `<div>` 구현 — `GLASS.L4` 토큰 의무

**예외**:
- Data-loss 위험 confirm dialog — `bg-black/60` + alert-style body 허용 (사용자 잠시 stop)
- 풀스크린 이미지 viewer — `bg-black/90` 허용

---

## 5. Glass 디자인 시스템 (CLAUDE.md § 10)

5 레벨 glass 사용:
- L5: 네비게이션 (white/0.75)
- L4: 테이블 / 모달 (white/0.72)
- L3: 일반 카드 (white/0.60)
- L2: 사이드바 (white/0.35)
- L1: 인풋 (white/0.40 + inset)

`app/utils/ui-tokens.ts` 의 `GLASS.L1` ~ `GLASS.L5` 사용. 직접 색상 X.

---

## 6. 위반 사례 (현재)

### 6.1 CallScheduler (`/CallScheduler`)
- ❌ 헤더 박스 + 「📅 근무시간표 분석 & 배포」 큰 제목 (페이지 제목이 너무 크고 강조)
- ❌ Breadcrumb 없음
- ❌ stat 카드를 DcStatStrip 으로 안 만듦 (4 카드 — 자체 div)
- ✅ 탭 이모지 사용 (정상)

### 6.2 factory-search (`/factory-search`)
- ❌ Breadcrumb 「Employee of Ride Inc. > 협력공장 추천」 (그룹명을 기준 그룹명 X — 정산 관리는 「영업/계약」)
- ❌ 페이지 제목에 빨간 점 단독 (정산은 RGY 3색)
- ❌ stat 카드 자체 구현 (DcStatStrip 미사용)
- ❌ 탭이 hr underline 스타일 (정산은 검정 pill 스타일)

### 6.3 정산 관리 ✅ (기준)
- 정상 — 모든 패턴 준수

---

## 7. 자동화 안전장치 (TBD)

```
🔜 ui-design-lint.js (계획):
  - 페이지 파일에 DcStatStrip / DcToolbar import 검사
  - 직접 div 로 stat 카드 구현 시 경고
  - breadcrumb 패턴 확인
  - 위치: harness-engineering/scripts/ui-design-lint.js
```

---

## 8. 다른 세션 협업 가이드

다른 cowork 세션이 새 페이지 / 기존 페이지 수정 시:

1. **이 문서 (`_docs/UI-DESIGN-STANDARD.md`) 먼저 확인**
2. **기준 페이지 (`/finance/settlement`) 참조**
3. **DcStatStrip / DcToolbar 컴포넌트 의무 사용**
4. **Breadcrumb 그룹명 일치** (사이드바 그룹명과 동일)
5. **PR 시 시각 검수** (Rule 6 / Rule 27 G7) — 기준 페이지 비교 스크린샷

위반 시 사용자 보고 → 본 세션 (sweet-amazing-galileo) 가 lint 도구 신설.

---

본 문서는 사용자 피드백에 따라 갱신.
