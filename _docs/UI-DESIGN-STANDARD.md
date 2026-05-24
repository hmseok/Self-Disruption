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

## 4. 탭 (sub-section)

```tsx
{/* 탭 이름 앞에 이모지/아이콘 */}
<div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
  <button>📋 계약 현황</button>
  <button>📈 매출 분석</button>
  <button>💸 지급 관리 25</button>
  <button>📊 손익계산서</button>
  <button>⚡ 정산 실행 25</button>
  <button>📒 정산 원장</button>
</div>
```

활성 탭: 검정 배경 + 흰 글씨 (`#0f2440`)
비활성 탭: 투명 배경 + 회색 글씨 (`#64748b`)

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
