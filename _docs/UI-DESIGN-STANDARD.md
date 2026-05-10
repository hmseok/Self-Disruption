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

## 1. 페이지 헤더 표준 (정산 관리 기준)

### 1.1 Breadcrumb (필수)
```tsx
{/* 작은 회색 텍스트 — 그룹 / 페이지명 */}
<div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', marginBottom: 4 }}>
  <span>영업/계약</span>
  <span>›</span>
  <span style={{ color: '#0f2440', fontWeight: 600 }}>정산 관리</span>
</div>
```

### 1.2 페이지 제목 영역 (단순)
```tsx
{/* 컬러 점 (red/yellow/green) + 제목 — 또는 아이콘 + 제목 */}
<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
  <span style={{ width: 8, height: 8, borderRadius: 4, background: '#dc2626' }} />
  <span style={{ width: 8, height: 8, borderRadius: 4, background: '#f59e0b' }} />
  <span style={{ width: 8, height: 8, borderRadius: 4, background: '#16a34a' }} />
  <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f2440', margin: 0 }}>정산 관리</h1>
</div>
```

또는 아이콘 + 제목만:
```tsx
<h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f2440', margin: 0 }}>
  💰 통장/카드 관리
</h1>
```

❌ **금지**:
- 큰 박스로 헤더 강조
- 헤더에 "Employee of Ride Inc." 같은 회사명 (breadcrumb 만)
- 제목 옆에 큰 설명 (description)

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
